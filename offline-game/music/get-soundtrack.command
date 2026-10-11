#!/bin/bash
# Downloads the Quantum Foundry soundtrack: 10 Kevin MacLeod tracks from
# incompetech.com, licensed Creative Commons: By Attribution 4.0
# (https://creativecommons.org/licenses/by/4.0/). See ../CREDITS.md.
#
# Double-click this file on a Mac (if macOS blocks it: Control-click -> Open),
# or run it from Terminal. Files land in this music/ folder under the exact
# names the game looks for. Already-downloaded tracks are skipped.
cd "$(dirname "$0")" || exit 1
BASE="https://incompetech.com/music/royalty-free/mp3-royaltyfree"
ok=0; fail=0

fetch() {
  local out="$1"; shift
  if [ -s "$out" ]; then echo "✓ $out (already here)"; ok=$((ok+1)); return; fi
  local name encoded
  for name in "$@"; do
    encoded="${name// /%20}"; encoded="${encoded//(/%28}"; encoded="${encoded//)/%29}"
    if curl -fsSL --retry 2 -o "$out.part" "$BASE/$encoded" && [ -s "$out.part" ]; then
      mv "$out.part" "$out"; echo "✓ $out"; ok=$((ok+1)); return
    fi
  done
  rm -f "$out.part"
  echo "✗ $out — download it manually from incompetech.com and save it here under exactly this name"
  fail=$((fail+1))
}

fetch "Monkeys Spinning Monkeys.mp3" "Monkeys Spinning Monkeys.mp3"
fetch "Fluffing a Duck.mp3"          "Fluffing a Duck.mp3"
fetch "Sneaky Snitch.mp3"            "Sneaky Snitch.mp3"
fetch "Scheming Weasel.mp3"          "Scheming Weasel faster.mp3" "Scheming Weasel (faster version).mp3" "Scheming Weasel.mp3"
fetch "Carefree.mp3"                 "Carefree.mp3"
fetch "Investigations.mp3"           "Investigations.mp3"
fetch "Local Forecast - Elevator.mp3" "Local Forecast - Elevator.mp3" "Local Forecast Elevator.mp3"
fetch "Wallpaper.mp3"                "Wallpaper.mp3"
fetch "Amazing Plan.mp3"             "Amazing Plan.mp3" "The Amazing Plan.mp3"
fetch "Cipher.mp3"                   "Cipher.mp3"

echo
echo "$ok of 10 tracks ready. $([ $fail -gt 0 ] && echo "$fail missing — the game plays its original score for those.")"
echo "Attribution for all tracks: Kevin MacLeod (incompetech.com), CC BY 4.0 — see CREDITS.md."
read -r -p "Press Return to close."
