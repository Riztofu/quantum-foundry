'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), { createEnvironment } = require('./dom-fixture.cjs');
const plain = value => JSON.parse(JSON.stringify(value));
const verify = async e => { await e.begin(); await e.get('check').click(); assert.equal(e.win.quantumFoundry.getStatus().passed, true, e.state().level); };
const saveAndContinue = async e => { await e.modalAction(1); await e.begin(); };

async function fullCampaign(e) {
  await e.open('link'); await e.wire('in0', 'out0'); await verify(e); await saveAndContinue(e);
  assert.equal(e.state().level, 'invert');
  let id = await e.place('X'); await e.wire('in0', id); await e.wire(id, 'out0'); await verify(e); await saveAndContinue(e);
  assert.equal(e.state().level, 'superposition');
  id = await e.place('H'); await e.wire('in0', id); await e.wire(id, 'out0'); await verify(e); await saveAndContinue(e);
  assert.equal(e.state().level, 'phase');
  id = await e.place('Z', 540); await e.wire('h-before', id); await e.wire(id, 'h-after'); await verify(e); await saveAndContinue(e);
  assert.equal(e.state().level, 'cnot');
  id = await e.place('CX', 560); await e.wire('in0', id); await e.wire('in1', id, 0, 1); await e.wire(id, 'out0'); await e.wire(id, 'out1', 1); await verify(e); await saveAndContinue(e);
  assert.equal(e.state().level, 'bell');
  const flip = e.win.quantumFoundry.getProject().modules.find(m => m.kind === 'ControlledFlip');
  const h = await e.place('H', 320), block = await e.place('MODULE', 640, 120, flip.id);
  await e.wire('in0', h); await e.wire(h, block); await e.wire('in1', block, 0, 1); await e.wire(block, 'out0'); await e.wire(block, 'out1', 1); await verify(e); await saveAndContinue(e);
  assert.equal(e.state().level, 'decode');
  const controlled = await e.place('MODULE', 380, 120, flip.id), hadamard = await e.place('H', 760);
  await e.wire('in0', controlled); await e.wire('in1', controlled, 0, 1); await e.wire(controlled, hadamard); await e.wire(hadamard, 'out0'); await e.wire(controlled, 'out1', 1); await verify(e); await saveAndContinue(e);
  assert.equal(e.state().level, 'courier');
  const modules = e.win.quantumFoundry.getProject().modules, prep = modules.find(m => m.kind === 'BellPrep'), decode = modules.find(m => m.kind === 'BellDecode');
  const a = await e.place('MODULE', 260, 120, prep.id), b = await e.place('MODULE', 840, 120, decode.id);
  await e.wire('in0', a); await e.wire('in1', a, 0, 1); await e.wire(a, 'encoder'); await e.wire(a, b, 1, 1); await e.wire('transfer', b); await e.wire(b, 'out0'); await e.wire(b, 'out1', 1); await verify(e);
  await e.modalAction(0);
}
test('the actual packaged game plays through all eight assignments using placement and pin events', async () => {
  const e = createEnvironment(); assert.equal(e.get('campaign').hidden, false); assert.equal(e.query('[data-level="invert"]').disabled, true);
  await fullCampaign(e);
  const p = plain(e.win.quantumFoundry.getProject()); assert.equal(Object.values(p.progress).filter(Boolean).length, 8); assert.deepEqual(p.modules.map(m => m.kind), ['Inverter', 'ControlledFlip', 'BellPrep', 'BellDecode']);
  assert.match(e.get('campaign-status').textContent, /8 \/ 16/);
  for (let i = 0; i < 4; i++) { await e.query(`[data-input="${i}"]`).click(); await e.get('run').click(); assert.match(e.get('dock-content').innerHTML, new RegExp(i.toString(2).padStart(2, '0'))); assert.equal(e.win.quantumFoundry.getStatus().error, null); }
  assert.match(e.win.quantumFoundry.exportQiskit(), /qc\.cx\(0, 1\)/); assert.match(e.win.quantumFoundry.exportQiskit(), /qc\.z\(0\)/); assert.match(e.win.quantumFoundry.exportQiskit(), /qc\.x\(0\)/);
});
test('undo, redo, deletion, duplication, reset and moving preserve fixed fixtures', async () => {
  const e = createEnvironment(); await e.get('sandbox').click(); await e.begin(); const id = await e.place('H', 320);
  await e.get('undo').click(); assert.equal(e.state().graph.nodes.some(n => n.id === id), false);
  await e.get('redo').click(); assert.equal(e.state().graph.nodes.some(n => n.id === id), true);
  await e.query(`[data-node="${id}"]`).dispatch('pointerdown', e.position(350, 150)); await e.get('canvas').dispatch('pointerup');
  await e.query('[data-action="duplicate-selected"]').click(); assert.equal(e.state().graph.nodes.filter(n => !n.locked).length, 2);
  await e.key('Delete'); assert.equal(e.state().graph.nodes.filter(n => !n.locked).length, 1);
  await e.query('[data-node="in0"]').dispatch('pointerdown'); await e.key('Delete'); assert.equal(e.state().graph.nodes.filter(n => n.type === 'INPUT').length, 2);
  await e.query(`[data-node="${id}"]`).dispatch('pointerdown', e.position(350, 150)); await e.get('canvas').dispatch('pointermove', e.position(430, 210)); await e.get('canvas').dispatch('pointerup');
  assert.equal(e.state().graph.nodes.find(n => n.id === id).x, 400);
  await e.get('undo').click(); assert.equal(e.state().graph.nodes.find(n => n.id === id).x, 320);
  await e.get('reset-circuit').click(); await e.modalAction(1); assert.equal(e.state().graph.nodes.length, 4);
  await e.get('undo').click(); assert.equal(e.state().graph.nodes.length, 5);
});
test('disallowed wiring gives feedback without corrupting an unfinished circuit', async () => {
  const e = createEnvironment(); await e.open('link'); await e.wire('in0', 'out0');
  const edges = e.state().graph.edges.length; await e.wire('in0', 'out0'); assert.equal(e.state().graph.edges.length, edges); assert.match(e.get('toast').textContent, /already connected/);
  await e.get('undo').click(); await e.get('check').click(); assert.equal(e.win.quantumFoundry.getStatus().passed, false); assert.match(e.get('toast').textContent, /Connect/);
});
test('saved modules and campaign circuits restore from the exact browser storage payload', async () => {
  const e = createEnvironment(); await fullCampaign(e); await e.query('[data-input="2"]').click();
  const reload = createEnvironment({ saved: e.saved });
  assert.equal(reload.state().level, 'courier'); assert.equal(reload.state().message, '10'); assert.equal(reload.win.quantumFoundry.getProject().modules.length, 4); assert.equal(reload.win.quantumFoundry.getStatus().error, null);
  await reload.begin(); await reload.get('check').click(); assert.equal(reload.win.quantumFoundry.getStatus().passed, true);
});
test('backup download and import restore progress, components and circuit without overwriting the import', async () => {
  const e = createEnvironment(); await fullCampaign(e); await e.get('backup').click();
  assert.equal(e.doc.downloads[0].name, 'Quantum-Foundry-Backup.json'); const text = await e.doc.downloads[0].blob.text(); const backup = JSON.parse(text); assert.equal(backup.modules.length, 4);
  const next = createEnvironment(); const input = next.get('import-file'); input.files = [{ size: Buffer.byteLength(text), text: async () => text }]; await input.dispatch('change'); await next.modalAction(1);
  const imported = plain(next.win.quantumFoundry.getProject()); assert.equal(imported.progress.courier, true); assert.equal(imported.modules.length, 4); assert.equal(imported.circuits.courier.nodes.length, backup.circuits.courier.nodes.length);
  await next.open('courier'); await verify(next);
});
test('component workshop renders the saved graph and its expanded primitive sequence', async () => {
  const e = createEnvironment(); await fullCampaign(e); await e.get('workshop').click(); const m = e.win.quantumFoundry.getProject().modules.find(m => m.kind === 'BellPrep');
  await e.query(`[data-inspect="${m.id}"]`).click(); assert.match(e.get('modal-root').innerHTML, /module-schematic/); assert.match(e.get('modal-root').innerHTML, /CNOT q0 → q1/); assert.match(e.get('modal-root').innerHTML, /assumes input/);
});
test('the Bell demo runs in sandbox and grants no campaign progress', async () => {
  const e = createEnvironment(); await e.get('demo').click(); await e.begin(); assert.equal(e.state().level, 'sandbox'); assert.equal(e.state().operations.length, 2); assert.deepEqual(plain(e.win.quantumFoundry.getProject().progress), {});
  assert.match(e.get('dock-content').innerHTML, /1.000/); await e.get('run').click(); assert.match(e.get('dock-content').innerHTML, /512 fresh preparations/);
});
test('stepping, rewinding, playing, sampling and shot selection are operational', async () => {
  const e = createEnvironment(); await e.get('demo').click(); await e.begin(); await e.get('reset-execution').click(); assert.equal(e.win.quantumFoundry.getStatus().step, 0);
  await e.get('step').click(); assert.equal(e.win.quantumFoundry.getStatus().step, 1); await e.get('rewind').click(); assert.equal(e.win.quantumFoundry.getStatus().step, 0);
  await e.get('play').click(); assert.equal(e.intervals.size, 1); e.tick(); assert.equal(e.win.quantumFoundry.getStatus().step, 1); e.tick(); assert.equal(e.win.quantumFoundry.getStatus().step, 2); assert.equal(e.intervals.size, 0);
  e.get('shots').value = '128'; await e.get('shots').dispatch('change'); await e.get('run').click(); assert.match(e.get('dock-content').innerHTML, /128 fresh preparations/);
});
test('Qiskit download contains executable Python source with the requested shebang', async () => {
  const e = createEnvironment(); await e.get('demo').click(); await e.begin(); await e.get('export').click(); const download = e.doc.downloads[0]; assert.equal(download.name, 'quantum_foundry_sandbox.py'); const python = await download.blob.text(); assert.ok(python.startsWith('#!/usr/bin/env python3')); assert.match(python, /qc\.h\(0\)/); assert.match(python, /qc\.cx\(0, 1\)/);
});
test('broken imported modules, recursion and altered fixtures are rejected before replacing user work', async () => {
  const e = createEnvironment(); await fullCampaign(e); const p = plain(e.win.quantumFoundry.getProject()); const bad = plain(p); bad.modules[0].gates = [{ type: 'Z', target: 0 }]; assert.throws(() => e.win.quantumFoundry.validateProject(bad), /invalid saved/);
  const recursive = plain(p); const m = recursive.modules[0]; m.graph.nodes.push({ id: 'self', type: 'MODULE', moduleId: m.id, x: 300, y: 0 }); assert.throws(() => e.win.quantumFoundry.validateProject(recursive), /themselves/);
  const changed = plain(p); changed.circuits.phase.nodes.find(n => n.id === 'h-before').type = 'X'; assert.throws(() => e.win.quantumFoundry.validateProject(changed), /fixture/);
  assert.equal(e.win.quantumFoundry.getProject().modules.length, 4);
});
test('blocked local storage still permits gameplay and manual backup', async () => {
  const e = createEnvironment({ failStorage: true }); assert.equal(e.win.quantumFoundry.getStatus().storage, false); assert.match(e.get('toast').textContent, /saving is unavailable/);
  await e.open('link'); await e.wire('in0', 'out0'); await verify(e); await e.modalAction(0); await e.get('backup').click(); assert.equal(e.doc.downloads[0].name, 'Quantum-Foundry-Backup.json');
});
test('invalid component names keep the dialog open and do not create a module', async () => {
  const e = createEnvironment(); await e.open('link'); await e.wire('in0', 'out0'); await verify(e); await e.modalAction(1);
  const x = await e.place('X'); await e.wire('in0', x); await e.wire(x, 'out0'); await verify(e);
  e.get('component-name').value = '  '; await e.modalAction(1); assert.equal(e.win.quantumFoundry.getProject().modules.length, 0); assert.match(e.get('component-error').textContent, /1 and 32/);
  e.get('component-name').value = 'My Inverter'; await e.modalAction(1); assert.equal(e.win.quantumFoundry.getProject().modules[0].name, 'My Inverter');
});
test('editing and saving a new component version preserves the original block and its consumers', async () => {
  const e = createEnvironment(); await fullCampaign(e); const before = plain(e.win.quantumFoundry.getProject()), original = before.modules.find(m => m.kind === 'BellPrep');
  await e.get('workshop').click(); await e.query(`[data-inspect="${original.id}"]`).click(); await e.modalAction(1);
  assert.equal(e.state().level, 'bell'); await verify(e); e.get('component-name').value = 'BellPrep'; await e.modalAction(1);
  const after = plain(e.win.quantumFoundry.getProject()); assert.equal(after.modules.filter(m => m.kind === 'BellPrep').length, 2); assert.deepEqual(after.modules.find(m => m.id === original.id), original); assert.equal(after.modules.at(-1).version, 2);
  assert.deepEqual(after.circuits.courier, before.circuits.courier); const reloaded = createEnvironment({ saved: e.saved }); assert.equal(reloaded.win.quantumFoundry.getProject().modules.length, 5);
});

