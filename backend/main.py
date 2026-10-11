"""Local web service for explicit IonQ QPU runs and Qiskit circuit submission."""
from __future__ import absolute_import

import os
import re
from pathlib import Path

from fastapi import Body, FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

try:
    from .circuit import validate_payload
except ImportError:
    from circuit import validate_payload

ROOT = Path(__file__).resolve().parent.parent
IONQ_BACKEND = os.environ.get("IONQ_BACKEND", "ionq_qpu.forte-1").strip()
_IONQ_BACKEND_RE = re.compile(r"^ionq_qpu(?:\.[A-Za-z0-9._-]+)?$")
_JOB_ID_RE = re.compile(r"^[A-Za-z0-9._:-]{1,128}$")
app = FastAPI(title="Quantum Foundry IonQ bridge", docs_url=None, redoc_url=None)


def _has_ionq_key():
    return any(os.environ.get(name) for name in ("QISKIT_IONQ_API_TOKEN", "IONQ_API_KEY", "IONQ_API_TOKEN"))


def _backend_name():
    if not _IONQ_BACKEND_RE.fullmatch(IONQ_BACKEND):
        raise ValueError("IONQ_BACKEND must name an IonQ QPU, such as ionq_qpu.forte-1.")
    return IONQ_BACKEND


def _provider_backend():
    if not _has_ionq_key():
        raise RuntimeError("Add an IonQ API key to the server environment before submitting a hardware run.")
    from qiskit_ionq import IonQProvider

    provider = IonQProvider()
    backend_name = _backend_name()
    backend = provider.get_backend(backend_name)
    reported_name = getattr(backend, "name", backend_name)
    if callable(reported_name):
        reported_name = reported_name()
    lowered = str(reported_name).lower()
    if "qpu" not in lowered or "sim" in lowered:
        raise RuntimeError("The configured IonQ target is not a physical QPU.")
    return backend, str(reported_name)


def _make_circuit(request_data):
    from qiskit import QuantumCircuit
    from qiskit.circuit.library import StatePreparation

    qubits = request_data["qubits"]
    circuit = QuantumCircuit(qubits, qubits)
    initial = request_data["initial"]
    if "basis" in initial:
        for target in range(qubits):
            if (initial["basis"] >> target) & 1:
                circuit.x(target)
    else:
        circuit.append(StatePreparation(initial["state"]), list(range(qubits)))
    for operation in request_data["operations"]:
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
    # Expand arbitrary pure-state preparation into Qiskit gates for IonQ's compiler.
    circuit = circuit.decompose(reps=10)
    circuit.measure(list(range(qubits)), list(range(qubits)))
    return circuit


def _compile_for_ionq_qis(circuit):
    from qiskit import transpile

    # IonQ QIS accepts rotations and CNOT. Compile to this universal subset directly:
    # transpiling against the full provider target pads a tiny game circuit to every
    # physical qubit on the device, needlessly turning a 2-qubit run into a 36-qubit one.
    return transpile(circuit, basis_gates=["rx", "ry", "rz", "cx"], optimization_level=1)


def _status_name(job):
    status = job.status()
    return str(getattr(status, "name", status)).lower().rsplit(".", 1)[-1]


def _job_response(job, backend_name):
    state = _status_name(job)
    result = {"job_id": str(job.job_id()), "backend": backend_name, "status": state}
    if state == "done":
        counts = job.result().get_counts()
        result["counts"] = {str(bits).replace(" ", ""): int(count) for bits, count in counts.items()}
    return result


@app.middleware("http")
async def restrict_to_local_browser(request: Request, call_next):
    host = request.headers.get("host", "").split(":", 1)[0].strip("[]").lower()
    if host not in ("localhost", "127.0.0.1"):
        return JSONResponse({"detail": "This service only accepts local connections."}, status_code=403)
    origin = request.headers.get("origin")
    expected_origin = "{}://{}".format(request.url.scheme, request.headers.get("host", ""))
    if origin and origin.rstrip("/") != expected_origin.rstrip("/"):
        return JSONResponse({"detail": "Cross-origin requests are not allowed."}, status_code=403)
    return await call_next(request)


@app.get("/api/health")
def health():
    configured_target = IONQ_BACKEND if _IONQ_BACKEND_RE.fullmatch(IONQ_BACKEND) else "IonQ QPU"
    return {
        "hardware_ready": bool(_has_ionq_key() and _IONQ_BACKEND_RE.fullmatch(IONQ_BACKEND)),
        "backend": configured_target,
        "provider": "IonQ",
    }


@app.post("/api/ionq/jobs")
def submit_ionq_job(payload: dict = Body(...)):
    try:
        validated = validate_payload(payload)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error))
    try:
        backend, backend_name = _provider_backend()
        circuit = _compile_for_ionq_qis(_make_circuit(validated))
        job = backend.run(circuit, shots=validated["shots"])
        return _job_response(job, backend_name)
    except Exception:
        raise HTTPException(status_code=502, detail="IonQ could not accept this hardware job. Check the server key, QPU access, and backend name.")


@app.get("/api/ionq/jobs/{job_id}")
def get_ionq_job(job_id: str):
    if not _JOB_ID_RE.fullmatch(job_id):
        raise HTTPException(status_code=400, detail="The IonQ job ID is invalid.")
    try:
        backend, backend_name = _provider_backend()
        job = backend.retrieve_job(job_id)
        return _job_response(job, backend_name)
    except Exception:
        raise HTTPException(status_code=502, detail="IonQ could not return this job. Check the job ID and server key.")


# API routes take priority; the same-origin static app keeps local music available.
app.mount("/", StaticFiles(directory=str(ROOT), html=True), name="quantum-foundry")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="127.0.0.1", port=int(os.environ.get("QF_PORT", "8000")), reload=False)
