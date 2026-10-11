'use strict';
// The game's exact simulator against Qiskit-generated fixtures
// (regenerate: python -m backend.make_reference > tests/qiskit_reference.json).
const test = require('node:test'), assert = require('node:assert/strict'), C = require('../source/core.js');
const reference = require('./qiskit_reference.json');
const close = (a, b) => Math.max(...a.map((x, i) => Math.hypot(x[0] - b[i][0], x[1] - b[i][1])));

test('statevectors match Qiskit for mission circuits and random 1-6 qubit circuits', () => {
  assert.ok(reference.statevectors.length >= 25);
  for (const f of reference.statevectors) assert.ok(close(C.evolve(f.gates, f.n, f.initial, false).state, f.amps) < 1e-12, f.name);
});

test('unitaries match Qiskit Operator column by column (q0 least significant)', () => {
  for (const f of reference.unitaries) for (let col = 0; col < 2 ** f.n; col++) {
    const column = C.evolve(f.gates, f.n, col, false).state, expected = f.matrix.map(row => row[col]);
    assert.ok(close(column, expected) < 1e-12, f.name + ' column ' + col);
  }
});

test('the reversed CNOT is a different operation in both engines', () => {
  const reversed = reference.unitaries.find(f => f.name === 'reversed-cnot'), bell = C.references.cnot;
  assert.ok(C.operatorScore(reversed.gates, bell, 2) < 1 - C.EPS);
});