test('every mission entry and reload opens its explanatory briefing', async () => {
  const e = createEnvironment(); await e.query('[data-level="link"]').click();
  assert.ok(e.get('briefing-content')); assert.equal(e.doc.querySelectorAll('[data-lesson-page]').length, 3);
  assert.match(e.get('briefing-content').textContent, /Two gates you will meet/);
  assert.match(e.get('briefing-content').textContent, /Hadamard/);
  assert.match(e.get('briefing-content').textContent, /CNOT has a control and a target/);
  assert.match(e.get('briefing-content').textContent, /delivers the input qubit unchanged/);
  await e.get('lesson-tab-1').click(); assert.match(e.get('briefing-content').textContent, /cannot split to copy/);
  await e.get('lesson-tab-2').click(); assert.match(e.get('briefing-content').textContent, /What the result means/);
  await e.begin(); assert.equal(e.doc.getElementById('briefing-content'), null);
  await e.get('map-button').click(); await e.query('[data-level="link"]').click(); assert.ok(e.get('briefing-content')); await e.begin();
  const reload = createEnvironment({saved:e.saved}); assert.ok(reload.get('briefing-content')); await reload.begin();
  await reload.get('assignment').click(); assert.ok(reload.get('briefing-content'));
});

test('all eight educational briefings and their interactive examples operate without changing player circuits', async () => {
  const e = createEnvironment(); await fullCampaign(e);
  for (const id of ['link','invert','superposition','phase','cnot','bell','decode','courier']) {
    await e.open(id); const before = plain(e.win.quantumFoundry.getCircuit()), progress = plain(e.win.quantumFoundry.getProject().progress);
    await e.get('assignment').click(); assert.match(e.get('briefing-content').textContent, /What you have/);
    await e.get('lesson-tab-1').click(); assert.ok(e.get('concept-example'));
    const example = e.win.FoundryLessons[id].example;
    for (let i = 0; i < example.inputs.length; i++) {
      if (example.inputs.length > 1) await e.query(`[data-demo-input="${i}"]`).click();
      const buttons = e.doc.querySelectorAll('[data-demo-step]');
      for (let j = 0; j < buttons.length; j++) { await e.query(`[data-demo-step="${j}"]`).click(); assert.match(e.get('concept-example').textContent, /Worked example · your circuit is unchanged/); }
      const expectedBasis = ['link','invert','decode','courier'].includes(id) ? i : ['superposition','phase'].includes(id) ? id === 'phase' ? 1 : 0 : id === 'cnot' ? [0,3,2,1][i] : undefined;
      if (expectedBasis !== undefined) e.get('concept-example').querySelectorAll('.state-row').forEach((row,j) => assert.equal(parseFloat(row.children[3].textContent), j === expectedBasis ? 100 : 0, id + ' example input ' + i));
      if (id === 'bell') { const rows = e.get('concept-example').querySelectorAll('.state-row'); assert.match(rows[0].textContent,/\+0\.707.*50(?:\.0)?%/); assert.match(rows[3].textContent,/\+0\.707.*50(?:\.0)?%/); assert.match(e.get('concept-example').textContent,/entanglement 1\.000/); }
    }
    await e.get('lesson-tab-2').click(); assert.match(e.get('briefing-content').textContent, /What Check circuit verifies/);
    await e.begin(); assert.deepEqual(plain(e.win.quantumFoundry.getCircuit()), before); assert.deepEqual(plain(e.win.quantumFoundry.getProject().progress), progress);
  }
});

