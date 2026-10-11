# Quantum Foundry service: Qiskit and IonQ

One local FastAPI service that adds the following to the offline game:

- **Qiskit grading** (`/api/verify`). Every Check circuit is regraded on Qiskit: `Statevector` state fidelity for each test case, and `Operator.equiv` for reusable operations (equal up to one global phase, so input-dependent phase errors are rejected). This is the grader from the original Quantum Foundry backend, extended to the expanded game's gates (X, H, Z, CNOT, SWAP), amplitude inputs, and 1–6 qubits.
- **Qiskit sampling** (`/api/run`) and **OpenQASM 2.0 / 3.0 export** (`/api/qasm`).
- **IonQ runs** through `qiskit-ionq`: the free cloud simulator (ideal or with device noise models) and paid trapped-ion QPUs, with cost estimates, batch jobs, status polling, cancellation, and a job history.
- **The game itself**, served at <http://127.0.0.1:8000>.

The game works without this service. Its tag under Check circuit says *LOCAL SIMULATION* until the service is found.

## Start it

Use Python 3.10 or newer. From `offline-game/`:

```sh
./start-service.sh
```

Or by hand:

```sh
cd backend
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt          # or requirements-qollab.txt for Qollab's forks
export IONQ_API_KEY="your-IonQ-key"      # optional: enables IonQ runs
python main.py
```

Then open <http://127.0.0.1:8000>.

## IonQ configuration

| Variable | Meaning |
| --- | --- |
| `IONQ_API_KEY` | IonQ API key. `QISKIT_IONQ_API_TOKEN` and `IONQ_API_TOKEN` also work. It stays in this process; the browser never sees it. |
| `IONQ_ENABLE_QPU=1` | Also offer physical QPUs. Without it, only the free simulators are offered, so a demo machine cannot spend credits by accident. |
| `IONQ_TARGETS` | Comma-separated target list. Default: `simulator,simulator@aria-1,simulator@forte-1,qpu.aria-1,qpu.forte-1,qpu.forte-enterprise-1`. |
| `IONQ_DEFAULT_TARGET` | The target the game preselects (default: the first one). |
| `QF_PORT` | Port (default 8000). |

Target IDs: `simulator` is the ideal cloud simulator, `simulator@<model>` is the simulator with an IonQ noise model, and `qpu.<device>` is a physical QPU. Paid QPU submissions must carry `confirm_paid: true`; the game sets it only after the player ticks a confirmation box under IonQ's cost estimate. Job IDs and metadata are kept in `backend/.ionq-jobs.json` (git-ignored), so jobs that queue for hours can be reopened after a restart.

Circuits are prepared on the selected input (basis states with X gates; arbitrary amplitudes with `StatePreparation`). They are then compiled to IonQ's QIS gate set with an explicit basis rather than the device target. This keeps a 2-qubit game circuit at 2 qubits instead of padding it to every physical qubit. Count keys come back in the game's order: highest qubit first, down to A = q0.

## Security model

- The service binds to 127.0.0.1 and rejects non-local `Host` headers (DNS-rebinding protection).
- `/api/health`, `/api/verify`, `/api/run`, and `/api/qasm` are free and CPU-only. They answer any origin with CORS, including `file://` pages and Chrome's Private Network Access preflight, so a game opened from disk can still use Qiskit.
- `/api/ionq/*` can spend money. It accepts only same-origin requests from the page this service serves; `file://` (`Origin: null`) and other websites are refused.
- Do not host this publicly.

## API

| Route | Purpose |
| --- | --- |
| `GET /api/health` | `{service, qiskit, engine, ionq: {configured, key, provider, qpu_enabled, targets, default}}` |
| `POST /api/verify` | `{qubits, cases: [{label, initial, operations, expected}], operator: {operations, reference} \| null}` → per-case fidelity and the operator verdict |
| `POST /api/run` | `{qubits, shots, initial, operations}` → amplitudes, probabilities, Qiskit-sampled counts |
| `POST /api/qasm` | `{qubits, initial, operations}` → `qasm2`, `qasm3` |
| `GET /api/ionq/targets` | Configured targets plus live availability from IonQ characterizations (cached 60 s) |
| `POST /api/ionq/estimate` | IonQ's cost and queue estimate for a job (free for simulators) |
| `POST /api/ionq/jobs` | `{target, shots, name, error_mitigation, confirm_paid, circuits: [1–16 × {label, qubits, initial, operations}]}`: one IonQ job holding every circuit |
| `GET /api/ionq/jobs` | Recent jobs submitted by this service |
| `GET /api/ionq/jobs/{id}` | Status (`submitted`, `queued`, `running`, `done`, `cancelled`, `failed`), per-circuit counts, and IonQ's failure reason |
| `POST /api/ionq/jobs/{id}/cancel` | Cancel a queued job |

`initial` is `{"basis": int}` or `{"state": [[re, im], …]}`. Operations are `{"type": "X"|"H"|"Z"|"CX"|"SWAP", "target": q, "control": q?}`.

## Tests

From `offline-game/` with the virtual environment active:

```sh
pip install -r backend/requirements-test.txt
python -m pytest backend/tests
```

The tests cover:

- the Qiskit grader, including every mission's reference solution as produced by the game's own `core.js`;
- the CORS and same-origin rules;
- the full IonQ lifecycle against a fake provider: batching, paid confirmation, estimates, polling, failures, cancellation, and error messages.

They never contact IonQ or spend credits.
