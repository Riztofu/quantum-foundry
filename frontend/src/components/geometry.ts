/** Shared schematic geometry (all coordinates in grid cells). */
import type { CircuitGraph, NodeInst, PartDef, PortDef } from "../model/types";
import { PartRegistry } from "../model/parts";

export interface Pt {
  x: number;
  y: number;
}

export function pinPos(node: NodeInst, part: PartDef, port: PortDef): Pt {
  const same = part.ports.filter((p) => p.side === port.side);
  const idx = same.findIndex((p) => p.id === port.id);
  const y = node.y + (part.h * (idx + 1)) / (same.length + 1);
  const x = port.side === "left" ? node.x : node.x + part.w;
  return { x, y };
}

/** Orthogonal route between an output pin and an input pin. */
export function routeWire(a: Pt, b: Pt): Pt[] {
  const stub = 1;
  const sx = a.x + stub;
  const ex = b.x - stub;
  if (sx <= ex + 0.001) {
    const midX = Math.round((sx + ex) / 2);
    if (Math.abs(a.y - b.y) < 0.01) return [a, b];
    return [a, { x: midX, y: a.y }, { x: midX, y: b.y }, b];
  }
  // target is behind the source: loop around
  const midY = Math.round((a.y + b.y) / 2) + (a.y === b.y ? 3 : 0);
  return [a, { x: sx, y: a.y }, { x: sx, y: midY }, { x: ex, y: midY }, { x: ex, y: b.y }, b];
}

export function pathFrom(points: Pt[]): string {
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ");
}

export function graphBBox(g: CircuitGraph, registry: PartRegistry): { x: number; y: number; w: number; h: number } {
  if (!g.nodes.length) return { x: 0, y: 0, w: 40, h: 24 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of g.nodes) {
    const part = registry.get(n.type);
    const w = part?.w ?? 3;
    const h = part?.h ?? 2;
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + w);
    maxY = Math.max(maxY, n.y + h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
