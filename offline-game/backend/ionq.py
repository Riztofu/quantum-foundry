"""IonQ bridge: cloud simulator (ideal or device noise models) and physical QPUs.

The API key stays in this process's environment (``IONQ_API_KEY``, or
``QISKIT_IONQ_API_TOKEN`` / ``IONQ_API_TOKEN``); the browser never sees it.

Targets
-------
``simulator``            IonQ cloud simulator, ideal (free)
``simulator@aria-1``     IonQ cloud simulator with the Aria noise model (free)
``simulator@forte-1``    IonQ cloud simulator with the Forte noise model (free)
``qpu.<device>``         a physical trapped-ion QPU (uses paid credits)

QPU targets are offered only when ``IONQ_ENABLE_QPU=1`` is set, so a demo
machine cannot spend credits by accident. ``IONQ_TARGETS`` (comma-separated)
replaces the default list; ``IONQ_DEFAULT_TARGET`` chooses the preselected one.

Hardware and noisy-simulator counts are samples for one prepared input each;
they illustrate the circuit on a real stack and never decide campaign grading.
"""
from __future__ import absolute_import

import json
import logging
import os
import re
import threading
import time
from pathlib import Path

try:
    from . import quantum
except ImportError:
    import quantum

log = logging.getLogger("quantum_foundry.ionq")

DEFAULT_TARGETS = "simulator,simulator@aria-1,simulator@forte-1,qpu.aria-1,qpu.forte-1,qpu.forte-enterprise-1"
KEY_VARIABLES = ("IONQ_API_KEY", "QISKIT_IONQ_API_TOKEN", "IONQ_API_TOKEN")
# IonQ's QIS gate set accepts these directly; compiling to an explicit basis (rather than the
# provider target) keeps a 2-qubit game circuit at 2 qubits instead of padding to the device.
QIS_BASIS = ["x", "y", "z", "h", "s", "sdg", "t", "tdg", "rx", "ry", "rz", "cx", "swap"]
MAX_CIRCUITS = 16
_TARGET_RE = re.compile(r"^(simulator(@[a-z0-9][a-z0-9._-]{0,40})?|qpu\.[a-z0-9][a-z0-9._-]{0,40})$")
_JOB_ID_RE = re.compile(r"^[A-Za-z0-9._:-]{1,128}$")
_STATUS_CACHE_SECONDS = 60
JOBS_FILE = Path(os.environ.get("QF_JOBS_FILE", str(Path(__file__).resolve().parent / ".ionq-jobs.json")))


class IonQServiceError(Exception):
    """A failure that is safe to show to the player, with an HTTP status."""

    def __init__(self, message, status=502):
        super().__init__(message)
        self.message, self.status = message, status


def _env_flag(name):
    return os.environ.get(name, "").strip().lower() in ("1", "true", "yes", "on")


def has_key():
    return any(os.environ.get(name) for name in KEY_VARIABLES)


def describe_target(target_id):
    if target_id == "simulator":
        return {"id": target_id, "label": "IonQ cloud simulator (ideal)", "kind": "simulator", "noise_model": "ideal", "paid": False}
    if target_id.startswith("simulator@"):
        model = target_id.split("@", 1)[1]
        return {"id": target_id, "label": "IonQ simulator · {} noise model".format(model), "kind": "simulator", "noise_model": model, "paid": False}
    device = target_id.split(".", 1)[1]
    return {"id": target_id, "label": "IonQ {} QPU".format(device.replace("-", " ").title()), "kind": "qpu", "device": device, "paid": True}


def configured_targets():
    raw = os.environ.get("IONQ_TARGETS") or DEFAULT_TARGETS
    allow_qpu = _env_flag("IONQ_ENABLE_QPU")
    seen, targets = set(), []
    for item in raw.split(","):
        target_id = item.strip().lower()
        if not target_id or target_id in seen or not _TARGET_RE.fullmatch(target_id):
            continue
        if target_id.startswith("qpu.") and not allow_qpu:
            continue
        seen.add(target_id)
        targets.append(describe_target(target_id))
    return targets


def default_target(targets=None):
    targets = configured_targets() if targets is None else targets
    wanted = os.environ.get("IONQ_DEFAULT_TARGET", "").strip().lower()
    ids = [t["id"] for t in targets]
    if wanted in ids:
        return wanted
    return ids[0] if ids else None


def require_target(target_id):
    if not isinstance(target_id, str) or target_id.lower() not in {t["id"] for t in configured_targets()}:
        raise IonQServiceError("That IonQ target is not enabled on this server.", 400)
    return describe_target(target_id.lower())


def health():
    targets = configured_targets()
    try:
        import qiskit_ionq
        provider_version = getattr(qiskit_ionq, "__version__", "unknown")
    except ImportError:
        provider_version = None
    return {
        "configured": bool(has_key() and provider_version),
        "key": has_key(),
        "provider": provider_version,
        "qpu_enabled": _env_flag("IONQ_ENABLE_QPU"),
        "targets": targets,
        "default": default_target(targets),
    }


