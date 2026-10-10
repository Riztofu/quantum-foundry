import { describe, expect, it } from "vitest";
import { basisState, opsToUnitary, probabilities, sampleShots, simulate, zeroState } from "../sim";
import { compileGraph } from "../compile";
import { checkOperator, gradeLevel, stateFidelity } from "../grade";
import { PartRegistry } from "../../model/parts";
import { LEVEL_BY_ID } from "../../model/levels";
import type { CircuitGraph, CustomComponentDef, Op, TestCase } from "../../model/types";
import qiskitRef from "./qiskit_reference.json";

const reg = new PartRegistry();
const op = (gate: Op["gate"], qubits: number[]): Op => ({ gate, qubits, nodeId: "t", layer: 0 });

describe("statevector simulator", () => {
  it("H on |0> gives equal positive superposition", () => {
    const s = simulate(zeroState(1), [op("H", [0])]);
    expect(s.re[0]).toBeCloseTo(Math.SQRT1_2, 10);
    expect(s.re[1]).toBeCloseTo(Math.SQRT1_2, 10);
  });
  it("HZH |0> = |1> (interference)", () => {
    const s = simulate(zeroState(1), [op("H", [0]), op("Z", [0]), op("H", [0])]);
    expect(Math.abs(s.re[1])).toBeCloseTo(1, 10);
    expect(probabilities(s)[0]).toBeCloseTo(0, 10);
  });
  it("Bell pair from |00>", () => {
    const s = simulate(zeroState(2), [op("H", [0]), op("CX", [0, 1])]);
    expect(s.re[0]).toBeCloseTo(Math.SQRT1_2, 10);
    expect(s.re[3]).toBeCloseTo(Math.SQRT1_2, 10);
    expect(Math.hypot(s.re[1], s.im[1])).toBeCloseTo(0, 10);
  });
  it("matches Qiskit reference statevectors", () => {
    for (const fix of qiskitRef.statevectors) {
      const ops = fix.ops.map((o: { gate: string; qubits: number[] }) => op(o.gate as Op["gate"], o.qubits));
      const s = simulate(zeroState(fix.n), ops);
      for (let i = 0; i < fix.amps.length; i++) {
        expect(s.re[i]).toBeCloseTo(fix.amps[i][0], 8);
        expect(s.im[i]).toBeCloseTo(fix.amps[i][1], 8);
      }
    }
  });
  it("matches Qiskit reference unitaries up to global phase", () => {
    for (const fix of qiskitRef.unitaries) {
      const ops = fix.ops.map((o: { gate: string; qubits: number[] }) => op(o.gate as Op["gate"], o.qubits));
      const u = opsToUnitary(fix.n, ops);
      const r = checkOperator(u, {
        refOps: fix.ops as { gate: Op["gate"]; qubits: number[] }[],
        arity: fix.n,
        descr: "ref",
      });
      expect(r.pass).toBe(true);
      // and literally equal to Qiskit's matrix
      const dim = 1 << fix.n;
      for (let rI = 0; rI < dim; rI++)
        for (let c = 0; c < dim; c++) {
          expect(u.re[rI * dim + c]).toBeCloseTo(fix.matrix[rI][c][0], 8);
          expect(u.im[rI * dim + c]).toBeCloseTo(fix.matrix[rI][c][1], 8);
        }
    }
  });
  it("shot sampling is exhaustive and sums to shots", () => {
    const s = simulate(zeroState(1), [op("H", [0])]);
    const counts = sampleShots(s, 512, () => 0.25);
    let total = 0;
    for (const v of counts.values()) total += v;
    expect(total).toBe(512);
  });
});

