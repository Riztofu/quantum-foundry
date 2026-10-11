// Soundtrack engine with two kinds of track:
//  - "score": the original procedural WebAudio score (no files, always works offline)
//  - "file":  Kevin MacLeod (incompetech.com) MP3s in the music/ folder,
//             licensed Creative Commons: By Attribution 4.0 — see CREDITS.md.
//             If a file is missing, playback falls back to the original score.
(function (root) {
  'use strict';
  const scores = Object.freeze({
    copper: { title: 'Copper Signals', beat: .75, chords: [[48,55,62],[45,52,60],[41,48,57],[43,50,59]], melody: [74,null,69,null,72,null,67,null,69,null,76,null,72,null,67,null] },
    night: { title: 'Night Shift', beat: 1, chords: [[45,52,59],[41,48,55],[48,55,62],[43,50,57]], melody: [69,null,null,76,null,72,null,null,67,null,null,74,null,71,null,null] }
  });
  const CREDIT = 'Kevin MacLeod (incompetech.com) · CC BY 4.0';
  // Canonical file names: the music/ fetch script saves under exactly these names.
  const playlist = Object.freeze([
    ['km-monkeys', 'Monkeys Spinning Monkeys', 'Monkeys Spinning Monkeys.mp3'],
    ['km-fluffing', 'Fluffing a Duck', 'Fluffing a Duck.mp3'],
    ['km-sneaky', 'Sneaky Snitch', 'Sneaky Snitch.mp3'],
    ['km-weasel', 'Scheming Weasel', 'Scheming Weasel.mp3'],
    ['km-carefree', 'Carefree', 'Carefree.mp3'],
    ['km-investigations', 'Investigations', 'Investigations.mp3'],
    ['km-elevator', 'Local Forecast — Elevator', 'Local Forecast - Elevator.mp3'],
    ['km-wallpaper', 'Wallpaper', 'Wallpaper.mp3'],
    ['km-amazing', 'Amazing Plan', 'Amazing Plan.mp3'],
    ['km-cipher', 'Cipher', 'Cipher.mp3']
  ]);
  const tracks = {};
  for (const id of Object.keys(scores)) tracks[id] = { title: scores[id].title, kind: 'score' };
  for (const [id, title, file] of playlist) tracks[id] = { title, kind: 'file', file: 'music/' + file, credit: CREDIT };
  Object.freeze(tracks);
  const playlistIds = playlist.map(([id]) => id);

  function create(options = {}) {
    let context = null, master = null, enabled = options.enabled !== false, volume = Math.max(0, Math.min(.6, options.volume ?? .22)), track = tracks[options.track] ? options.track : 'copper';
    let playing = false, timer = null, next = 0, tick = 0, started = false, generation = 0, element = null, elementTrack = null, note = '';
    const missing = new Set();
    const voices = new Set(), Context = root.AudioContext || root.webkitAudioContext, AudioEl = root.Audio;
    const change = () => options.onState?.(status());
    const kind = () => tracks[track].kind;
    const status = () => ({ available: !!Context || !!AudioEl, enabled, playing, volume, track, title: tracks[track].title, kind: kind(), credit: tracks[track].credit || '', note });
    function ensureContext() {
      if (context || !Context) return !!context;
      context = new Context(); master = context.createGain(); master.gain.value = 0; master.connect(context.destination);
      return true;
    }
    function noteOn(midi, when, duration, strength, type = 'sine') {
      const oscillator = context.createOscillator(), gain = context.createGain();
      oscillator.type = type; oscillator.frequency.setValueAtTime(440 * 2 ** ((midi - 69) / 12), when);
      gain.gain.setValueAtTime(0, when); gain.gain.linearRampToValueAtTime(strength, when + .12);
      gain.gain.setValueAtTime(strength * .6, when + Math.min(.35, duration / 2)); gain.gain.linearRampToValueAtTime(0, when + duration);
      oscillator.connect(gain); gain.connect(master); voices.add(oscillator);
      oscillator.onended = () => { voices.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
      oscillator.start(when); oscillator.stop(when + duration + .03);
    }
    function schedule() {
      if (!playing || kind() !== 'score' || !context || context.state !== 'running') return;
      const score = scores[track];
      // Recover from a suspended background tab without scheduling a burst of old notes.
      if (next < context.currentTime - .2) next = context.currentTime + .08;
      while (next < context.currentTime + .3) {
        const index = tick % 16, chord = score.chords[Math.floor(tick / 8) % score.chords.length];
        if (tick % 8 === 0) chord.forEach((m, i) => noteOn(m, next + i * .035, score.beat * 7.5, .055, 'sine'));
        const melody = score.melody[index]; if (melody !== null) noteOn(melody, next, score.beat * 1.7, .038, 'triangle');
        if (tick % 4 === 2) noteOn(chord[0] + 12, next, score.beat * 2, .028);
        next += score.beat; tick++;
      }
    }
    function stop() {
      generation++;
      playing = false; if (timer !== null) root.clearInterval(timer); timer = null;
      if (element) { try { element.pause(); } catch {} }
      if (master && context) { master.gain.cancelScheduledValues(context.currentTime); master.gain.setTargetAtTime(0, context.currentTime, .05); }
      voices.forEach(v => { try { v.stop(context.currentTime + .2); } catch {} }); voices.clear(); change();
    }
    function fileFailed(id) {
      if (tracks[id]?.kind !== 'file' || missing.has(id)) return;
      missing.add(id);
      if (track === id) {
        const title = tracks[id].title;
        stop(); track = 'copper'; elementTrack = null;
        note = '“' + title + '” is not in the music folder (see music/README) — playing the original score.';
        if (enabled) startScore(); else change();
      } else change();
    }
    async function startScore() {
      if (!enabled || !Context) { change(); return false; }
      const request = generation;
      try {
        ensureContext();
        await context.resume();
        if (!enabled || request !== generation) return false;
        if (context.state !== 'running') { change(); return false; }
        if (playing) return true;
        started = true; playing = true; tick = 0; next = context.currentTime + .08;
        master.gain.setTargetAtTime(volume, context.currentTime, .1); schedule(); timer = root.setInterval(schedule, 100); change(); return true;
      } catch { stop(); return false; }
    }
    async function startFile() {
      if (!enabled) { change(); return false; }
      if (!AudioEl || missing.has(track)) {
        // No file playback here (or this file is known missing): go straight to the original score.
        missing.add(track);
        const title = tracks[track].title;
        track = 'copper'; elementTrack = null;
        note = AudioEl ? '“' + title + '” is not in the music folder (see music/README) — playing the original score.' : '';
        return startScore();
      }
      const request = generation, id = track;
      try {
        if (!element || elementTrack !== id) {
          if (element) { try { element.pause(); element.removeAttribute('src'); element.load?.(); } catch {} }
          element = new AudioEl(tracks[id].file);
          elementTrack = id;
          element.addEventListener('ended', () => { if (playing && kind() === 'file') advance(); });
          element.addEventListener('error', () => fileFailed(id));
        }
        element.volume = Math.max(0, Math.min(1, volume / .6));
        await element.play();
        if (!enabled || request !== generation || track !== id) { try { element.pause(); } catch {} return false; }
        started = true; playing = true; note = ''; change(); return true;
      } catch { fileFailed(id); return false; }
    }
    function advance() {
      // Step forward through the playlist to the next track that is not known missing.
      const i = playlistIds.indexOf(track);
      let j = (i + 1) % playlistIds.length;
      while (missing.has(playlistIds[j]) && j !== i) j = (j + 1) % playlistIds.length;
      if (missing.has(playlistIds[j])) { fileFailed(track); return; }
      track = playlistIds[j];
      playing = false; change();
      startFile();
    }
    const start = () => kind() === 'file' ? startFile() : startScore();
    return Object.freeze({
      start, status,
      setEnabled(value) { enabled = !!value; if (!enabled) stop(); else change(); },
      setVolume(value) {
        if (!Number.isFinite(value)) return; volume = Math.max(0, Math.min(.6, value));
        if (playing && kind() === 'score' && master) master.gain.setTargetAtTime(volume, context.currentTime, .05);
        if (element) element.volume = Math.max(0, Math.min(1, volume / .6));
        change();
      },
      setTrack(value) { if (!tracks[value] || track === value) return; const wasPlaying = playing; stop(); track = value; note = ''; change(); if (wasPlaying && enabled) return start(); },
      visibility(hidden) { if (hidden) stop(); else if (started && enabled) return start(); },
      chime() { if (!playing || volume === 0 || !ensureContext()) return; [72,76,79].forEach((m,i) => noteOn(m, context.currentTime + i * .12, .7, .055)); },
      stop
    });
  }
  root.FoundryAudio = { create, tracks, scores, playlist: playlistIds, credit: CREDIT };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.FoundryAudio;
})(typeof window !== 'undefined' ? window : globalThis);
