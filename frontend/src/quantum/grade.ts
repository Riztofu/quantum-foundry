/**
 * Grading engine. Exact simulation, deterministic verdicts.
 *
 * - State-preparation: fidelity |<target|psi>|^2, which ignores global phase.
 * - Operation claims: full unitary compared to the reference up to one global
 *   phase (the local mirror of Qiskit's Operator.equiv).
 * - Feedback distinguishes structural errors, wrong probabilities, and wrong
 *   relative phase. Basis probabilities alone never verify a coherent op.
 */
import type {
  CompiledCircuit,
  LevelDef,
  OperatorCheck,
  StateVec,
  TestCase,
} from "../model/types";
import { basisLabel, basisState, opsToUnitary, probabilities, simulate } from "./sim";

const EPS = 1e-6;

export interface CaseResult {
  test: TestCase;
  pass: boolean;
  /** actual, human-readable (bits or dominant amplitudes) */
  actual: string;
  expected: string;
  feedback?: string;
  finalState?: StateVec;
}

export interface GradeResult {
  compiled: boolean;
  structural?: string; // structural error summary when not compiled
  cases: CaseResult[];
  operatorPass?: boolean;
  operatorFeedback?: string;
  allPass: boolean;
}

function inner(a: StateVec, bAmps: [number, number][]): { re: number; im: number } {
  // <b|a> with b given as literal amplitudes
  let re = 0;
  let im = 0;
  for (let i = 0; i < bAmps.length; i++) {
    const [br, bi] = bAmps[i]; // b_i
    // conj(b_i) * a_i
    re += br * a.re[i] + bi * a.im[i];
    im += br * a.im[i] - bi * a.re[i];
  }
  return { re, im };
}

export function stateFidelity(actual: StateVec, target: [number, number][]): number {
  const ip = inner(actual, target);
  return ip.re * ip.re + ip.im * ip.im;
}

/** Do probabilities match the target state's probabilities? (phase-blind check for feedback) */
function probsMatch(actual: StateVec, target: [number, number][]): boolean {
  const p = probabilities(actual);
  for (let i = 0; i < target.length; i++) {
    const tp = target[i][0] * target[i][0] + target[i][1] * target[i][1];
    if (Math.abs(p[i] - tp) > 1e-4) return false;
  }
  return true;
}

export function describeState(s: StateVec, maxTerms = 4): string {
  const terms: string[] = [];
  const idx = [...Array(1 << s.n).keys()].sort(
    (a, b) => s.re[b] * s.re[b] + s.im[b] * s.im[b] - (s.re[a] * s.re[a] + s.im[a] * s.im[a]),
  );
  for (const i of idx.slice(0, maxTerms)) {
    const mag2 = s.re[i] * s.re[i] + s.im[i] * s.im[i];
    if (mag2 < 1e-9) continue;
    const amp = s.im[i] * s.im[i] < 1e-12 ? `${s.re[i] >= 0 ? "+" : "−"}${Math.abs(s.re[i]).toFixed(2)}` : `${mag2.toFixed(2)}^½∠`;
    terms.push(`${amp}|${basisLabel(i, s.n)}⟩`);
  }
  return terms.join(" ") || "0";
}

function runCase(level: LevelDef, test: TestCase, compileFor: (t: TestCase) => CompiledCircuit): CaseResult {
  const compiled = compileFor(test);
  if (!compiled.ok) {
    return {
      test,
      pass: false,
      actual: "—",
      expected: test.expect.descr,
      feedback: compiled.issues[0]?.message ?? "The circuit is incomplete.",
    };
  }
  let input = basisState(level.numQubits, padInputs(test.inputs, level.numQubits));
  if (test.prep?.length) {
    input = simulate(
      input,
      test.prep.map((p, i) => ({ ...p, nodeId: `prep${i}`, layer: 0 })),
    );
  }
  const final = simulate(input, compiled.ops);

  if (test.expect.type === "bits") {
    const p = probabilities(final);
    // deterministic readout expected: find outcome with probability ~1
    let best = 0;
    for (let i = 1; i < p.length; i++) if (p[i] > p[best]) best = i;
    const bits = basisLabel(best, level.numQubits);
    const deterministic = p[best] > 1 - 1e-6;
    const pass = deterministic && bits === test.expect.bits;
    return {
      test,
      pass,
      actual: deterministic ? bits : `random (${describeState(final)})`,
      expected: test.expect.bits,
      finalState: final,
      feedback: pass
        ? undefined
        : deterministic
          ? `Reads ${bits}, expected ${test.expect.bits}.`
          : "The readout is not deterministic — the state still has spread amplitude.",
    };
  }

  const f = stateFidelity(final, test.expect.amps);
  const pass = f > 1 - EPS;
  let feedback: string | undefined;
  if (!pass) {
    feedback = probsMatch(final, test.expect.amps)
      ? "The probabilities match, but the relative phase differs. Flip to amplitude view — a sign is wrong."
      : `Fidelity ${f.toFixed(3)} — the amplitudes land in the wrong places.`;
  }
  return {
    test,
    pass,
    actual: describeState(final),
    expected: test.expect.descr,
    finalState: final,
    feedback,
  };
}

function padInputs(inputs: (0 | 1)[], n: number): (0 | 1)[] {
  const out: (0 | 1)[] = [];
  for (let q = 0; q < n; q++) out.push(inputs[q] ?? 0);
  return out;
}

/**
 * Compare the realized unitary with the reference up to one global phase.
 * Mirrors Qiskit Operator.equiv.
 */
