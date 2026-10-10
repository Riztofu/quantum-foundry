"""Generate Qiskit reference fixtures used to validate the local TS simulator.

Run: python3 make_reference.py > ../frontend/src/quantum/__tests__/qiskit_reference.json
"""
import json

from qiskit import QuantumCircuit
from qiskit.quantum_info import Operator, Statevector

CASES = [
    {"n": 1, "ops": [{"gate": "H", "qubits": [0]}]},
    {"n": 1, "ops": [{"gate": "X", "qubits": [0]}]},
    {"n": 1, "ops": [{"gate": "H", "qubits": [0]}, {"gate": "Z", "qubits": [0]}, {"gate": "H", "qubits": [0]}]},
    {"n": 2, "ops": [{"gate": "H", "qubits": [0]}, {"gate": "CX", "qubits": [0, 1]}]},
    {
        "n": 2,
        "ops": [
            {"gate": "H", "qubits": [0]},
            {"gate": "CX", "qubits": [0, 1]},
            {"gate": "X", "qubits": [0]},
            {"gate": "Z", "qubits": [0]},
            {"gate": "CX", "qubits": [0, 1]},
            {"gate": "H", "qubits": [0]},
        ],
    },
    {"n": 2, "ops": [{"gate": "CX", "qubits": [1, 0]}]},
    {"n": 2, "ops": [{"gate": "CX", "qubits": [0, 1]}, {"gate": "H", "qubits": [0]}]},
]


def build(case):
    qc = QuantumCircuit(case["n"])
    for op in case["ops"]:
        if op["gate"] == "H":
            qc.h(op["qubits"][0])
        elif op["gate"] == "X":
            qc.x(op["qubits"][0])
        elif op["gate"] == "Z":
            qc.z(op["qubits"][0])
        elif op["gate"] == "CX":
            qc.cx(op["qubits"][0], op["qubits"][1])
    return qc


def main():
    out = {"statevectors": [], "unitaries": []}
    for case in CASES:
        qc = build(case)
        sv = Statevector.from_label("0" * case["n"]).evolve(qc)
        amps = [[float(a.real), float(a.imag)] for a in sv.data]
        out["statevectors"].append({**case, "amps": amps})
        u = Operator(qc).data
        matrix = [[[float(u[r][c].real), float(u[r][c].imag)] for c in range(u.shape[1])] for r in range(u.shape[0])]
        out["unitaries"].append({**case, "matrix": matrix})
    print(json.dumps(out))


if __name__ == "__main__":
    main()
