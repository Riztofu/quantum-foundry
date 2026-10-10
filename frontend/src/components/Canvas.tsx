/**
 * The schematic canvas: placement ghosts, pin-to-pin orthogonal wiring,
 * selection, drag-move, pan/zoom, fixtures, execution highlighting.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { CircuitGraph, Edge, NodeInst, PortDef, PortRef } from "../model/types";
import { pinPos, pathFrom, routeWire, graphBBox, type Pt } from "./geometry";
import { store, useApp } from "../state/store";

export interface CanvasDerived {
  activeNodeId: string | null;
  issuePorts: Set<string>; // "node:port" needing attention
  issueNodes: Set<string>;
  outReadings: Map<string, string>; // OUT node id -> displayed value
  inValues: Map<string, 0 | 1>; // IN node id -> displayed prepared value
}

interface Props {
  derived: CanvasDerived;
  readOnly?: boolean;
  graphOverride?: CircuitGraph; // workshop inspection
}

const keyOf = (r: PortRef) => `${r.node}:${r.port}`;

export function Canvas({ derived, readOnly = false, graphOverride }: Props): JSX.Element {
  const app = useApp();
  const graph = graphOverride ?? app.graph;
  const registry = store.registry;
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverPort, setHoverPort] = useState<string | null>(null);
  const [mouse, setMouse] = useState<Pt>({ x: 0, y: 0 });
  const dragRef = useRef<null | {
    nodeId: string;
    offX: number;
    offY: number;
    moved: boolean;
  }>(null);
  const panRef = useRef<null | { startX: number; startY: number; camX: number; camY: number }>(null);
  const spaceRef = useRef(false);

  const cam = app.camera;

  const toWorld = useCallback(
    (clientX: number, clientY: number): Pt => {
      const rect = svgRef.current!.getBoundingClientRect();
      return {
        x: (clientX - rect.left) / cam.zoom + cam.x,
        y: (clientY - rect.top) / cam.zoom + cam.y,
      };
    },
    [cam],
  );

  const fit = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const bb = graphBBox(graph, registry);
    const pad = 4;
    const zoom = Math.min(
      48,
      Math.max(8, Math.min(rect.width / (bb.w + pad * 2), rect.height / (bb.h + pad * 2))),
    );
    store.set({
      camera: {
        zoom,
        x: bb.x - (rect.width / zoom - bb.w) / 2,
        y: bb.y - (rect.height / zoom - bb.h) / 2,
      },
    });
  }, [graph, registry]);

  // expose fit via store-level event: toolbar dispatches a custom event
  useEffect(() => {
    const onFit = () => fit();
    window.addEventListener("qf-fit", onFit);
    return () => window.removeEventListener("qf-fit", onFit);
  }, [fit]);

  // keyboard
  useEffect(() => {
    if (readOnly) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;
      if (e.key === " ") {
        spaceRef.current = true;
        return;
      }
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) store.redo();
        else store.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicateSelection();
        return;
      }
      switch (e.key) {
        case "v":
        case "V":
          store.set({ tool: "select", placing: null });
          break;
        case "w":
        case "W":
          store.set({ tool: "wire", placing: null });
          break;
        case "f":
        case "F":
          fit();
          break;
        case "Escape":
          store.set({ wireDraft: null, placing: null, selection: null });
          break;
        case "Delete":
        case "Backspace":
          deleteSelection();
          break;
        case ".":
          window.dispatchEvent(new CustomEvent("qf-step"));
          break;
      }
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key === " ") spaceRef.current = false;
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onUp);
    };
  }, [readOnly, fit]);

  const deleteSelection = () => {
    const sel = store.state.selection;
    if (!sel) return;
    if (sel.kind === "node") {
      const node = store.state.graph.nodes.find((n) => n.id === sel.id);
      if (!node) return;
      if (node.fixture) {
        store.toast("Mission fixtures cannot be deleted.");
        return;
      }
      store.editGraph((g) => {
        g.nodes = g.nodes.filter((n) => n.id !== sel.id);
        g.edges = g.edges.filter((e) => e.from.node !== sel.id && e.to.node !== sel.id);
      });
    } else {
      const edge = store.state.graph.edges.find((e) => e.id === sel.id);
      if (!edge) return;
      if (edge.fixture) {
        store.toast("This connection is part of the mission and cannot be removed.");
        return;
      }
      store.editGraph((g) => {
        g.edges = g.edges.filter((e) => e.id !== sel.id);
      });
    }
    store.set({ selection: null });
  };

  const duplicateSelection = () => {
    const sel = store.state.selection;
    if (!sel || sel.kind !== "node") return;
    const node = store.state.graph.nodes.find((n) => n.id === sel.id);
    if (!node || node.type === "IN" || node.type === "OUT" || node.fixture) return;
    const id = `n${Date.now().toString(36)}${Math.floor(Math.random() * 999)}`;
    store.editGraph((g) => {
      g.nodes.push({ ...node, id, x: node.x + 2, y: node.y + 2, fixture: false });
    });
    store.set({ selection: { kind: "node", id } });
  };

  const tryFinishWire = (to: PortRef, toPort: PortDef) => {
    const draft = store.state.wireDraft;
    if (!draft) return;
    const fromNode = graph.nodes.find((n) => n.id === draft.from.node)!;
    const fromPart = registry.get(fromNode.type)!;
    const fromPort = fromPart.ports.find((p) => p.id === draft.from.port)!;
    if (toPort.kind !== "qin" && toPort.kind !== "cin") {
      store.toast("Wires end at an input pin — pick a pin on a part's left side.");
      return;
    }
    if (fromPort.kind === "qout" && toPort.kind === "cin") {
      store.toast("A quantum wire cannot feed a classical input.");
      return;
    }
    if (fromPort.kind === "cout" && toPort.kind === "qin") {
      store.toast("A classical wire cannot feed a quantum input.");
      return;
    }
    if (graph.edges.some((e) => keyOf(e.to) === keyOf(to))) {
      store.toast("That input already has a connection — every input takes exactly one.");
      return;
    }
    if (fromPort.kind === "qout" && graph.edges.some((e) => keyOf(e.from) === keyOf(draft.from))) {
      store.toast("This qubit already has an outgoing connection; route it through the next gate instead.");
      return;
    }
    if (to.node === draft.from.node) {
      store.toast("A part cannot wire to itself.");
      return;
    }
    const id = `e${Date.now().toString(36)}${Math.floor(Math.random() * 999)}`;
    store.editGraph((g) => {
      g.edges.push({ id, from: draft.from, to });
    });
    store.set({ wireDraft: null });
  };

  const onPinClick = (node: NodeInst, port: PortDef) => {
    if (readOnly) return;
    const ref = { node: node.id, port: port.id };
    if (port.kind === "qout" || port.kind === "cout") {
      store.set({ wireDraft: { from: ref }, selection: null });
    } else if (store.state.wireDraft) {
      tryFinishWire(ref, port);
    } else {
      // starting from an input: allowed; we just flip direction when finished on an output
      store.toast("Start a wire from an output pin (right side), then click an input pin.");
    }
  };

  const onSvgPointerDown = (e: React.PointerEvent) => {
    const w = toWorld(e.clientX, e.clientY);
    if (e.button === 1 || (e.button === 0 && spaceRef.current) || (e.button === 0 && readOnly)) {
      panRef.current = { startX: e.clientX, startY: e.clientY, camX: cam.x, camY: cam.y };
      (e.target as Element).setPointerCapture?.(e.pointerId);
      e.preventDefault();
      return;
    }
    if (readOnly) return;
    if (e.button !== 0) return;
    if (app.placing) {
      const part = registry.get(app.placing);
      if (part) {
        const id = `n${Date.now().toString(36)}${Math.floor(Math.random() * 999)}`;
        const x = Math.round(w.x - part.w / 2);
        const y = Math.round(w.y - part.h / 2);
        store.editGraph((g) => {
          g.nodes.push({ id, type: part.type, x, y });
        });
        if (!e.shiftKey) store.set({ placing: null, selection: { kind: "node", id } });
      }
      return;
    }
    if (app.wireDraft) {
      store.set({ wireDraft: null });
      return;
    }
    store.set({ selection: null });
  };

  const onSvgPointerMove = (e: React.PointerEvent) => {
    const w = toWorld(e.clientX, e.clientY);
    setMouse(w);
    if (panRef.current) {
      const p = panRef.current;
      store.set({
        camera: {
          ...cam,
          x: p.camX - (e.clientX - p.startX) / cam.zoom,
          y: p.camY - (e.clientY - p.startY) / cam.zoom,
        },
      });
      return;
    }
    const drag = dragRef.current;
    if (drag) {
      const nx = Math.round(w.x - drag.offX);
      const ny = Math.round(w.y - drag.offY);
      const node = store.state.graph.nodes.find((n) => n.id === drag.nodeId);
      if (node && (node.x !== nx || node.y !== ny)) {
        drag.moved = true;
        // light-weight move without undo-churn: mutate + emit; undo snapshot on release
        node.x = nx;
        node.y = ny;
        store.set({ graph: { ...store.state.graph } });
      }
    }
  };

  const onSvgPointerUp = (e: React.PointerEvent) => {
    panRef.current = null;
    const drag = dragRef.current;
    if (drag) {
      dragRef.current = null;
      if (drag.moved) {
        // commit the move as one undoable edit: positions already applied
        const g = store.state.graph;
        store.editGraph(() => JSON.parse(JSON.stringify(g)), false);
      }
    }
    void e;
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const rect = svgRef.current!.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const wx = px / cam.zoom + cam.x;
    const wy = py / cam.zoom + cam.y;
    const zoom = Math.min(48, Math.max(8, cam.zoom * Math.exp(-e.deltaY * 0.0012)));
    store.set({ camera: { zoom, x: wx - px / zoom, y: wy - py / zoom } });
  };

  const beginNodeDrag = (e: React.PointerEvent, node: NodeInst) => {
    if (readOnly) return;
    if (e.button !== 0 || spaceRef.current) return;
    e.stopPropagation();
    store.set({ selection: { kind: "node", id: node.id }, wireDraft: null });
    if (node.fixture) return; // fixtures stay anchored
    const w = toWorld(e.clientX, e.clientY);
    dragRef.current = { nodeId: node.id, offX: w.x - node.x, offY: w.y - node.y, moved: false };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };

  // --- render helpers -----------------------------------------------------
  const renderWire = (e: Edge) => {
    const fromNode = graph.nodes.find((n) => n.id === e.from.node);
    const toNode = graph.nodes.find((n) => n.id === e.to.node);
    if (!fromNode || !toNode) return null;
    const fromPart = registry.get(fromNode.type);
    const toPart = registry.get(toNode.type);
    if (!fromPart || !toPart) return null;
    const fp = fromPart.ports.find((p) => p.id === e.from.port);
    const tp = toPart.ports.find((p) => p.id === e.to.port);
    if (!fp || !tp) return null;
    const a = pinPos(fromNode, fromPart, fp);
    const b = pinPos(toNode, toPart, tp);
    const pts = routeWire(a, b);
    const classical = fp.kind === "cout";
    const selected = app.selection?.kind === "edge" && app.selection.id === e.id;
    return (
      <g key={e.id} className={`wire ${classical ? "classical" : "quantum"} ${selected ? "selected" : ""} ${e.fixture ? "fixture" : ""}`}>
        <path
          d={pathFrom(pts)}
          className="wire-hit"
          onPointerDown={(ev) => {
            if (readOnly) return;
            ev.stopPropagation();
            store.set({ selection: { kind: "edge", id: e.id }, wireDraft: null });
          }}
        />
        <path d={pathFrom(pts)} className="wire-line" />
      </g>
    );
  };

  const renderNode = (node: NodeInst) => {
    const part = registry.get(node.type);
    if (!part) return null;
    const selected = app.selection?.kind === "node" && app.selection.id === node.id;
    const active = derived.activeNodeId === node.id;
    const hasIssue = derived.issueNodes.has(node.id);
    const isIO = part.type === "IN" || part.type === "OUT";
    const isCustom = !!part.custom;
    const reading = part.type === "OUT" ? derived.outReadings.get(node.id) : undefined;
    const inValue = part.type === "IN" ? derived.inValues.get(node.id) : undefined;
    return (
      <g
        key={node.id}
        data-node-id={node.id}
        data-node-type={node.type}
        transform={`translate(${node.x} ${node.y})`}
        className={`node ${selected ? "selected" : ""} ${active ? "active" : ""} ${node.fixture ? "fixture" : ""} ${hasIssue ? "issue" : ""}`}
        onPointerDown={(e) => beginNodeDrag(e, node)}
      >
        <rect
          className={`body ${isIO ? "io" : isCustom ? "custom" : "gate"} ${part.type === "ENCODER" ? "encoder" : ""}`}
          width={part.w}
          height={part.h}
          rx={0.25}
        />
        {node.fixture && <rect className="fixture-band" width={part.w} height={0.35} />}
        <text
          className="label"
          x={part.w / 2}
          y={isIO || isCustom ? part.h * 0.42 : part.h / 2 + 0.05}
        >
          {part.type === "IN" ? `q${node.qubit ?? 0}` : part.label}
        </text>
        {part.type === "IN" && (
          <text className="sub" x={part.w / 2} y={part.h - 0.35}>
            {`|${inValue ?? node.value ?? 0}⟩`}
          </text>
        )}
        {part.type === "OUT" && (
          <text className="sub readout" x={part.w / 2} y={part.h - 0.35}>
            {reading ?? "—"}
          </text>
        )}
        {isCustom && <text className="sub" x={part.w / 2} y={part.h - 0.3}>{part.custom!.gateCost} gates</text>}
        {part.ports.map((p) => {
          const pos = pinPos(node, part, p);
          const k = `${node.id}:${p.id}`;
          const connected = graph.edges.some((e) => keyOf(e.from) === k || keyOf(e.to) === k);
          const isHover = hoverPort === k;
          const issue = derived.issuePorts.has(k);
          const draftActive = app.wireDraft && keyOf(app.wireDraft.from) === k;
          return (
            <g key={p.id} transform={`translate(${pos.x - node.x} ${pos.y - node.y})`}>
              <circle
                className={`pin ${p.kind} ${connected ? "connected" : ""} ${isHover ? "hover" : ""} ${issue ? "issue" : ""} ${draftActive ? "drafting" : ""}`}
                data-node={node.id}
                data-port={p.id}
                data-kind={p.kind}
                r={0.42}
                onPointerDown={(e) => {
                  e.stopPropagation();
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onPinClick(node, p);
                }}
                onPointerEnter={() => setHoverPort(k)}
                onPointerLeave={() => setHoverPort(null)}
              >
                <title>{`${p.kind.startsWith("q") ? "quantum" : "classical"} ${p.kind.endsWith("in") ? "input" : "output"}${p.label ? ` — ${p.label}` : ""}`}</title>
              </circle>
              {p.label && p.side === "left" && (
                <text className="pin-label" x={0.65} y={0.12} textAnchor="start">
                  {p.label}
                </text>
              )}
            </g>
          );
        })}
      </g>
    );
  };

  // wire preview while drafting
  let preview: JSX.Element | null = null;
  if (app.wireDraft && !readOnly) {
    const fromNode = graph.nodes.find((n) => n.id === app.wireDraft!.from.node);
    const fromPart = fromNode && registry.get(fromNode.type);
    const fp = fromPart?.ports.find((p) => p.id === app.wireDraft!.from.port);
    if (fromNode && fromPart && fp) {
      const a = pinPos(fromNode, fromPart, fp);
      const pts = routeWire(a, mouse);
      preview = <path className="wire-preview" d={pathFrom(pts)} />;
    }
  }

  // placement ghost
  let ghost: JSX.Element | null = null;
  if (app.placing && !readOnly) {
    const part = registry.get(app.placing);
    if (part) {
      const x = Math.round(mouse.x - part.w / 2);
      const y = Math.round(mouse.y - part.h / 2);
      ghost = (
        <g transform={`translate(${x} ${y})`} className="ghost">
          <rect width={part.w} height={part.h} rx={0.25} />
          <text x={part.w / 2} y={part.h / 2 + 0.05} className="label">
            {part.label}
          </text>
        </g>
      );
    }
  }

  const rect = svgRef.current?.getBoundingClientRect();
  const vw = rect?.width ?? 1200;
  const vh = rect?.height ?? 700;

  return (
    <svg
      ref={svgRef}
      className={`canvas tool-${app.tool} ${app.placing ? "placing" : ""} ${app.wireDraft ? "wiring" : ""}`}
      onPointerDown={onSvgPointerDown}
      onPointerMove={onSvgPointerMove}
      onPointerUp={onSvgPointerUp}
      onWheel={onWheel}
      onContextMenu={(e) => e.preventDefault()}
      tabIndex={0}
      role="application"
      aria-label="Circuit schematic canvas"
    >
      <defs>
        <pattern
          id="grid"
          width={cam.zoom * 2}
          height={cam.zoom * 2}
          patternUnits="userSpaceOnUse"
          patternTransform={`translate(${-cam.x * cam.zoom} ${-cam.y * cam.zoom})`}
        >
          <circle cx={1} cy={1} r={0.8} className="grid-dot" />
        </pattern>
      </defs>
      <rect width={vw} height={vh} className="canvas-bg" fill="url(#grid)" />
      <g transform={`scale(${cam.zoom}) translate(${-cam.x} ${-cam.y})`}>
        {graph.edges.map(renderWire)}
        {preview}
        {graph.nodes.map(renderNode)}
        {ghost}
      </g>
    </svg>
  );
}

export function fitCanvas(): void {
  window.dispatchEvent(new CustomEvent("qf-fit"));
}
