#!/usr/bin/env bash
# Start backend + frontend for local development.
set -e
cd "$(dirname "$0")"

(
  cd backend
  if [ ! -d .venv ]; then python3 -m venv .venv; fi
  source .venv/bin/activate
  pip install -q -r requirements.txt
  uvicorn main:app --reload --port 8000
) &
BACK=$!
trap "kill $BACK 2>/dev/null" EXIT

cd frontend
[ -d node_modules ] || npm install
npm run dev
