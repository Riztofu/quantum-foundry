(function (root) {
  'use strict';
  const EPS = 1e-8;
  const LIMITS = Object.freeze({ qubits: 6, nodes: 160, edges: 384, moduleGates: 1024, gates: 4096, modules: 64 });
  const validQubits = n => Number.isInteger(n) && n >= 1 && n <= LIMITS.qubits;
  const qubitName = q => String.fromCharCode(65 + q);
  const bitOrder = n => Array.from({ length: n }, (_, i) => qubitName(n - i - 1)).join(' ');
  const clone = value => JSON.parse(JSON.stringify(value));
  const amp = (r = 0, i = 0) => [r, i];
  const mul = (a, b) => amp(a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]);
  const basis = (n, index = 0) => {
    if (!validQubits(n) || !Number.isInteger(index) || index < 0 || index >= 2 ** n) throw Error('Invalid input state.');
    return Array.from({ length: 2 ** n }, (_, i) => amp(i === index ? 1 : 0));
  };
  const bits = (i, n) => i.toString(2).padStart(n, '0');
  const labels = n => Array.from({ length: 2 ** n }, (_, i) => bits(i, n));
  function apply(state, gate, n) {
    if (!validQubits(n) || state.length !== 2 ** n) throw Error('Input size does not match the circuit.');
    const q = gate.target;
    if (!Number.isInteger(q) || q < 0 || q >= n) throw Error('Invalid gate target.');
    const out = state.map(a => [...a]);
    if (gate.type === 'I') return out;
    if (gate.type === 'CX' || gate.type === 'SWAP') {
      const c = gate.control;
      if (!Number.isInteger(c) || c < 0 || c >= n || c === q) throw Error('CNOT or SWAP needs two different qubits.');
      for (let i = 0; i < out.length; i++) if ((i & 2 ** c) && !(i & 2 ** q)) {
        const j = gate.type === 'SWAP' ? i ^ 2 ** q ^ 2 ** c : i ^ 2 ** q; [out[i], out[j]] = [out[j], out[i]];
      }
    } else if (gate.type === 'Z') {
      for (let i = 0; i < out.length; i++) if (i & 2 ** q) out[i] = amp(-out[i][0], -out[i][1]);
    } else if (gate.type === 'X' || gate.type === 'H') {
      for (let i = 0; i < out.length; i++) if (!(i & 2 ** q)) {
        const j = i | 2 ** q, a = state[i], b = state[j];
        if (gate.type === 'X') [out[i], out[j]] = [[...b], [...a]];
        else [out[i], out[j]] = [amp((a[0] + b[0]) * Math.SQRT1_2, (a[1] + b[1]) * Math.SQRT1_2), amp((a[0] - b[0]) * Math.SQRT1_2, (a[1] - b[1]) * Math.SQRT1_2)];
      }
    } else throw Error('Unsupported quantum gate: ' + gate.type);
    return out;
  }
  function evolve(gates, n, initial = 0, captureTrace = true) {
    if (!validQubits(n) || !Array.isArray(gates) || gates.length > LIMITS.gates) throw Error('Invalid circuit size.');
    let state = Array.isArray(initial) ? clone(initial) : basis(n, initial);
    if (state.length !== 2 ** n) throw Error('Input size does not match the circuit.');
    if (!state.every(a => Array.isArray(a) && a.length === 2 && a.every(Number.isFinite)) || Math.abs(state.reduce((sum, a) => sum + a[0] ** 2 + a[1] ** 2, 0) - 1) > 1e-6) throw Error('Input amplitudes must be finite and normalized.');
    const trace = captureTrace ? [clone(state)] : [];
    for (const gate of gates) { state = apply(state, gate, n); if (captureTrace) trace.push(clone(state)); }
    return { state, trace };
  }
  const probabilities = state => state.map(([r, i]) => Math.max(0, Math.min(1, r * r + i * i)));
  function fidelity(a, b) {
    if (a.length !== b.length) return 0;
    let r = 0, i = 0;
    for (let k = 0; k < a.length; k++) { r += a[k][0] * b[k][0] + a[k][1] * b[k][1]; i += a[k][1] * b[k][0] - a[k][0] * b[k][1]; }
    return Math.min(1, r * r + i * i);
  }
  function operatorScore(gates, reference, n) {
    let r = 0, im = 0;
    for (let k = 0; k < 2 ** n; k++) {
      const a = evolve(gates, n, k, false).state, b = evolve(reference, n, k, false).state;
      for (let j = 0; j < a.length; j++) { r += a[j][0] * b[j][0] + a[j][1] * b[j][1]; im += a[j][1] * b[j][0] - a[j][0] * b[j][1]; }
    }
    return Math.min(1, (r * r + im * im) / (2 ** n) ** 2);
  }
  function concurrence(state) {
    if (state.length !== 4) return 0;
    const a = mul(state[0], state[3]), b = mul(state[1], state[2]);
    return Math.min(1, 2 * Math.hypot(a[0] - b[0], a[1] - b[1]));
  }
  function marginals(state) {
    const n = Math.log2(state.length);
    if (!validQubits(n)) throw Error('Invalid register state.');
    return Array.from({ length: n }, (_, q) => {
      let p0 = 0, p1 = 0, re = 0, im = 0;
      for (let i = 0; i < state.length; i++) if (!(i & 2 ** q)) {
        const a = state[i], b = state[i | 2 ** q];
        p0 += a[0] ** 2 + a[1] ** 2; p1 += b[0] ** 2 + b[1] ** 2;
        re += a[0] * b[0] + a[1] * b[1]; im += a[1] * b[0] - a[0] * b[1];
      }
      const d = Math.min(1, Math.sqrt((p0 - p1) ** 2 + 4 * (re ** 2 + im ** 2)));
      const eigenvalues = [(1 + d) / 2, (1 - d) / 2];
      return { qubit: q, p0, p1, purity: Math.min(1, p0 ** 2 + p1 ** 2 + 2 * (re ** 2 + im ** 2)), entropy: eigenvalues.reduce((s, p) => s - (p > EPS ? p * Math.log2(p) : 0), 0) };
    });
  }
  function sample(state, shots = 512, random = Math.random) {
    if (![128, 512, 1024].includes(shots)) throw Error('Choose 128, 512, or 1024 shots.');
    const p = probabilities(state), n = Math.log2(state.length), counts = Object.fromEntries(labels(n).map(b => [b, 0]));
    for (let k = 0; k < shots; k++) {
      const u = random(); let sum = 0, index = p.length - 1;
      for (let i = 0; i < p.length; i++) { sum += p[i]; if (u < sum) { index = i; break; } }
      counts[bits(index, n)]++;
    }
    return counts;
  }
  const H = q => ({ type: 'H', target: q }), X = q => ({ type: 'X', target: q }), Z = q => ({ type: 'Z', target: q });
  const CX = (c = 0, q = 1) => ({ type: 'CX', control: c, target: q });
  const SWAP = (c = 0, q = 1) => ({ type: 'SWAP', control: c, target: q });
  const prep = [H(0), CX()], decoder = [CX(), H(0)];
  const swap = [CX(), CX(1, 0), CX()];
  const ghz = [H(0), CX(0, 1), CX(1, 2)], ghzDecode = [CX(1, 2), CX(0, 1), H(0)];
  const parity = [CX(0, 3), CX(1, 3), CX(2, 3)];
  const ghz4 = [...ghz, CX(2, 3)];
  const references = { link: [], invert: [X(0)], cnot: [CX()], decode: decoder, swap, routing: [CX(0, 2)], uncompute: ghzDecode, parity };
  function encodedBell(message) {
    const gates = [...prep]; if (message[1] === '1') gates.push(Z(0)); if (message[0] === '1') gates.push(X(0));
    return evolve(gates, 2).state;
  }
  const levels = [
    { id: 'link', number: 1, title: 'First Connection', chapter: 'Foundations', qubits: 1, requires: [], parts: [], contract: 'Connect input A to output A. Preserve every input.', lesson: 'A wire carries one qubit. Connect an output pin to an input pin to create a path.', reward: 'X gate', hints: ['Start at the orange pin on the right of INPUT A.', 'Click that pin, then click the orange pin on the left of OUTPUT A.'] },
    { id: 'invert', number: 2, title: 'The Inverter', chapter: 'Foundations', qubits: 1, requires: ['link'], parts: ['X'], kind: 'Inverter', contract: 'Swap |0⟩ and |1⟩ for every input.', lesson: 'X flips a qubit. Your circuit must pass both input cases, and preserve coherent quantum behavior.', reward: 'Inverter + H gate', hints: ['Choose X in the parts drawer and place it between the terminals.', 'Connect INPUT A → X → OUTPUT A. Then Check All.'] },
    { id: 'superposition', number: 3, title: 'Two Possibilities', chapter: 'Coherence', qubits: 1, requires: ['invert'], parts: ['X', 'H'], contract: 'Prepare (|0⟩ + |1⟩)/√2 from |0⟩.', lesson: 'H creates equal positive amplitudes. Fresh preparations measure 0 or 1 with equal probability. A second H can undo the preparation before measurement.', reward: 'Z gate + controlled-operation branch', hints: ['Try H on the |0⟩ input.', 'Connect INPUT A → H → OUTPUT A. Inspect State, then sample fresh preparations.'] },
    { id: 'phase', number: 4, title: 'The Hidden Sign', chapter: 'Coherence', qubits: 1, requires: ['superposition'], parts: ['Z'], contract: 'Put a phase change between the fixed H gates. Produce |1⟩ from |0⟩.', lesson: 'Z changes the relative sign of the |1⟩ amplitude. The probabilities stay the same at that moment; the final H reveals the change through interference.', reward: 'Phase encoding', hints: ['The first and last H are fixed. Only the middle of the experiment is unfinished.', 'Place Z between the H gates and connect H → Z → H. Step twice to inspect the negative amplitude.'] },
    { id: 'cnot', number: 5, title: 'Conditional Flip', chapter: 'Entanglement', qubits: 2, requires: ['superposition'], parts: ['CX', 'H', 'X', 'Z'], kind: 'ControlledFlip', contract: 'Flip B only when A is 1. Preserve coherent behavior.', lesson: 'A is q0; B is q1. On CNOT, the upper input is CONTROL and the lower input is TARGET. Bitstrings are B A, matching Qiskit.', reward: 'ControlledFlip component', hints: ['CNOT has two separate quantum paths. Its control pin does not copy the control qubit.', 'Connect A through CONTROL and B through TARGET, then connect each output to its matching terminal.'] },
    { id: 'bell', number: 6, title: 'A Shared Pair', chapter: 'Entanglement', qubits: 2, requires: ['cnot'], parts: ['H', 'X', 'Z', 'CX'], kind: 'BellPrep', contract: 'Prepare (|00⟩ + |11⟩)/√2 from |00⟩. Save it as BellPrep.', lesson: 'H on A followed by a controlled flip A→B creates an entangled pair. Joint results are 00 or 11. The full state, including its relative phase, is part of the contract.', reward: 'BellPrep component', hints: ['First create a superposition on A. Keep B in |0⟩.', 'Route A through H, then into ControlledFlip CONTROL. Route B into TARGET. Connect both outputs.'] },
    { id: 'decode', number: 7, title: 'Read the Bell State', chapter: 'Communication', qubits: 2, requires: ['bell'], parts: ['H', 'X', 'Z', 'CX'], kind: 'BellDecode', contract: 'Convert the four supplied Bell states into four distinct bitstrings.', lesson: 'Reverse the Bell preparation: controlled flip first, then H on A. The decoder must work coherently for any input, so we also check the complete operation.', reward: 'BellDecode component', hints: ['Preparation was H then CNOT. Both gates are their own inverses.', 'Connect A and B through ControlledFlip, then route A through H before its output. B goes straight to its output.'] },
    { id: 'courier', number: 8, title: 'Quantum Courier', chapter: 'Communication', qubits: 2, requires: ['phase', 'decode'], parts: [], contract: 'Reuse your BellPrep and BellDecode to recover all four two-bit messages.', lesson: 'Alice and Bob first share an entangled pair. Alice encodes two bits on A and sends that one qubit to Bob. Bob decodes with both qubits. The pre-shared pair is an essential resource.', reward: 'Working quantum communication device', hints: ['Place your saved BellPrep before Alice’s encoder, and BellDecode at Bob’s receiver.', 'A: INPUT → BellPrep → encoder → SEND A → BellDecode → OUTPUT. B: INPUT → BellPrep → BellDecode → OUTPUT.'] },
    { id: 'swap', number: 9, title: 'Exchange the States', chapter: 'Architecture', qubits: 2, requires: ['courier'], parts: ['CX'], kind: 'Swap', contract: 'Exchange A and B using controlled flips. Preserve every coherent input.', reward: 'Swap component + routing', targetCost: 3 },
    { id: 'routing', number: 10, title: 'Across the Register', chapter: 'Architecture', qubits: 3, requires: ['swap'], parts: ['CX'], kinds: ['Swap'], resources: ['Swap'], adjacentOnly: true, contract: 'Flip C when A is 1. Restore B. Only neighboring qubits may interact.', reward: 'Three-qubit register + SWAP gate', targetCost: 7 },
    { id: 'ghz', number: 11, title: 'A Three-Way Link', chapter: 'Registers', qubits: 3, requires: ['routing'], parts: ['H', 'X', 'Z', 'CX', 'SWAP'], kind: 'GHZPrep', adjacentOnly: true, contract: 'Prepare (|000⟩ + |111⟩)/√2 from |000⟩ using neighboring operations.', reward: 'GHZPrep component', targetCost: 3 },
    { id: 'uncompute', number: 12, title: 'Undo the Machine', chapter: 'Registers', qubits: 3, requires: ['ghz'], parts: ['H', 'X', 'Z', 'CX', 'SWAP'], kind: 'GHZDecode', contract: 'Reverse the supplied three-qubit preparation for every input.', reward: 'GHZDecode component', targetCost: 3 },
    { id: 'parity', number: 13, title: 'Parity Accumulator', chapter: 'Registers', qubits: 4, requires: ['uncompute'], parts: ['H', 'X', 'Z', 'CX', 'SWAP'], kind: 'Parity', contract: 'D becomes D ⊕ A ⊕ B ⊕ C. Preserve A, B, and C.', reward: 'Four-port Parity component', targetCost: 3 },
    { id: 'fanout', number: 14, title: 'A Four-Way Link', chapter: 'Registers', qubits: 4, requires: ['parity'], parts: ['H', 'X', 'Z', 'CX', 'SWAP'], kind: 'GHZ4Prep', adjacentOnly: true, contract: 'Prepare (|0000⟩ + |1111⟩)/√2 using neighboring operations.', reward: 'Four-qubit entanglement + query lab', targetCost: 4 },
    { id: 'kickback', number: 15, title: 'One Quantum Query', chapter: 'Algorithms', qubits: 2, requires: ['fanout', 'phase'], parts: ['H', 'X'], kinds: [], contract: 'Use the fixed oracle once. A must reveal constant (0) or balanced (1); B must end in |−⟩.', reward: 'Phase kickback + Deutsch algorithm', targetCost: 6 },
    { id: 'oracle', number: 16, title: 'The Hidden Register', chapter: 'Algorithms', qubits: 4, requires: ['kickback'], parts: ['H', 'X'], kinds: [], contract: 'Recover the oracle’s three hidden bits in C B A with one query. Leave D in |−⟩.', reward: 'A working Bernstein–Vazirani query machine', targetCost: 11 },
    { id: 'sandbox', number: 0, title: 'Sandbox', chapter: 'Free Build', qubits: 2, requires: [], parts: ['X', 'H', 'Z', 'CX', 'SWAP'], contract: 'Build, step, and inspect circuits on a register of one to six qubits.', lesson: 'All primitive gates are available here. Sandbox work never completes campaign assignments.', reward: '', hints: ['Use Fit if your circuit moves off screen.', 'Save a valid circuit as a custom component, or export it as Qiskit Python.'] }
  ];
  const getLevel = id => levels.find(l => l.id === id);
  const moduleFor = (modules, id) => modules.find(m => m.id === id);
  function arity(node, modules = []) {
    if (node.type === 'MODULE') { const m = moduleFor(modules, node.moduleId); if (!m) throw Error('This circuit needs a missing saved component. Import its project backup.'); return m.qubits; }
    return node.type === 'ORACLE' ? node.oracle === 'bv' ? 4 : 2 : ['CX', 'SWAP'].includes(node.type) ? 2 : 1;
  }
  function ports(node, modules = []) {
    const count = arity(node, modules);
    return { input: node.type === 'INPUT' ? 0 : count, output: node.type === 'OUTPUT' ? 0 : count };
  }
  function fixture(id, type, x, y, extra = {}) { return { id, type, x, y, locked: true, ...extra }; }
  const edge = (from, port, to, input, locked = false) => ({ id: `${from}:${port}>${to}:${input}`, from: { node: from, port }, to: { node: to, port: input }, locked });
  function starter(id, sandboxQubits = 2) {
    const l = getLevel(id); if (!l) throw Error('Unknown assignment.');
    const n = id === 'sandbox' ? sandboxQubits : l.qubits;
    if (!validQubits(n)) throw Error('Choose a register with one to six qubits.');
    const graph = { nodes: [], edges: [] };
    for (let q = 0; q < n; q++) {
      graph.nodes.push(fixture('in' + q, 'INPUT', 40, 120 + q * 120, { qubit: q, label: 'INPUT ' + qubitName(q) }));
      graph.nodes.push(fixture('out' + q, 'OUTPUT', 1080, 120 + q * 120, { qubit: q, label: 'OUTPUT ' + qubitName(q) }));
    }
    if (id === 'phase') {
      graph.nodes.push(fixture('h-before', 'H', 260, 120), fixture('h-after', 'H', 820, 120));
      graph.edges.push(edge('in0', 0, 'h-before', 0, true), edge('h-after', 0, 'out0', 0, true));
    }
    if (id === 'courier') {
      graph.nodes.push(fixture('encoder', 'ENCODE', 460, 120), fixture('transfer', 'TRANSFER', 640, 120));
      graph.edges.push(edge('encoder', 0, 'transfer', 0, true));
    }
    if (id === 'kickback' || id === 'oracle') graph.nodes.push(fixture('oracle', 'ORACLE', 560, 120, { oracle: id === 'oracle' ? 'bv' : 'deutsch', label: 'ORACLE' }));
    return graph;
  }
  function validateShape(graph, modules, n) {
    if (!validQubits(n) || !graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges) || graph.nodes.length > LIMITS.nodes || graph.edges.length > LIMITS.edges) throw Error('Invalid or oversized schematic.');
    const ids = new Set();
    for (const node of graph.nodes) {
      if (typeof node.id !== 'string' || node.id.length > 120 || ids.has(node.id)) throw Error('Component IDs must be unique.');
      ids.add(node.id);
      if (!['INPUT', 'OUTPUT', 'H', 'X', 'Z', 'CX', 'SWAP', 'MODULE', 'ENCODE', 'TRANSFER', 'ORACLE'].includes(node.type)) throw Error('Unknown component.');
      if (node.type === 'ORACLE' && !['deutsch', 'bv'].includes(node.oracle)) throw Error('Unknown oracle fixture.');
      if (![node.x, node.y].every(x => Number.isFinite(x) && Math.abs(x) < 20000)) throw Error('Invalid component position.');
      if (['INPUT', 'OUTPUT'].includes(node.type) && (!Number.isInteger(node.qubit) || node.qubit < 0 || node.qubit >= n)) throw Error('Invalid terminal.');
      const a = arity(node, modules); if (a > n) throw Error('This component needs more qubits than the assignment.');
    }
    const drivers = new Set(), consumers = new Set(), edgeIds = new Set();
    for (const e of graph.edges) {
      if (!e.from || !e.to || typeof e.id !== 'string' || edgeIds.has(e.id)) throw Error('Invalid wire.');
      edgeIds.add(e.id);
      const a = graph.nodes.find(n => n.id === e.from.node), b = graph.nodes.find(n => n.id === e.to.node);
      if (!a || !b) throw Error('A wire references a missing component.');
      if (!Number.isInteger(e.from.port) || e.from.port < 0 || e.from.port >= ports(a, modules).output || !Number.isInteger(e.to.port) || e.to.port < 0 || e.to.port >= ports(b, modules).input) throw Error('Connect output pins to compatible input pins.');
      const f = e.from.node + ':' + e.from.port, t = e.to.node + ':' + e.to.port;
      if (drivers.has(f)) throw Error('A qubit cannot be copied: this output already has a wire.');
      if (consumers.has(t)) throw Error('This input already has a driver. Remove its wire first.');
      drivers.add(f); consumers.add(t);
    }
    const incoming = new Map(graph.nodes.map(n => [n.id, 0]));
    for (const e of graph.edges) incoming.set(e.to.node, incoming.get(e.to.node) + 1);
    const ready = graph.nodes.filter(n => incoming.get(n.id) === 0), seen = [];
    while (ready.length) {
      ready.sort((a, b) => a.x - b.x || a.y - b.y || a.id.localeCompare(b.id));
      const node = ready.shift(); seen.push(node);
      for (const e of graph.edges.filter(e => e.from.node === node.id)) { incoming.set(e.to.node, incoming.get(e.to.node) - 1); if (!incoming.get(e.to.node)) ready.push(graph.nodes.find(n => n.id === e.to.node)); }
    }
    if (seen.length !== graph.nodes.length) throw Error('Quantum paths cannot contain loops.');
    return seen;
  }
  function validateFixtures(graph, level, modules) {
    const fixed = starter(level.id, level.qubits);
    for (const node of fixed.nodes) {
      const actual = graph.nodes.find(n => n.id === node.id);
      if (!actual || actual.type !== node.type || actual.qubit !== node.qubit || actual.oracle !== node.oracle || actual.locked !== true) throw Error('An assignment fixture was changed. Reset this schematic.');
    }
    for (const e of fixed.edges) if (!graph.edges.some(a => a.id === e.id && a.from.node === e.from.node && a.from.port === e.from.port && a.to.node === e.to.node && a.to.port === e.to.port && a.locked === true)) throw Error('A fixed connection was changed. Reset this schematic.');
    for (const node of graph.nodes.filter(n => !fixed.nodes.some(f => f.id === n.id))) {
      if (['INPUT', 'OUTPUT', 'ENCODE', 'TRANSFER', 'ORACLE'].includes(node.type) || node.locked) throw Error('Extra fixed terminals are not allowed.');
      if (node.type !== 'MODULE' && !level.parts.includes(node.type)) throw Error('This part is not available in this assignment.');
      if (node.type === 'MODULE' && level.id !== 'sandbox') {
        const kind = moduleFor(modules, node.moduleId)?.kind;
        const allowed = allowedKinds(level);
        if (!allowed.includes(kind)) throw Error('This saved component is not available in this assignment.');
      }
    }
  }
  function allowedKinds(level) {
    if (level.kinds) return level.kinds;
    if (level.id === 'sandbox') return null;
    if (level.number >= 9) return ['Inverter', 'ControlledFlip', 'BellPrep', 'BellDecode', 'Swap', 'GHZPrep', 'GHZDecode', 'Parity', 'GHZ4Prep'];
    return level.id === 'courier' ? ['BellPrep', 'BellDecode'] : ['bell', 'decode'].includes(level.id) ? ['ControlledFlip', 'Inverter'] : level.parts.length ? ['Inverter'] : [];
  }
  function oracleGates(oracle, message, local) {
    if (oracle === 'bv') {
      if (!/^[01]{3}$/.test(message)) throw Error('Choose a three-bit secret.');
      return [0, 1, 2].filter(q => message[2 - q] === '1').map(q => CX(local[q], local[3]));
    }
    if (!/^[01]{2}$/.test(message)) throw Error('Choose a two-bit oracle table.');
    return [...(message[0] !== message[1] ? [CX(local[0], local[1])] : []), ...(message[0] === '1' ? [X(local[1])] : [])];
  }
  const gateQubits = g => ['CX', 'SWAP'].includes(g.type) ? [g.control, g.target] : [g.target];
  const expandGates = gates => gates.flatMap(g => g.type === 'SWAP' ? [CX(g.control, g.target), CX(g.target, g.control), CX(g.control, g.target)] : [clone(g)]);
  function validGate(g, n) { return g && ['X', 'H', 'Z', 'CX', 'SWAP'].includes(g.type) && Number.isInteger(g.target) && g.target >= 0 && g.target < n && (!['CX', 'SWAP'].includes(g.type) || Number.isInteger(g.control) && g.control >= 0 && g.control < n && g.control !== g.target); }
  function compile(graph, modules = [], n = 2, message = null) {
    if (message === null) message = graph.nodes.some(n => n.type === 'ORACLE' && n.oracle === 'bv') ? '000' : '00';
    if (!/^[01]{2,3}$/.test(message)) throw Error('Choose a valid message or oracle case.');
    const sorted = validateShape(graph, modules, n), maps = new Map(), gates = [], outputQubits = [];
    const inputs = graph.nodes.filter(x => x.type === 'INPUT');
    if (inputs.length !== n || new Set(inputs.map(x => x.qubit)).size !== n) throw Error('The circuit needs one input for each qubit.');
    if (graph.nodes.filter(x => x.type === 'OUTPUT').length !== n) throw Error('The circuit needs one output for each qubit.');
    for (const node of sorted) {
      const p = ports(node, modules), local = [];
      for (let j = 0; j < p.input; j++) {
        const wire = graph.edges.find(e => e.to.node === node.id && e.to.port === j);
        if (!wire) throw Object.assign(Error(`Connect the ${node.type === 'CX' ? (j ? 'TARGET' : 'CONTROL') : 'input'} pin on ${node.label || node.type}.`), { nodeId: node.id });
        const q = maps.get(wire.from.node)?.[wire.from.port];
        if (q === undefined) throw Error('An incoming path is incomplete.');
        local.push(q);
      }
      if (new Set(local).size !== local.length) throw Error('A multi-qubit part needs distinct qubits.');
      for (let j = 0; j < p.output; j++) if (!graph.edges.some(e => e.from.node === node.id && e.from.port === j)) throw Object.assign(Error(`Connect the output pin on ${node.label || node.type}.`), { nodeId: node.id });
      if (node.type === 'INPUT') maps.set(node.id, [node.qubit]);
      else if (node.type === 'OUTPUT') {
        if (local[0] !== node.qubit) throw Object.assign(Error('Route A back to OUTPUT A, B back to OUTPUT B, and each remaining qubit to its matching output. Crossings do not rename qubits.'), { nodeId: node.id });
        outputQubits.push(local[0]);
      } else {
        maps.set(node.id, local);
        let operations = [];
        if (node.type === 'CX') operations = [CX(local[0], local[1])];
        else if (node.type === 'SWAP') operations = [CX(local[0], local[1]), CX(local[1], local[0]), CX(local[0], local[1])];
        else if (['H', 'X', 'Z'].includes(node.type)) operations = [{ type: node.type, target: local[0] }];
        else if (node.type === 'ENCODE') { if (message[1] === '1') operations.push(Z(local[0])); if (message[0] === '1') operations.push(X(local[0])); }
        else if (node.type === 'ORACLE') operations = oracleGates(node.oracle, message, local);
        else if (node.type === 'MODULE') {
          const m = moduleFor(modules, node.moduleId);
          if (!Array.isArray(m.gates) || m.gates.length > LIMITS.moduleGates) throw Error('Invalid saved component.');
          operations = expandGates(m.gates.map(g => {
            if (!validGate(g, local.length)) throw Error('Invalid gate inside saved component.');
            return { type: g.type, target: local[g.target], ...(['CX', 'SWAP'].includes(g.type) ? { control: local[g.control] } : {}) };
          }));
        }
        gates.push(...operations.map(g => ({ ...g, nodeId: node.id })));
      }
    }
    if (new Set(outputQubits).size !== n) throw Error('Each qubit needs its own output.');
    if (gates.length > LIMITS.gates) throw Error('This demo supports up to ' + LIMITS.gates + ' expanded primitive gates.');
    const layers = Array(n).fill(0);
    for (const g of gates) { const qubits = gateQubits(g), depth = 1 + Math.max(...qubits.map(q => layers[q])); for (const q of qubits) layers[q] = depth; }
    return { gates, count: gates.length, depth: Math.max(...layers), nodes: sorted.map(n => n.id) };
  }
  function connect(graph, from, to, modules, n) {
    if (graph.edges.some(e => e.from.node === from.node && e.from.port === from.port && e.to.node === to.node && e.to.port === to.port)) throw Error('These pins are already connected. Remove the existing wire first.');
    const next = clone(graph), wire = edge(from.node, from.port, to.node, to.port);
    next.edges.push(wire); validateShape(next, modules, n); return next;
  }
  function cases(level) {
    if (level.id === 'decode') return ['00', '01', '10', '11'].map((message, index) => ({ initial: encodedBell(message), input: ['Φ+ (00)', 'Φ− (01)', 'Ψ+ (10)', 'Ψ− (11)'][index], expected: basis(2, index), message }));
    if (level.id === 'courier') return ['00', '01', '10', '11'].map(message => ({ initial: 0, input: 'Message ' + message, expected: basis(2, parseInt(message, 2)), message }));
    if (level.id === 'uncompute') return labels(3).map((b, index) => ({ initial: evolve(ghz, 3, index).state, basisInput: index, input: 'Prepared ' + b, expected: basis(3, index), message: '00' }));
    if (level.id === 'kickback' || level.id === 'oracle') {
      const bv = level.id === 'oracle';
      return labels(bv ? 3 : 2).map(message => {
        const answer = bv ? parseInt(message, 2) : Number(message[0] !== message[1]), expected = basis(level.qubits).map(() => amp());
        expected[answer] = amp(Math.SQRT1_2); expected[answer + 2 ** (level.qubits - 1)] = amp(-Math.SQRT1_2);
        return { initial: 0, input: bv ? 'Secret ' + message : 'f(0)f(1) = ' + message, expected, message };
      });
    }
    if (references[level.id] || level.id === 'sandbox') {
      const reference = references[level.id] || [];
      return labels(level.qubits).map((b, index) => ({ initial: index, input: '|' + b + '⟩', expected: evolve(reference, level.qubits, index).state, message: '00' }));
    }
    const expected = level.id === 'superposition' ? evolve([H(0)], 1).state : level.id === 'phase' ? basis(1, 1) : level.id === 'ghz' ? evolve(ghz, 3).state : level.id === 'fanout' ? evolve(ghz4, 4).state : evolve(prep, 2).state;
    return [{ initial: 0, input: '|' + '0'.repeat(level.qubits) + '⟩', expected, message: '00' }];
  }
  function grade(levelId, graph, modules = []) {
    const level = getLevel(levelId); if (!level || levelId === 'sandbox') throw Error('Sandbox has no campaign contract.');
    validateFixtures(graph, level, modules);
    let count = 0, depth = 0;
    const tests = cases(level).map(c => {
      const compiled = compile(graph, modules, level.qubits, c.message), actual = evolve(compiled.gates, level.qubits, c.initial, false).state, score = fidelity(actual, c.expected);
      count = Math.max(count, compiled.count); depth = Math.max(depth, compiled.depth);
      return { ...c, actual, score, passed: score > 1 - EPS, label: c.input, type: 'state' };
    });
    const compiled = compile(graph, modules, level.qubits, cases(level)[0].message);
    const reference = references[levelId];
    if (reference) {
      const score = operatorScore(compiled.gates, reference, level.qubits);
      tests.push({ label: 'Coherent operation', type: 'operator', score, passed: score > 1 - EPS });
    }
    {
      for (const kind of levelId === 'courier' ? ['BellPrep', 'BellDecode'] : level.resources || []) {
        const passed = graph.nodes.some(node => node.type === 'MODULE' && moduleFor(modules, node.moduleId)?.kind === kind);
        tests.push({ label: 'Reuse ' + kind, type: 'resource', score: passed ? 1 : 0, passed });
      }
    }
    if (level.adjacentOnly) {
      const passed = compiled.gates.every(g => gateQubits(g).length === 1 || Math.abs(g.control - g.target) === 1);
      tests.push({ label: 'Neighboring interactions only', type: 'hardware', score: passed ? 1 : 0, passed });
    }
    if (['kickback', 'oracle'].includes(levelId)) tests.push({ label: 'Exactly one fixed oracle query', type: 'query', score: 1, passed: true });
    return { passed: tests.every(t => t.passed), tests, count, depth };
  }
  function moduleContract(module) {
    if (!module || !validQubits(module.qubits) || !Array.isArray(module.gates) || module.gates.reduce((sum,g) => sum + (g?.type === 'SWAP' ? 3 : 1), 0) > LIMITS.moduleGates || !['Inverter', 'ControlledFlip', 'BellPrep', 'BellDecode', 'Swap', 'GHZPrep', 'GHZDecode', 'Parity', 'GHZ4Prep', 'Custom'].includes(module.kind)) return false;
    try {
      const n = module.qubits, g = module.gates;
      for (const gate of g) if (!validGate(gate, n)) return false;
      if (module.kind === 'Inverter') return n === 1 && operatorScore(g, [X(0)], 1) > 1 - EPS;
      if (module.kind === 'ControlledFlip') return n === 2 && operatorScore(g, [CX()], 2) > 1 - EPS;
      if (module.kind === 'BellPrep') return n === 2 && fidelity(evolve(g, 2).state, evolve(prep, 2).state) > 1 - EPS;
      if (module.kind === 'BellDecode') return n === 2 && operatorScore(g, decoder, 2) > 1 - EPS;
      if (module.kind === 'Swap') return n === 2 && operatorScore(g, swap, 2) > 1 - EPS;
      if (module.kind === 'GHZPrep') return n === 3 && fidelity(evolve(g, 3).state, evolve(ghz, 3).state) > 1 - EPS;
      if (module.kind === 'GHZDecode') return n === 3 && operatorScore(g, ghzDecode, 3) > 1 - EPS;
      if (module.kind === 'Parity') return n === 4 && operatorScore(g, parity, 4) > 1 - EPS;
      if (module.kind === 'GHZ4Prep') return n === 4 && fidelity(evolve(g, 4).state, evolve(ghz4, 4).state) > 1 - EPS;
      evolve(g, n); return true;
    } catch { return false; }
  }
  function available(level, progress, modules) {
    if (level.id === 'sandbox') return true;
    const resources = level.id === 'courier' ? ['BellPrep', 'BellDecode'] : level.resources || [];
    return level.requires.every(id => !!progress[id]) && resources.every(k => modules.some(m => m.kind === k && moduleContract(m)));
  }
  function solution(levelId, modules = []) {
    // Used by automated checks and the separate sandbox presentation demo.
    const g = starter(levelId), add = (id, type, x, y, extra = {}) => g.nodes.push({ id, type, x, y, ...extra });
    const wire = (a, b, pa = 0, pb = 0) => g.edges.push(edge(a, pa, b, pb));
    if (levelId === 'link') wire('in0', 'out0');
    if (levelId === 'invert' || levelId === 'superposition') { add('gate', levelId === 'invert' ? 'X' : 'H', 520, 120); wire('in0', 'gate'); wire('gate', 'out0'); }
    if (levelId === 'phase') { add('gate', 'Z', 540, 120); wire('h-before', 'gate'); wire('gate', 'h-after'); }
    if (['cnot', 'bell', 'decode', 'sandbox'].includes(levelId)) {
      add('cx', 'CX', levelId === 'decode' ? 380 : 640, 120);
      if (levelId === 'bell' || levelId === 'sandbox') { add('h', 'H', 320, 120); wire('in0', 'h'); wire('h', 'cx'); wire('cx', 'out0'); }
      else if (levelId === 'decode') { add('h', 'H', 760, 120); wire('in0', 'cx'); wire('cx', 'h'); wire('h', 'out0'); }
      else { wire('in0', 'cx'); wire('cx', 'out0'); }
      wire('in1', 'cx', 0, 1); wire('cx', 'out1', 1);
    }
    if (levelId === 'courier') {
      const p = modules.find(m => m.kind === 'BellPrep'), d = modules.find(m => m.kind === 'BellDecode');
      if (!p || !d) throw Error('Save BellPrep and BellDecode first.');
      add('prep', 'MODULE', 260, 120, { moduleId: p.id }); add('decode', 'MODULE', 840, 120, { moduleId: d.id });
      wire('in0', 'prep'); wire('in1', 'prep', 0, 1); wire('prep', 'encoder'); wire('prep', 'decode', 1, 1); wire('transfer', 'decode'); wire('decode', 'out0'); wire('decode', 'out1', 1);
    }
    if (getLevel(levelId).number >= 9) {
      const n = getLevel(levelId).qubits, previous = Array.from({ length: n }, (_, q) => ({ node: 'in' + q, port: 0 }));
      let steps = levelId === 'swap' ? swap : levelId === 'routing' ? [] : levelId === 'ghz' ? ghz : levelId === 'uncompute' ? ghzDecode : levelId === 'parity' ? parity : levelId === 'fanout' ? ghz4 : [];
      if (levelId === 'routing') {
        const m = modules.find(m => m.kind === 'Swap'); if (!m) throw Error('Save the Swap component first.');
        steps = [{ type: 'MODULE', moduleId: m.id, qubits: [0, 1] }, CX(1, 2), { type: 'MODULE', moduleId: m.id, qubits: [0, 1] }];
      }
      if (levelId === 'kickback' || levelId === 'oracle') {
        steps = [...Array.from({ length: n - 1 }, (_, q) => ({ ...H(q), x: 360 })), { ...X(n - 1), x: 200 }, { ...H(n - 1), x: 360 }, { nodeId: 'oracle', qubits: Array.from({ length: n }, (_, q) => q) }, ...Array.from({ length: n - 1 }, (_, q) => ({ ...H(q), x: 820 }))];
      }
      steps.forEach((s, i) => {
        const qubits = s.qubits || gateQubits(s), id = s.nodeId || 'gate-' + i;
        if (!s.nodeId) add(id, s.type, s.x || 250 + i * 150, 120 + Math.min(...qubits) * 120, s.moduleId ? { moduleId: s.moduleId } : {});
        qubits.forEach((q, port) => { wire(previous[q].node, id, previous[q].port, port); previous[q] = { node: id, port }; });
      });
      previous.forEach((p, q) => wire(p.node, 'out' + q, p.port));
    }
    return g;
  }
  function qiskit(compiled, n, initial = 0, message = '00', levelId = 'sandbox') {
    const emit = gate => ['CX', 'SWAP'].includes(gate.type) ? `qc.${gate.type.toLowerCase()}(${gate.control}, ${gate.target})` : `qc.${gate.type.toLowerCase()}(${gate.target})`;
    const lines = ['#!/usr/bin/env python3', '# Quantum Foundry: ideal logical circuit', '# Bitstrings: ' + bitOrder(n) + ' = highest qubit index to q0; A is q0.', '# Requires Qiskit; this export does not submit to Qollab automatically.', 'from qiskit import QuantumCircuit', 'from qiskit.quantum_info import Statevector', '', `qc = QuantumCircuit(${n})`];
    if (levelId === 'decode') { for (const gate of [...prep, ...(message[1] === '1' ? [Z(0)] : []), ...(message[0] === '1' ? [X(0)] : [])]) lines.push(gate.type === 'CX' ? `qc.cx(${gate.control}, ${gate.target})` : `qc.${gate.type.toLowerCase()}(${gate.target})`); }
    else {
      for (let q = 0; q < n; q++) if (initial & 2 ** q) lines.push(`qc.x(${q})  # prepare input`);
      if (levelId === 'uncompute') for (const gate of ghz) lines.push(emit(gate) + '  # supplied preparation');
    }
    lines.push('', '# Expanded player circuit');
    for (const gate of compiled.gates) lines.push(emit(gate));
    lines.push('', 'state = Statevector.from_instruction(qc)', 'print(state.probabilities_dict())', 'qc.measure_all()', 'print(qc.draw())', '', '# Use your Qollab runner to execute qc on a supported simulator.', '');
    return lines.join('\n');
  }
  // ── Requests for the local Qiskit service (backend/main.py) ──
  // Inputs travel as {basis} or {state}; gates are plain primitives with A = q0.
  const inputSpec = initial => typeof initial === 'number' ? { basis: initial } : { state: clone(initial) };
  const plainGates = gates => gates.map(({ type, target, control }) => ({ type, target, ...(['CX', 'SWAP'].includes(type) ? { control } : {}) }));
  function verificationRequest(levelId, graph, modules = []) {
    const level = getLevel(levelId); if (!level || levelId === 'sandbox') throw Error('Sandbox has no campaign contract.');
    const all = cases(level), request = { qubits: level.qubits, operator: null };
    request.cases = all.map(c => ({ label: c.input, initial: inputSpec(c.initial), operations: plainGates(compile(graph, modules, level.qubits, c.message).gates), expected: clone(c.expected) }));
    if (references[levelId]) request.operator = { operations: plainGates(compile(graph, modules, level.qubits, all[0].message).gates), reference: plainGates(references[levelId]) };
    return request;
  }
  function serviceCircuits(level, graph, modules = [], indices = [0]) {
    const all = cases(level);
    return indices.map(i => {
      const c = all[i]; if (!c) throw Error('Unknown test input.');
      const gates = compile(graph, modules, level.qubits, c.message).gates;
      return { label: c.input, qubits: level.qubits, initial: inputSpec(c.initial), operations: plainGates(gates), ideal: probabilities(evolve(gates, level.qubits, c.initial, false).state) };
    });
  }
  function classicalFidelity(ideal, counts, n) {
    const total = Object.values(counts).reduce((a, b) => a + b, 0); if (!total) return 0;
    const overlap = ideal.reduce((sum, p, i) => sum + Math.sqrt(p * (counts[bits(i, n)] || 0) / total), 0);
    return Math.min(1, overlap * overlap);
  }
  function qasm(compiled, n, initial = 0, message = '00', levelId = 'sandbox') {
    const emit = g => g.type === 'CX' ? `cx q[${g.control}],q[${g.target}];` : g.type === 'SWAP' ? `swap q[${g.control}],q[${g.target}];` : `${g.type.toLowerCase()} q[${g.target}];`;
    const lines = ['OPENQASM 2.0;', 'include "qelib1.inc";', `// Quantum Foundry: ${levelId} · bitstrings read ${bitOrder(n)} (A = q[0], least significant)`, `qreg q[${n}];`, `creg c[${n}];`];
    if (levelId === 'decode') for (const g of [...prep, ...(message[1] === '1' ? [Z(0)] : []), ...(message[0] === '1' ? [X(0)] : [])]) lines.push(emit(g) + ' // supplied Bell input');
    else {
      for (let q = 0; q < n; q++) if (initial & 2 ** q) lines.push(`x q[${q}]; // prepare input`);
      if (levelId === 'uncompute') for (const g of ghz) lines.push(emit(g) + ' // supplied preparation');
    }
    lines.push('barrier q;', ...compiled.gates.map(emit), 'measure q -> c;', '');
    return lines.join('\n');
  }
  const api = { EPS, LIMITS, clone, basis, bits, labels, qubitName, bitOrder, apply, evolve, probabilities, fidelity, operatorScore, concurrence, marginals, sample, encodedBell, levels, getLevel, arity, ports, starter, edge, allowedKinds, oracleGates, expandGates, validateShape, validateFixtures, compile, connect, cases, grade, moduleContract, available, solution, qiskit, qasm, references, inputSpec, plainGates, verificationRequest, serviceCircuits, classicalFidelity };
  root.FoundryCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