test('the phase teaching example shows a negative amplitude while keeping both probabilities at 50 percent', async () => {
  const e = createEnvironment(); await fullCampaign(e); await e.open('phase'); await e.get('assignment').click(); await e.get('lesson-tab-1').click();
  await e.query('[data-demo-step="1"]').click();
  assert.equal(e.get('concept-example').querySelectorAll('.negative').length, 1);
  const rows = e.get('concept-example').querySelectorAll('.state-row');
  assert.match(rows[0].textContent, /\+0\.707.*50(?:\.0)?%/); assert.match(rows[1].textContent, /−0\.707.*50(?:\.0)?%/);
  await e.query('[data-demo-step="2"]').click(); assert.match(e.get('concept-example').querySelectorAll('.state-row')[1].textContent, /\+1\.000.*100(?:\.0)?%/);
});

test('game-menu controls open, close, download, and retain keyboard focus on Escape', async () => {
  const e = createEnvironment(); await e.get('demo').click(); await e.begin();
  assert.equal(e.get('game-menu').hidden, true); await e.get('menu-button').click(); assert.equal(e.get('game-menu').hidden, false);
  assert.equal(e.get('menu-button').getAttribute('aria-expanded'), 'true');
  await e.get('backup').click(); assert.equal(e.get('game-menu').hidden, true); assert.equal(e.doc.downloads[0].name, 'Quantum-Foundry-Backup.json');
  await e.get('menu-button').click(); await e.key('Escape'); assert.equal(e.get('game-menu').hidden, true); assert.equal(e.doc.activeElement.id, 'menu-button');
  await e.get('menu-button').click(); await e.doc.body.click(); assert.equal(e.get('game-menu').hidden, true);
  await e.get('menu-button').click(); await e.get('help').click(); assert.equal(e.get('game-menu').hidden, true); assert.match(e.get('modal-root').textContent, /Menu → Download backup/);
});

