#!/usr/bin/env python3
"""Quantum Foundry — Qiskit runner.

Serves the game's QISKIT RUNNER engine on http://127.0.0.1:8765. While it is
running, the engine tag under "Check circuit" switches to "QISKIT RUNNER ·
LIVE" (click the tag, or Menu -> Connect Qiskit runner, to re-probe) and
"Sample output" is measured by real Qiskit instead of the local JS sampler.
The game stays fully playable without this process; the tag then honestly
reads "IDEAL SIMULATION".

Usage:
    pip install -r requirements.txt    # qiskit only
    python3 runner.py                  # or: python3 qiskit/runner.py

Endpoints (JSON over CORS-open HTTP so the file:// game page can call it):
    GET  /status -> {"service": "quantum-foundry-qiskit-runner", "qiskit": "..."}
    POST /run    -> body {"n": int, "gates": [{"type", "target", "control"?}],
                          "initial": int | [[re, im], ...], "shots": 128|512|1024}
                    reply {"probabilities": [...], "amplitudes": [[re, im], ...],
                           "counts": {bitstring: shots}, "qiskit": "..."}

Bit order matches the game and Qiskit: q0 is the least-significant bit, so
bitstring keys read from the highest qubit index down to A = q0.
"""
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np
from qiskit import QuantumCircuit
from qiskit import __version__ as QISKIT_VERSION
from qiskit.quantum_info import Statevector

HOST, PORT = "127.0.0.1", 8765
MAX_QUBITS, MAX_GATES = 6, 4096
SHOT_CHOICES = (128, 512, 1024)
MAX_BODY = 2 * 1024 * 1024


def build_circuit(n, gates):
    if not isinstance(gates, list) or len(gates) > MAX_GATES:
        raise ValueError("gates must be a list of at most %d operations" % MAX_GATES)
    qc = QuantumCircuit(n)
    for gate in gates:
        kind = gate.get("type")
        target = gate.get("target")
        if not isinstance(target, int) or not 0 <= target < n:
            raise ValueError("invalid gate target")
        if kind == "I":
            continue
        if kind in ("CX", "SWAP"):
            control = gate.get("control")
            if not isinstance(control, int) or not 0 <= control < n or control == target:
                raise ValueError("invalid control qubit")
            (qc.cx if kind == "CX" else qc.swap)(control, target)
        elif kind == "X":
            qc.x(target)
        elif kind == "H":
            qc.h(target)
        elif kind == "Z":
            qc.z(target)
        else:
            raise ValueError("unsupported gate type: %r" % (kind,))
    return qc


def initial_state(n, initial):
    dims = 2 ** n
    if isinstance(initial, int):
        if not 0 <= initial < dims:
            raise ValueError("initial basis index out of range")
        return Statevector.from_int(initial, dims)
    if isinstance(initial, list) and len(initial) == dims:
        amplitudes = np.array([complex(pair[0], pair[1]) for pair in initial])
        if not np.all(np.isfinite(amplitudes.view(float))) or abs(np.linalg.norm(amplitudes) - 1) > 1e-6:
            raise ValueError("initial amplitudes must be finite and normalized")
        return Statevector(amplitudes)
    raise ValueError("initial must be a basis index or a list of 2^n [re, im] pairs")


def normalize_counts(raw, n):
    counts = {format(i, "0%db" % n): 0 for i in range(2 ** n)}
    for key, value in raw.items():
        text = str(key)
        if set(text) <= {"0", "1"} and len(text) <= n:
            counts[text.zfill(n)] = int(value)
        else:  # defensively accept integer or hex keys from other Qiskit versions
            counts[format(int(text, 0), "0%db" % n)] = int(value)
    return counts


def simulate(payload):
    n = payload.get("n")
    if not isinstance(n, int) or not 1 <= n <= MAX_QUBITS:
        raise ValueError("n must be an integer between 1 and %d" % MAX_QUBITS)
    shots = payload.get("shots", 512)
    if shots not in SHOT_CHOICES:
        raise ValueError("shots must be one of %s" % (SHOT_CHOICES,))
    qc = build_circuit(n, payload.get("gates", []))
    sv = initial_state(n, payload.get("initial", 0)).evolve(qc)
    return {
        "engine": "qiskit",
        "qiskit": QISKIT_VERSION,
        "probabilities": [float(p) for p in sv.probabilities()],
        "amplitudes": [[float(a.real), float(a.imag)] for a in sv.data],
        "counts": normalize_counts(sv.sample_counts(shots), n),
        "shots": shots,
    }


class Handler(BaseHTTPRequestHandler):
    server_version = "QuantumFoundryQiskitRunner/1.0"

    def _send(self, code, payload):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self._send(204, {})

    def do_GET(self):
        if self.path.rstrip("/") in ("", "/status"):
            self._send(200, {"service": "quantum-foundry-qiskit-runner", "engine": "qiskit",
                             "qiskit": QISKIT_VERSION, "maxQubits": MAX_QUBITS, "shots": list(SHOT_CHOICES)})
        else:
            self._send(404, {"error": "unknown path; use GET /status or POST /run"})

    def do_POST(self):
        if self.path.rstrip("/") != "/run":
            self._send(404, {"error": "unknown path; POST /run"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= MAX_BODY:
                raise ValueError("request body too large or empty")
            payload = json.loads(self.rfile.read(length))
            self._send(200, simulate(payload))
        except Exception as error:  # report, never crash the runner
            self._send(400, {"error": str(error)})

    def log_message(self, fmt, *args):
        print("runner:", fmt % args)


if __name__ == "__main__":
    print("Quantum Foundry Qiskit runner — Qiskit", QISKIT_VERSION)
    print("Listening on http://%s:%d  (GET /status, POST /run)" % (HOST, PORT))
    print("Open index.html and the engine tag switches to QISKIT RUNNER · LIVE.")
    print("Press Ctrl+C to stop; the game falls back to its local simulator.")
    try:
        ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
    except KeyboardInterrupt:
        print("\nrunner stopped")
