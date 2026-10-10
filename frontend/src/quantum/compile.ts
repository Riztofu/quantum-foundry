/**
 * Graph-to-circuit compiler.
 *
 * Translates the schematic (nodes + pin-to-pin edges) into an ordered list of
 * primitive operations, tracking the identity of each input qubit through
 * connected ports. Connections define behavior; geometry is only readability.
 *
 * Rejected: cycles, duplicate drivers, quantum fanout, merged quantum wires,
 * incompatible port kinds, recursive modules. Incomplete graphs produce
 * "incomplete" issues instead of invented output states.
 */
import type {
  CircuitGraph,
  CompileIssue,
  CompiledCircuit,
  Edge,
  NodeInst,
  Op,
  PortRef,
} from "../model/types";
import { PartRegistry } from "../model/parts";

export interface CompileContext {
  /** two-bit message for the ENCODER fixture ("00".."11") */
  message?: string;
}

interface PortIndex {
  outEdges: Map<string, Edge[]>; // "node:port" -> edges leaving it
  inEdges: Map<string, Edge[]>; // "node:port" -> edges entering it
}

const key = (r: PortRef) => `${r.node}:${r.port}`;

function indexEdges(g: CircuitGraph): PortIndex {
  const outEdges = new Map<string, Edge[]>();
  const inEdges = new Map<string, Edge[]>();
  for (const e of g.edges) {
    const ko = key(e.from);
    const ki = key(e.to);
    (outEdges.get(ko) ?? outEdges.set(ko, []).get(ko)!).push(e);
    (inEdges.get(ki) ?? inEdges.set(ki, []).get(ki)!).push(e);
  }
  return { outEdges, inEdges };
}

