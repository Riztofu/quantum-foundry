/**
 * Part catalog: primitive gates, I/O terminals, and the registry that also
 * serves player-built custom components.
 */
import type { CustomComponentDef, PartDef, PortDef } from "./types";

const qin = (id: string, label: string, slot: number): PortDef => ({ id, kind: "qin", label, side: "left", slot });
const qout = (id: string, label: string, slot: number): PortDef => ({ id, kind: "qout", label, side: "right", slot });

export const PRIMITIVE_PARTS: PartDef[] = [
  {
    type: "IN",
    label: "IN",
    title: "Qubit Input",
    description: "Supplies one qubit prepared in |0⟩ or |1⟩. Mission fixture.",
    ports: [qout("out", "q", 0)],
    w: 3,
    h: 2,
    category: "I/O",
  },
  {
    type: "OUT",
    label: "OUT",
    title: "Readout",
    description: "Terminal measurement of one qubit in the computational basis.",
    ports: [qin("in", "q", 0)],
    w: 3,
    h: 2,
    category: "I/O",
  },
  {
    type: "X",
    label: "X",
    title: "X — Bit Flip",
    description: "Swaps |0⟩ and |1⟩. The quantum NOT.",
    ports: [qin("in", "", 0), qout("out", "", 0)],
    gate: "X",
    w: 2,
    h: 2,
    category: "1 Qubit",
    unlockedBy: "first-connection",
  },
  {
    type: "H",
    label: "H",
    title: "H — Hadamard",
    description: "Turns |0⟩ into an equal superposition (|0⟩+|1⟩)/√2, and back.",
    ports: [qin("in", "", 0), qout("out", "", 0)],
    gate: "H",
    w: 2,
    h: 2,
    category: "1 Qubit",
    unlockedBy: "inverter",
  },
  {
    type: "Z",
    label: "Z",
    title: "Z — Phase Flip",
    description: "Leaves |0⟩ alone and negates the amplitude of |1⟩. Invisible to a direct measurement.",
    ports: [qin("in", "", 0), qout("out", "", 0)],
    gate: "Z",
    w: 2,
    h: 2,
    category: "1 Qubit",
    unlockedBy: "two-possibilities",
  },
  {
    type: "CX",
    label: "CX",
    title: "CNOT — Controlled Flip",
    description: "Flips the target qubit when the control qubit is |1⟩. Wiring decides which is which.",
    ports: [qin("ctrl_in", "ctrl", 0), qin("tgt_in", "tgt", 1), qout("ctrl_out", "", 0), qout("tgt_out", "", 1)],
    gate: "CX",
    w: 4,
    h: 3,
    category: "2 Qubits",
    unlockedBy: "two-possibilities",
  },
  {
    type: "ENCODER",
    label: "MSG",
    title: "Alice's Message Encoder",
    description: "Mission fixture. Encodes the selected two-bit message cd onto qubit A: X when c=1, then Z when d=1.",
    ports: [qin("in", "A", 0), qout("out", "A", 0)],
    w: 4,
    h: 2,
    category: "I/O",
  },
];

export class PartRegistry {
  private parts = new Map<string, PartDef>();

  constructor(customs: CustomComponentDef[] = []) {
    for (const p of PRIMITIVE_PARTS) this.parts.set(p.type, p);
    for (const c of customs) this.addCustom(c);
  }

  addCustom(c: CustomComponentDef): void {
    const ports: PortDef[] = [];
    for (let i = 0; i < c.arity; i++) {
      ports.push(qin(`in${i}`, c.arity === 2 ? (i === 0 ? "A" : "B") : "", i));
      ports.push(qout(`out${i}`, c.arity === 2 ? (i === 0 ? "A" : "B") : "", i));
    }
    this.parts.set(c.id, {
      type: c.id,
      label: c.name,
      title: c.name,
      description: `${c.promise} (${c.assumes})`,
      ports,
      custom: c,
      w: Math.max(4, Math.min(7, Math.ceil(c.name.length * 0.6) + 2)),
      h: c.arity === 2 ? 3 : 2,
      category: "Custom",
    });
  }

  get(type: string): PartDef | undefined {
    return this.parts.get(type);
  }

  require(type: string): PartDef {
    const p = this.parts.get(type);
    if (!p) throw new Error(`Unknown part type: ${type}`);
    return p;
  }

  all(): PartDef[] {
    return [...this.parts.values()];
  }
}
