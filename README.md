# Quantum Foundry

A quantum circuit construction game. You are an apprentice rebuilding a small quantum machine. You place parts, connect pins, inspect the joint quantum state, and pass each mission's tests. Then you package your verified circuit as a reusable component and build larger systems from it. The campaign grows from a single wire through superdense coding, routing, and entanglement to the Deutsch and Bernstein–Vazirani algorithms. You can also run your circuits on IonQ quantum computers.

Built for the Qollab × IonQ hackathon (Quantum Unlocked track). The spatial layout and progression are inspired by Turing Complete. All names, text, and assets are original, except the CC BY 4.0 music credited in `offline-game/assets/music/CREDITS.md`.

## Play

Open [`offline-game/index.html`](offline-game/index.html) in Safari or Chrome. No server, install, or internet connection is needed.

For Qiskit grading and IonQ runs, start the optional local service:

```bash
cd offline-game
./start-service.sh                         # installs Qiskit + qiskit-ionq into backend/.venv
# open http://127.0.0.1:8000
```

| | Offline | With the service |
| --- | --- | --- |
| Grading | Exact local statevector simulator | Qiskit regrades every Check: `Statevector` fidelity per case and `Operator.equiv` per operation. Progress is awarded only when Qiskit agrees. |
| Measurements | Local sampling | Sampled by Qiskit |
| Export | Qiskit Python, OpenQASM | OpenQASM written by Qiskit |
| IonQ | — | Cloud simulator (ideal or Aria / Forte noise models) and, with `IONQ_ENABLE_QPU=1`, trapped-ion QPUs |

Set `IONQ_API_KEY` to enable IonQ. Paid QPU runs show IonQ's cost and queue estimate and require confirmation, and the API key never reaches the browser. IonQ runs can cover every test input of a mission in one job. Results appear beside the ideal prediction and never change your grade.

## What's inside

- **16 missions in two chapters.** First Connection → Inverter → superposition → phase → CNOT → Bell pair → Bell decoder → Quantum Courier (superdense coding), then SWAP, routing, GHZ states, uncomputation, parity, and quantum query algorithms.
- **Teaching from zero.** A five-page primer, a new-words panel before every mission, a 26-term dictionary, guided worked examples, and three-level hints.
- **Saved components.** Verified circuits become reusable blocks whose gates always count toward cost.
- **Sandbox and Bell demo.** A Sandbox for 1–6 qubits, and a populated Bell circuit on separate progress.
- **Conventions and saving.** Qiskit bit order throughout (A = q0, least significant), autosave, and portable JSON backups.

## Repository layout

```
offline-game/
  index.html          the packaged game (built from source/)
  source/             core.js (simulator, campaign, grading), app.js, lessons.js, audio.js, styles.css
  backend/            local service: quantum.py (Qiskit), ionq.py (IonQ), main.py (FastAPI), tests/
  tests/              Node test suite, Qiskit reference fixtures, math cross-checks
  assets/music/       bundled soundtrack
```

Details: [game README](offline-game/README.md) · [service, IonQ setup, and API](offline-game/backend/README.md) · [test report](offline-game/TEST_REPORT.md) · [walkthrough](offline-game/WALKTHROUGH.md).

## Tests

```bash
cd offline-game
node source/build.cjs && node --test tests/*.test.cjs     # 81 tests, incl. Qiskit fixtures
. backend/.venv/bin/activate && pip install -r backend/requirements-test.txt
python -m pytest backend/tests                            # Qiskit grading of all 16 missions, API, IonQ lifecycle
```

MIT licensed. See `LICENSE`.