test('the bench and parts collapse, persist, and reopen through the relevant controls', async () => {
  const e = createEnvironment(); await e.get('demo').click(); await e.begin(); await e.get('toggle-dock').click(); await e.get('toggle-parts').click();
  assert.equal(e.get('toggle-dock').getAttribute('aria-expanded'), 'false'); assert.equal(e.get('toggle-parts').getAttribute('aria-expanded'), 'false');
  assert.equal(e.get('app').classList.contains('dock-collapsed'), true); assert.equal(e.get('app').classList.contains('parts-collapsed'), true);
  const reload = createEnvironment({saved:e.saved}); await reload.begin(); assert.equal(reload.get('app').classList.contains('dock-collapsed'), true); assert.equal(reload.get('app').classList.contains('parts-collapsed'), true);
  await reload.get('step').click(); assert.equal(reload.get('toggle-dock').getAttribute('aria-expanded'), 'true');
  await reload.get('toggle-dock').click(); await reload.get('tab-measurements').click(); assert.equal(reload.get('toggle-dock').getAttribute('aria-expanded'), 'true'); assert.equal(reload.get('measurement-settings').hidden, false);
  await reload.get('toggle-parts').click(); assert.equal(reload.get('toggle-parts').getAttribute('aria-expanded'), 'true');
  await reload.get('dock-resizer').dispatch('keydown',{key:'ArrowUp'}); assert.equal(reload.win.quantumFoundry.getProject().settings.dock, 192);
});

