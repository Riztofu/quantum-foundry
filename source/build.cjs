#!/usr/bin/env node
'use strict';
const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..');
const audio = require('./audio.js'), recordings = Object.values(audio.tracks).filter(track => track.kind === 'recording');
if (recordings.length !== 10) throw Error('Expected ten licensed Kevin MacLeod recordings in source/audio.js.');
for (const track of recordings) if (!fs.existsSync(path.join(root, track.src))) throw Error('Missing bundled soundtrack file: ' + track.src);
let html = fs.readFileSync(path.join(__dirname, 'template.html'), 'utf8');
for (const [tag, file] of [['STYLE', 'styles.css'], ['CORE', 'core.js'], ['LESSONS', 'lessons.js'], ['AUDIO', 'audio.js'], ['APP', 'app.js']]) {
  const content = fs.readFileSync(path.join(__dirname, file), 'utf8');
  if (tag !== 'STYLE' && /<\/script/i.test(content)) throw Error('Inline JavaScript cannot contain a closing script tag.');
  html = html.replace(`/*__${tag}__*/`, () => content);
}
if (/\/\*__[A-Z]+__\*\//.test(html)) throw Error('Unresolved template placeholder.');
fs.writeFileSync(path.join(root, 'index.html'), html);
console.log('Built self-contained index.html (' + Buffer.byteLength(html) + ' bytes).');
