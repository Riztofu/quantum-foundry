/**
 * Campaign data: eight assignments, fully data-driven.
 * Grid coordinates are in cells (CELL px each, see canvas).
 */
import type { CircuitGraph, LevelDef } from "./types";

const R2 = Math.SQRT1_2;

const oneQubitIO = (outX = 44): CircuitGraph => ({
  nodes: [
    { id: "in0", type: "IN", x: 3, y: 10, fixture: true, qubit: 0, value: 0 },
    { id: "out0", type: "OUT", x: outX, y: 10, fixture: true },
  ],
  edges: [],
});

const twoQubitIO = (): CircuitGraph => ({
  nodes: [
    { id: "in0", type: "IN", x: 3, y: 7, fixture: true, qubit: 0, value: 0 },
    { id: "in1", type: "IN", x: 3, y: 16, fixture: true, qubit: 1, value: 0 },
    { id: "out0", type: "OUT", x: 44, y: 7, fixture: true },
    { id: "out1", type: "OUT", x: 44, y: 16, fixture: true },
  ],
  edges: [],
});

export const LEVELS: LevelDef[] = [
  {
    id: "first-connection",
    n: 1,
    title: "First Connection",
    group: "Foundations",
    contract: "Carry the supplied qubit from its input to its readout, unchanged.",
    briefing: [
      "Welcome to the foundry floor, apprentice. Before you shape quantum states, you must learn to carry one.",
      "Click the input's output pin, then click the readout's input pin to run a wire. The readout reports whatever arrives.",
    ],
    fieldNote: "A quantum wire carries one qubit. Wiring is the circuit — geometry is just for your eyes.",
    numQubits: 1,
    palette: [],
    fixtures: oneQubitIO(),
    tests: [
      { id: "t0", label: "input |0⟩", inputs: [0], expect: { type: "bits", bits: "0", descr: "reads 0" } },
      { id: "t1", label: "input |1⟩", inputs: [1], expect: { type: "bits", bits: "1", descr: "reads 1" } },
    ],
    prereqs: [],
    unlocks: { parts: ["X"], note: "X — the bit flip — is now in your drawer." },
  },
  {
    id: "inverter",
    n: 2,
    title: "The Inverter",
    group: "Foundations",
    contract: "Build a device that swaps |0⟩ and |1⟩ for every input.",
    briefing: [
      "The X gate is the quantum NOT: it exchanges |0⟩ and |1⟩.",
      "Place one on the line and wire it in. Pass both tests, and the full operation is verified — then package your work as a reusable Inverter.",
    ],
    fieldNote: "A verified circuit can be sealed into a named component and reused. The foundry grows with you.",
    numQubits: 1,
    palette: ["X"],
    fixtures: oneQubitIO(),
    tests: [
      { id: "t0", label: "input |0⟩", inputs: [0], expect: { type: "bits", bits: "1", descr: "reads 1" } },
      { id: "t1", label: "input |1⟩", inputs: [1], expect: { type: "bits", bits: "0", descr: "reads 0" } },
    ],
    operatorCheck: { refOps: [{ gate: "X", qubits: [0] }], arity: 1, descr: "the X operation on any input" },
    prereqs: ["first-connection"],
    unlocks: { parts: ["H"], note: "H — the Hadamard — is now in your drawer." },
    savesComponent: {
      suggestedName: "Inverter",
      arity: 1,
      promise: "Swaps |0⟩ and |1⟩.",
      assumes: "any input — operator verified",
    },
  },
  {
    id: "two-possibilities",
    n: 3,
    title: "Two Possibilities",
    group: "Coherence",
    contract: "From |0⟩, prepare the positive equal superposition (|0⟩+|1⟩)/√2.",
    briefing: [
      "The Hadamard spreads one definite state into two amplitudes of equal size — both positive.",
      "The state dock shows every amplitude. Your target: +0.71 on |0⟩ and +0.71 on |1⟩, sign included. Run shots and watch the readout split.",
    ],
    fieldNote: "Probability is amplitude squared — and amplitudes, unlike probabilities, can be negative. The sign is real, even when a measurement can't see it.",
    numQubits: 1,
    palette: ["H", "X"],
    fixtures: oneQubitIO(),
    tests: [
      {
        id: "t0",
        label: "input |0⟩",
        inputs: [0],
        expect: { type: "state", amps: [[R2, 0], [R2, 0]], descr: "(|0⟩+|1⟩)/√2, phase included" },
      },
    ],
    prereqs: ["inverter"],
    unlocks: { parts: ["Z", "CX"], note: "Z and CNOT unlocked — the phase branch and the controlled branch are open." },
  },
  {
    id: "hidden-sign",
    n: 4,
    title: "The Hidden Sign",
    group: "Coherence",
    contract: "Insert one part between the two fixed H gates so the readout becomes 1.",
    briefing: [
      "A sealed experiment: H, a gap, then H. Untouched, it returns |0⟩ — the two paths rejoin and cancel back to where they started.",
      "Your drawer holds Z and X. Z flips the sign of the |1⟩ amplitude — invisible to any direct measurement. But between two Hadamards, that hidden sign steers where the paths recombine.",
      "Step the execution and watch the amplitude bars between the gates: the mark is there, even while the probabilities look unchanged.",
    ],
    fieldNote: "A phase flip is invisible to measurement on its own — interference is how a hidden sign becomes a visible answer.",
    numQubits: 1,
    palette: ["Z", "X"],
    fixtures: {
      nodes: [
        { id: "in0", type: "IN", x: 2, y: 10, fixture: true, qubit: 0, value: 0 },
        { id: "h1", type: "H", x: 12, y: 10, fixture: true },
        { id: "h2", type: "H", x: 32, y: 10, fixture: true },
        { id: "out0", type: "OUT", x: 42, y: 10, fixture: true },
      ],
      edges: [
        { id: "fe0", from: { node: "in0", port: "out" }, to: { node: "h1", port: "in" }, fixture: true },
        { id: "fe1", from: { node: "h2", port: "out" }, to: { node: "out0", port: "in" }, fixture: true },
      ],
    },
    tests: [
      { id: "t0", label: "input |0⟩", inputs: [0], expect: { type: "bits", bits: "1", descr: "reads 1, deterministically" } },
    ],
    prereqs: ["two-possibilities"],
    unlocks: { note: "Phase encoding mastered — the Quantum Courier will need it." },
    hints: [
      "Untouched, H then H undoes itself — wiring the gap straight through reads 0. You need to change something in between.",
      "X flips bits. But between two Hadamards, flipping bits is not what moves the answer — flipping the sign is.",
      "Place Z in the gap: wire H → Z → H. Step through and watch the |1⟩ bar swing negative in the middle.",
    ],
  },
  {
    id: "conditional-flip",
    n: 5,
    title: "Conditional Flip",
    group: "Entanglement",
    contract: "Wire the CNOT so qubit A controls a flip on qubit B.",
    briefing: [
      "The CNOT is the first gate where two qubits meet: it flips its target exactly when its control is |1⟩.",
      "The roles follow your wiring — not the gate's position on the canvas. Route A into ctrl and B into tgt, and prove all four basis cases. The full operation is verified coherently, not just case by case.",
    ],
    fieldNote: "Control and target are decided by connections. Reversed wiring is a different operation — the tests can tell.",
    numQubits: 2,
    palette: ["CX", "X"],
    fixtures: twoQubitIO(),
    tests: [
      { id: "t00", label: "input A=0 B=0", inputs: [0, 0], expect: { type: "bits", bits: "00", descr: "B A = 00" } },
      { id: "t10", label: "input A=1 B=0", inputs: [1, 0], expect: { type: "bits", bits: "11", descr: "B A = 11" } },
      { id: "t01", label: "input A=0 B=1", inputs: [0, 1], expect: { type: "bits", bits: "10", descr: "B A = 10" } },
      { id: "t11", label: "input A=1 B=1", inputs: [1, 1], expect: { type: "bits", bits: "01", descr: "B A = 01" } },
    ],
    operatorCheck: {
      refOps: [{ gate: "CX", qubits: [0, 1] }],
      arity: 2,
      descr: "CNOT with A as control and B as target, for any joint input",
    },
    prereqs: ["two-possibilities"],
    unlocks: { note: "ControlledFlip saved — entanglement is one step away." },
    savesComponent: {
      suggestedName: "ControlledFlip",
      arity: 2,
      promise: "Flips B exactly when A is |1⟩.",
      assumes: "any input — operator verified",
    },
  },
  {
    id: "shared-pair",
    n: 6,
    title: "A Shared Pair",
    group: "Entanglement",
    contract: "From |00⟩, prepare the entangled pair (|00⟩ + |11⟩)/√2.",
    briefing: [
      "Spread A with H, then let A control a flip on B. The result cannot be described one qubit at a time — that is entanglement.",
      "The state dock shows the joint state: +0.71 on |00⟩, +0.71 on |11⟩, nothing anywhere else — and the sign matters. Save the result as BellPrep: the courier protocol is built on this pair.",
    ],
    fieldNote: "An entangled pair is one state shared across two qubits. The joint amplitudes are the only honest description.",
    numQubits: 2,
    palette: ["H", "CX", "X", "Z"],
    fixtures: twoQubitIO(),
    tests: [
      {
        id: "t0",
        label: "input |00⟩",
        inputs: [0, 0],
        expect: {
          type: "state",
          amps: [[R2, 0], [0, 0], [0, 0], [R2, 0]],
          descr: "(|00⟩+|11⟩)/√2, phase included",
        },
      },
    ],
    prereqs: ["conditional-flip"],
    unlocks: { note: "BellPrep saved. A decoder would make the pair readable…" },
    hints: [
      "Two ingredients: spread one qubit, then let it control a flip on the other.",
      "H goes on A's line first. Then route A into the CNOT's ctrl pin and B into tgt.",
      "If you see |00⟩ and |11⟩ but the test still fails, check the sign — an X or Z before the H flips the hidden phase.",
    ],
    savesComponent: {
      suggestedName: "BellPrep",
      arity: 2,
      promise: "Prepares (|00⟩+|11⟩)/√2.",
      assumes: "verified from |00⟩",
    },
  },
  {
    id: "read-bell",
    n: 7,
    title: "Read the Bell State",
    group: "Entanglement",
    contract: "Build the decoder — CNOT A→B, then H on A — that maps each supplied Bell state to a definite readout.",
    briefing: [
      "Four Bell states arrive on the line, one per test, prepared by the mission fixtures. Each hides two classical bits that no single-qubit measurement can read.",
      "Run BellPrep backwards: CNOT with A as control, then H on A. Each pair collapses to a definite pair of bits. The decoder is verified as a full operation — it must work on every input, not just these four.",
    ],
    fieldNote: "Entangled states can be told apart perfectly — but only by letting the qubits interact before measuring.",
    numQubits: 2,
    palette: ["H", "CX", "X", "Z"],
    fixtures: twoQubitIO(),
    tests: [
      {
        id: "phi+",
        label: "Φ⁺ = (|00⟩+|11⟩)/√2",
        inputs: [0, 0],
        prep: [{ gate: "H", qubits: [0] }, { gate: "CX", qubits: [0, 1] }],
        expect: { type: "bits", bits: "00", descr: "B A = 00" },
      },
      {
        id: "psi+",
        label: "Ψ⁺ = (|01⟩+|10⟩)/√2",
        inputs: [0, 0],
        prep: [{ gate: "H", qubits: [0] }, { gate: "CX", qubits: [0, 1] }, { gate: "X", qubits: [0] }],
        expect: { type: "bits", bits: "10", descr: "B A = 10" },
      },
      {
        id: "phi-",
        label: "Φ⁻ = (|00⟩−|11⟩)/√2",
        inputs: [0, 0],
        prep: [{ gate: "H", qubits: [0] }, { gate: "CX", qubits: [0, 1] }, { gate: "Z", qubits: [0] }],
        expect: { type: "bits", bits: "01", descr: "B A = 01" },
      },
      {
        id: "psi-",
        label: "Ψ⁻ = (|01⟩−|10⟩)/√2",
        inputs: [0, 0],
        prep: [
          { gate: "H", qubits: [0] },
          { gate: "CX", qubits: [0, 1] },
          { gate: "X", qubits: [0] },
          { gate: "Z", qubits: [0] },
        ],
        expect: { type: "bits", bits: "11", descr: "B A = 11" },
      },
    ],
    operatorCheck: {
      refOps: [{ gate: "CX", qubits: [0, 1] }, { gate: "H", qubits: [0] }],
      arity: 2,
      descr: "CNOT A→B followed by H on A, for any joint input",
    },
    prereqs: ["shared-pair"],
    unlocks: { note: "BellDecode saved. You hold both halves of a quantum channel." },
    hints: [
      "The decoder is BellPrep run in reverse order: the CNOT first this time, then H.",
      "A is still the control: route A into ctrl, B into tgt, then H on A's line after the CNOT.",
    ],
    savesComponent: {
      suggestedName: "BellDecode",
      arity: 2,
      promise: "Maps the four Bell states to the four definite readouts.",
      assumes: "any input — operator verified",
    },
  },
  {
    id: "courier",
    n: 8,
    title: "Quantum Courier",
    group: "Communication",
    contract: "Assemble BellPrep, Alice's encoder, and your BellDecode so every two-bit message is recovered exactly.",
    briefing: [
      "The capstone. Alice and Bob share an entangled pair prepared in advance — that is the resource. Then Alice touches only her qubit A: for message cd she applies X when c=1 and Z when d=1, and sends that one qubit to Bob.",
      "Bob decodes with your BellDecode and reads c from B, d from A. Two classical bits, carried by one transmitted qubit — because a shared pair was spent. Readouts are shown B A = q1 q0, Qiskit order.",
      "Stages: prepare → encode → transmit → decode. Pick each message button and pass all four.",
    ],
    fieldNote: "Superdense coding: one qubit sent + one entangled pair shared = two classical bits received. The pair is a consumable resource.",
    numQubits: 2,
    palette: ["H", "CX", "X", "Z"],
    requiresComponents: ["BellPrep", "BellDecode"],
    fixtures: {
      nodes: [
        { id: "in0", type: "IN", x: 2, y: 7, fixture: true, qubit: 0, value: 0 },
        { id: "in1", type: "IN", x: 2, y: 16, fixture: true, qubit: 1, value: 0 },
        { id: "enc", type: "ENCODER", x: 22, y: 7, fixture: true },
        { id: "out0", type: "OUT", x: 50, y: 7, fixture: true },
        { id: "out1", type: "OUT", x: 50, y: 16, fixture: true },
      ],
      edges: [],
    },
    tests: [
      { id: "m00", label: "message 00", inputs: [0, 0], message: "00", expect: { type: "bits", bits: "00", descr: "B A = 00" } },
      { id: "m01", label: "message 01", inputs: [0, 0], message: "01", expect: { type: "bits", bits: "01", descr: "B A = 01" } },
      { id: "m10", label: "message 10", inputs: [0, 0], message: "10", expect: { type: "bits", bits: "10", descr: "B A = 10" } },
      { id: "m11", label: "message 11", inputs: [0, 0], message: "11", expect: { type: "bits", bits: "11", descr: "B A = 11" } },
    ],
    prereqs: ["hidden-sign", "read-bell"],
    unlocks: { note: "The courier runs. The foundry's first machine is complete." },
    hints: [
      "Order of stages: BellPrep on both qubits → A through Alice's encoder → BellDecode on both → readouts.",
      "Wire BellPrep's A output into the encoder, and the encoder's output into BellDecode's A input. B goes straight from BellPrep to BellDecode.",
      "Test every message with the buttons in the test table — each message is its own test case.",
    ],
  },
];

export const LEVEL_BY_ID = new Map(LEVELS.map((l) => [l.id, l]));
