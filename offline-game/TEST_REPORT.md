# Validation record

Validated October 11, 2026, in the provided Linux development environment.

## Automated behavior — passed

**66 tests passed:** 23 original simulator/compiler tests, 10 expanded register/contract tests, 28 gameplay/teaching tests, and 5 audio behavior tests.

```sh
node --test tests/core.test.cjs tests/expanded.test.cjs tests/gameplay.test.cjs tests/audio.test.cjs
```

The gameplay suite executes the inline scripts from the actual built index.html in a DOM/event fixture. Its full playthrough places parts, connects pins, checks every mission, saves nine component kinds, and completes all **16 assignments** through the game's controls. It restores the completed project and verifies the final algorithm again.

Coverage includes:

- Original workflow: moving, duplication, deletion, undo/redo, protected fixtures, rejected connections, execution, sampling, downloads, prerequisites, module inspection/version stability, storage failure, and backup import.
- Every-entry mission briefings, including replay and reload; all 16 teaching examples, circuit diagrams, input controls, steps, relative phase, progressive hints, and isolation from player circuits/progress.
- One-to-six-qubit Sandbox switching with separate preserved circuits, full joint-state and marginal readouts, six-port blocks, backup migration, and old version-3 compatibility.
- Three-gate SWAP expansion, neighboring-only routing, middle-qubit restoration, rejection of forbidden interactions inside blocks, GHZ preparation/inversion, all 16 parity inputs, and coherent operation contracts.
- All four Deutsch truth tables and all eight Bernstein–Vazirani secrets; original oracle fixture integrity, single-query semantics, auxiliary relative phase, and correct bit order.
- Music activation, volume/track changes, mute, visibility, background scheduling recovery, unavailable/blocked audio, persisted preferences, and cancellation of a pending resume after a tab is hidden.

The DOM fixture refuses workbench pointer interactions while a dialog is open. The audio fixture records oscillator and gain scheduling. These fixtures verify logic and event behavior; they do not render a browser or reproduce audible playback.

## Independent numerical comparison — passed

`tests/verify-math.py` constructs independent dense NumPy gate matrices and compares them with the JavaScript simulator on **192 random circuits**, covering one through six qubits with 40 gates each and normalized random complex inputs.

Maximum absolute amplitude difference: **2.45 × 10⁻¹⁵**, below the acceptance tolerance of 10⁻¹². Normalization also passed for every circuit.

**75 generated Qiskit exports** parsed successfully with Python's AST parser: every campaign input/oracle case plus one export for each Sandbox size. This verifies syntax and the selected-input export path, rather than execution in an installed Qiskit runtime.

## Package checks — passed

- All JavaScript source passes Node syntax checks; `bash -n` passes for the Mac launcher.
- Built index.html has 87 unique element IDs and four complete inline scripts, including audio.
- No external JavaScript, CSS, fonts, images, audio, network fetches, or runtime modules are required to play.
- Source rebuilds the packaged HTML without npm dependencies.
- ZIP integrity, extracted file bytes, and the launcher's Unix executable permission entry were verified.

## Verification limits

**Actual macOS/Safari rendering and audible playback were not verified.** A DOM/event fixture does not reproduce layout, native file dialogs, pointer capture, Safari local-file storage, Finder behavior, or audio output. A live browser was unavailable in this environment. This report makes no Mac/Safari, visual, or listening-test claim.

The intended launch path is to unzip and open index.html in Safari 14.1+ or current Chrome. The optional launcher uses only `/bin/bash` and `/usr/bin/open`. No development runtime is needed for gameplay.

**Qollab and physical hardware execution are not integrated.** The package identifies its ideal logical simulation and supports Qiskit export. It does not implement noise, pulse control, fault tolerance, or automatic hardware submission.

## Soundtrack and Qiskit runner update — passed

After adding the Kevin MacLeod soundtrack layer and the live Qiskit runner:

- **69 / 69 JS tests pass** (3 new audio tests: file playback with attribution and auto-advance, missing-file fallback to the original score, clean switching between file and score sources).
- `tests/verify-qiskit-runner.py`: the Qiskit runner agrees with the local JS simulator on **48 random circuits** over X/H/Z/CX/SWAP on 1-6 qubits, max absolute amplitude difference **1.22e-15**; sampled counts are complete and sum to the shot budget.
- Chromium end-to-end with the runner live: the game auto-detects it on load, the engine tag reads "QISKIT RUNNER · LIVE", Sample output reports "sampled by Qiskit 2.5.2 · matches the local preview"; with the runner stopped the tag honestly reads "IDEAL SIMULATION". With MP3s present, playback starts on a mission gesture, credits Kevin MacLeod (CC BY 4.0), and auto-advances at track end; with MP3s absent the game names the missing file and falls back to the original score.

## Ground-up teaching layer — passed

After adding the from-zero primer, per-mission NEW WORDS, the Dictionary, and rewriting all 17 lesson texts for readers with no background: **70 / 70 tests pass** (one new gameplay test covers primer paging, seenPrimer persistence, the dictionary modal, and the NEW WORDS panel). Chromium screenshots verified the primer, dictionary, and briefing render correctly with zero console errors.

## Primer visuals and interactive widgets — passed

Every primer page now carries a visual: a bit-vs-qubit diagram (p1), a live drag-the-lean amplitude/probability widget with a negative-sign toggle (p2), a measure-once / measure-x100 tally sampler (p3), a two-path interference demonstrator using the real H-Z-H numbers (p4), and an annotated circuit-anatomy diagram (p5). **71 / 71 tests pass** (new test drives the slider, sampler, and sign-flip through real events). Chromium screenshots verified all five pages render with zero console errors.
