# Quantum Foundry — expanded offline prototype

## Play on a MacBook

1. Unzip **Quantum-Foundry-Mac.zip**.
2. Open the **Quantum-Foundry** folder.
3. Double-click **index.html**. If another app opens it, Control-click → Open With → Safari or Google Chrome.
4. Choose **First Connection**, or **Bell demo** for an immediate working example.

The game plays without an installation, server, account, or internet connection. Keep the extracted folder together: the ten optional Kevin MacLeod tracks live in `assets/music/`, while two original synthesized scores remain built in. Safari 14.1+ or a current Chrome is the intended browser; actual Mac/browser verification remains pending.

The optional **Launch-Quantum-Foundry.command** begins with `#!/bin/bash` and opens the adjacent HTML file using macOS `open`. If macOS refuses that launcher, open index.html directly.

## What is new

- **A ground-up teaching layer**: 🧭 **Start from zero** on the map is a five-page primer assuming no background at all (what a bit is, amplitudes, measurement, interference, how the workshop works); every mission briefing opens **How it works** with a NEW WORDS panel defining each term before it is used; and **Menu ≡ → Dictionary** holds all 26 terms in plain words.
- **Ten bundled Kevin MacLeod soundtrack tracks** (CC BY 4.0; see `assets/music/CREDITS.md`) with playlist auto-advance, plus the two original scores.
- **A live Qiskit runner** (`qiskit/runner.py`): while it runs, Sample output is measured by real Qiskit and the engine tag reads QISKIT RUNNER · LIVE.

- **16 working missions in two chapters**, progressing from a wire to communication, routing, registers, and quantum query algorithms.
- A **popup before every mission entry and replay**. Build explains the goal and available parts; How it works contains a circuit diagram with interactive execution steps; Try & observe explains an experiment and its result.
- **One to six qubits in Sandbox**, with a separate saved circuit for each register size.
- Up to **160 schematic parts**, **64 saved component versions**, **1024 primitive gates per block**, and **4096 expanded gates per circuit**.
- Three- and four-port campaign blocks, a SWAP primitive, neighboring-interaction puzzles, register marginals, and full joint-state inspection.
- Optional circuit benchmarks and **best verified gate costs** on the map.
- Two original ambient scores, **Copper Signals** and **Night Shift**, composed from local oscillators, as the always-available fallback when soundtrack files are absent.

## Building and inspecting circuits

Choose a part in the right tray, then click the grid to place it. Drag its body to move it. Click a right-side output pin and then a left-side input pin to wire the path. Crossings stay separate: a qubit cannot split, merge, or loop. Each physical qubit must return to its matching output.

**Check circuit** tests the full assignment contract. Passing component assignments let you package your actual solution as a stable block for later circuits. **My components** shows the original schematic inside a block; editing saves a new version and preserves existing versions.

**Step**, **Play**, **Back**, and **Restart** inspect intermediate ideal states. **State** shows every joint amplitude and probability, with each qubit's probability of 1 and its entropy with the rest of the pure register. **Sample output** samples fresh preparations of the final circuit. Random shot counts do not determine pass/fail. Large registers hide zero-count measurement rows; their complete state remains available in State.

The slim test controller shows up to eight likely joint outcomes. Expand the bottom bench for the complete register. Collapse it with ▾ to give the schematic more room. **Parts** hides or restores the tray. Pan with scroll or Space + drag; pinch / Command + scroll zooms; **Fit** recovers the whole circuit.

Keyboard shortcuts with canvas focus: **V** select, **W** wire, **X/H/Z/C/S** choose X/H/Z/CNOT/SWAP, **F** fit, **Delete** remove, arrows move a selected part, **Command Z** undo, **Shift Command Z** redo. Pins support Enter/Space activation. Assignment tabs support arrow-key navigation.

**Need a hint?** offers three levels of help. Teaching examples and hints never alter player circuits or grant progress.

## Music

Music begins after clicking **Build circuit**, entering Sandbox, or clicking **♫**. Browsers require a user gesture before audio can start. The ♫ buttons start or mute music. **Menu ≡** contains the track selector and a volume slider; preferences are saved with your project. Music pauses when the tab is hidden and resumes when it returns, if enabled. If audio is unavailable, the game continues normally.

The ten Kevin MacLeod tracks are Monkeys Spinning Monkeys, Fluffing a Duck, Carefree, Sneaky Snitch, Cipher, Scheming Weasel (faster version), Investigations, Local Forecast, Merry Go, and Happy Bee. They play in order with automatic advance and are licensed under Creative Commons Attribution 4.0; see `assets/music/CREDITS.md` for track links. The unchanged MP3s are bundled for offline playback. If one cannot load, the game falls back to its two original scores (Copper Signals, Night Shift), which remain selectable.

## Campaign

| # | Mission | Construction and reward |
| --- | --- | --- |
| 01 | First Connection | Identity wire; unlock X |
| 02 | The Inverter | X on every input; save Inverter, unlock H |
| 03 | Two Possibilities | Prepare the positive superposition; unlock Z and controlled branch |
| 04 | The Hidden Sign | Complete the fixed H…H interference experiment |
| 05 | Conditional Flip | Full CNOT operation; save ControlledFlip |
| 06 | A Shared Pair | Positive Bell pair from 00; save BellPrep |
| 07 | Read the Bell State | Coherent Bell decoder; save BellDecode |
| 08 | Quantum Courier | Reuse your two saved blocks in superdense coding |
| 09 | Exchange the States | Construct SWAP from CNOTs; save Swap |
| 10 | Across the Register | Long-range controlled flip using neighboring interactions and saved Swap |
| 11 | A Three-Way Link | Three-qubit GHZ preparation; save GHZPrep |
| 12 | Undo the Machine | Reverse the supplied preparation; save GHZDecode |
| 13 | Parity Accumulator | Preserve data and XOR into D; save four-port Parity |
| 14 | A Four-Way Link | Extend GHZ along a four-qubit line; save GHZ4Prep |
| 15 | One Quantum Query | Deutsch algorithm with a fixed oracle |
| 16 | The Hidden Register | Bernstein–Vazirani algorithm for all eight three-bit secrets |

