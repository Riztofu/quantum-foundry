# Quantum Foundry

A quantum circuit construction game. You are an apprentice reconstructing a small
quantum machine: place parts, connect pins, inspect the joint quantum state, pass
the mission's tests, package your verified circuit as a reusable component, and
build a larger system from it — ending with a working superdense-coding
"Quantum Courier" assembled from components you built and verified yourself.

Built for the Qollab × IonQ hackathon (Quantum Unlocked track), spatial-layout and
progression inspired by Turing Complete. All names, text, and assets are original.

## The campaign (8 assignments)

1. **First Connection** — carry a qubit from input to readout; wiring *is* the circuit.
2. **The Inverter** — build and verify X, save your first component.
3. **Two Possibilities** — prepare (|0⟩+|1⟩)/√2; probability = amplitude², signs are real.
4. **The Hidden Sign** — insert Z between two fixed H gates; interference turns an
   invisible phase into a deterministic 1.
5. **Conditional Flip** — wire CNOT's control/target correctly; roles follow wiring,
   and the full operation is verified coherently (reversed wiring is caught).
6. **A Shared Pair** — prepare the Bell pair, save **BellPrep**.
7. **Read the Bell State** — build the decoder, verified as a full operation, save **BellDecode**.
8. **Quantum Courier** — assemble BellPrep + Alice's encoder + your BellDecode;
   recover all four two-bit messages. Bitstrings read **B A = q1 q0** (Qiskit order).

Each completion adds a one-sentence field note to the apprentice's journal — by the
end, the journal is a plain-language explanation of superdense coding. A **Sandbox**
and a **Demo Mode** (populated Bell circuit on separate progress) are included.

## Honest quantum, verified twice

- The schematic graph is compiled (typed quantum/classical ports, acyclicity,
  no qubit fanout, no merged wires, dependency-ordered; custom blocks expand to
  primitives so their gate cost never disappears) into an operation list.
- **Local Preview**: an exact statevector simulator in TypeScript gives instant
  amplitudes, step-through snapshots, and shot sampling. It is validated against
  Qiskit-generated fixtures (`backend/make_reference.py` →
  `frontend/src/quantum/__tests__/qiskit_reference.json`, run by `npm test`).
- **Qollab Simulator (Qiskit)**: the FastAPI backend rebuilds a real
  `qiskit.QuantumCircuit` and grades with `Statevector` (state fidelity, global
  phase ignored) and `Operator.equiv` (unitary equivalence up to one global
  phase). The toolbar badge always says which source produced the numbers, and
  stale responses are discarded by circuit revision.
- State-preparation challenges check fidelity to the full target state;
  operation challenges check the complete unitary — basis probabilities alone
  are never accepted as proof of a coherent operation. Measurement histograms
  illustrate; exact simulation grades, so shot noise can't fail a correct circuit.

## Run it

Two terminals (or `./dev.sh`):

```bash
# 1 — Qiskit backend (grading + shots + QASM export)
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# 2 — frontend
cd frontend
npm install
npm run dev        # http://localhost:5173
```

The game is fully playable without the backend (Local Preview, honestly labeled);
"Verify on Qiskit" and Qiskit-sampled counts need it.

## Tests

```bash
cd frontend && npm test            # 19 core tests incl. Qiskit fixture agreement
cd backend && python3 -m pytest    # 7 grading tests (fidelity, equiv, courier, reversed CNOT)
node frontend/e2e/playthrough.mjs  # full-campaign browser playthrough (30 checks)
```

The e2e script plays the entire campaign with real pointer events: wiring,
placement, fanout rejection, component save/reuse, all four courier messages,
undo, autosave restoration, workshop inspection, demo mode.

## Controls

V select · W wire · click output pin → click input pin to wire · Delete remove ·
Ctrl/Cmd+Z undo · Ctrl/Cmd+Shift+Z redo · Ctrl/Cmd+D duplicate · F fit ·
`.` single step · Space+drag or middle-drag pan · wheel zoom · Esc cancel.

## Conventions & export

- Qubit 0 is the least significant bit everywhere (Qiskit convention);
  displayed bitstrings read q(n−1)…q0.
- Export (toolbar) downloads versioned JSON: schema version, explicit bit-order
  note, graph, components, camera. `POST /api/qasm` returns OpenQASM 2.0.
- Progress, per-level circuits, sandbox work, and components persist in
  localStorage (schema-versioned).

## Demo script (2–3 min)

1. Open **The Hidden Sign** — step through; amplitude view shows the bar swing
   negative while probability view doesn't change; the final H turns the hidden
   sign into a deterministic 1 (phase change, shown live).
2. Open **A Shared Pair** — build H + CNOT, show the joint state (+0.71 |00⟩,
   +0.71 |11⟩), press **Verify on Qiskit** (badge flips to Qollab Simulator —
   Qiskit ✓), pass, **Save as Component** → BellPrep.
3. Open **Quantum Courier** — place BellPrep and BellDecode, wire A through
   Alice's encoder, click each message button: all four recovered. Open the
   Selected Component tab to show the real circuit inside a block.
4. Map: completed graph + the journal that wrote itself.

## Project layout

```
frontend/src/quantum/   sim.ts (statevector), compile.ts (graph→ops), grade.ts
frontend/src/model/     types.ts, parts.ts, levels.ts (data-driven campaign)
frontend/src/state/     store.ts (undo/redo, persistence, components)
frontend/src/components/ Canvas, Bench, Dock, MapScreen, Workshop, Overlay
backend/                main.py (FastAPI + Qiskit), test_quantum.py, make_reference.py
```

MIT licensed. See `LICENSE`.
