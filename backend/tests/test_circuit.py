import unittest

from backend.circuit import validate_payload


def basis_request(qubits=2, operations=None, shots=128):
    return {
        "qubits": qubits,
        "initial": {"basis": 1},
        "operations": [] if operations is None else operations,
        "shots": shots,
    }


class CircuitRequestTests(unittest.TestCase):
    def test_accepts_empty_identity_circuit_and_known_gate_set(self):
        identity = validate_payload(basis_request())
        self.assertEqual(identity["operations"], ())
        request = validate_payload(basis_request(2, [
            {"type": "H", "target": 0},
            {"type": "CX", "control": 0, "target": 1},
            {"type": "SWAP", "control": 0, "target": 1},
        ]))
        self.assertEqual([op["type"] for op in request["operations"]], ["H", "CX", "SWAP"])

    def test_checks_register_shots_and_operation_indexes(self):
        for update in ({"qubits": 0}, {"qubits": 7}, {"shots": 256},
                       {"operations": [{"type": "H", "target": 2}]},
                       {"operations": [{"type": "CX", "control": 0, "target": 0}]}):
            request = basis_request()
            request.update(update)
            with self.assertRaises(ValueError):
                validate_payload(request)

    def test_checks_pure_state_norm_and_shape(self):
        request = basis_request(1)
        request["initial"] = {"state": [[1.0, 0.0], [0.0, 0.0]]}
        self.assertAlmostEqual(abs(validate_payload(request)["initial"]["state"][0]), 1.0)
        request["initial"] = {"state": [[1.0, 0.0], [1.0, 0.0]]}
        with self.assertRaises(ValueError):
            validate_payload(request)


if __name__ == "__main__":
    unittest.main()