test('old version-3 backups retain circuits and modules while receiving the compact default layout', async () => {
  const e = createEnvironment(); await fullCampaign(e); const legacy = plain(e.win.quantumFoundry.getProject());
  legacy.settings = {shots:128,dock:252}; delete legacy.briefings;
  const imported = plain(e.win.quantumFoundry.validateProject(legacy)); assert.equal(imported.settings.dock, 172); assert.equal(imported.settings.shots, 128);
  assert.deepEqual(imported.modules, legacy.modules); assert.deepEqual(imported.circuits, legacy.circuits); assert.deepEqual(imported.progress, legacy.progress);
});

test('unfinished construction stays visually quiet until the player asks to test it', async () => {
  const e = createEnvironment(); await e.open('link'); assert.equal(e.get('graph-error').hidden, true);
  await e.get('check').click(); assert.equal(e.get('graph-error').hidden, false);
  await e.wire('in0','out0'); assert.equal(e.get('graph-error').hidden, true); assert.equal(e.win.quantumFoundry.getStatus().error, null);
});

test('hints progress from a nudge to explicit wiring and never advance the campaign', async () => {
  const e = createEnvironment(); await e.open('link');
  for (let i = 0; i < 3; i++) { await e.get('hint').click(); assert.match(e.get('modal-root').textContent, new RegExp('Hint ' + (i + 1) + ' / 3')); await e.modalAction(0); }
  await e.get('hint').click(); assert.match(e.get('modal-root').textContent, /Hint 3 \/ 3/);
  assert.deepEqual(plain(e.win.quantumFoundry.getProject().progress), {});
});

test('lesson tabs and editor pins support keyboard interaction through rerenders', async () => {
  const e = createEnvironment(); await e.open('link'); await e.get('assignment').click();
  await e.get('lesson-tab-0').dispatch('keydown',{key:'ArrowRight'}); assert.equal(e.doc.activeElement.id,'lesson-tab-1'); assert.equal(e.get('briefing-content').getAttribute('aria-labelledby'),'lesson-tab-1');
  await e.get('lesson-tab-1').dispatch('keydown',{key:'End'}); assert.equal(e.doc.activeElement.id,'lesson-tab-2');
  await e.begin(); const selector = 'circle.port[data-pin="in0"][data-dir="out"][data-port="0"]'; await e.query(selector).dispatch('keydown',{key:'Enter'}); assert.equal(e.doc.activeElement,e.query(selector));
  await e.query('circle.port[data-pin="out0"][data-dir="in"][data-port="0"]').dispatch('keydown',{key:'Enter'}); assert.equal(e.state().graph.edges.length,1);
  await e.get('tab-tests').dispatch('keydown',{key:'ArrowRight'}); assert.equal(e.doc.activeElement.id,'tab-state'); assert.equal(e.get('tab-state').getAttribute('aria-selected'),'true');
});

