"""Quantum Foundry local service: Qiskit grading, Qiskit sampling, OpenQASM export, and IonQ.

Run ``python main.py`` and open http://127.0.0.1:8000 — the service also
serves the game itself, so every feature works same-origin.

Two trust levels:

* ``/api/health``, ``/api/verify``, ``/api/run``, ``/api/qasm`` are free,
  CPU-only Qiskit calls. They answer any origin (CORS ``*``) so the game can
  also use them when opened straight from ``index.html`` (``file://``).
* ``/api/ionq/*`` can spend IonQ credits. It accepts only same-origin
  requests from a localhost page, never ``file://`` or another website.

The whole service binds to 127.0.0.1 and rejects non-local Host headers
(DNS-rebinding protection). It is not designed for public hosting.
"""
from __future__ import absolute_import

import logging
import os
from pathlib import Path

from fastapi import Body, FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles

try:
    from . import ionq, quantum
    from .circuit import validate_ionq_job, validate_payload, validate_verify
except ImportError:
    import ionq
    import quantum
    from circuit import validate_ionq_job, validate_payload, validate_verify

ROOT = Path(__file__).resolve().parent.parent
SERVICE = "quantum-foundry"
OPEN_PATHS = ("/api/health", "/api/verify", "/api/run", "/api/qasm")
CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "600",
    # Chrome's Private Network Access: let a file:// page reach this localhost service.
    "Access-Control-Allow-Private-Network": "true",
}
app = FastAPI(title="Quantum Foundry", docs_url=None, redoc_url=None)
logging.basicConfig(level=logging.WARNING, format="%(levelname)s %(name)s: %(message)s")


@app.middleware("http")
async def local_only(request: Request, call_next):
    host = request.headers.get("host", "").rsplit(":", 1)[0].strip("[]").lower()
    if host not in ("localhost", "127.0.0.1", "::1"):
        return JSONResponse({"detail": "This service only accepts local connections."}, status_code=403)
    path = request.url.path.rstrip("/") or "/"
    if path in OPEN_PATHS:
        if request.method == "OPTIONS":
            return Response(status_code=204, headers=CORS_HEADERS)
        response = await call_next(request)
        response.headers.update(CORS_HEADERS)
        return response
    origin = request.headers.get("origin")
    expected = "{}://{}".format(request.url.scheme, request.headers.get("host", ""))
    if origin and origin.rstrip("/") != expected.rstrip("/"):
        return JSONResponse({"detail": "IonQ requests must come from the game served by this service."}, status_code=403)
    return await call_next(request)


def _validated(validator, payload):
    try:
        return validator(payload)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error))


def _ionq_call(function, *args):
    try:
        return function(*args)
    except ionq.IonQServiceError as error:
        raise HTTPException(status_code=error.status, detail=error.message)


@app.get("/api/health")
def health():
    status = ionq.health()
    return {
        "service": SERVICE,
        "engine": quantum.ENGINE,
        "qiskit": quantum.QISKIT_VERSION,
        "ionq": status,
        # Kept for older game builds that only knew the hardware flag.
        "hardware_ready": status["configured"],
    }


@app.post("/api/verify")
def verify(payload: dict = Body(...)):
    """Grade a mission contract: Statevector fidelity per case + Operator.equiv."""
    return quantum.verify(_validated(validate_verify, payload))


@app.post("/api/run")
def run(payload: dict = Body(...)):
    """Exact final state and Qiskit-sampled counts for one selected input."""
    return quantum.simulate(_validated(validate_payload, payload))


@app.post("/api/qasm")
def qasm(payload: dict = Body(...)):
    payload = {**payload, "shots": payload.get("shots", 512)} if isinstance(payload, dict) else payload
    return quantum.export(_validated(validate_payload, payload))


@app.get("/api/ionq/targets")
def ionq_targets():
    return {**ionq.health(), "availability": _ionq_call(ionq.availability)}


@app.post("/api/ionq/estimate")
def ionq_estimate(payload: dict = Body(...)):
    request = _validated(validate_ionq_job, payload)
    return _ionq_call(ionq.estimate, request["target"], request["circuits"], request["shots"], request["error_mitigation"])


@app.post("/api/ionq/jobs")
def ionq_submit(payload: dict = Body(...)):
    request = _validated(validate_ionq_job, payload)
    if _ionq_call(ionq.require_target, request["target"])["paid"] and payload.get("confirm_paid") is not True:
        raise HTTPException(status_code=428, detail="Confirm that this QPU run may use paid IonQ credits.")
    return _ionq_call(ionq.submit, request)


@app.get("/api/ionq/jobs")
def ionq_jobs():
    return {"jobs": ionq.recent_jobs()}


@app.get("/api/ionq/jobs/{job_id}")
def ionq_job(job_id: str):
    return _ionq_call(ionq.status, job_id)


@app.post("/api/ionq/jobs/{job_id}/cancel")
def ionq_cancel(job_id: str):
    return _ionq_call(ionq.cancel, job_id)


# API routes take priority; the same-origin static app keeps music and IonQ available.
app.mount("/", StaticFiles(directory=str(ROOT), html=True), name="quantum-foundry")


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("QF_PORT", "8000"))
    print("Quantum Foundry — Qiskit {} · open http://127.0.0.1:{}".format(quantum.QISKIT_VERSION, port))
    status = ionq.health()
    print("IonQ: " + ("key found · targets: " + ", ".join(t["id"] for t in status["targets"]) if status["key"]
                      else "no API key (set IONQ_API_KEY to enable IonQ runs)"))
    uvicorn.run(app, host="127.0.0.1", port=port, reload=False)