export function referenceMatrix(check: OperatorCheck): [number, number][][] {
  const u = opsToUnitary(
    check.arity,
    check.refOps.map((p, i) => ({ ...p, nodeId: `ref${i}`, layer: 0 })),
  );
  const m: [number, number][][] = [];
  for (let r = 0; r < u.dim; r++) {
    const row: [number, number][] = [];
    for (let c = 0; c < u.dim; c++) row.push([u.re[r * u.dim + c], u.im[r * u.dim + c]]);
    m.push(row);
  }
  return m;
}

export function checkOperator(
  u: { re: Float64Array; im: Float64Array; dim: number },
  check: OperatorCheck,
): { pass: boolean; feedback?: string } {
  const dim = u.dim;
  const matrix = referenceMatrix(check);
  if (dim !== matrix.length) {
    return { pass: false, feedback: "The circuit does not act on the required number of qubits." };
  }
  // find reference entry with largest magnitude to fix the phase
  let pr = 0;
  let pc = 0;
  let pm = -1;
  for (let r = 0; r < dim; r++)
    for (let c = 0; c < dim; c++) {
      const [tr, ti] = matrix[r][c];
      const m = tr * tr + ti * ti;
      if (m > pm) {
        pm = m;
        pr = r;
        pc = c;
      }
    }
  const [tr, ti] = matrix[pr][pc];
  const ar = u.re[pr * dim + pc];
  const ai = u.im[pr * dim + pc];
  const am = ar * ar + ai * ai;
  if (Math.abs(am - pm) > 1e-6) {
    return { pass: false, feedback: diagnoseOperator(u, matrix) };
  }
  // phase = actual / target
  const den = tr * tr + ti * ti;
  const phr = (ar * tr + ai * ti) / den;
  const phi = (ai * tr - ar * ti) / den;
  for (let r = 0; r < dim; r++)
    for (let c = 0; c < dim; c++) {
      const [er, ei] = matrix[r][c];
      const xr = er * phr - ei * phi;
      const xi = er * phi + ei * phr;
      if (Math.abs(u.re[r * dim + c] - xr) > 1e-6 || Math.abs(u.im[r * dim + c] - xi) > 1e-6) {
        return { pass: false, feedback: diagnoseOperator(u, matrix) };
      }
    }
  return { pass: true };
}

function diagnoseOperator(
  u: { re: Float64Array; im: Float64Array; dim: number },
  matrix: [number, number][][],
): string {
  const dim = u.dim;
  // magnitude pattern comparison: catches "control and target reversed" and phase-only errors
  let magsMatch = true;
  for (let r = 0; r < dim && magsMatch; r++)
    for (let c = 0; c < dim; c++) {
      const [er, ei] = matrix[r][c];
      const tm = Math.sqrt(er * er + ei * ei);
      const am = Math.hypot(u.re[r * dim + c], u.im[r * dim + c]);
      if (Math.abs(tm - am) > 1e-4) {
        magsMatch = false;
        break;
      }
    }
  if (magsMatch) {
    return "The probabilities match, but the relative phase differs — the operation is only correct up to signs.";
  }
  // reversed-CNOT heuristic for 2-qubit checks
  if (dim === 4) {
    // swap roles: reference with qubits exchanged
    const perm = [0, 2, 1, 3]; // exchange q0 and q1 in basis index
    let reversed = true;
    for (let r = 0; r < 4 && reversed; r++)
      for (let c = 0; c < 4; c++) {
        const [er, ei] = matrix[perm[r]][perm[c]];
        const tm = Math.sqrt(er * er + ei * ei);
        const am = Math.hypot(u.re[r * dim + c], u.im[r * dim + c]);
        if (Math.abs(tm - am) > 1e-4) {
          reversed = false;
          break;
        }
      }
    if (reversed) return "The control and target are reversed — swap which qubit drives the flip.";
  }
  return "This operation does not match the required behavior for every input, even though some cases may pass.";
}

export function gradeLevel(
  level: LevelDef,
  compileFor: (t: TestCase) => CompiledCircuit,
  realizedUnitary?: { re: Float64Array; im: Float64Array; dim: number } | null,
): GradeResult {
  const probe = compileFor(level.tests[0]);
  if (!probe.ok && probe.issues.some((i) => i.severity === "error")) {
    return {
      compiled: false,
      structural: probe.issues.find((i) => i.severity === "error")!.message,
      cases: level.tests.map((t) => ({
        test: t,
        pass: false,
        actual: "—",
        expected: t.expect.descr,
      })),
      allPass: false,
    };
  }
  const cases = level.tests.map((t) => runCase(level, t, compileFor));
  let operatorPass: boolean | undefined;
  let operatorFeedback: string | undefined;
  if (level.operatorCheck) {
    if (realizedUnitary) {
      const r = checkOperator(realizedUnitary, level.operatorCheck);
      operatorPass = r.pass;
      operatorFeedback = r.feedback;
    } else {
      operatorPass = false;
      operatorFeedback = "The full operation could not be verified — finish the circuit first.";
    }
  }
  // per-case cross feedback, e.g. "passes 00 but fails 01"
  const failing = cases.filter((c) => !c.pass);
  const passing = cases.filter((c) => c.pass);
  if (failing.length && passing.length) {
    for (const f of failing) {
      if (!f.feedback?.startsWith("This component")) {
        f.feedback = `This circuit passes ${passing[0].test.label} but fails ${f.test.label}.${f.feedback ? " " + f.feedback : ""}`;
      }
    }
  }
  const allPass = cases.every((c) => c.pass) && (operatorPass ?? true);
  return { compiled: true, cases, operatorPass, operatorFeedback, allPass };
}