const Core = require('../source/core.js');
async function buildPaths(e, steps) {
  const n=e.state().qubits, paths=Array.from({length:n},(_,q)=>({node:'in'+q,port:0}));
  for(let i=0;i<steps.length;i++) {
    const s=steps[i],qs=s.qs,id=s.node || await e.place(s.type,s.x || 260+i*150,s.y ?? 120+Math.min(...qs)*120,s.moduleId);
    for(let p=0;p<qs.length;p++){const q=qs[p];await e.wire(paths[q].node,id,paths[q].port,p);paths[q]={node:id,port:p};}
  }
  for(let q=0;q<n;q++) await e.wire(paths[q].node,'out'+q,paths[q].port);
}
const gate=(type,qs,x)=>({type,qs,x});
async function finishExpandedCampaign(e) {
  await e.open('swap');await buildPaths(e,[gate('CX',[0,1]),gate('CX',[1,0]),gate('CX',[0,1])]);await verify(e);await saveAndContinue(e);
  assert.equal(e.state().level,'routing');const swap=e.win.quantumFoundry.getProject().modules.find(m=>m.kind==='Swap');
  await buildPaths(e,[{type:'MODULE',moduleId:swap.id,qs:[0,1]},gate('CX',[1,2]),{type:'MODULE',moduleId:swap.id,qs:[0,1]}]);await verify(e);await saveAndContinue(e);
  assert.equal(e.state().level,'ghz');await buildPaths(e,[gate('H',[0]),gate('CX',[0,1]),gate('CX',[1,2])]);await verify(e);await saveAndContinue(e);
  assert.equal(e.state().level,'uncompute');await buildPaths(e,[gate('CX',[1,2]),gate('CX',[0,1]),gate('H',[0])]);await verify(e);await saveAndContinue(e);
  assert.equal(e.state().level,'parity');await buildPaths(e,[gate('CX',[0,3]),gate('CX',[1,3]),gate('CX',[2,3])]);await verify(e);await saveAndContinue(e);
  assert.equal(e.state().level,'fanout');await buildPaths(e,[gate('H',[0]),gate('CX',[0,1]),gate('CX',[1,2]),gate('CX',[2,3])]);await verify(e);await saveAndContinue(e);
  assert.equal(e.state().level,'kickback');await buildPaths(e,[gate('H',[0],360),gate('X',[1],200),gate('H',[1],360),{node:'oracle',qs:[0,1]},gate('H',[0],820)]);await verify(e);await saveAndContinue(e);
  assert.equal(e.state().level,'oracle');await buildPaths(e,[...Array.from({length:3},(_,q)=>gate('H',[q],360)),gate('X',[3],200),gate('H',[3],360),{node:'oracle',qs:[0,1,2,3]},...Array.from({length:3},(_,q)=>gate('H',[q],820))]);await verify(e);await e.modalAction(0);
}
function expandedSeed() {
  const p=plain(createEnvironment().win.quantumFoundry.getProject());
  for(const l of Core.levels.filter(l=>l.number)) {
    const graph=Core.solution(l.id,p.modules);p.circuits[l.id]=graph;p.progress[l.id]=true;
    if(l.kind)p.modules.push({id:l.kind,name:l.kind,kind:l.kind,qubits:l.qubits,graph,gates:Core.compile(graph,p.modules,l.qubits).gates,version:1,sourceLevel:l.id});
  }
  return new Map([['quantum-foundry-offline-v3',JSON.stringify(p)]]);
}
test('all sixteen missions play through real controls, save nine component kinds, and restore their results',{timeout:30000},async()=>{
  const e=createEnvironment();await fullCampaign(e);await finishExpandedCampaign(e);
  const p=plain(e.win.quantumFoundry.getProject());assert.equal(Object.values(p.progress).filter(Boolean).length,16);
  assert.deepEqual(p.modules.map(m=>m.kind),['Inverter','ControlledFlip','BellPrep','BellDecode','Swap','GHZPrep','GHZDecode','Parity','GHZ4Prep']);
  assert.equal(p.best.routing.count,7);assert.equal(p.best.oracle.count,11);assert.match(e.get('campaign-status').textContent,/16 \/ 16/);
  for(let i=0;i<8;i++){await e.query(`[data-input="${i}"]`).click();await e.get('run').click();const rows=e.get('dock-content').querySelectorAll('.measurement-row');assert.equal(rows.length,2);assert.match(e.get('gate-cost').textContent,/1 query/);}
  const reload=createEnvironment({saved:e.saved});assert.ok(reload.get('briefing-content'));await reload.begin();await verify(reload);assert.equal(reload.win.quantumFoundry.getProject().modules.length,9);
});
test('the expanded chapter is visible while locked, and every replay receives its own mission popup',async()=>{
  const e=createEnvironment();await e.query('[data-chapter="1"]').click();assert.equal(e.doc.querySelectorAll('[data-level]').length,8);assert.equal(e.query('[data-level="oracle"]').disabled,true);assert.match(e.get('map-progress').textContent,/0 \/ 16/);
  const ready=createEnvironment({saved:expandedSeed()});await ready.query('[data-chapter="1"]').click();await ready.query('[data-level="parity"]').click();assert.ok(ready.get('briefing-content'));assert.match(ready.get('dialog-kicker').textContent,/MISSION 13 \/ 16/);assert.match(ready.get('briefing-content').textContent,/16 input cases/);await ready.begin();
  await ready.get('map-button').click();await ready.query('[data-level="parity"]').click();assert.ok(ready.get('briefing-content'));assert.equal(ready.state().qubits,4);
});
test('all new teaching diagrams, query examples, and hints leave the working circuit unchanged',async()=>{
  const e=createEnvironment({saved:expandedSeed()});
  for(const id of ['swap','routing','ghz','uncompute','parity','fanout','kickback','oracle']) {
    await e.open(id);const before=e.state(),progress=plain(e.win.quantumFoundry.getProject().progress);await e.get('assignment').click();await e.get('lesson-tab-1').click();assert.ok(e.get('concept-example').querySelector('.example-schematic'));
    const example=e.win.FoundryLessons[id].example;
    for(let i=0;i<example.inputs.length;i++) {
      if(example.inputs.length>1)await e.query(`[data-demo-input="${i}"]`).click();const steps=e.doc.querySelectorAll('[data-demo-step]');
      for(let j=0;j<steps.length;j++)await e.query(`[data-demo-step="${j}"]`).click();
      if(example.query){const state=e.get('concept-example').querySelectorAll('.state-row'),answer=example.query==='bv'?parseInt(example.inputs[i].message,2):Number(example.inputs[i].message[0]!==example.inputs[i].message[1]);const offset=1<<(example.qubits-1);
        state.forEach((row,index)=>assert.equal(parseFloat(row.children[3].textContent),index===answer||index===answer+offset?50:0));const pair=[state[answer].children[1].textContent,state[answer+offset].children[1].textContent];assert.equal(pair.filter(a=>a.startsWith('−')).length,1);assert.equal(pair.filter(a=>a.startsWith('+')).length,1);
      }
    }
    await e.get('lesson-tab-2').click();assert.match(e.get('briefing-content').textContent,/What Check circuit verifies/);await e.begin();assert.deepEqual(e.state(),before);assert.deepEqual(plain(e.win.quantumFoundry.getProject().progress),progress);
    await e.get('hint').click();assert.match(e.get('dialog-title').textContent,/Hint 1 \/ 3/);await e.modalAction(0);assert.deepEqual(e.state(),before);
  }
});
test('one-to-six-qubit Sandbox circuits persist independently and survive backup import',async()=>{
  const e=createEnvironment();await e.get('sandbox').click();assert.equal(e.get('check').hidden,true);assert.match(e.get('briefing-content').textContent,/Hadamard/);assert.match(e.get('briefing-content').textContent,/CNOT/);await e.get('lesson-tab-2').click();assert.match(e.get('briefing-content').textContent,/Sandbox rules/);assert.doesNotMatch(e.get('briefing-content').textContent,/What Check circuit verifies/);await e.begin();const h=await e.place('H',320);await e.wire('in0',h);await e.wire(h,'out0');await e.wire('in1','out1');const two=e.state().graph;
  e.get('register-size').value='6';await e.get('register-size').dispatch('change');assert.equal(e.state().qubits,6);assert.equal(e.state().bitOrder,'q5q4q3q2q1q0');assert.equal(e.get('input-select').querySelectorAll('option').length,64);assert.equal(e.get('input-buttons').hidden,true);
  await buildPaths(e,[gate('H',[0],200),...Array.from({length:5},(_,q)=>gate('CX',[q,q+1],330+q*110))]);await e.get('run').click();const six=e.state().graph;assert.equal(e.win.quantumFoundry.getStatus().error,null);assert.equal(e.get('dock-content').querySelectorAll('.measurement-row').length,2);
  await e.get('tab-state').click();assert.equal(e.get('dock-content').querySelectorAll('.state-row').length,64);assert.equal(e.get('dock-content').querySelector('.register-marginals').children.length,6);
  assert.match(e.get('dock-content').textContent,/F.*P\(1\) 50%/);await e.get('save-component').click();e.get('component-name').value='SixQubitLink';await e.modalAction(1);assert.equal(e.win.quantumFoundry.getProject().modules[0].qubits,6);
  e.get('register-size').value='1';await e.get('register-size').dispatch('change');assert.equal(e.doc.querySelector('[data-part="CX"]'),null);await e.wire('in0','out0');
  e.get('register-size').value='2';await e.get('register-size').dispatch('change');assert.deepEqual(e.state().graph,two);
  e.get('register-size').value='6';await e.get('register-size').dispatch('change');assert.deepEqual(e.state().graph,six);await e.get('backup').click();const backup=JSON.parse(await e.doc.downloads[0].blob.text());
  assert.equal(Object.keys(backup.sandboxes).length,3);const imported=plain(e.win.quantumFoundry.validateProject(backup));assert.equal(imported.settings.sandboxQubits,6);assert.deepEqual(imported.sandboxes['2'],two);
  const reload=createEnvironment({saved:e.saved});assert.equal(reload.state().qubits,6);assert.deepEqual(reload.state().graph,six);assert.equal(reload.win.quantumFoundry.getStatus().error,null);
});
test('the original soundtrack starts with a mission gesture, supports mute, track and volume, and saves preferences',async()=>{
  const {AudioStub}=require('./audio-fixture.cjs'),e=createEnvironment({AudioContext:AudioStub});assert.equal(e.win.quantumFoundry.getAudioStatus().playing,false);
  await e.query('[data-level="link"]').click();await e.begin();await Promise.resolve();assert.equal(e.win.quantumFoundry.getAudioStatus().playing,true);assert.equal(e.get('music-toggle').getAttribute('aria-pressed'),'true');
  await e.get('music-toggle').click();assert.equal(e.win.quantumFoundry.getAudioStatus().playing,false);assert.equal(e.win.quantumFoundry.getProject().settings.music,false);
  await e.get('music-toggle').click();assert.equal(e.win.quantumFoundry.getAudioStatus().playing,true);
  e.get('music-volume').value='35';await e.get('music-volume').dispatch('input');e.get('music-track').value='night';await e.get('music-track').dispatch('change');await Promise.resolve();assert.equal(e.win.quantumFoundry.getAudioStatus().track,'night');assert.equal(e.get('music-volume-label').textContent,'35%');
  e.doc.hidden=true;await Promise.all(e.doc.listeners.visibilitychange.map(f=>f()));assert.equal(e.win.quantumFoundry.getAudioStatus().playing,false);
  e.doc.hidden=false;await Promise.all(e.doc.listeners.visibilitychange.map(f=>f()));await Promise.resolve();await Promise.resolve();assert.equal(e.win.quantumFoundry.getAudioStatus().playing,true);
  await e.get('music-toggle').click();const reload=createEnvironment({saved:e.saved,AudioContext:AudioStub});assert.equal(reload.win.quantumFoundry.getAudioStatus().enabled,false);assert.equal(reload.win.quantumFoundry.getAudioStatus().volume,.35);assert.equal(reload.win.quantumFoundry.getAudioStatus().track,'night');
});
test('Qiskit export keeps the selected prepared register input and saved SWAP cost survives import',async()=>{
  const e=createEnvironment({saved:expandedSeed()});await e.open('uncompute');await e.query('[data-input="5"]').click();const python=e.win.quantumFoundry.exportQiskit();assert.match(python,/qc\.x\(0\).*prepare input/);assert.match(python,/qc\.x\(2\).*prepare input/);assert.match(python,/supplied preparation/);
  const backup=plain(e.win.quantumFoundry.getProject()),swap=backup.modules.find(m=>m.kind==='Swap');swap.gates=[{type:'SWAP',control:0,target:1}];const normalized=plain(e.win.quantumFoundry.validateProject(backup));assert.equal(normalized.modules.find(m=>m.kind==='Swap').gates.length,3);
});

