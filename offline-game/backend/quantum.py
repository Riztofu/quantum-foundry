"""Qiskit engine: authoritative grading, sampling, and OpenQASM export.

Ported from the original Quantum Foundry backend. The browser compiles the
player's schematic into primitive operations (A = q0, Qiskit's little-endian
order) and posts them here. This module rebuilds a real
``qiskit.QuantumCircuit`` and

* grades every test case with ``Statevector`` state fidelity (global phase
  ignored), and
* grades reusable operations with ``Operator.equiv`` — unitary equivalence up
  to one global phase, so input-dependent phase errors are rejected.

Measurement histograms are illustration only; exact simulation decides
pass/fail, so shot noise can never fail a correct circuit.
"""
from __future__ import absolute_import

from qiskit import QuantumCircuit, qasm2, qasm3, transpile
from qiskit import __version__ as QISKIT_VERSION
from qiskit.circuit.library import StatePreparation
from qiskit.quantum_info import Operator, Statevector, process_fidelity, state_fidelity

TOLERANCE = 1e-9
ENGINE = "qiskit-statevector"
QASM2_BASIS = ["x", "z", "h", "rx", "ry", "rz", "cx"]


def apply_operations(circuit, operations):
    for operation in operations:
        kind, target = operation["type"], operation["target"]
        if kind == "X":
            circuit.x(target)
        elif kind == "H":
            circuit.h(target)
        elif kind == "Z":
            circuit.z(target)
        elif kind == "CX":
            circuit.cx(operation["control"], target)
        elif kind == "SWAP":
            circuit.swap(operation["control"], target)
    return circuit


def operations_circuit(qubits, operations):
    return apply_operations(QuantumCircuit(qubits), operations)


def initial_statevector(qubits, initial):
    if "basis" in initial:
        return Statevector.from_int(initial["basis"], 2 ** qubits)
    return Statevector(list(initial["state"]))


def prepared_circuit(circuit_request, measure=False):
    """Input preparation + player operations as one circuit (for hardware and export)."""
    qubits = circuit_request["qubits"]
    circuit = QuantumCircuit(qubits, qubits if measure else 0, name=_circuit_name(circuit_request))
    initial = circuit_request["initial"]
    if "basis" in initial:
        for target in range(qubits):
            if (initial["basis"] >> target) & 1:
                circuit.x(target)
    else:
        circuit.append(StatePreparation(list(initial["state"])), list(range(qubits)))
        circuit.barrier()
    apply_operations(circuit, circuit_request["operations"])
    if measure:
        circuit.measure(list(range(qubits)), list(range(qubits)))
    return circuit


def _circuit_name(circuit_request):
    label = "".join(ch if ch.isalnum() else "_" for ch in circuit_request.get("label") or "")
    return ("qf_" + label)[:40].rstrip("_") or "qf"


def final_state(circuit_request):
    start = initial_statevector(circuit_request["qubits"], circuit_request["initial"])
    return start.evolve(operations_circuit(circuit_request["qubits"], circuit_request["operations"]))


def amplitudes_json(state):
    return [[float(a.real), float(a.imag)] for a in state.data]


def normalize_counts(raw, qubits, fill=True):
    """Return counts keyed by game-order bitstrings (highest qubit first), zero-filled."""
    counts = {format(i, "0{}b".format(qubits)): 0 for i in range(2 ** qubits)} if fill else {}
    for key, value in raw.items():
        text = str(key).replace(" ", "")
        if text and set(text) <= {"0", "1"} and len(text) <= qubits:
            index = int(text, 2)
        else:  # integer or hex keys from other result formats
            index = int(text, 0)
        if not 0 <= index < 2 ** qubits:
            continue
        bits = format(index, "0{}b".format(qubits))
        counts[bits] = counts.get(bits, 0) + value
    return counts


def simulate(request, seed=None):
    """Exact final state plus Qiskit-sampled measurement counts for one input."""
    state = final_state(request)
    if seed is not None:
        state.seed(seed)
    counts = {k: int(v) for k, v in normalize_counts(state.sample_counts(request["shots"]), request["qubits"]).items()}
    return {
        "engine": ENGINE,
        "qiskit": QISKIT_VERSION,
        "qubits": request["qubits"],
        "shots": request["shots"],
        "amplitudes": amplitudes_json(state),
        "probabilities": [float(p) for p in state.probabilities()],
        "counts": counts,
    }


def verify(request):
    """Grade a mission contract on Qiskit. Mirrors the game's local grader, independently."""
    qubits = request["qubits"]
    results = []
    for index, case in enumerate(request["cases"]):
        actual = final_state(case)
        expected = Statevector(list(case["expected"]))
        fidelity = float(state_fidelity(actual, expected, validate=False))
        results.append({
            "index": index,
            "label": case["label"] or "case {}".format(index + 1),
            "fidelity": fidelity,
            "passed": fidelity > 1 - TOLERANCE,
        })

    operator = None
    if request["operator"] is not None:
        realized = Operator(operations_circuit(qubits, request["operator"]["operations"]))
        reference = Operator(operations_circuit(qubits, request["operator"]["reference"]))
        operator = {
            "equivalent": bool(realized.equiv(reference)),  # equal up to ONE global phase
            "process_fidelity": float(process_fidelity(realized, reference, require_cp=False, require_tp=False)),
        }

    failing = [r for r in results if not r["passed"]]
    passed = not failing and (operator is None or operator["equivalent"])
    if passed:
        summary = "Qiskit confirms all {} case{}".format(len(results), "" if len(results) == 1 else "s")
        if operator:
            summary += " and the full operation (Operator.equiv)"
    elif failing:
        first = failing[0]
        summary = "{}/{} cases differ — {}: state fidelity {:.4f}".format(len(failing), len(results), first["label"], first["fidelity"])
    else:
        summary = "Every case passes, but the full operation is not equivalent (check relative phase and port roles)"
    return {
        "engine": ENGINE,
        "qiskit": QISKIT_VERSION,
        "passed": passed,
        "summary": summary,
        "cases": results,
        "operator": operator,
    }


def export(request):
    """OpenQASM 2.0 and 3.0 for the selected input + circuit, measured (q0 = LSB)."""
    # Lower to gates every OpenQASM 2 reader knows from the original qelib1.inc
    # (StatePreparation and SWAP are not in it); level 0 keeps the player's gates as written.
    circuit = transpile(prepared_circuit(request, measure=True), basis_gates=QASM2_BASIS, optimization_level=0)
    return {
        "qiskit": QISKIT_VERSION,
        "qasm2": qasm2.dumps(circuit),
        "qasm3": qasm3.dumps(circuit),
        "bitOrder": "q[0] is A, the least significant bit; Qiskit count keys read from the highest qubit down to A.",
    }
