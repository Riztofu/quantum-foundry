#!/usr/bin/env python3
"""Cross-check the Quantum Foundry service's Qiskit engine against the game's JS simulator.

Optional developer check: requires Qiskit and Node. Random circuits over the
game's full gate set (X, H, Z, CX, SWAP) on 1-6 qubits are simulated by both
engines; amplitudes must agree to 1e-10 and sampled counts must sum to shots.
"""
import json
import shutil
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import numpy as np  # noqa: E402
from backend.circuit import validate_payload  # noqa: E402
from backend.quantum import simulate  # noqa: E402

rng = np.random.default_rng(20261011)
fixtures = []
for n in range(1, 7):
    for _ in range(8):
        gates = []
        for _ in range(30):
            kind = rng.choice(["H", "X", "Z", "CX", "SWAP"] if n > 1 else ["H", "X", "Z"])
            target = int(rng.integers(n))
            gate = {"type": str(kind), "target": target}
            if kind in ("CX", "SWAP"):
                gate["control"] = int(rng.choice([q for q in range(n) if q != target]))
            gates.append(gate)
        fixtures.append({"n": n, "gates": gates, "initial": int(rng.integers(2 ** n))})

root = Path(__file__).resolve().parents[1]
node_code = (
    "const C=require('./source/core.js');let s='';process.stdin.on('data',d=>s+=d);"
    "process.stdin.on('end',()=>process.stdout.write(JSON.stringify("
    "JSON.parse(s).map(f=>C.evolve(f.gates,f.n,f.initial,false).state))));"
)
runtime = shutil.which("node") or shutil.which("bun")
if not runtime:
    raise SystemExit("Install Node.js or Bun to run the Qiskit comparison.")
result = subprocess.run([runtime, "-e", node_code], cwd=root, input=json.dumps(fixtures),
                        capture_output=True, text=True, check=True)
locals_ = json.loads(result.stdout)

worst = 0.0
for fixture, local in zip(fixtures, locals_):
    reply = simulate(validate_payload({"qubits": fixture["n"], "operations": fixture["gates"],
                                       "initial": {"basis": fixture["initial"]}, "shots": 128}))
    qiskit_amplitudes = np.array([complex(r, i) for r, i in reply["amplitudes"]])
    local_amplitudes = np.array([complex(r, i) for r, i in local])
    worst = max(worst, float(np.max(np.abs(qiskit_amplitudes - local_amplitudes))))
    assert sum(reply["counts"].values()) == 128
    assert all(len(key) == fixture["n"] and set(key) <= {"0", "1"} for key in reply["counts"])
    assert abs(sum(reply["probabilities"]) - 1) < 1e-9

assert worst < 1e-10, worst
print("Qiskit service vs local simulator: %d circuits, max |amplitude delta| = %.3g — OK" % (len(fixtures), worst))
