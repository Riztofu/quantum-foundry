/**
 * Local statevector simulator (the "Local Preview" source).
 *
 * Exact complex statevector evolution for small registers. Qubit 0 is the
 * least significant bit of the basis index (Qiskit convention). Validated
 * against Qiskit reference fixtures in src/quantum/__tests__/.
 */
import type { GateName, Op, StateVec } from "../model/types";

export function zeroState(n: number): StateVec {
  const dim = 1 << n;
  const re = new Float64Array(dim);
  const im = new Float64Array(dim);
  re[0] = 1;
  return { re, im, n };
}

export function basisState(n: number, bits: (0 | 1)[]): StateVec {
  // bits[q] is the value of qubit q
  let idx = 0;
  for (let q = 0; q < n; q++) if (bits[q]) idx |= 1 << q;
  const s = zeroState(n);
  s.re[0] = 0;
  s.re[idx] = 1;
  return s;
}

export function cloneState(s: StateVec): StateVec {
  return { re: s.re.slice(), im: s.im.slice(), n: s.n };
}

const SQRT1_2 = Math.SQRT1_2;

export function applyGate(s: StateVec, gate: GateName, qubits: number[]): void {
  const dim = 1 << s.n;
  const { re, im } = s;
  if (gate === "X") {
    const m = 1 << qubits[0];
    for (let i = 0; i < dim; i++) {
      if ((i & m) === 0) {
        const j = i | m;
        const tr = re[i], ti = im[i];
        re[i] = re[j]; im[i] = im[j];
        re[j] = tr; im[j] = ti;
      }
    }
  } else if (gate === "Z") {
    const m = 1 << qubits[0];
    for (let i = 0; i < dim; i++) {
      if (i & m) {
        re[i] = -re[i];
        im[i] = -im[i];
      }
    }
  } else if (gate === "H") {
    const m = 1 << qubits[0];
    for (let i = 0; i < dim; i++) {
      if ((i & m) === 0) {
        const j = i | m;
        const ar = re[i], ai = im[i], br = re[j], bi = im[j];
        re[i] = (ar + br) * SQRT1_2;
        im[i] = (ai + bi) * SQRT1_2;
        re[j] = (ar - br) * SQRT1_2;
        im[j] = (ai - bi) * SQRT1_2;
      }
    }
  } else if (gate === "CX") {
    const cm = 1 << qubits[0];
    const tm = 1 << qubits[1];
    for (let i = 0; i < dim; i++) {
      if ((i & cm) !== 0 && (i & tm) === 0) {
        const j = i | tm;
        const tr = re[i], ti = im[i];
        re[i] = re[j]; im[i] = im[j];
        re[j] = tr; im[j] = ti;
      }
    }
  } else {
    throw new Error(`Unknown gate ${gate satisfies never}`);
  }
}

/** Run ops from a given input state; returns a fresh state. */
export function simulate(input: StateVec, ops: Op[]): StateVec {
  const s = cloneState(input);
  for (const op of ops) applyGate(s, op.gate, op.qubits);
  return s;
}

/** Snapshots after each op (index 0 = input state), for step/rewind. */
export function simulateSteps(input: StateVec, ops: Op[]): StateVec[] {
  const snaps: StateVec[] = [cloneState(input)];
  let s = cloneState(input);
  for (const op of ops) {
    applyGate(s, op.gate, op.qubits);
    snaps.push(cloneState(s));
  }
  return snaps;
}

export function probabilities(s: StateVec): Float64Array {
  const dim = 1 << s.n;
  const p = new Float64Array(dim);
  for (let i = 0; i < dim; i++) p[i] = s.re[i] * s.re[i] + s.im[i] * s.im[i];
  return p;
}

/** Sample `shots` measurement outcomes (all qubits, computational basis). */
export function sampleShots(s: StateVec, shots: number, rng: () => number = Math.random): Map<number, number> {
  const p = probabilities(s);
  const counts = new Map<number, number>();
  for (let k = 0; k < shots; k++) {
    let r = rng();
    let outcome = p.length - 1;
    for (let i = 0; i < p.length; i++) {
      r -= p[i];
      if (r <= 0) {
        outcome = i;
        break;
      }
    }
    counts.set(outcome, (counts.get(outcome) ?? 0) + 1);
  }
  return counts;
}

/** bitstring label for basis index, q(n-1) .. q0 left-to-right (Qiskit order) */
export function basisLabel(idx: number, n: number): string {
  let out = "";
  for (let q = n - 1; q >= 0; q--) out += (idx >> q) & 1;
  return out;
}

/** Build the full unitary realized by `ops` on an n-qubit register (column c = U|c>). */
export function opsToUnitary(n: number, ops: Op[]): { re: Float64Array; im: Float64Array; dim: number } {
  const dim = 1 << n;
  const re = new Float64Array(dim * dim);
  const im = new Float64Array(dim * dim);
  for (let c = 0; c < dim; c++) {
    const s = zeroState(n);
    s.re[0] = 0;
    s.re[c] = 1;
    for (const op of ops) applyGate(s, op.gate, op.qubits);
    for (let r = 0; r < dim; r++) {
      re[r * dim + c] = s.re[r];
      im[r * dim + c] = s.im[r];
    }
  }
  return { re, im, dim };
}
