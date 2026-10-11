#!/usr/bin/env bash
# Start the Quantum Foundry service: Qiskit grading + sampling + OpenQASM, IonQ runs,
# and the game itself at http://127.0.0.1:8000. The game also works without it.
#   IONQ_API_KEY=...      enables IonQ cloud-simulator runs (free)
#   IONQ_ENABLE_QPU=1     also offers paid trapped-ion QPUs
set -euo pipefail
cd "$(dirname "$0")/backend"
PYTHON="${PYTHON:-python3}"
if [ ! -x .venv/bin/python ]; then
  "$PYTHON" -m venv .venv
  .venv/bin/python -m pip install -q --upgrade pip
fi
.venv/bin/python -m pip install -q -r requirements.txt
exec .venv/bin/python main.py
