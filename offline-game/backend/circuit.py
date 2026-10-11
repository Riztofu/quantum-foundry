"""Strict input validation shared by the Qiskit grader, the IonQ bridge, and their tests.

Every request from the browser passes through here before Qiskit sees it, so
error messages are written for players and never echo raw server state.
Bit order matches the game and Qiskit: A = q0 is the least significant bit.
"""
from __future__ import absolute_import

import math

MAX_QUBITS = 6
MAX_GATES = 4096
MAX_CASES = 16
VALID_SHOTS = (128, 512, 1024)
VALID_GATES = frozenset(("X", "H", "Z", "CX", "SWAP"))


def _is_int(value):
    return isinstance(value, int) and not isinstance(value, bool)


def validate_qubits(qubits):
    if not _is_int(qubits) or not 1 <= qubits <= MAX_QUBITS:
        raise ValueError("Choose a register with one to six qubits.")
    return qubits


def validate_shots(shots):
    if not _is_int(shots) or shots not in VALID_SHOTS:
        raise ValueError("Choose 128, 512, or 1024 shots.")
    return shots


def validate_amplitudes(raw_state, qubits, what="starting state"):
    """Return a tuple of complex amplitudes with total probability 1."""
    if not isinstance(raw_state, list) or len(raw_state) != (1 << qubits):
        raise ValueError("The {} has the wrong number of amplitudes.".format(what))
    amplitudes = []
    for pair in raw_state:
        if not isinstance(pair, (list, tuple)) or len(pair) != 2:
            raise ValueError("Each amplitude in the {} needs a real and imaginary value.".format(what))
        real, imaginary = pair
        if (isinstance(real, bool) or isinstance(imaginary, bool)
                or not isinstance(real, (int, float)) or not isinstance(imaginary, (int, float))):
            raise ValueError("The {} must contain finite numbers.".format(what))
        try:
            real, imaginary = float(real), float(imaginary)
        except OverflowError:
            raise ValueError("The {} must contain finite numbers.".format(what))
        if not math.isfinite(real) or not math.isfinite(imaginary):
            raise ValueError("The {} must contain finite numbers.".format(what))
        amplitudes.append(complex(real, imaginary))
    norm = sum(abs(amplitude) ** 2 for amplitude in amplitudes)
    if not math.isfinite(norm) or abs(norm - 1.0) > 1e-5:
        raise ValueError("The {} amplitudes must have total probability 1.".format(what))
    return tuple(amplitudes)


def validate_initial(initial, qubits):
    """Accept {"basis": int} or {"state": [[re, im], ...]} (the game's two input kinds)."""
    if not isinstance(initial, dict) or len(initial) != 1:
        raise ValueError("The starting state is missing or invalid.")
    if "basis" in initial:
        basis = initial["basis"]
        if not _is_int(basis) or not 0 <= basis < (1 << qubits):
            raise ValueError("The starting bit pattern does not fit this register.")
        return {"basis": basis}
    if "state" in initial:
        return {"state": validate_amplitudes(initial["state"], qubits)}
    raise ValueError("The starting state is missing or invalid.")


def validate_operations(operations, qubits):
    if not isinstance(operations, list) or len(operations) > MAX_GATES:
        raise ValueError("Use no more than 4096 gates in this circuit.")
    normalized = []
    for operation in operations:
        if not isinstance(operation, dict) or not isinstance(operation.get("type"), str) or operation.get("type") not in VALID_GATES:
            raise ValueError("The circuit contains a gate this service cannot run.")
        kind = operation["type"]
        target = operation.get("target")
        if not _is_int(target) or not 0 <= target < qubits:
            raise ValueError("A gate target is outside the selected register.")
        if kind in ("CX", "SWAP"):
            control = operation.get("control")
            if not _is_int(control) or not 0 <= control < qubits or control == target:
                raise ValueError("A two-qubit gate needs two different paths in the register.")
            normalized.append({"type": kind, "control": control, "target": target})
        else:
            normalized.append({"type": kind, "target": target})
    return tuple(normalized)


def validate_circuit(payload, qubits=None):
    """Validate one {qubits?, initial, operations, label?} circuit description."""
    if not isinstance(payload, dict):
        raise ValueError("The circuit request must be a JSON object.")
    qubits = validate_qubits(payload.get("qubits") if qubits is None else qubits)
    label = payload.get("label", "")
    if not isinstance(label, str) or len(label) > 80:
        raise ValueError("Circuit labels must be short text.")
    return {
        "qubits": qubits,
        "label": label,
        "initial": validate_initial(payload.get("initial"), qubits),
        "operations": validate_operations(payload.get("operations"), qubits),
    }


def validate_payload(payload):
    """Return a normalized single-circuit run request or raise ValueError with a safe message."""
    if not isinstance(payload, dict):
        raise ValueError("The circuit request must be a JSON object.")
    qubits = validate_qubits(payload.get("qubits"))
    shots = validate_shots(payload.get("shots"))
    circuit = validate_circuit(payload, qubits)
    circuit["shots"] = shots
    return circuit


def validate_verify(payload):
    """Validate a grading request: per-case circuits with expected final states, plus an optional operator contract."""
    if not isinstance(payload, dict):
        raise ValueError("The grading request must be a JSON object.")
    qubits = validate_qubits(payload.get("qubits"))
    raw_cases = payload.get("cases")
    if not isinstance(raw_cases, list) or not 1 <= len(raw_cases) <= MAX_CASES:
        raise ValueError("Send between 1 and 16 test cases.")
    cases = []
    for raw in raw_cases:
        case = validate_circuit(raw, qubits)
        case["expected"] = validate_amplitudes(raw.get("expected"), qubits, "expected state")
        cases.append(case)
    operator = payload.get("operator")
    if operator is not None:
        if not isinstance(operator, dict):
            raise ValueError("The operation contract is invalid.")
        operator = {
            "operations": validate_operations(operator.get("operations"), qubits),
            "reference": validate_operations(operator.get("reference"), qubits),
        }
    return {"qubits": qubits, "cases": cases, "operator": operator}


def validate_ionq_job(payload):
    """Validate an IonQ submission: 1-16 measured circuits (one per input) on one register size."""
    if not isinstance(payload, dict):
        raise ValueError("The IonQ request must be a JSON object.")
    target = payload.get("target")
    if not isinstance(target, str) or not target:
        raise ValueError("Choose an IonQ target.")
    shots = validate_shots(payload.get("shots"))
    raw_circuits = payload.get("circuits")
    if not isinstance(raw_circuits, list) or not 1 <= len(raw_circuits) <= MAX_CASES:
        raise ValueError("Send between 1 and 16 circuits in one IonQ job.")
    qubits = validate_qubits(raw_circuits[0].get("qubits") if isinstance(raw_circuits[0], dict) else None)
    circuits = [validate_circuit(raw, qubits) for raw in raw_circuits]
    name = payload.get("name", "Quantum Foundry")
    if not isinstance(name, str):
        raise ValueError("The job name must be text.")
    name = "".join(ch for ch in name if ch.isprintable())[:80] or "Quantum Foundry"
    mitigation = payload.get("error_mitigation", False)
    if not isinstance(mitigation, bool):
        raise ValueError("Error mitigation must be on or off.")
    return {"target": target, "shots": shots, "circuits": circuits, "name": name, "error_mitigation": mitigation}
