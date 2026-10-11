# Optional IonQ QPU service

The game remains an offline ideal simulator by default. This small local service adds a separate, explicit run on a real IonQ QPU. It sends the selected circuit and current input through Qiskit and `qiskit-ionq`, keeps the IonQ key on the server, and returns the device's measured counts. Device results are noisy samples; they do not replace the game's exact campaign checks.

## Start it

Use Python 3.10 or newer. From this directory, install the standard Qiskit provider and start the local-only web service:

```sh
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements.txt
export IONQ_API_KEY="your-IonQ-key"
python main.py
```

Open <http://127.0.0.1:8000>. The service serves the game and music assets from the project folder. To select an available physical IonQ device, set `IONQ_BACKEND` to its Qiskit QPU name (the default is `ionq_qpu.forte-1`). Simulator targets are rejected. Real hardware jobs may use paid IonQ credits.

The API key must stay in the server environment. Do not put it in the browser or a project backup. The server binds only to `127.0.0.1` and rejects non-local hosts and cross-origin requests. Keep this service local; it is not designed for public hosting.

To run the backend checks from the project root, install the test extra and run:

```sh
python -m pip install -r backend/requirements-test.txt
python -m unittest backend.tests.test_circuit backend.tests.test_qiskit_circuit backend.tests.test_http_api
```

These tests exercise the Qiskit circuit builder and local HTTP routes with a fake provider. They do not submit paid IonQ jobs.

## Qollab libraries

`requirements-qollab.txt` is an alternate install profile pinned to Qollab's public Qiskit and IonQ-provider forks. Those forks are patched for Qollab/Pyodide use and expose the same Python import names used here (`qiskit` and `qiskit_ionq`). Install that profile **instead of** `requirements.txt`, not on top of it. The default profile uses the upstream supported packages for the server; the game’s Qiskit export remains usable with either profile.

## API

- `GET /api/health` reports whether a server-side IonQ key and a physical QPU name are configured.
- `POST /api/ionq/jobs` submits one measured circuit. It accepts 1–6 qubits, X/H/Z/CNOT/SWAP operations, and 128/512/1024 shots.
- `GET /api/ionq/jobs/{job_id}` retrieves that IonQ job's status and final counts.

The two paths are encoded little-endian like the game (`A=q0`); Qiskit measurement keys are returned in the game's displayed order, highest qubit down to A. Arbitrary selected pure-state inputs are prepared by Qiskit before the submitted operations.
