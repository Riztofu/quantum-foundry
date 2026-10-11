# Validation record

Validated October 11, 2026, in the provided Linux development environment.

## Game checks — passed

**69 JavaScript tests passed** with Bun 1.3.5. They cover the simulator, all 16 missions, music behavior, the user briefings, credits, the hidden Sandbox Check button, and the browser side of IonQ submission.

```sh
bun test tests/core.test.cjs tests/expanded.test.cjs tests/gameplay.test.cjs tests/audio.test.cjs
```

The gameplay suite runs the scripts from the rebuilt `index.html` in a DOM/event fixture. It builds and verifies all 16 campaign assignments, saves nine component kinds, restores the completed project, and checks the final algorithm again. Teaching examples and hints leave player circuits and progress unchanged. The H and CNOT explanations appear on the required Build briefing, including before Sandbox and Bell demo play.

The build checks that all ten soundtrack files exist. Tests cover track selection, local media paths, mute, volume, tab visibility, and audio startup failures. The credits test checks the seven requested entries and all ten licensed recording attributions.

## Backend checks — passed

**13 Python tests passed** in a temporary Python 3.12.14 environment with Qiskit 2.5.2, qiskit-ionq 1.1.1, FastAPI, and HTTPX. They validate request bounds, Qiskit state preparation, H/CNOT behavior, the game's qubit and measurement order, IonQ QIS serialization after transpilation without expanding the game register, local static serving, API submission and polling, and cross-origin rejection. The API tests use a fake provider, so no IonQ hardware job was submitted.

```sh
python -m pip install -r backend/requirements-test.txt
python -m unittest backend.tests.test_circuit backend.tests.test_qiskit_circuit backend.tests.test_http_api
```

The bridge refuses simulator backends and accepts only a physical IonQ QPU target. A server-side IonQ key and a valid target are required before the menu action is enabled. Live provider access and paid QPU execution were not available for verification.

## Independent numerical comparison — passed

`tests/verify-math.py` compared independent dense NumPy gate matrices with the JavaScript simulator on **192 random circuits**, with one to six qubits, 40 gates each, and normalized random complex inputs. It now selects Node.js or Bun automatically.

Maximum amplitude difference: **2.45 × 10⁻¹⁵**, below the 10⁻¹² tolerance. Normalization passed for every circuit.

## Verification limits

These tests do not render a real browser or confirm audible sound. **macOS/Safari display, native file dialogs, local-file storage, and actual audio playback were not verified.** A live IonQ QPU run was also not performed. The Qollab-patched dependency profile is pinned to Qollab's current public fork commits but was not installed in this validation environment; the tested backend used upstream Qiskit and qiskit-ionq.

Open `index.html` from the extracted folder for offline play. Keep `assets/music/` beside it to use the bundled recordings. The optional IonQ service uses Python 3.10+ and serves the game from `http://127.0.0.1:8000`; see [`backend/README.md`](backend/README.md).