export function compileGraph(
  g: CircuitGraph,
  registry: PartRegistry,
  ctx: CompileContext = {},
): CompiledCircuit {
  const issues: CompileIssue[] = [];
  const nodeById = new Map<string, NodeInst>();
  for (const n of g.nodes) nodeById.set(n.id, n);

  // --- static edge validation -------------------------------------------
  for (const e of g.edges) {
    const fromNode = nodeById.get(e.from.node);
    const toNode = nodeById.get(e.to.node);
    if (!fromNode || !toNode) {
      issues.push({ severity: "error", message: "A wire references a missing part.", ports: [e.from, e.to] });
      continue;
    }
    const fromPort = registry.get(fromNode.type)?.ports.find((p) => p.id === e.from.port);
    const toPort = registry.get(toNode.type)?.ports.find((p) => p.id === e.to.port);
    if (!fromPort || !toPort) {
      issues.push({ severity: "error", message: "A wire references a missing pin.", ports: [e.from, e.to] });
      continue;
    }
    if (fromPort.kind !== "qout" && fromPort.kind !== "cout") {
      issues.push({ severity: "error", message: "Wires must start at an output pin.", ports: [e.from] });
    }
    if (toPort.kind !== "qin" && toPort.kind !== "cin") {
      issues.push({ severity: "error", message: "Wires must end at an input pin.", ports: [e.to] });
    }
    if (fromPort.kind === "qout" && toPort.kind === "cin") {
      issues.push({ severity: "error", message: "A quantum wire cannot feed a classical input.", ports: [e.from, e.to] });
    }
    if (fromPort.kind === "cout" && toPort.kind === "qin") {
      issues.push({ severity: "error", message: "A classical wire cannot feed a quantum input.", ports: [e.from, e.to] });
    }
  }

  const { outEdges, inEdges } = indexEdges(g);

  // no quantum fanout: each quantum output drives at most one input
  for (const [k, edges] of outEdges) {
    if (edges.length > 1) {
      const [nodeId] = k.split(":");
      const node = nodeById.get(nodeId);
      const port = node && registry.get(node.type)?.ports.find((p) => p.id === edges[0].from.port);
      if (port?.kind === "qout") {
        issues.push({
          severity: "error",
          message: "This qubit already has an outgoing connection; a qubit cannot be copied by splitting its wire. Route it through the next gate instead.",
          ports: edges.map((e) => e.from),
        });
      }
    }
  }
  // no merged drivers: each input accepts exactly one connection
  for (const [, edges] of inEdges) {
    if (edges.length > 1) {
      issues.push({
        severity: "error",
        message: "Two wires cannot merge into one input pin — every input takes exactly one connection.",
        ports: edges.map((e) => e.to),
      });
    }
  }

  // --- cycle check / topological order ----------------------------------
  const adj = new Map<string, Set<string>>();
  const indeg = new Map<string, number>();
  for (const n of g.nodes) {
    adj.set(n.id, new Set());
    indeg.set(n.id, 0);
  }
  for (const e of g.edges) {
    if (!nodeById.has(e.from.node) || !nodeById.has(e.to.node)) continue;
    if (!adj.get(e.from.node)!.has(e.to.node)) {
      adj.get(e.from.node)!.add(e.to.node);
      indeg.set(e.to.node, (indeg.get(e.to.node) ?? 0) + 1);
    }
  }
  const queue = g.nodes.filter((n) => (indeg.get(n.id) ?? 0) === 0).map((n) => n.id);
  // stable order: by x position then y, so execution reads left-to-right
  const posOf = (id: string) => {
    const n = nodeById.get(id)!;
    return n.x * 10000 + n.y;
  };
  queue.sort((a, b) => posOf(a) - posOf(b));
  const topo: string[] = [];
  const q = [...queue];
  while (q.length) {
    q.sort((a, b) => posOf(a) - posOf(b));
    const id = q.shift()!;
    topo.push(id);
    for (const next of adj.get(id) ?? []) {
      indeg.set(next, indeg.get(next)! - 1);
      if (indeg.get(next) === 0) q.push(next);
    }
  }
  if (topo.length < g.nodes.length) {
    const cyclic = g.nodes.filter((n) => !topo.includes(n.id)).map((n) => n.id);
    issues.push({
      severity: "error",
      message: "These parts form a loop — quantum connections must flow left-to-right without cycles.",
      nodes: cyclic,
    });
  }

  if (issues.some((i) => i.severity === "error")) {
    return { ok: false, issues, numQubits: 0, ops: [], measurements: [], gateCount: 0, depth: 0, nodeOrder: [] };
  }

  // --- qubit identity propagation + op emission --------------------------
  const ins = g.nodes.filter((n) => n.type === "IN");
  const numQubits = ins.length;
  // qubit carried on each output port
  const qubitAt = new Map<string, number>();
  for (const n of ins) qubitAt.set(`${n.id}:out`, n.qubit ?? 0);

  const ops: Op[] = [];
  const measurements: { nodeId: string; qubit: number }[] = [];
  const nodeOrder: string[] = [];
  const lastLayer = new Map<number, number>(); // qubit -> last layer used

  const incomingQubit = (nodeId: string, portId: string): number | null => {
    const edges = inEdges.get(`${nodeId}:${portId}`);
    if (!edges || edges.length === 0) return null;
    const src = edges[0].from;
    const v = qubitAt.get(key(src));
    return v === undefined ? null : v;
  };

  const emit = (gate: Op["gate"], qubits: number[], nodeId: string) => {
    const layer = Math.max(...qubits.map((qb) => lastLayer.get(qb) ?? 0)) + 1;
    for (const qb of qubits) lastLayer.set(qb, layer);
    ops.push({ gate, qubits, nodeId, layer });
  };

  let incomplete = false;
  const missing = (nodeId: string, portId: string, label: string) => {
    incomplete = true;
    issues.push({
      severity: "incomplete",
      message: `${label} is not connected yet.`,
      ports: [{ node: nodeId, port: portId }],
    });
  };

  for (const id of topo) {
    const node = nodeById.get(id)!;
    const part = registry.get(node.type);
    if (!part) {
      issues.push({ severity: "error", message: `Unknown part "${node.type}".`, nodes: [id] });
      continue;
    }
    if (part.type === "IN") {
      nodeOrder.push(id);
      const drives = outEdges.get(`${id}:out`);
      if (!drives || drives.length === 0) missing(id, "out", `Input q${node.qubit ?? 0}`);
      continue;
    }
    if (part.type === "OUT") {
      const qb = incomingQubit(id, "in");
      if (qb === null) {
        missing(id, "in", "A readout");
      } else {
        measurements.push({ nodeId: id, qubit: qb });
        nodeOrder.push(id);
      }
      continue;
    }
    if (part.type === "ENCODER") {
      const qb = incomingQubit(id, "in");
      if (qb === null) {
        missing(id, "in", "The message encoder");
        continue;
      }
      const msg = ctx.message ?? "00";
      const c = msg[0] === "1";
      const d = msg[1] === "1";
      nodeOrder.push(id);
      if (c) emit("X", [qb], id);
      if (d) emit("Z", [qb], id);
      qubitAt.set(`${id}:out`, qb);
      continue;
    }
    if (part.gate) {
      if (part.gate === "CX") {
        const cq = incomingQubit(id, "ctrl_in");
        const tq = incomingQubit(id, "tgt_in");
        if (cq === null) missing(id, "ctrl_in", "The CNOT control input");
        if (tq === null) missing(id, "tgt_in", "The CNOT target input");
        if (cq === null || tq === null) continue;
        if (cq === tq) {
          issues.push({
            severity: "error",
            message: "The CNOT control and target are the same qubit — route two different qubits into it.",
            nodes: [id],
          });
          continue;
        }
        nodeOrder.push(id);
        emit("CX", [cq, tq], id);
        qubitAt.set(`${id}:ctrl_out`, cq);
        qubitAt.set(`${id}:tgt_out`, tq);
      } else {
        const qb = incomingQubit(id, "in");
        if (qb === null) {
          missing(id, "in", `The ${part.label} gate input`);
          continue;
        }
        nodeOrder.push(id);
        emit(part.gate, [qb], id);
        qubitAt.set(`${id}:out`, qb);
      }
      continue;
    }
    if (part.custom) {
      const c = part.custom;
      const bound: (number | null)[] = [];
      for (let i = 0; i < c.arity; i++) bound.push(incomingQubit(id, `in${i}`));
      if (bound.some((b) => b === null)) {
        bound.forEach((b, i) => {
          if (b === null) missing(id, `in${i}`, `${c.name} input ${c.arity === 2 ? (i === 0 ? "A" : "B") : ""}`.trim());
        });
        continue;
      }
      if (c.arity === 2 && bound[0] === bound[1]) {
        issues.push({
          severity: "error",
          message: `${c.name}'s two inputs are the same qubit — it needs two different qubits.`,
          nodes: [id],
        });
        continue;
      }
      // expand: compile the saved internal graph (primitives only) and remap
      const innerRegistry = registry; // primitives resolve the same way
      const hasCustomInside = c.graph.nodes.some((n) => registry.get(n.type)?.custom);
      if (hasCustomInside) {
        issues.push({
          severity: "error",
          message: `${c.name} contains another custom component — nested modules are limited to one level.`,
          nodes: [id],
        });
        continue;
      }
      const inner = compileGraph(c.graph, innerRegistry, ctx);
      if (!inner.ok) {
        issues.push({ severity: "error", message: `${c.name}'s saved circuit is malformed.`, nodes: [id] });
        continue;
      }
      nodeOrder.push(id);
      for (const op of inner.ops) {
        emit(op.gate, op.qubits.map((iq) => bound[iq] as number), id);
      }
      // port mapping: internal qubit i enters at in{i} and exits at out{i}
      for (let i = 0; i < c.arity; i++) qubitAt.set(`${id}:out${i}`, bound[i] as number);
      continue;
    }
    issues.push({ severity: "error", message: `Part "${part.label}" cannot be compiled.`, nodes: [id] });
  }

  const errored = issues.some((i) => i.severity === "error");
  const depth = ops.length ? Math.max(...ops.map((o) => o.layer)) : 0;
  return {
    ok: !errored && !incomplete,
    issues,
    numQubits,
    ops,
    measurements: measurements.sort((a, b) => a.qubit - b.qubit),
    gateCount: ops.length,
    depth,
    nodeOrder,
  };
}
