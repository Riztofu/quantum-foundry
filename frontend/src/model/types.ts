/**
 * Core data model for Quantum Foundry.
 *
 * Bit-order convention (documented, exported): qubit 0 is the LEAST significant
 * bit of every basis index and bitstring, matching Qiskit. A displayed
 * bitstring reads "q1 q0" left-to-right (B A for the courier mission).
 */

export type PortKind = "qin" | "qout" | "cin" | "cout";

export interface PortDef {
  id: string; // unique within the part, e.g. "in0", "ctrl_in"
  kind: PortKind;
  label: string; // short label drawn near the pin, e.g. "ctrl"
  side: "left" | "right";
  /** vertical slot index on its side, 0 = top */
  slot: number;
}

export type GateName = "X" | "Z" | "H" | "CX";

/** One primitive operation after compilation. */
export interface Op {
  gate: GateName;
  /** qubit indices; for CX: [control, target] */
  qubits: number[];
  /** node that produced this op (outermost node on the canvas, for highlighting) */
  nodeId: string;
  /** logical layer for depth display (independent gates share a layer) */
  layer: number;
}

export interface CustomComponentDef {
  /** stable id, e.g. "custom:inverter:v1" */
  id: string;
  name: string;
  /** number of quantum ports on each side (1 or 2 for the hackathon build) */
  arity: 1 | 2;
  /** the saved internal circuit (uses only primitive parts + IN/OUT markers) */
  graph: CircuitGraph;
  /** primitive gate count when fully expanded */
  gateCost: number;
  /** plain-language promised behavior */
  promise: string;
  /** input assumption, e.g. "verified from |00>" or "any input (operator verified)" */
  assumes: string;
  /** schema version so saved definitions stay stable */
  version: number;
}

export interface PartDef {
  type: string; // "IN", "OUT", "X", "H", "Z", "CX", "MEASURE", "ENCODER", or custom id
  label: string;
  title: string;
  description: string;
  ports: PortDef[];
  gate?: GateName; // primitive single-gate parts
  custom?: CustomComponentDef;
  /** size in grid cells */
  w: number;
  h: number;
  category: "1 Qubit" | "2 Qubits" | "I/O" | "Custom";
  /** which level unlocks it (level id) — undefined means available from start */
  unlockedBy?: string;
}

export interface NodeInst {
  id: string;
  type: string;
  /** grid coordinates (cells, not px) */
  x: number;
  y: number;
  /** mission fixture: cannot be deleted; rewiring may be restricted */
  fixture?: boolean;
  /** fixture whose wiring is locked entirely */
  lockedWiring?: boolean;
  /** for IN parts: which qubit index this input drives */
  qubit?: number;
  /** for IN parts: prepared basis value (0 or 1), settable from the left strip */
  value?: 0 | 1;
}

export interface PortRef {
  node: string;
  port: string;
}

export interface Edge {
  id: string;
  from: PortRef; // must be an output port (qout/cout)
  to: PortRef; // must be an input port (qin/cin)
  /** fixture edge: cannot be deleted */
  fixture?: boolean;
}

export interface CircuitGraph {
  nodes: NodeInst[];
  edges: Edge[];
}

/** A compile-time problem, pointing at the pins involved. */
export interface CompileIssue {
  severity: "error" | "incomplete";
  message: string;
  nodes?: string[];
  ports?: PortRef[];
}

export interface CompiledCircuit {
  ok: boolean;
  issues: CompileIssue[];
  numQubits: number;
  ops: Op[];
  /** measured qubits in node order: nodeId -> qubit index */
  measurements: { nodeId: string; qubit: number }[];
  gateCount: number;
  depth: number;
  /** execution order of canvas nodes, for step-through highlighting */
  nodeOrder: string[];
}

/** complex amplitudes as parallel arrays */
export interface StateVec {
  re: Float64Array;
  im: Float64Array;
  n: number; // qubit count
}

export type TestExpectation =
  | { type: "state"; amps: [number, number][]; descr: string } // target statevector (re,im), fidelity-checked
  | { type: "bits"; bits: string; descr: string }; // deterministic readout, displayed q(n-1)..q0

export interface PrepOp {
  gate: GateName;
  qubits: number[];
}

export interface TestCase {
  id: string;
  label: string; // e.g. "input |01>"
  /** basis value for each declared input qubit, by qubit index */
  inputs: (0 | 1)[];
  /** fixture preparation applied before the player's circuit (e.g. supplied Bell states) */
  prep?: PrepOp[];
  /** for the courier level: message the encoder fixture applies */
  message?: string;
  expect: TestExpectation;
}

export interface OperatorCheck {
  /** reference circuit realizing the required operation; its unitary is the grading reference, compared up to global phase */
  refOps: PrepOp[];
  arity: number;
  descr: string;
}

export interface LevelDef {
  id: string;
  n: number; // order number for display
  title: string;
  group: "Foundations" | "Coherence" | "Entanglement" | "Communication";
  contract: string; // one-sentence mission contract
  briefing: string[]; // short mission text paragraphs
  fieldNote: string; // collected on completion
  numQubits: number;
  /** parts placeable in this level (type ids); custom parts always allowed once saved */
  palette: string[];
  /** starting graph (fixtures + any pre-placed parts) */
  fixtures: CircuitGraph;
  /** ids of node whose region is editable; empty = whole canvas editable */
  tests: TestCase[];
  operatorCheck?: OperatorCheck;
  prereqs: string[]; // level ids
  unlocks: { parts?: string[]; note?: string };
  /** completing lets the player save their circuit as this component */
  savesComponent?: { suggestedName: string; arity: 1 | 2; promise: string; assumes: string };
  /** level requires these saved components to exist */
  requiresComponents?: string[];
  /** progressive hints, revealed one at a time */
  hints?: string[];
}
