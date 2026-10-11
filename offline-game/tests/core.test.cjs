'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), C = require('../source/core.js');
const almost = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
const H = q => ({ type: 'H', target: q }), X = q => ({ type: 'X', target: q }), Z = q => ({ type: 'Z', target: q }), CX = (c = 0, target = 1) => ({ type: 'CX', control: c, target });
function component(kind, id = kind, pool = []) { const l = C.levels.find(l => l.kind === kind), graph = C.solution(l.id, pool); return { id, name: kind, kind, qubits: l.qubits, graph, version: 1, gates: C.compile(graph, pool, l.qubits).gates }; }

test('basis labels follow Qiskit little-endian qubit indexing', () => {
  assert.deepEqual(C.labels(2), ['00', '01', '10', '11']);
  almost(C.probabilities(C.evolve([X(0)], 2).state)[1], 1);
  almost(C.probabilities(C.evolve([X(1)], 2).state)[2], 1);
});
test('H squared and each primitive gate are reversible for every basis state', () => {
  for (const gate of [H(0), H(1), X(0), X(1), Z(0), Z(1), CX(), CX(1, 0)]) for (let i = 0; i < 4; i++) almost(C.fidelity(C.evolve([gate, gate], 2, i).state, C.basis(2, i)), 1);
});
test('CNOT control A target B passes all four computational inputs', () => {
  for (const [input, expected] of [[0, 0], [1, 3], [2, 2], [3, 1]]) almost(C.fidelity(C.evolve([CX()], 2, input).state, C.basis(2, expected)), 1);
});
test('interference reveals a phase change with H Z H', () => {
  const trace = C.evolve([H(0), Z(0), H(0)], 1).trace;
  assert.ok(trace[2][1][0] < 0); almost(C.probabilities(trace[2])[1], .5); almost(C.fidelity(trace[3], C.basis(1, 1)), 1);
});
test('Bell preparation has full positive phase, normalized amplitudes, and entanglement', () => {
  const state = C.evolve([H(0), CX()], 2).state;
  almost(state[0][0], Math.SQRT1_2); almost(state[3][0], Math.SQRT1_2); almost(C.concurrence(state), 1); almost(C.probabilities(state).reduce((a, b) => a + b, 0), 1);
  almost(C.concurrence(C.evolve([H(0), H(1)], 2).state), 0);
});
test('wrong Bell relative phase is rejected even when probabilities match', () => {
  const good = C.evolve([H(0), CX()], 2).state, bad = C.evolve([H(0), CX(), Z(0)], 2).state;
  assert.deepEqual(C.probabilities(good), C.probabilities(bad)); almost(C.fidelity(good, bad), 0);
  const graph = C.solution('bell'); graph.nodes.push({ id: 'bad-z', type: 'Z', x: 860, y: 120 }); graph.edges = graph.edges.filter(e => e.to.node !== 'out0'); graph.edges.push(C.edge('cx', 0, 'bad-z', 0), C.edge('bad-z', 0, 'out0', 0));
  assert.equal(C.grade('bell', graph).passed, false);
});
test('operator verification uses one global phase, rather than one phase per input', () => {
  almost(C.operatorScore([X(0), Z(0)], [X(0)], 1), 0);
  for (const i of [0, 1]) almost(C.fidelity(C.evolve([X(0), Z(0)], 1, i).state, C.evolve([X(0)], 1, i).state), 1);
  // X Z X Z = -I. One global sign is physically equivalent.
  almost(C.operatorScore([X(0), Z(0), X(0), Z(0)], [], 1), 1);
});
test('four encoded Bell states decode to four different messages', () => {
  for (const message of C.labels(2)) almost(C.fidelity(C.evolve([CX(), H(0)], 2, C.encodedBell(message)).state, C.basis(2, parseInt(message, 2))), 1);
});
test('all sixteen campaign reference solutions pass and form valid saved modules', () => {
  const modules = [];
  for (const l of C.levels.filter(l => l.number)) {
    const graph = C.solution(l.id, modules), result = C.grade(l.id, graph, modules);
    assert.equal(result.passed, true, l.id);
    if (l.kind) { const m = component(l.kind, l.kind, modules); assert.equal(C.moduleContract(m), true); modules.push(m); }
  }
  const r = C.grade('courier', C.solution('courier', modules), modules); assert.equal(r.tests.length, 6);
});
test('campaign locks require prerequisites plus actual Bell modules', () => {
  assert.equal(C.available(C.getLevel('invert'), {}, []), false);
  assert.equal(C.available(C.getLevel('invert'), { link: true }, []), true);
  assert.equal(C.available(C.getLevel('phase'), { superposition: true }, []), true);
  assert.equal(C.available(C.getLevel('cnot'), { superposition: true }, []), true);
  assert.equal(C.available(C.getLevel('courier'), { phase: true, decode: true }, []), false);
  assert.equal(C.available(C.getLevel('courier'), { phase: true, decode: true }, [component('BellPrep'), component('BellDecode')]), true);
});
test('an unfinished assignment cannot pass or produce an invented output', () => { for (const l of C.levels.filter(l => l.number)) assert.throws(() => C.grade(l.id, C.starter(l.id), [])); });
test('quantum fanout, duplicate drivers, wrong pin types and malformed graphs are rejected', () => {
  const graph = C.solution('link');
  graph.nodes.push({ id: 'x', type: 'X', x: 500, y: 300 });
  assert.throws(() => C.connect(graph, { node: 'in0', port: 0 }, { node: 'x', port: 0 }, [], 1), /copied/);
  assert.throws(() => C.connect(graph, { node: 'x', port: 0 }, { node: 'out0', port: 0 }, [], 1), /driver/);
  assert.throws(() => C.connect(graph, { node: 'out0', port: 0 }, { node: 'x', port: 0 }, [], 1), /output pins/);
  assert.throws(() => C.compile({ nodes: [{ id: 'a', type: 'UNKNOWN', x: 0, y: 0 }], edges: [] }), /Unknown/);
});
test('quantum path cycles are rejected while incomplete acyclic editing is allowed', () => {
  const g = C.starter('sandbox'); g.nodes.push({ id: 'a', type: 'H', x: 300, y: 120 }, { id: 'b', type: 'X', x: 500, y: 120 });
  g.edges.push(C.edge('a', 0, 'b', 0)); C.validateShape(g, [], 2);
  assert.throws(() => C.connect(g, { node: 'b', port: 0 }, { node: 'a', port: 0 }, [], 2), /loops/);
});
test('geometry does not override wire-defined gate dependencies', () => {
  const graph = C.solution('phase'); graph.nodes.find(n => n.id === 'gate').x = -200;
  assert.deepEqual(C.compile(graph, [], 1).gates.map(g => g.type), ['H', 'Z', 'H']); assert.equal(C.grade('phase', graph).passed, true);
});
test('reversed CNOT wiring fails the prescribed operation', () => {
  const graph = C.solution('cnot'); graph.edges = [C.edge('in0', 0, 'cx', 1), C.edge('in1', 0, 'cx', 0), C.edge('cx', 1, 'out0', 0), C.edge('cx', 0, 'out1', 0)];
  const result = C.grade('cnot', graph); assert.equal(result.passed, false); assert.equal(result.tests.at(-1).passed, false);
});
test('crossing wires does not silently relabel output qubits', () => { const g = C.starter('sandbox'); g.edges = [C.edge('in0', 0, 'out1', 0), C.edge('in1', 0, 'out0', 0)]; assert.throws(() => C.compile(g), /Route A back/); });
test('fixed phase fixtures survive edits and cannot be replaced', () => {
  const graph = C.solution('phase'); graph.nodes.find(n => n.id === 'h-before').type = 'X'; assert.throws(() => C.grade('phase', graph), /fixture/);
  const second = C.solution('phase'); second.edges.find(e => e.locked).locked = false; assert.throws(() => C.grade('phase', second), /fixed connection/);
});
test('saved macro expansion preserves gate cost, dependency depth and qubit mapping', () => {
  const m = component('BellPrep'), graph = C.starter('sandbox'); graph.nodes.push({ id: 'block', type: 'MODULE', moduleId: m.id, x: 520, y: 120 });
  graph.edges = [C.edge('in0', 0, 'block', 0), C.edge('in1', 0, 'block', 1), C.edge('block', 0, 'out0', 0), C.edge('block', 1, 'out1', 0)];
  const expanded = C.compile(graph, [m]); assert.equal(expanded.count, 2); assert.equal(expanded.depth, 2); almost(C.fidelity(C.evolve(expanded.gates, 2).state, C.encodedBell('00')), 1);
  const reversed = C.clone(graph); reversed.edges = [C.edge('in0', 0, 'block', 1), C.edge('in1', 0, 'block', 0), C.edge('block', 1, 'out0', 0), C.edge('block', 0, 'out1', 0)];
  const operations = C.compile(reversed, [m]).gates; assert.equal(operations[0].target, 1); assert.equal(operations[1].control, 1); assert.equal(operations[1].target, 0);
});
test('logical depth allows independent gates in the same layer', () => {
  const g = C.starter('sandbox'); g.nodes.push({ id: 'h0', type: 'H', x: 300, y: 120 }, { id: 'h1', type: 'H', x: 600, y: 240 });
  g.edges = [C.edge('in0', 0, 'h0', 0), C.edge('in1', 0, 'h1', 0), C.edge('h0', 0, 'out0', 0), C.edge('h1', 0, 'out1', 0)]; assert.equal(C.compile(g).depth, 1);
});
test('measurement counts sample fresh preparations and never mutate the wavefunction', () => {
  const s = C.encodedBell('00'), saved = C.clone(s); let count = 0;
  const counts = C.sample(s, 128, () => (count++ % 2 ? .75 : .25)); assert.deepEqual(counts, { '00': 64, '01': 0, '10': 0, '11': 64 }); assert.deepEqual(s, saved);
  assert.throws(() => C.sample(s, 5));
});
test('malformed saved components cannot claim verified operations', () => {
  const m = component('BellDecode'); m.gates = [H(0)]; assert.equal(C.moduleContract(m), false);
  m.gates = [{ type: 'MODULE', target: 0 }]; assert.equal(C.moduleContract(m), false);
  m.gates = [CX(0, 0)]; assert.equal(C.moduleContract(m), false);
});
test('Qiskit export expands macros and prepares a selected Bell input before decoding', () => {
  const graph = C.solution('decode'), python = C.qiskit(C.compile(graph), 2, 0, '11', 'decode');
  assert.ok(python.startsWith('#!/usr/bin/env python3\n')); assert.match(python, /qc\.z\(0\)/); assert.match(python, /qc\.x\(0\)/); assert.match(python, /qc\.cx\(0, 1\)/); assert.ok(python.indexOf('Statevector.from_instruction') < python.indexOf('qc.measure_all()'));
});
test('normalization remains stable across long valid circuits', () => {
  const gates = Array.from({ length: 250 }, (_, i) => [H(i % 2), Z((i + 1) % 2), CX(i % 2, (i + 1) % 2)]).flat();
  const state = C.evolve(gates, 2).state; almost(C.probabilities(state).reduce((a, b) => a + b, 0), 1);
});
