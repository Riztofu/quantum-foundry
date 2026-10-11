// Quantum Foundry — Qollab entry point (JS / Qiskit project).
// The game itself is plain JavaScript; Qiskit (in Qollab's in-browser Python) grades every
// Check circuit and samples measurements, and "Run on …" uses the backend you picked in
// the Select QPU dialog. The game stays live above this console until you press Stop.
import './config.js';
import './core.js';
import './lessons.js';
import './audio.js';
import './app.js';
import * as bridge from 'foundry.bridge';
import { createHost } from './host.js';

console.log('Quantum Foundry is loading Qiskit…');
await window.quantumFoundry.attachHost(createHost(bridge, backend));
const engine = window.quantumFoundry.getEngine();
console.log(engine.kind === 'qiskit'
  ? `Qiskit ${engine.qiskit} connected. Play in the page above: Check circuit is graded by Qiskit; “Run on …” uses the backend chosen in Select QPU.`
  : 'Qiskit could not start; the game is using its exact local simulator.');
console.log('Nothing is saved between Runs here: use 💾 Save on the map to keep progress, and Import save after the next Run. Press Stop to end.');

await new Promise(() => {}); // keep the Run (and Qiskit) alive while you play