describe("compiler", () => {
  const wire = (id: string, fn: string, fp: string, tn: string, tp: string) => ({
    id,
    from: { node: fn, port: fp },
    to: { node: tn, port: tp },
  });

  it("compiles a straight wire", () => {
    const g: CircuitGraph = {
      nodes: [
        { id: "in0", type: "IN", x: 0, y: 0, qubit: 0 },
        { id: "out0", type: "OUT", x: 10, y: 0 },
      ],
      edges: [wire("e0", "in0", "out", "out0", "in")],
    };
    const c = compileGraph(g, reg);
    expect(c.ok).toBe(true);
    expect(c.ops).toHaveLength(0);
    expect(c.measurements).toHaveLength(1);
  });

  it("rejects quantum fanout", () => {
    const g: CircuitGraph = {
      nodes: [
        { id: "in0", type: "IN", x: 0, y: 0, qubit: 0 },
        { id: "x1", type: "X", x: 5, y: 0 },
        { id: "x2", type: "X", x: 5, y: 5 },
      ],
      edges: [wire("e0", "in0", "out", "x1", "in"), wire("e1", "in0", "out", "x2", "in")],
    };
    const c = compileGraph(g, reg);
    expect(c.ok).toBe(false);
    expect(c.issues.some((i) => i.message.includes("cannot be copied"))).toBe(true);
  });

  it("rejects merged inputs", () => {
    const g: CircuitGraph = {
      nodes: [
        { id: "in0", type: "IN", x: 0, y: 0, qubit: 0 },
        { id: "in1", type: "IN", x: 0, y: 5, qubit: 1 },
        { id: "x1", type: "X", x: 5, y: 0 },
      ],
      edges: [wire("e0", "in0", "out", "x1", "in"), wire("e1", "in1", "out", "x1", "in")],
    };
    const c = compileGraph(g, reg);
    expect(c.ok).toBe(false);
    expect(c.issues.some((i) => i.message.includes("merge"))).toBe(true);
  });

  it("rejects cycles", () => {
    const g: CircuitGraph = {
      nodes: [
        { id: "x1", type: "X", x: 0, y: 0 },
        { id: "x2", type: "X", x: 5, y: 0 },
      ],
      edges: [wire("e0", "x1", "out", "x2", "in"), wire("e1", "x2", "out", "x1", "in")],
    };
    const c = compileGraph(g, reg);
    expect(c.ok).toBe(false);
    expect(c.issues.some((i) => i.message.includes("loop"))).toBe(true);
  });

  it("reports incomplete graphs without inventing output", () => {
    const g: CircuitGraph = {
      nodes: [
        { id: "in0", type: "IN", x: 0, y: 0, qubit: 0 },
        { id: "h", type: "H", x: 5, y: 0 },
        { id: "out0", type: "OUT", x: 10, y: 0 },
      ],
      edges: [wire("e0", "in0", "out", "h", "in")],
    };
    const c = compileGraph(g, reg);
    expect(c.ok).toBe(false);
    expect(c.issues.every((i) => i.severity === "incomplete")).toBe(true);
  });

  it("tracks CNOT roles by wiring, not position", () => {
    // in1 (q1) wired to ctrl even though it is drawn lower
    const g: CircuitGraph = {
      nodes: [
        { id: "in0", type: "IN", x: 0, y: 0, qubit: 0 },
        { id: "in1", type: "IN", x: 0, y: 5, qubit: 1 },
        { id: "cx", type: "CX", x: 5, y: 2 },
        { id: "out0", type: "OUT", x: 10, y: 0 },
        { id: "out1", type: "OUT", x: 10, y: 5 },
      ],
      edges: [
        wire("e0", "in1", "out", "cx", "ctrl_in"),
        wire("e1", "in0", "out", "cx", "tgt_in"),
        wire("e2", "cx", "ctrl_out", "out1", "in"),
        wire("e3", "cx", "tgt_out", "out0", "in"),
      ],
    };
    const c = compileGraph(g, reg);
    expect(c.ok).toBe(true);
    expect(c.ops[0].qubits).toEqual([1, 0]); // control q1, target q0
  });

  it("expands custom components and counts their primitives", () => {
    const bellGraph: CircuitGraph = {
      nodes: [
        { id: "in0", type: "IN", x: 0, y: 0, qubit: 0 },
        { id: "in1", type: "IN", x: 0, y: 5, qubit: 1 },
        { id: "h", type: "H", x: 4, y: 0 },
        { id: "cx", type: "CX", x: 8, y: 2 },
        { id: "out0", type: "OUT", x: 14, y: 0 },
        { id: "out1", type: "OUT", x: 14, y: 5 },
      ],
      edges: [
        wire("e0", "in0", "out", "h", "in"),
        wire("e1", "h", "out", "cx", "ctrl_in"),
        wire("e2", "in1", "out", "cx", "tgt_in"),
        wire("e3", "cx", "ctrl_out", "out0", "in"),
        wire("e4", "cx", "tgt_out", "out1", "in"),
      ],
    };
    const def: CustomComponentDef = {
      id: "custom:bellprep:v1",
      name: "BellPrep",
      arity: 2,
      graph: bellGraph,
      gateCost: 2,
      promise: "Prepares the Bell pair.",
      assumes: "from |00>",
      version: 1,
    };
    const reg2 = new PartRegistry([def]);
    const g: CircuitGraph = {
      nodes: [
        { id: "in0", type: "IN", x: 0, y: 0, qubit: 0 },
        { id: "in1", type: "IN", x: 0, y: 5, qubit: 1 },
        { id: "bp", type: "custom:bellprep:v1", x: 5, y: 2 },
        { id: "out0", type: "OUT", x: 10, y: 0 },
        { id: "out1", type: "OUT", x: 10, y: 5 },
      ],
      edges: [
        wire("e0", "in0", "out", "bp", "in0"),
        wire("e1", "in1", "out", "bp", "in1"),
        wire("e2", "bp", "out0", "out0", "in"),
        wire("e3", "bp", "out1", "out1", "in"),
      ],
    };
    const c = compileGraph(g, reg2);
    expect(c.ok).toBe(true);
    expect(c.gateCount).toBe(2); // expanded primitives, cost does not disappear
    const s = simulate(basisState(2, [0, 0]), c.ops);
    expect(s.re[0]).toBeCloseTo(Math.SQRT1_2, 10);
    expect(s.re[3]).toBeCloseTo(Math.SQRT1_2, 10);
  });
});

