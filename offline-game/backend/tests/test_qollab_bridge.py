"""The Qollab bridge (source/qollab/bridge.py) against real Qiskit backends.

Qollab hands main.js a pre-created provider backend; here Qiskit's BasicSimulator
stands in for it, plus a wrapper named like Qollab's IonQ simulator so the
IonQ path (explicit QIS basis, one packed job) runs too.
"""
import importlib.util
import json
import math
import sys
import types
import unittest
from pathlib import Path

from qiskit.providers.basic_provider import BasicSimulator

GAME = Path(__file__).resolve().parents[2]
# Assemble the package exactly as build-qollab.cjs does: foundry/{bridge,quantum,circuit}.py
package = types.ModuleType("foundry")
package.__path__ = []
sys.modules.setdefault("foundry", package)
for name, path in (("circuit", GAME / "backend" / "circuit.py"), ("quantum", GAME / "backend" / "quantum.py"),
                   ("bridge", GAME / "source" / "qollab" / "bridge.py")):
    spec = importlib.util.spec_from_file_location("foundry." + name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules["foundry." + name] = module
    spec.loader.exec_module(module)
bridge = sys.modules["foundry.bridge"]

R2 = 1 / math.sqrt(2)
H0, X0, Z0 = {"type": "H", "target": 0}, {"type": "X", "target": 0}, {"type": "Z", "target": 0}
CX01 = {"type": "CX", "control": 0, "target": 1}


class Options:
    noise_model = "aria-1"


class FakeQollabIonQSimulator:
    """Named like Qollab's IonQ simulator; executes on BasicSimulator and records what it got."""
    name, num_qubits, options = "ionq_simulator", 25, Options()

    def __init__(self):
        self.submitted = []

    def run(self, circuit, **options):
        self.submitted.append((circuit, options))
        return BasicSimulator().run(circuit, shots=options["shots"], seed_simulator=11)


def courier(message):
    return [H0, CX01] + ([Z0] if message[1] == "1" else []) + ([X0] if message[0] == "1" else []) + [CX01, H0]


def call(function, *args):
    return json.loads(function(*args))


class QollabBridgeTests(unittest.TestCase):
    def test_grading_and_sampling_match_the_local_service(self):
        out = call(bridge.verify, json.dumps({"qubits": 2, "cases": [
            {"label": "|00⟩", "initial": {"basis": 0}, "operations": [H0, CX01], "expected": [[R2, 0], [0, 0], [0, 0], [R2, 0]]}]}))
        self.assertTrue(out["ok"] and out["data"]["passed"], out)
        sampled = call(bridge.simulate, json.dumps({"qubits": 1, "shots": 128, "initial": {"basis": 1}, "operations": []}))
        self.assertEqual(sampled["data"]["counts"], {"0": 0, "1": 128})

    def test_errors_come_back_as_json_not_exceptions(self):
        self.assertEqual(call(bridge.verify, "not json")["status"], 422)
        self.assertIn("one to six qubits", call(bridge.simulate, json.dumps({"qubits": 9}))["detail"])

    def test_describe_labels_ionq_simulator_and_caps_width(self):
        info = call(bridge.describe, FakeQollabIonQSimulator())["data"]
        self.assertEqual((info["label"], info["ionq"], info["paid"], info["max_qubits"]), ("IonQ simulator · aria-1 noise model", True, False, 24))
        self.assertEqual(call(bridge.describe, BasicSimulator())["data"]["ionq"], False)

    def test_all_four_courier_messages_in_one_packed_job(self):
        backend = FakeQollabIonQSimulator()
        circuits = [{"label": m, "qubits": 2, "initial": {"basis": 0}, "operations": courier(m)} for m in ("00", "01", "10", "11")]
        out = call(bridge.run_on_backend, backend, json.dumps({"shots": 128, "circuits": circuits}))
        self.assertTrue(out["ok"], out)
        self.assertEqual(out["data"]["counts"], [{"00": 128}, {"01": 128}, {"10": 128}, {"11": 128}])
        self.assertEqual(len(backend.submitted), 1)  # IonQ: one job per Run
        packed, options = backend.submitted[0]
        self.assertEqual((packed.num_qubits, options), (8, {"shots": 128}))
        for item in packed.data:
            self.assertIn(item.operation.name, bridge.QIS_BASIS + ["measure", "barrier"])

    def test_amplitude_inputs_pack_and_split_correctly(self):
        bell = [[R2, 0], [0, 0], [0, 0], [R2, 0]]
        circuits = [{"label": "Φ+", "qubits": 2, "initial": {"state": bell}, "operations": [CX01, H0]},
                    {"label": "|01⟩", "qubits": 2, "initial": {"basis": 1}, "operations": []}]
        out = call(bridge.run_on_backend, BasicSimulator(), json.dumps({"shots": 512, "circuits": circuits}))
        self.assertEqual(out["data"]["counts"], [{"00": 512}, {"01": 512}])

    def test_too_wide_batches_are_refused_with_advice(self):
        circuits = [{"label": str(i), "qubits": 4, "initial": {"basis": i}, "operations": []} for i in range(8)]
        out = call(bridge.run_on_backend, FakeQollabIonQSimulator(), json.dumps({"shots": 128, "circuits": circuits}))
        self.assertEqual(out["status"], 422)
        self.assertIn("Run fewer inputs", out["detail"])

    def test_split_counts_handles_hex_and_spaced_keys(self):
        self.assertEqual(bridge.split_counts({"0x6": 3, "10 01": 2}, 2, 2), [{"10": 3, "01": 2}, {"01": 3, "10": 2}])


if __name__ == "__main__":
    unittest.main()


class QollabSendFileTests(unittest.TestCase):
    def test_send_file_hands_exports_to_qollab_console(self):
        sent = []
        fake_js = types.ModuleType("js")
        fake_js.sendFile = lambda name, mime, text: sent.append((name, mime, text))
        sys.modules["js"] = fake_js
        try:
            out = call(bridge.send_file, json.dumps({"name": "Quantum-Foundry-Backup.json", "mime": "application/json", "text": "{}"}))
        finally:
            del sys.modules["js"]
        self.assertTrue(out["ok"], out)
        self.assertEqual(sent, [("Quantum-Foundry-Backup.json", "application/json", "{}")])

    def test_send_file_without_qollab_reports_an_error_instead_of_crashing(self):
        sys.modules.pop("js", None)
        out = call(bridge.send_file, json.dumps({"name": "a.qasm", "mime": "text/plain", "text": "x"}))
        self.assertFalse(out["ok"])
        self.assertEqual(call(bridge.send_file, json.dumps({"name": 3}))["status"], 422)
