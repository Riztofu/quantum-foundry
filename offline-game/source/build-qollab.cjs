#!/usr/bin/env node
'use strict';
// Builds the Qollab "JS / Qiskit project" in offline-game/qollab/ (upload that folder, or the zip).
// Qollab runs index.html + main.js in a sandboxed frame with Qiskit in in-browser Python, allows
// 100 files of at most 2 MB, runs no <script> tags, and loads main.css as the only stylesheet.
const fs = require('node:fs'), path = require('node:path');
const source = __dirname, game = path.resolve(source, '..'), out = path.join(game, 'qollab');
const MUSIC_BASE = process.env.QF_MUSIC_BASE || 'https://cdn.jsdelivr.net/gh/mav1o1/quantum-foundry@90b022be67b3c6c119b442886a2794fbd10ad88f/offline-game/assets/music/';
const read = file => fs.readFileSync(file, 'utf8');

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'foundry'), { recursive: true });
const write = (name, text) => fs.writeFileSync(path.join(out, name), text);

const template = read(path.join(source, 'template.html'));
const body = template.slice(template.indexOf('<body>') + 6, template.indexOf('<script>'))
  .replace(/<noscript>[\s\S]*?<\/noscript>/, '').trim();
write('index.html', `<div id="qf-qollab"><div id="qf-stage">\n${body}\n</div></div>\n`);
// The stage is always 1600 × 820 (scaled by stage.js), so screen-size rules would only misfire:
// drop @media blocks that test width or height; keep the rest (e.g. prefers-reduced-motion).
function stripViewportMedia(css) {
  let out = '', i = 0;
  for (let at = css.indexOf('@media', i); at !== -1; at = css.indexOf('@media', i)) {
    const open = css.indexOf('{', at); let depth = 0, end = open;
    for (; end < css.length; end++) { if (css[end] === '{') depth++; else if (css[end] === '}' && --depth === 0) break; }
    out += css.slice(i, at);
    if (!/(min|max)-(width|height)/.test(css.slice(at, open))) out += css.slice(at, end + 1);
    i = end + 1;
  }
  return out + css.slice(i);
}
write('main.css', stripViewportMedia(read(path.join(source, 'styles.css'))) + read(path.join(source, 'qollab', 'overrides.css')));
for (const file of ['core.js', 'lessons.js', 'audio.js', 'app.js']) write(file, read(path.join(source, file)));
for (const file of ['main.js', 'host.js', 'stage.js', 'README.md']) write(file, read(path.join(source, 'qollab', file)));
write('config.js', read(path.join(source, 'qollab', 'config.js')).replace('__MUSIC_BASE__', MUSIC_BASE));
write('LICENSE', read(path.join(game, 'LICENSE')));
write('foundry/__init__.py', '"""Quantum Foundry\'s Qiskit engine for Qollab."""\n');
write('foundry/bridge.py', read(path.join(source, 'qollab', 'bridge.py')));
for (const file of ['quantum.py', 'circuit.py']) write('foundry/' + file, read(path.join(game, 'backend', file)));

const files = [];
(function walk(dir) { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, entry.name); entry.isDirectory() ? walk(p) : files.push(p); } })(out);
const big = files.filter(f => fs.statSync(f).size > 2 * 1024 * 1024);
if (files.length > 100 || big.length) throw Error('Qollab limits exceeded: ' + files.length + ' files; too large: ' + big.join(', '));
console.log('Built Qollab project in qollab/ (' + files.length + ' files, largest ' + Math.max(...files.map(f => fs.statSync(f).size)) + ' bytes).');
