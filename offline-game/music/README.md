# Soundtrack folder

The game looks here for ten Kevin MacLeod tracks (the in-game menu lists them
under **Soundtrack**). They are not bundled in the repository; fetch them once:

- **Mac:** double-click `get-soundtrack.command` (Control-click → Open if macOS
  objects the first time), or
- **Terminal:** `bash music/get-soundtrack.command`

The script downloads each track from incompetech.com under exactly the file
name the game expects and skips anything already present. If a track is
missing, the game says so and falls back to its built-in original score — the
soundtrack is always optional.

Expected files:

    Monkeys Spinning Monkeys.mp3
    Fluffing a Duck.mp3
    Sneaky Snitch.mp3
    Scheming Weasel.mp3
    Carefree.mp3
    Investigations.mp3
    Local Forecast - Elevator.mp3
    Wallpaper.mp3
    Amazing Plan.mp3
    Cipher.mp3

## License and attribution

All ten tracks: **Kevin MacLeod (incompetech.com), licensed under Creative
Commons: By Attribution 4.0** — <https://creativecommons.org/licenses/by/4.0/>.
Per-track attributions are in [`../CREDITS.md`](../CREDITS.md); the game also
credits the artist in the soundtrack menu and in the now-playing status.
