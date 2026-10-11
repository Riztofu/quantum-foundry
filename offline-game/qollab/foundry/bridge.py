"""Quantum Foundry on Qollab: the game's Qiskit engine, called from main.js.

This package is the same grader as the local service (backend/quantum.py and
backend/circuit.py are copied in by build-qollab.cjs). It runs in Qollab's
in-browser Python (Pyodide). Every function takes and returns JSON text so
nothing depends on proxy conversion: ``{"ok": true, "data": ...}`` or
``{"ok": false, "status": 422, "detail": "..."}``.

Hardware-style runs use the ``backend`` Qollab pre-creates from the Select QPU
dialog. IonQ backends accept one job per Run, so every selected test input is
packed side by side into ONE circuit (input i on qubits i*n ... i*n+n-1) and
the measured bitstrings are split back apart.
"""
import json
import time

from qiskit import QuantumCircuit, transpile
from qiskit import __version__ as QISKIT_VERSION

from . import quantum
from .circuit import MAX_CASES, validate_circuit, validate_payload, validate_qubits, validate_shots, validate_verify

QIS_BASIS = ["x", "y", "z", "h", "s", "sdg", "t", "tdg", "rx", "ry", "rz", "cx", "swap"]
MAX_PACKED_QUBITS = 24


def _respond(function, payload_json):
    try:
        return json.dumps({"ok": True, "data": function(json.loads(payload_json))})
    except ValueError as error:  # includes malformed JSON
        return json.dumps({"ok": False, "status": 422, "detail": str(error)})
    except Exception as error:  # report, never break the game
        return json.dumps({"ok": False, "status": 502, "detail": "{}: {}".format(type(error).__name__, error)[:400]})


def verify(payload_json):
    return _respond(lambda data: quantum.verify(validate_verify(data)), payload_json)


def simulate(payload_json):
    return _respond(lambda data: quantum.simulate(validate_payload(data)), payload_json)


def export(payload_json):
    return _respond(lambda data: quantum.export(validate_payload({**data, "shots": data.get("shots", 512)})), payload_json)


def _name(backend):
    name = getattr(backend, "name", "backend")
    return str(name() if callable(name) else name)


def _option(backend, key):
    options = getattr(backend, "options", None)
    try:
        return getattr(options, key) if options is not None else None
    except AttributeError:
        return None


def _info(backend):
    name = _name(backend)
    lowered = name.lower()
    ionq = "ionq" in lowered
    paid = ionq and "qpu" in lowered and "sim" not in lowered
    noise = _option(backend, "noise_model") if ionq and not paid else None
    if paid:
        label = "IonQ " + name.split(".", 1)[-1].replace("-", " ").title() + " QPU"
    elif ionq:
        label = "IonQ simulator" + (" · {} noise model".format(noise) if noise and noise != "ideal" else "")
    else:
        label = name.replace("_", " ")
    short = ("IonQ " + name.split(".", 1)[-1].replace("-", " ").title()) if paid else "IonQ sim" if ionq else "simulator"
    qubits = getattr(backend, "num_qubits", None)
    try:
        qubits = int(qubits)
    except (TypeError, ValueError):
        qubits = MAX_PACKED_QUBITS
    return {"name": name, "label": label, "short": short, "ionq": ionq, "paid": paid, "noise_model": noise,
            "max_qubits": max(1, min(MAX_PACKED_QUBITS, qubits)), "qiskit": QISKIT_VERSION}


def describe(backend):
    return _respond(lambda _: _info(backend), "{}")


def pack(circuits):
    """Place each prepared input on its own block of qubits in one measured circuit."""
    width = circuits[0]["qubits"]
    total = width * len(circuits)
    packed = QuantumCircuit(total, total, name="quantum_foundry")
    for index, circuit in enumerate(circuits):
        block = list(range(index * width, (index + 1) * width))
        packed.compose(quantum.prepared_circuit(circuit, measure=False), qubits=block, inplace=True)
    packed.measure(list(range(total)), list(range(total)))
    return packed


def split_counts(raw, width, copies):
    """Split packed bitstrings (highest qubit first) back into one count table per input."""
    total = width * copies
    tables = [{} for _ in range(copies)]
    for key, value in raw.items():
        text = str(key).replace(" ", "")
        if not (text and set(text) <= {"0", "1"} and len(text) <= total):
            text = format(int(text, 0), "b")
        text = text.zfill(total)
        for index in range(copies):
            bits = text[total - (index + 1) * width: total - index * width]
            tables[index][bits] = tables[index].get(bits, 0) + int(round(value))
    return tables


def _compile(circuit, backend, info):
    if info["ionq"]:
        return transpile(circuit, basis_gates=QIS_BASIS, optimization_level=1)
    try:
        return transpile(circuit, backend=backend, optimization_level=1)
    except Exception:
        return transpile(circuit, basis_gates=["x", "z", "h", "rx", "ry", "rz", "cx"], optimization_level=1)


def _run(backend, data):
    info = _info(backend)
    if not isinstance(data, dict):
        raise ValueError("The run request must be a JSON object.")
    shots = validate_shots(data.get("shots"))
    raw_circuits = data.get("circuits")
    if not isinstance(raw_circuits, list) or not 1 <= len(raw_circuits) <= MAX_CASES:
        raise ValueError("Send between 1 and 16 circuits.")
    width = validate_qubits(raw_circuits[0].get("qubits") if isinstance(raw_circuits[0], dict) else None)
    circuits = [validate_circuit(raw, width) for raw in raw_circuits]
    if width * len(circuits) > info["max_qubits"]:
        raise ValueError("{} inputs × {} qubits do not fit on {} ({} qubits). Run fewer inputs.".format(
            len(circuits), width, info["label"], info["max_qubits"]))
    options = {"shots": shots}
    if info["paid"] and data.get("error_mitigation") is True:
        from qiskit_ionq import ErrorMitigation
        options["error_mitigation"] = ErrorMitigation.DEBIASING
    started = time.time()
    job = backend.run(_compile(pack(circuits), backend, info), **options)
    counts = job.result().get_counts()
    if isinstance(counts, list):
        counts = counts[0]
    return {"counts": split_counts(counts, width, len(circuits)), "seconds": round(time.time() - started, 2),
            "backend": info["label"]}


def run_on_backend(backend, payload_json):
    """One job on the Qollab-selected backend holding every requested input."""
    return _respond(lambda data: _run(backend, data), payload_json)