# ── Provider access ───────────────────────────────────────────────────────

_backends = {}
_backend_lock = threading.Lock()


def _provider():
    if not has_key():
        raise IonQServiceError("Add an IonQ API key to the server environment (IONQ_API_KEY) and restart it.", 503)
    try:
        from qiskit_ionq import IonQProvider
    except ImportError:
        raise IonQServiceError("The server is missing qiskit-ionq. Install backend/requirements.txt.", 503)
    return IonQProvider()


def get_backend(target_id):
    """Cached qiskit-ionq backend for a configured target, with its noise model applied."""
    target = require_target(target_id)
    with _backend_lock:
        if target["id"] not in _backends:
            provider = _provider()
            if target["kind"] == "simulator":
                backend = provider.get_backend("simulator")
                backend.set_options(noise_model=target["noise_model"])
            else:
                backend = provider.get_backend("qpu." + target["device"])
                if "qpu" not in str(backend.name).lower() or "sim" in str(backend.name).lower():
                    raise IonQServiceError("The configured IonQ QPU target resolved to a simulator.", 500)
            _backends[target["id"]] = backend
        return _backends[target["id"]]


def translate_error(error):
    """Map qiskit-ionq / transport exceptions to messages a player can act on."""
    if isinstance(error, IonQServiceError):
        return error
    try:
        from qiskit_ionq import exceptions as ionq_exceptions
    except ImportError:  # pragma: no cover - provider missing is reported earlier
        ionq_exceptions = None
    log.warning("IonQ request failed: %r", error)
    if ionq_exceptions is not None:
        if isinstance(error, ionq_exceptions.IonQCredentialsError):
            return IonQServiceError("The server's IonQ credentials are missing or malformed.", 503)
        if isinstance(error, ionq_exceptions.IonQAPIError):
            code = getattr(error, "status_code", 502)
            detail = str(getattr(error, "message", "") or "")[:240]
            if code in (401, 403):
                return IonQServiceError("IonQ rejected the API key, or this account cannot use that target. " + detail, 502)
            if code == 404:
                return IonQServiceError("IonQ does not recognize that job or backend. " + detail, 404)
            if code == 429:
                return IonQServiceError("IonQ is rate-limiting requests. Wait a moment and try again.", 429)
            return IonQServiceError("IonQ returned an error ({}): {}".format(code, detail or "no details"), 502)
        if isinstance(error, ionq_exceptions.IonQGateError):
            return IonQServiceError("IonQ cannot run one of this circuit's gates: " + str(error)[:200], 422)
        if isinstance(error, ionq_exceptions.IonQError):
            return IonQServiceError("IonQ: " + str(getattr(error, "message", error))[:240], 502)
    name = type(error).__name__
    if name in ("ConnectionError", "Timeout", "ReadTimeout", "ConnectTimeout"):
        return IonQServiceError("The server could not reach IonQ. Check its internet connection.", 504)
    return IonQServiceError("IonQ could not complete this request.", 502)


# ── Circuits, estimates, and jobs ─────────────────────────────────────────

def compile_for_ionq(circuit_request):
    from qiskit import transpile

    measured = quantum.prepared_circuit(circuit_request, measure=True)
    return transpile(measured, basis_gates=QIS_BASIS, optimization_level=1)


def gate_counts(circuit):
    one, two = 0, 0
    for item in circuit.data:
        if item.operation.name in ("measure", "barrier", "id"):
            continue
        if len(item.qubits) == 1:
            one += 1
        else:
            two += 1
    return one, two


def estimate(target_id, circuits, shots, error_mitigation=False):
    """IonQ's own cost/time prediction for a batch, summed per circuit (simulators are free)."""
    target = require_target(target_id)
    compiled = [compile_for_ionq(c) for c in circuits]
    shapes = [gate_counts(c) + (c.num_qubits,) for c in compiled]
    if target["kind"] == "simulator":
        return {"target": target["id"], "paid": False, "cost": 0.0, "cost_unit": "USD", "circuits": len(compiled), "gates": shapes}
    try:
        backend = get_backend(target["id"])
        cost, unit, execution, queue = 0.0, None, 0.0, None
        cache = {}
        for shape in shapes:
            if shape not in cache:
                cache[shape] = backend.client.estimate_job(
                    backend="qpu." + target["device"], oneq_gates=shape[0], twoq_gates=shape[1],
                    qubits=shape[2], shots=shots, error_mitigation=bool(error_mitigation))
            result = cache[shape]
            cost += float(result.cost or 0)
            unit = unit or result.cost_unit
            execution += float(result.exec_time or 0)
            if result.queue_time is not None:
                queue = max(queue or 0.0, float(result.queue_time))
    except Exception as error:
        raise translate_error(error)
    return {"target": target["id"], "paid": True, "cost": round(cost, 4), "cost_unit": unit or "USD",
            "execution_seconds": execution, "queue_seconds": queue, "circuits": len(compiled), "gates": shapes}


