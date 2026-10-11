"""Generate Qiskit reference fixtures that validate the game's JavaScript simulator.

Run from offline-game/:  python -m backend.make_reference > tests/qiskit_reference.json

Every mission contract plus seeded random circuits over the full gate set
(X, H, Z, CX, SWAP; 1-6 qubits). Statevectors come from Qiskit's Statevector,
unitaries (up to 3 qubits) from Operator. tests/qiskit-reference.test.cjs
checks core.js against these numbers on every `node --test` run.
"""
import json
import random

from qiskit import __version__ as QISKIT_VERSION
from qiskit.quantum_info import Operator, Statevector

from backend.quantum import operations_circuit

R = random.Random(20261011)


def gate(kind, target, control=None):
    return {"type": kind, "target": target} if control is None else {"type": kind, "control": control, "target": target}


NAMED = [
    ("bell", 2, [gate("H", 0), gate("CX", 1, 0)]),
    ("hidden-sign", 1, [gate("H", 0), gate("Z", 0), gate("H", 0)]),
    ("reversed-cnot", 2, [gate("CX", 0, 1)]),
    ("bell-decoder", 2, [gate("CX", 1, 0), gate("H", 0)]),
    ("swap-from-cnots", 2, [gate("CX", 1, 0), gate("CX", 0, 1), gate("CX", 1, 0)]),
    ("swap-gate", 2, [gate("SWAP", 1, 0)]),
    ("ghz3", 3, [gate("H", 0), gate("CX", 1, 0), gate("CX", 2, 1)]),
    ("parity", 4, [gate("CX", 3, 0), gate("CX", 3, 1), gate("CX", 3, 2)]),
    ("ghz4", 4, [gate("H", 0), gate("CX", 1, 0), gate("CX", 2, 1), gate("CX", 3, 2)]),
]


def random_circuit(n, length=24):
    ops = []
    for _ in range(length):
        kind = R.choice(["X", "H", "Z", "CX", "SWAP"] if n > 1 else ["X", "H", "Z"])
        target = R.randrange(n)
        ops.append(gate(kind, target, R.choice([q for q in range(n) if q != target]) if kind in ("CX", "SWAP") else None))
    return ops


def pairs(values):
    return [[round(float(v.real), 15), round(float(v.imag), 15)] for v in values]


def main():
    circuits = NAMED + [("random-{}q-{}".format(n, i), n, random_circuit(n)) for n in range(1, 7) for i in range(3)]
    out = {"qiskit": QISKIT_VERSION, "bitOrder": "q0 least significant", "statevectors": [], "unitaries": []}
    for name, n, ops in circuits:
        circuit = operations_circuit(n, ops)
        initial = R.randrange(2 ** n)
        state = Statevector.from_int(initial, 2 ** n).evolve(circuit)
        out["statevectors"].append({"name": name, "n": n, "initial": initial, "gates": ops, "amps": pairs(state.data)})
        if n <= 3:
            matrix = Operator(circuit).data
            out["unitaries"].append({"name": name, "n": n, "gates": ops, "matrix": [pairs(row) for row in matrix]})
    print(json.dumps(out))


if __name__ == "__main__":
    main()
