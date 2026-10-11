// Original procedural scores plus locally bundled, CC BY 4.0 recordings.
(function (root) {
  'use strict';
  const tracks = Object.freeze({
    copper: { title: 'Copper Signals', kind: 'synth', beat: .75, chords: [[48,55,62],[45,52,60],[41,48,57],[43,50,59]], melody: [74,null,69,null,72,null,67,null,69,null,76,null,72,null,67,null] },
    night: { title: 'Night Shift', kind: 'synth', beat: 1, chords: [[45,52,59],[41,48,55],[48,55,62],[43,50,57]], melody: [69,null,null,76,null,72,null,null,67,null,null,74,null,71,null,null] },
    monkeys: { title: 'Monkeys Spinning Monkeys', kind: 'recording', src: 'assets/music/monkeys-spinning-monkeys.mp3', isrc: 'USUAN1400011' },
    duck: { title: 'Fluffing a Duck', kind: 'recording', src: 'assets/music/fluffing-a-duck.mp3', isrc: 'USUAN1100768' },
    carefree: { title: 'Carefree', kind: 'recording', src: 'assets/music/carefree.mp3', isrc: 'USUAN1400037' },
    sneaky: { title: 'Sneaky Snitch', kind: 'recording', src: 'assets/music/sneaky-snitch.mp3', isrc: 'USUAN1100772' },
    cipher: { title: 'Cipher', kind: 'recording', src: 'assets/music/cipher.mp3', isrc: 'USUAN1100844' },
    weasel: { title: 'Scheming Weasel (faster version)', kind: 'recording', src: 'assets/music/scheming-weasel-fast.mp3', isrc: 'USUAN1100085' },
    investigations: { title: 'Investigations', kind: 'recording', src: 'assets/music/investigations.mp3', isrc: 'USUAN1100646' },
    forecast: { title: 'Local Forecast', kind: 'recording', src: 'assets/music/local-forecast.mp3', isrc: 'USUAN1300010' },
    merry: { title: 'Merry Go', kind: 'recording', src: 'assets/music/merry-go.mp3', isrc: 'USUAN1100731' },
    bee: { title: 'Happy Bee', kind: 'recording', src: 'assets/music/happy-bee.mp3', isrc: 'USUAN1300014' }
  });
  const licenseUrl = 'https://creativecommons.org/licenses/by/4.0/';
  function create(options = {}) {
    let context = null, master = null, media = null, mediaSource = '', enabled = options.enabled !== false;
    let volume = Math.max(0, Math.min(.6, options.volume ?? .22)), track = tracks[options.track] ? options.track : 'monkeys';
    let playing = false, timer = null, next = 0, tick = 0, started = false, generation = 0;
    const voices = new Set(), Context = root.AudioContext || root.webkitAudioContext;
    const change = () => options.onState?.(status());
    function getMedia() {
      if (media) return media;
      media = root.document?.getElementById('music-player') || (root.Audio ? new root.Audio() : null);
      if (media) { media.preload = 'none'; media.loop = true; media.onerror = () => { playing = false; change(); }; }
      return media;
    }
    const status = () => ({ available: tracks[track].kind === 'recording' ? !!getMedia()?.play : !!Context, enabled, playing, volume, track, title: tracks[track].title, kind: tracks[track].kind });
    function note(midi, when, duration, strength, type = 'sine') {
      const oscillator = context.createOscillator(), gain = context.createGain();
      oscillator.type = type; oscillator.frequency.setValueAtTime(440 * 2 ** ((midi - 69) / 12), when);
      gain.gain.setValueAtTime(0, when); gain.gain.linearRampToValueAtTime(strength, when + .12);
      gain.gain.setValueAtTime(strength * .6, when + Math.min(.35, duration / 2)); gain.gain.linearRampToValueAtTime(0, when + duration);
      oscillator.connect(gain); gain.connect(master); voices.add(oscillator);
      oscillator.onended = () => { voices.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
      oscillator.start(when); oscillator.stop(when + duration + .03);
    }
    function schedule() {
      if (!playing || !context || context.state !== 'running') return;
      const score = tracks[track];
      if (score.kind !== 'synth') return;
      // Recover from a suspended background tab without scheduling a burst of old notes.
      if (next < context.currentTime - .2) next = context.currentTime + .08;
      while (next < context.currentTime + .3) {
        const index = tick % 16, chord = score.chords[Math.floor(tick / 8) % score.chords.length];
        if (tick % 8 === 0) chord.forEach((m, i) => note(m, next + i * .035, score.beat * 7.5, .055, 'sine'));
        const melody = score.melody[index]; if (melody !== null) note(melody, next, score.beat * 1.7, .038, 'triangle');
        if (tick % 4 === 2) note(chord[0] + 12, next, score.beat * 2, .028);
        next += score.beat; tick++;
      }
    }
    function setMediaSource() {
      const player = getMedia(), source = tracks[track].kind === 'recording' ? tracks[track].src : '';
      if (!player || mediaSource === source) return;
      player.pause(); mediaSource = source;
      if (source) player.src = source;
      else { player.removeAttribute?.('src'); player.src = ''; }
      try { player.currentTime = 0; } catch {}
      player.load?.();
    }
    function stop() {
      generation++;
      playing = false; if (timer !== null) root.clearInterval(timer); timer = null;
      if (master && context) { master.gain.cancelScheduledValues(context.currentTime); master.gain.setTargetAtTime(0, context.currentTime, .05); }
      voices.forEach(v => { try { v.stop(context.currentTime + .2); } catch {} }); voices.clear();
      if (media) media.pause();
      change();
    }
    async function start() {
      if (!enabled || !status().available) { change(); return false; }
      const request = generation, score = tracks[track];
      if (score.kind === 'recording') {
        const player = getMedia(); setMediaSource();
        if (!player || typeof player.play !== 'function') { change(); return false; }
        player.volume = volume;
        try {
          await player.play();
          if (!enabled || request !== generation) { player.pause(); return false; }
          started = true; playing = true; change(); return true;
        } catch { playing = false; change(); return false; }
      }
      if (!Context) { change(); return false; }
      try {
        if (!context) { context = new Context(); master = context.createGain(); master.gain.value = 0; master.connect(context.destination); }
        await context.resume();
        if (!enabled || request !== generation) return false;
        if (context.state !== 'running') { change(); return false; }
        if (playing) return true;
        setMediaSource(); started = true; playing = true; tick = 0; next = context.currentTime + .08;
        master.gain.setTargetAtTime(volume, context.currentTime, .1); schedule(); timer = root.setInterval(schedule, 100); change(); return true;
      } catch { stop(); return false; }
    }
    return Object.freeze({
      start, status,
      setEnabled(value) { enabled = !!value; if (!enabled) stop(); else change(); },
      setVolume(value) {
        if (!Number.isFinite(value)) return;
        volume = Math.max(0, Math.min(.6, value));
        if (tracks[track].kind === 'recording' && media) media.volume = volume;
        if (playing && master && context) master.gain.setTargetAtTime(volume, context.currentTime, .05);
        change();
      },
      setTrack(value) {
        if (!tracks[value] || track === value) return;
        const wasPlaying = playing; stop(); track = value; setMediaSource(); change();
        if (wasPlaying && enabled) return start();
      },
      visibility(hidden) { if (hidden) stop(); else if (started && enabled) return start(); },
      chime() {
        if (!playing || volume === 0 || !Context) return;
        if (!context) { try { context = new Context(); master = context.createGain(); master.connect(context.destination); master.gain.value = volume; } catch { return; } }
        if (context.state !== 'running') return;
        [72,76,79].forEach((m,i) => note(m, context.currentTime + i * .12, .7, .055));
      },
      stop
    });
  }
  root.FoundryAudio = { create, tracks, licenseUrl };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.FoundryAudio;
})(typeof window !== 'undefined' ? window : globalThis);