test('the from-zero primer, mission words, and dictionary teach without blocking play', async () => {
  const e = createEnvironment();
  assert.ok(e.get('primer-button').classList.contains('pulse'));
  await e.get('primer-button').click();
  assert.ok(e.get('primer-content')); assert.equal(e.doc.querySelectorAll('[data-primer-page]').length, 5);
  assert.match(e.get('primer-content').textContent, /A bit is just a switch/);
  await e.query('[data-primer-step="1"]').click(); assert.match(e.get('primer-content').textContent, /amplitude/i);
  await e.query('[data-primer-page="4"]').click(); assert.match(e.get('primer-content').textContent, /Dictionary/);
  await e.query('[data-primer-done]').click(); assert.equal(e.doc.getElementById('primer-content'), null);
  assert.equal(e.win.quantumFoundry.getProject().seenPrimer, true);
  assert.equal(e.get('primer-button').classList.contains('pulse'), false);
  const reload = createEnvironment({ saved: e.saved });
  assert.equal(reload.get('primer-button').classList.contains('pulse'), false);
  await reload.get('glossary-button').click();
  assert.match(reload.get('modal-root').textContent, /Foundry dictionary/); assert.match(reload.get('modal-root').textContent, /quantum version of a bit/);
  await reload.query('[data-modal-action="0"]').click(); assert.equal(reload.get('modal-root').firstChild, null);
  await reload.query('[data-level="link"]').click();
  await reload.get('lesson-tab-1').click();
  assert.match(reload.get('briefing-content').textContent, /NEW WORDS IN THIS MISSION/);
  assert.match(reload.get('briefing-content').textContent, /quantum version of a bit/);
});

test('credits show exactly the requested names and music credits list all ten recordings', async () => {
  const e = createEnvironment(); await e.get('credits').click();
  assert.deepEqual(e.get('modal-root').querySelector('.credit-list').querySelectorAll('li').map(item => item.textContent), ['Maverick Pil', 'Yujie Wu', 'Kenneth Zhong', 'Anissa Li', 'Kevin MacLeod', 'Qollab', 'Carnegie Mellon University']);
  await e.modalAction(0); await e.get('music-credits').click();
  assert.equal(e.get('modal-root').querySelector('.music-credit-list').querySelectorAll('li').length, 10);
  assert.match(e.get('modal-root').textContent, /Creative Commons Attribution 4.0/);
});