describe("grading", () => {
  it("fidelity ignores global phase but not relative phase", () => {
    const plus = simulate(zeroState(1), [op("H", [0])]);
    const minus = simulate(zeroState(1), [op("X", [0]), op("H", [0])]); // (|0>-|1>)/sqrt2
    const target: [number, number][] = [[Math.SQRT1_2, 0], [Math.SQRT1_2, 0]];
    expect(stateFidelity(plus, target)).toBeCloseTo(1, 10);
    expect(stateFidelity(minus, target)).toBeCloseTo(0, 10);
    // global phase: -|+> still has fidelity 1
    const negPlus = { re: plus.re.map((v) => -v) as unknown as Float64Array, im: plus.im, n: 1 };
    expect(stateFidelity({ re: Float64Array.from(negPlus.re), im: plus.im.slice(), n: 1 }, target)).toBeCloseTo(1, 10);
  });

  it("reversed CNOT fails the operator check with the right feedback", () => {
    const u = opsToUnitary(2, [op("CX", [1, 0])]);
    const r = checkOperator(u, { refOps: [{ gate: "CX", qubits: [0, 1] }], arity: 2, descr: "CX" });
    expect(r.pass).toBe(false);
    expect(r.feedback).toContain("reversed");
  });

  it("wrong-phase Bell state fails level 6 with phase feedback", () => {
    const level = LEVEL_BY_ID.get("shared-pair")!;
    // player built X then H then CX: prepares (|00> - |11>)/sqrt2
    const ops = [op("X", [0]), op("H", [0]), op("CX", [0, 1])];
    const compiled = {
      ok: true,
      issues: [],
      numQubits: 2,
      ops,
      measurements: [],
      gateCount: 3,
      depth: 3,
      nodeOrder: [],
    };
    const grade = gradeLevel(level, () => compiled);
    expect(grade.allPass).toBe(false);
    expect(grade.cases[0].feedback).toContain("relative phase");
  });

  it("level 7 decoder passes all four Bell inputs and the operator check", () => {
    const level = LEVEL_BY_ID.get("read-bell")!;
    const ops = [op("CX", [0, 1]), op("H", [0])];
    const compiled = { ok: true, issues: [], numQubits: 2, ops, measurements: [], gateCount: 2, depth: 2, nodeOrder: [] };
    const grade = gradeLevel(level, () => compiled, opsToUnitary(2, ops));
    expect(grade.cases.map((c) => c.pass)).toEqual([true, true, true, true]);
    expect(grade.operatorPass).toBe(true);
    expect(grade.allPass).toBe(true);
  });

  it("level 8 courier recovers all four messages", () => {
    const level = LEVEL_BY_ID.get("courier")!;
    const compiledFor = (t: TestCase) => {
      const msg = t.message ?? "00";
      const ops: Op[] = [op("H", [0]), op("CX", [0, 1])];
      if (msg[0] === "1") ops.push(op("X", [0]));
      if (msg[1] === "1") ops.push(op("Z", [0]));
      ops.push(op("CX", [0, 1]), op("H", [0]));
      return { ok: true, issues: [], numQubits: 2, ops, measurements: [], gateCount: ops.length, depth: ops.length, nodeOrder: [] };
    };
    const grade = gradeLevel(level, compiledFor);
    expect(grade.cases.map((c) => c.pass)).toEqual([true, true, true, true]);
  });

  it("courier with a wrong decoder fails some messages with cross-case feedback", () => {
    const level = LEVEL_BY_ID.get("courier")!;
    const compiledFor = (t: TestCase) => {
      const msg = t.message ?? "00";
      const ops: Op[] = [op("H", [0]), op("CX", [0, 1])];
      if (msg[0] === "1") ops.push(op("X", [0]));
      if (msg[1] === "1") ops.push(op("Z", [0]));
      ops.push(op("CX", [0, 1])); // forgot the final H
      return { ok: true, issues: [], numQubits: 2, ops, measurements: [], gateCount: ops.length, depth: ops.length, nodeOrder: [] };
    };
    const grade = gradeLevel(level, compiledFor);
    expect(grade.allPass).toBe(false);
    expect(grade.cases.some((c) => c.pass)).toBe(false); // without H, nothing is deterministic
  });
});