_jobs_lock = threading.Lock()


def _load_jobs():
    try:
        data = json.loads(JOBS_FILE.read_text())
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def _remember_job(job_id, record):
    with _jobs_lock:
        jobs = _load_jobs()
        jobs[job_id] = record
        if len(jobs) > 200:  # keep the newest records only
            jobs = dict(sorted(jobs.items(), key=lambda kv: kv[1].get("created", 0))[-200:])
        try:
            JOBS_FILE.write_text(json.dumps(jobs, indent=1))
        except OSError as error:
            log.warning("Could not save IonQ job registry: %s", error)


def job_record(job_id):
    if not isinstance(job_id, str) or not _JOB_ID_RE.fullmatch(job_id):
        raise IonQServiceError("The IonQ job ID is invalid.", 400)
    with _jobs_lock:
        record = _load_jobs().get(job_id)
    if record is None:
        raise IonQServiceError("This server did not submit that IonQ job.", 404)
    return record


def submit(request):
    """Submit one IonQ job holding every requested circuit (one per selected input)."""
    target = require_target(request["target"])
    try:
        backend = get_backend(target["id"])
        compiled = [compile_for_ionq(c) for c in request["circuits"]]
        options = {"shots": request["shots"], "name": request["name"]}
        if target["kind"] == "qpu" and request["error_mitigation"]:
            from qiskit_ionq import ErrorMitigation
            options["error_mitigation"] = ErrorMitigation.DEBIASING
        job = backend.run(compiled if len(compiled) > 1 else compiled[0], **options)
        job_id = str(job.job_id())
    except Exception as error:
        raise translate_error(error)
    record = {
        "target": target["id"],
        "name": request["name"],
        "labels": [c["label"] for c in request["circuits"]],
        "qubits": request["circuits"][0]["qubits"],
        "shots": request["shots"],
        "error_mitigation": bool(options.get("error_mitigation")),
        "created": time.time(),
    }
    _remember_job(job_id, record)
    return {"job_id": job_id, "status": "submitted", **_public(record, target)}


def _public(record, target):
    return {"target": target["id"], "target_label": target["label"], "paid": target["paid"], "name": record["name"],
            "labels": record["labels"], "qubits": record["qubits"], "shots": record["shots"],
            "error_mitigation": record.get("error_mitigation", False), "created": record["created"]}


def _status_name(status):
    return str(getattr(status, "name", status)).lower().rsplit(".", 1)[-1]


def status(job_id):
    record = job_record(job_id)
    target = describe_target(record["target"])
    response = {"job_id": job_id, **_public(record, target)}
    try:
        from qiskit_ionq import exceptions as ionq_exceptions
        job = get_backend(target["id"]).retrieve_job(job_id)
        try:
            state = _status_name(job.status())
        except ionq_exceptions.IonQJobFailureError as failure:
            response.update(status="failed", error=str(getattr(failure, "message", failure))[:300])
            return response
        response["status"] = {"initializing": "submitted", "error": "failed"}.get(state, state)
        if state == "done":
            result = job.result()
            counts = []
            for index in range(len(record["labels"])):
                raw = result.get_counts(index)
                counts.append({k: int(round(v)) for k, v in quantum.normalize_counts(raw, record["qubits"], fill=False).items()})
            response["counts"] = counts
            seconds = getattr(job, "_execution_time", None)
            if isinstance(seconds, (int, float)) and seconds != float("inf"):
                response["execution_seconds"] = seconds
    except IonQServiceError:
        raise
    except Exception as error:
        raise translate_error(error)
    return response


def cancel(job_id):
    record = job_record(job_id)
    try:
        get_backend(record["target"]).cancel_job(job_id)
    except Exception as error:
        raise translate_error(error)
    return status(job_id)


def recent_jobs(limit=20):
    with _jobs_lock:
        jobs = _load_jobs()
    configured = {t["id"] for t in configured_targets()}
    newest = sorted(jobs.items(), key=lambda kv: kv[1].get("created", 0), reverse=True)[:limit]
    return [{"job_id": job_id, **_public(record, describe_target(record["target"]))}
            for job_id, record in newest if record.get("target") in configured]


_availability = {}


def availability():
    """Per-target availability from IonQ's latest characterization (cached for a minute)."""
    out = []
    for target in configured_targets():
        entry = {"id": target["id"], "available": None}
        if target["kind"] == "simulator":
            entry["available"] = True if has_key() else None
        elif has_key():
            cached = _availability.get(target["id"])
            if cached and time.time() - cached[0] < _STATUS_CACHE_SECONDS:
                entry["available"] = cached[1]
            else:
                try:
                    entry["available"] = bool(get_backend(target["id"]).status())
                except Exception as error:
                    entry["error"] = translate_error(error).message
                _availability[target["id"]] = (time.time(), entry["available"])
        out.append(entry)
    return out
