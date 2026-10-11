import math
import os
import unittest
from unittest.mock import patch

from qiskit.quantum_info import Statevector
from qiskit_ionq.helpers import qiskit_circ_to_ionq_circ

from backend.circuit import validate_payload
from backend.main import _compile_for_ionq_qis, _make_circuit, _provider_backend


class QiskitCircuitTests(unittest.TestCase):
    def state_after_gates(self, request):
        measured = _make_circuit(validate_payload(request))
        self.assertEqual(measured.num_clbits, request["qubits"])
        self.assertEqual(sum(item.operation.name == "measure" for item in measured.data), request["qubits"])
        return Statevector.from_instruction(measured.remove_final_measurements(inplace=False))

    def test_basis_inputs_and_measurement_order_match_the_game(self):
        # Application bits read highest qubit first; Qiskit counts use the same order.
        state = self.state_after_gates({"qubits": 2, "initial": {"basis": 1}, "operations": [], "shots": 128})
        self.assertAlmostEqual(state.probabilities()[1], 1.0)
        self.assertAlmostEqual(state.probabilities()[0], 0.0)

    def test_hadamard_and_cnot_prepare_the_expected_bell_state(self):
        state = self.state_after_gates({
            "qubits": 2, "initial": {"basis": 0}, "shots": 512,
            "operations": [{"type": "H", "target": 0}, {"type": "CX", "control": 0, "target": 1}],
        })
        expected = Statevector([1 / math.sqrt(2), 0, 0, 1 / math.sqrt(2)])
        self.assertTrue(state.equiv(expected))

    def test_arbitrary_selected_complex_input_is_preserved_then_changed_by_gates(self):
        root = 1 / math.sqrt(2)
        state = self.state_after_gates({
            "qubits": 2, "initial": {"state": [[root, 0], [0, 0], [0, 0], [root, 0]]},
            "shots": 1024, "operations": [{"type": "Z", "target": 0}],
        })
        expected = Statevector([root, 0, 0, -root])
        self.assertTrue(state.equiv(expected))

    def test_qis_transpilation_serializes_arbitrary_state_without_padding(self):
        request = {"qubits": 2, "initial": {"state": [
            [math.sqrt(0.1), 0], [0, math.sqrt(0.2)], [math.sqrt(0.3), 0], [0, math.sqrt(0.4)],
        ]}, "shots": 512, "operations": [
            {"type": "H", "target": 0}, {"type": "CX", "control": 0, "target": 1},
            {"type": "SWAP", "control": 0, "target": 1}, {"type": "Z", "target": 1},
        ]}
        raw = _make_circuit(validate_payload(request))
        compiled = _compile_for_ionq_qis(raw)
        serialized, measured, _ = qiskit_circ_to_ionq_circ(compiled)
        self.assertGreater(len(serialized), 0)
        self.assertEqual(compiled.num_qubits, 2)
        self.assertEqual(measured, 2)
        raw_state = Statevector.from_instruction(raw.remove_final_measurements(inplace=False))
        compiled_state = Statevector.from_instruction(compiled.remove_final_measurements(inplace=False))
        self.assertTrue(compiled_state.equiv(raw_state))

    def test_provider_rejects_simulator_even_with_a_valid_key(self):
        class FakeBackend:
            name = "ionq_simulator"

        class FakeProvider:
            def get_backend(self, _name):
                return FakeBackend()

        with patch.dict(os.environ, {"IONQ_API_KEY": "test-key"}), patch("qiskit_ionq.IonQProvider", return_value=FakeProvider()):
            with self.assertRaisesRegex(RuntimeError, "not a physical QPU"):
                _provider_backend()


if __name__ == "__main__":
    unittest.main()
