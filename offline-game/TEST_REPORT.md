# Validation report

Validated October 11, 2026, in the provided Linux development environment.

## Automated checks

- **72 JavaScript tests passed** across the simulator, 16-mission campaign, lessons and forced gate briefings, Sandbox, soundtrack, credits, Qiskit exports, and IonQ UI flow.
- **13 Python backend tests passed** for circuit validation, Qiskit construction, local API routes, selected-state preparation, and hardware result formatting.
- **192 independent dense-matrix comparisons passed** for random one-to-six-qubit circuits with 40 gates each. Maximum amplitude error was `2.45e-15`.
- **48 Qiskit runner comparisons passed** against the local simulator. Maximum amplitude error was `1.22e-15`; sampled counts matched each requested shot total.
- The packaged page rebuilt successfully with `bun source/build.cjs`.

Run the checks from `offline-game/` with:

```sh
bun test tests/core.test.cjs tests/expanded.test.cjs tests/gameplay.test.cjs tests/audio.test.cjs
python -m unittest discover -s backend/tests -v
python tests/verify-math.py
python tests/verify-qiskit-runner.py
```

The interface tests use a DOM/event fixture, the soundtrack tests use audio stubs, and the backend tests use a fake IonQ provider. They do not submit jobs to a paid IonQ device or verify browser rendering and speaker output. Real hardware jobs need an IonQ key, device access, and may incur charges.

## Quantum execution notes

The built-in **Check circuit** still performs the game’s exact logical verification locally. The optional Qiskit runner independently simulates and samples circuits using Qiskit. The separate IonQ service submits the selected circuit and one selected input to a physical IonQ QPU; its noisy measurement results are shown beside the ideal prediction and do not establish correctness for every input. The service keeps its API key on the server and rejects simulator targets.

The optional Qollab-patched dependency profile is pinned in `backend/requirements-qollab.txt`; the tested backend used the standard pinned dependencies in `backend/requirements.txt`.
