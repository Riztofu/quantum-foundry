"""Strict input validation shared by the IonQ API and its unit tests."""
from __future__ import absolute_import

import math

MAX_QUBITS = 6
MAX_GATES = 4096
VALID_SHOTS = (128, 512, 1024)
VALID_GATES = frozenset(("X", "H", "Z", "CX", "SWAP"))


def validate_payload(payload):
    """Return a normalized circuit request or raise ValueError with a safe message."""
    if not isinstance(payload, dict):
        raise ValueError("The circuit request must be a JSON object.")
    qubits = payload.get("qubits")
    if isinstance(qubits, bool) or not isinstance(qubits, int) or not 1 <= qubits <= MAX_QUBITS:
        raise ValueError("Choose a register with one to six qubits.")
    shots = payload.get("shots")
    if isinstance(shots, bool) or not isinstance(shots, int) or shots not in VALID_SHOTS:
        raise ValueError("Choose 128, 512, or 1024 shots.")

    initial = payload.get("initial")
    if not isinstance(initial, dict) or len(initial) != 1:
        raise ValueError("The starting state is missing or invalid.")
    if "basis" in initial:
        basis = initial["basis"]
        if isinstance(basis, bool) or not isinstance(basis, int) or not 0 <= basis < (1 << qubits):
            raise ValueError("The starting bit pattern does not fit this register.")
        normalized_initial = {"basis": basis}
    elif "state" in initial:
        raw_state = initial["state"]
        if not isinstance(raw_state, list) or len(raw_state) != (1 << qubits):
            raise ValueError("The starting state has the wrong number of amplitudes.")
        amplitudes = []
        for pair in raw_state:
            if not isinstance(pair, (list, tuple)) or len(pair) != 2:
                raise ValueError("Each starting amplitude needs a real and imaginary value.")
            real, imaginary = pair
            if (isinstance(real, bool) or isinstance(imaginary, bool)
                    or not isinstance(real, (int, float)) or not isinstance(imaginary, (int, float))):
                raise ValueError("The starting state must contain finite numbers.")
            try:
                real, imaginary = float(real), float(imaginary)
            except OverflowError:
                raise ValueError("The starting state must contain finite numbers.")
            if not math.isfinite(real) or not math.isfinite(imaginary):
                raise ValueError("The starting state must contain finite numbers.")
            amplitudes.append(complex(real, imaginary))
        norm = sum(abs(amplitude) ** 2 for amplitude in amplitudes)
        if not math.isfinite(norm) or abs(norm - 1.0) > 1e-5:
            raise ValueError("The starting amplitudes must have total probability 1.")
        normalized_initial = {"state": tuple(amplitudes)}
    else:
        raise ValueError("The starting state is missing or invalid.")

    operations = payload.get("operations")
    if not isinstance(operations, list) or len(operations) > MAX_GATES:
        raise ValueError("Use no more than 4096 gates in this circuit.")
    normalized_operations = []
    for operation in operations:
        if not isinstance(operation, dict) or not isinstance(operation.get("type"), str) or operation.get("type") not in VALID_GATES:
            raise ValueError("The circuit contains a gate this service cannot run.")
        kind = operation["type"]
        target = operation.get("target")
        if isinstance(target, bool) or not isinstance(target, int) or not 0 <= target < qubits:
            raise ValueError("A gate target is outside the selected register.")
        if kind in ("CX", "SWAP"):
            control = operation.get("control")
            if (isinstance(control, bool) or not isinstance(control, int)
                    or not 0 <= control < qubits or control == target):
                raise ValueError("A two-qubit gate needs two different paths in the register.")
            normalized_operations.append({"type": kind, "control": control, "target": target})
        else:
            normalized_operations.append({"type": kind, "target": target})

    return {
        "qubits": qubits,
        "shots": shots,
        "initial": normalized_initial,
        "operations": tuple(normalized_operations),
    }
