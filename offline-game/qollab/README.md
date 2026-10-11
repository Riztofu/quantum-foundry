# Quantum Foundry

Quantum Foundry is a puzzle game about building quantum circuits. You drag gates onto a board, wire them up, and step through what happens to the qubits. Each mission gives you a goal. Once a circuit works, you can save it and use it as a part later. You start with a single wire and end up building superdense coding, GHZ states, and the Deutsch and Bernstein–Vazirani algorithms.

This effort is supported by Qollab & IonQ.

🎬 **Demo video (2–3 min):** _add your public video link here_
💻 **Source:** https://github.com/Riztofu/quantum-foundry

We entered **Quantum Unlocked**. The game teaches superdense coding (sending two bits with one qubit) and two query algorithms, Deutsch and Bernstein–Vazirani. You don't need to know anything going in. The first page explains what a bit is.

## Quick tour

1. Press **Run** and pick **IonQ Forte 1** or the **Built-in simulator**. The game loads above the console.
2. Click **Bell demo** on the map and close the gate guide. Click **Run on … ↗** under Sample output, pick **All 4 test inputs**, and submit. You'll see IonQ's results next to what an ideal machine would give.
3. Go back to the map and open **Start from zero**. On page 2 you can drag a qubit's amplitude around.
4. Open mission **01**, connect INPUT A to OUTPUT A, and click **Check circuit**. The Tests tab shows what Qiskit thinks of your circuit.

## How it works

- Circuits you finish become parts you can reuse. The Bell pair you build in mission 6 is the same block you use to build the courier in mission 8.
- Qiskit grades every circuit. It compares the whole quantum state and the whole operation, not just the measurement counts, so a circuit that only works by accident won't pass.
- On Qollab, IonQ takes one job per Run. To test several inputs at once, the game puts them side by side in one bigger circuit and splits the results afterward. If you try a second job, it asks you to save first.

## How to run

1. Press **Run** and pick a backend in **Select QPU**. The free **Built-in simulator** starts instantly. An **IonQ simulator** (Aria or Forte noise model) lets the in-game "Run on …" button sample your circuits on IonQ's cloud.
2. The game appears **above the console**. Press **🧭 Start from zero** for a two-minute primer, or open **01 · First Connection** on the map.
3. Build the circuit, then press **Check circuit**. Qiskit grades it: the engine tag reads **QISKIT · LIVE**, and the Tests tab shows each case's state fidelity and the operator verdict.
4. Press **Run on …** (under Sample output) to send the selected input, or every test input at once, to the backend you chose. The samples appear beside the ideal prediction.
5. Press **Stop** when you're done. Nothing is saved between Runs, so press **💾 Save** on the map to keep progress, including your previous IonQ runs and their results, and **Import save** after your next Run. The save is also printed to the console in case the download is blocked.

Use a recent Chrome, Edge, or Firefox 153+. Safari cannot run Qollab projects yet.

## What it teaches (Quantum Unlocked)

Sixteen missions in two chapters. Every mission opens with a briefing that defines its new words before using them, a worked example you can step through, and a short experiment.

| Chapter I · Gates & communication | Chapter II · Registers & algorithms |
| --- | --- |
| 01 First Connection: a wire is a qubit's path | 09 Exchange the States: SWAP from three CNOTs |
| 02 The Inverter: X, verified on every input | 10 Across the Register: routing with only neighboring links |
| 03 Two Possibilities: superposition and amplitudes | 11 A Three-Way Link: GHZ on a line of qubits |
| 04 The Hidden Sign: phase becomes visible through interference | 12 Undo the Machine: uncomputation |
| 05 Conditional Flip: CNOT roles come from wiring | 13 Parity Accumulator: a four-port block |
| 06 A Shared Pair: the Bell state, saved as **BellPrep** | 14 A Four-Way Link: four-qubit entanglement |
| 07 Read the Bell State: a coherent decoder, **BellDecode** | 15 One Quantum Query: Deutsch, via phase kickback |
| 08 Quantum Courier: superdense coding from your own blocks | 16 The Hidden Register: Bernstein–Vazirani, all 8 secrets |

Saved components carry their real gate cost into later missions. The Sandbox goes up to six qubits, and a 26-term dictionary is always one click away.

## Where Qiskit and IonQ come in

- **Qiskit grading.** Check circuit compiles your schematic into primitive gates (A = q0, Qiskit's bit order). Qiskit then regrades the whole mission contract in this page:
  - `Statevector` fidelity for every test case (global phase ignored);
  - `Operator.equiv` for every reusable operation (equal up to *one* global phase), so a reversed CNOT or an input-dependent phase error can't pass by luck;
  - progress is awarded only when Qiskit agrees with the game's exact simulator.

  Measurement counts illustrate the result; exact simulation decides it, so shot noise never fails a correct circuit.
- **Sampling and export.** Sample output is measured by Qiskit. **Export OpenQASM** is written by `qasm2.dumps`.
- **Your Qollab backend, one job per Run.** "Run on …" prepares each selected input and runs it on the backend from Select QPU. IonQ accepts one job per Run. When you've used it, the game offers to save your progress, then asks you to Stop and Run again. Quantum Foundry also places several inputs **side by side in one circuit**: input *i* on qubits *i·n … i·n+n−1*. It then splits the measured bitstrings back apart. All four Courier messages fit in one 8-qubit job, and all eight uncomputation inputs fit in one 24-qubit job. Each input shows "correct outcome in X % of shots" or its distribution fidelity against the ideal prediction.

## Project files

| File | Role |
| --- | --- |
| `index.html`, `main.css` | The game's page and styles |
| `main.js` | Entry point: loads the game, connects it to Qiskit and the selected backend |
| `host.js` | Answers the game's quantum API inside Qollab |
| `core.js` | Exact statevector simulator, schematic compiler, 16-mission campaign, contracts |
| `app.js`, `lessons.js`, `audio.js` | Interface, teaching content, soundtrack |
| `foundry/quantum.py` | Qiskit grader (`Statevector`, `Operator.equiv`), sampling, OpenQASM export |
| `foundry/circuit.py` | Strict request validation |
| `foundry/bridge.py` | JSON bridge from JavaScript; packs inputs into one circuit for IonQ |

Dependencies: Qiskit (preinstalled on Qollab). No other packages, keys, or secrets.

## Credits and disclosure

- **Team:** Maverick Pil, Yujie Wu, Kenneth Zhong, Anissa Li (Carnegie Mellon University).
- **Built during the hackathon window** (from Oct 9, 2026). Development was assisted by AI coding tools (OpenAI Codex and Anthropic Claude Code). Full history: https://github.com/Riztofu/quantum-foundry
- **Music:** ten tracks by Kevin MacLeod (incompetech.com), licensed under CC BY 4.0. They are unchanged and stream from the project repository. Two original synthesized scores are built in.
- **Inspiration:** the construction-game format is inspired by *Turing Complete*. No Turing Complete code, art, or audio is used.
- **License:** MIT (see `LICENSE`).
