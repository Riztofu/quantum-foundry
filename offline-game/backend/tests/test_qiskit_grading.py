"""Qiskit grading, sampling, and export (ported from the original backend's test_quantum.py).

The last test asks the game's own core.js for the grading request of every
campaign mission's reference solution and confirms Qiskit passes all of them,
so the browser and the service can never silently disagree about a contract.
"""
import json
import math
import shutil
import subprocess
import unittest
from pathlib import Path

from qiskit.quantum_info import Statevector

from backend import quantum
from backend.circuit import validate_payload, validate_verify

R2 = 1 / math.sqrt(2)
H0, X0, Z0 = {"type": "H", "target": 0}, {"type": "X", "target": 0}, {"type": "Z", "target": 0}
CX01, CX10 = {"type": "CX", "control": 0, "target": 1}, {"type": "CX", "control": 1, "target": 0}
BELL = [[R2, 0], [0, 0], [0, 0], [R2, 0]]
GAME = Path(__file__).resolve().parents[2]


def basis(index, qubits=2):
    return [[1.0 if i == index else 0.0, 0.0] for i in range(2 ** qubits)]


def grade(qubits, cases, operator=None):
    return quantum.verify(validate_verify({"qubits": qubits, "cases": cases, "operator": operator}))


def case(operations, expected, initial=None, label="case"):
    return {"label": label, "initial": initial or {"basis": 0}, "operations": operations, "expected": expected}


class QiskitGradingTests(unittest.TestCase):
    def test_bell_prep_passes(self):
        out = grade(2, [case([H0, CX01], BELL)])
        self.assertTrue(out["passed"], out)
        self.assertEqual(out["engine"], "qiskit-statevector")

    def test_wrong_relative_phase_fails_even_with_identical_probabilities(self):
        out = grade(2, [case([X0, H0, CX01], BELL)])  # (|00> - |11>)/sqrt2
        self.assertFalse(out["passed"])
        self.assertAlmostEqual(out["cases"][0]["fidelity"], 0.0, places=9)

    def test_reversed_cnot_is_caught_by_operator_equivalence(self):
        out = grade(2, [case([CX10], basis(0))], {"operations": [CX10], "reference": [CX01]})
        self.assertTrue(out["cases"][0]["passed"])  # |00> alone cannot tell them apart
        self.assertFalse(out["operator"]["equivalent"])
        self.assertFalse(out["passed"])

    def test_one_global_phase_is_accepted(self):
        # X·Z = -Z·X: equal up to a single global phase.
        out = grade(1, [case([X0, Z0], basis(1, 1))], {"operations": [X0, Z0], "reference": [Z0, X0]})
        self.assertTrue(out["operator"]["equivalent"], out)

    def test_input_dependent_phase_is_rejected(self):
        # Z differs from identity only by a phase on |1>; that phase is not global.
        out = grade(1, [case([Z0], basis(0, 1))], {"operations": [Z0], "reference": []})
        self.assertFalse(out["operator"]["equivalent"])

    def test_courier_recovers_all_four_messages(self):
        for message in ("00", "01", "10", "11"):
            ops = [H0, CX01] + ([Z0] if message[1] == "1" else []) + ([X0] if message[0] == "1" else []) + [CX01, H0]
            out = grade(2, [case(ops, basis(int(message, 2)))])
            self.assertTrue(out["passed"], (message, out))

    def test_bell_decoder_from_amplitude_inputs(self):
        inputs = [BELL, [[R2, 0], [0, 0], [0, 0], [-R2, 0]], [[0, 0], [R2, 0], [R2, 0], [0, 0]], [[0, 0], [-R2, 0], [R2, 0], [0, 0]]]
        cases = [case([CX01, H0], basis(i), {"state": state}) for i, state in enumerate(inputs)]
        out = grade(2, cases, {"operations": [CX01, H0], "reference": [CX01, H0]})
        self.assertTrue(out["passed"], out)

    def test_swap_gate_matches_three_cnots(self):
        swap = {"type": "SWAP", "control": 0, "target": 1}
        out = grade(2, [case([swap], basis(2), {"basis": 1})], {"operations": [swap], "reference": [CX01, CX10, CX01]})
        self.assertTrue(out["passed"], out)

    def test_invalid_requests_are_refused_with_player_messages(self):
        for bad in ({"qubits": 7, "cases": []}, {"qubits": 1, "cases": []},
                    {"qubits": 1, "cases": [case([], [[1, 0], [1, 0]])]},
                    {"qubits": 1, "cases": [case([{"type": "T", "target": 0}], [[1, 0], [0, 0]])]}):
            with self.assertRaises(ValueError):
                validate_verify(bad)

    def test_sampling_uses_game_bit_order_and_exact_shots(self):
        request = validate_payload({"qubits": 2, "shots": 512, "initial": {"basis": 1}, "operations": []})
        out = quantum.simulate(request, seed=7)
        self.assertEqual(out["counts"], {"00": 0, "01": 512, "10": 0, "11": 0})
        self.assertEqual(out["probabilities"][1], 1.0)

    def test_qasm_export_round_trips_through_qiskit(self):
        from qiskit import qasm2

        request = validate_payload({"qubits": 2, "shots": 128, "initial": {"basis": 0}, "operations": [H0, CX01]})
        exported = quantum.export(request)
        circuit = qasm2.loads(exported["qasm2"]).remove_final_measurements(inplace=False)
        self.assertTrue(Statevector.from_instruction(circuit).equiv(Statevector([R2, 0, 0, R2])))
        self.assertIn("OPENQASM 3", exported["qasm3"])

    def test_qasm_export_expands_amplitude_inputs(self):
        from qiskit import qasm2

        request = validate_payload({"qubits": 2, "shots": 128, "initial": {"state": BELL}, "operations": [CX01, H0]})
        circuit = qasm2.loads(quantum.export(request)["qasm2"]).remove_final_measurements(inplace=False)
        self.assertAlmostEqual(Statevector.from_instruction(circuit).probabilities()[0], 1.0)


NODE_REQUESTS = r"""
const C = require(process.argv[1]);
const g = (type, target, control) => control === undefined ? { type, target } : { type, control, target };
const block = (id, kind, qubits, gates) => ({ id, kind, qubits, gates, name: kind, graph: { nodes: [], edges: [] }, version: 1 });
const modules = [block('prep', 'BellPrep', 2, [g('H', 0), g('CX', 1, 0)]), block('decode', 'BellDecode', 2, [g('CX', 1, 0), g('H', 0)]),
  block('swap', 'Swap', 2, [g('CX', 1, 0), g('CX', 0, 1), g('CX', 1, 0)])];
const out = {};
for (const level of C.levels.filter(l => l.number)) out[level.id] = C.verificationRequest(level.id, C.solution(level.id, modules), modules);
process.stdout.write(JSON.stringify(out));
"""


@unittest.skipUnless(shutil.which("node"), "Node.js is needed to load the game's core.js")
class CampaignAgreementTests(unittest.TestCase):
    def test_every_mission_reference_solution_passes_on_qiskit(self):
        output = subprocess.run(["node", "-e", NODE_REQUESTS, str(GAME / "source" / "core.js")],
                                check=True, capture_output=True, text=True).stdout
        requests = json.loads(output)
        self.assertEqual(len(requests), 16)
        for level_id, request in requests.items():
            with self.subTest(level=level_id):
                out = quantum.verify(validate_verify(request))
                self.assertTrue(out["passed"], (level_id, out["summary"]))


if __name__ == "__main__":
    unittest.main()