Chapter I branches after superposition. Courier needs phase, decoding, and saved BellPrep/BellDecode. Chapter II follows the architecture-to-algorithms sequence. Routing requires your verified saved Swap. Replays remain available. Sandbox and Bell demo never earn campaign progress.

## Saving and sharing

Work saves automatically in the same browser when local storage is available. Local-file storage depends on browser settings, location, and private browsing.

**Menu ≡ → Download backup** creates a portable JSON copy of mission circuits, progress, all Sandbox sizes, component versions, best scores, selected inputs, cameras, layout, and music preferences. **Import backup** restores it on another computer. Backups from the earlier version-3 prototype remain compatible. When local storage is unavailable, the game remains playable and asks you to keep a manual backup.

Send your friend the ZIP or full extracted folder so `assets/music/` stays beside `index.html`. The game itself still works if the MP3 folder is missing, using the two original scores. Keep a separate backup JSON before replacing or moving an older game file.

## Simulation scope

This is an ideal logical statevector simulator for up to six qubits. Gates are X, H, Z, CNOT, and SWAP. SWAP expands to three CNOTs. The palette is not universal. The game models adjacency in selected puzzles, rather than fabrication, pulses, noise, physical timing, or fault tolerance.

A=q0, B=q1, C=q2, etc. Bitstrings read from the highest qubit index to q0: **B A**, **C B A**, **D C B A**, up to **F E D C B A**.

State preparation compares the complete state up to global phase. Reusable operation contracts compare the complete unitary up to **one** overall global phase, rejecting input-dependent phase errors. Preparation blocks include their zero-input assumption. Every block's internal gates count toward cost and logical dependency depth. Neighboring-link checks expand blocks first. Success metrics report the hardest tested oracle/message case; the live toolbar reports the selected case's actual expansion.

The query fixtures are ideal reversible oracles. A query is counted even when a selected oracle expands to identity. Their gate expansions are inspectable and included in export; one query does not imply zero implementation cost. Superdense coding requires both a previously shared entangled pair and one transmitted qubit.

## Qiskit, Qollab, and IonQ

The game includes a Qiskit simulator and export, plus an optional physical IonQ hardware bridge. Playing never requires these services.

**Live Qiskit runner.** `qiskit/runner.py` is a small local web service that executes the game's circuits on real Qiskit (`Statevector` evolution and measurement sampling):

```sh
pip install -r qiskit/requirements.txt
python3 qiskit/runner.py
```

While it runs, the tag under **Check circuit** switches from *IDEAL SIMULATION* to **QISKIT RUNNER · LIVE** (click the tag, or **Menu ≡ → Connect Qiskit runner**, to re-probe), and **Sample output** measures fresh preparations on Qiskit instead of the local sampler — the Measurements panel states which engine produced the counts and that the Qiskit probabilities match the local preview. Stop the runner and the game falls back to its local exact simulator, honestly relabeled. `tests/verify-qiskit-runner.py` cross-checks the two engines on 48 random circuits over the full gate set (agreement ~1e-15).

**Qiskit export.** **Menu ≡ → Export to Qiskit** downloads Python beginning with `#!/usr/bin/env python3`. It prepares the selected input, expands saved blocks and the selected oracle, prints the ideal state probabilities, and adds measurements.

**IonQ hardware.** The menu can submit the current circuit and one selected input to a physical IonQ QPU through the optional local service in `backend/`. The game shows sampled device counts alongside the ideal prediction; this one-input hardware run does not replace the exact campaign checks. A server-side IonQ key and QPU access are required, and real jobs may use paid credits. `backend/requirements-qollab.txt` provides the alternate pinned Qollab Qiskit and IonQ-provider forks. See [`backend/README.md`](backend/README.md) before starting the service.

## Optional development

Source and tests are included. With Node 18+ installed:

```sh
node source/build.cjs
node --test tests/core.test.cjs tests/expanded.test.cjs tests/gameplay.test.cjs tests/audio.test.cjs
```

No npm packages are required. The build embeds CSS, core, lessons, audio, and app scripts in one HTML file. Optional independent matrix verification requires NumPy:

```sh
python3 tests/verify-math.py
```

The DOM and audio fixtures verify behavior, not browser rendering or audible playback. See **TEST_REPORT.md** for the validation record and limits; **WALKTHROUGH.md** contains spoilers and a presentation script.

Technical references: [IBM quantum information](https://quantum.cloud.ibm.com/learning/courses/basics-of-quantum-information/multiple-systems/quantum-information), [IBM routing stages](https://quantum.cloud.ibm.com/docs/en/guides/transpiler-stages), [IBM query algorithms](https://quantum.cloud.ibm.com/learning/en/courses/fundamentals-of-quantum-algorithms/quantum-query-algorithms/introduction), [Classiq Bernstein–Vazirani](https://docs.classiq.io/explore/algorithms/foundational/bernstein_vazirani/bernstein_vazirani).

MIT licensed. Original code, graphics, lesson content, and procedural music. The construction-game approach is inspired by Turing Complete; no Turing Complete assets, audio, or code are bundled.
