/**
 * Campaign map: zoomable dependency graph of assignments, grouped by chapter,
 * with complete / available / locked states and prerequisite connections.
 */
import { useRef, useState } from "react";
import { LEVELS, LEVEL_BY_ID } from "../model/levels";
import { isUnlocked, store, useApp } from "../state/store";

/** hand-placed map coordinates per level (map cells) */
const POS: Record<string, { x: number; y: number }> = {
  "first-connection": { x: 6, y: 16 },
  inverter: { x: 20, y: 16 },
  "two-possibilities": { x: 34, y: 16 },
  "hidden-sign": { x: 48, y: 8 },
  "conditional-flip": { x: 48, y: 24 },
  "shared-pair": { x: 62, y: 24 },
  "read-bell": { x: 76, y: 24 },
  courier: { x: 90, y: 16 },
};

const GROUP_LABELS: { label: string; x: number; y: number }[] = [
  { label: "Foundations", x: 13, y: 3 },
  { label: "Coherence", x: 41, y: 3 },
  { label: "Entanglement", x: 62, y: 33.5 },
  { label: "Communication", x: 90, y: 3 },
];

export function MapScreen(): JSX.Element {
  const app = useApp();
  const svgRef = useRef<SVGSVGElement>(null);
  const [cam, setCam] = useState({ x: -4, y: -2, zoom: 13 });
  const panRef = useRef<null | { sx: number; sy: number; cx: number; cy: number; moved: boolean }>(null);

  const journalNotes = app.journal
    .map((id) => LEVEL_BY_ID.get(id))
    .filter((l): l is NonNullable<typeof l> => !!l && !!l.fieldNote);

  return (
    <div className="map-screen">
      <header className="map-head">
        <h1>
          <span className="logo">⬡</span> Quantum Foundry
        </h1>
        <p className="tagline">An apprentice, a schematic bench, and one small quantum machine to reconstruct.</p>
        <div className="map-actions">
          <button onClick={() => store.openLevel("sandbox")}>Sandbox</button>
          <button onClick={() => store.openLevel("demo", true)} title="A populated Bell-pair circuit on separate progress — safe for presentations">
            Demo Mode
          </button>
          <button onClick={() => store.set({ screen: "workshop" })}>
            Component Workshop{app.components.length ? ` (${app.components.length})` : ""}
          </button>
        </div>
      </header>
      <svg
        ref={svgRef}
        className="map-svg"
        onPointerDown={(e) => {
          if ((e.target as Element).closest?.(".map-node")) return; // let nodes take the click
          panRef.current = { sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y, moved: false };
          (e.currentTarget as Element).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const p = panRef.current;
          if (!p) return;
          const dx = (e.clientX - p.sx) / cam.zoom;
          const dy = (e.clientY - p.sy) / cam.zoom;
          if (Math.abs(dx) + Math.abs(dy) > 0.2) p.moved = true;
          setCam((c) => ({ ...c, x: p.cx - dx, y: p.cy - dy }));
        }}
        onPointerUp={() => (panRef.current = null)}
        onWheel={(e) => {
          const rect = svgRef.current!.getBoundingClientRect();
          const px = e.clientX - rect.left;
          const py = e.clientY - rect.top;
          const wx = px / cam.zoom + cam.x;
          const wy = py / cam.zoom + cam.y;
          const zoom = Math.min(30, Math.max(7, cam.zoom * Math.exp(-e.deltaY * 0.0012)));
          setCam({ zoom, x: wx - px / zoom, y: wy - py / zoom });
        }}
      >
        <g transform={`scale(${cam.zoom}) translate(${-cam.x} ${-cam.y})`}>
          {GROUP_LABELS.map((g) => (
            <text key={g.label} className="map-group" x={g.x} y={g.y}>
              {g.label.toUpperCase()}
            </text>
          ))}
          {LEVELS.flatMap((l) =>
            l.prereqs.map((p) => {
              const a = POS[p];
              const b = POS[l.id];
              const done = app.completed.has(p);
              return (
                <path
                  key={`${p}->${l.id}`}
                  className={`map-link ${done ? "done" : ""}`}
                  d={`M${a.x + 4.5} ${a.y} C ${a.x + 9} ${a.y}, ${b.x - 9} ${b.y}, ${b.x - 4.5} ${b.y}`}
                />
              );
            }),
          )}
          {LEVELS.map((l) => {
            const pos = POS[l.id];
            const complete = app.completed.has(l.id);
            const unlocked = isUnlocked(l.id, app.completed);
            const cls = complete ? "complete" : unlocked ? "available" : "locked";
            const missingComponents = (l.requiresComponents ?? []).filter(
              (name) => !app.components.some((c) => c.name === name),
            );
            return (
              <g
                key={l.id}
                className={`map-node ${cls}`}
                transform={`translate(${pos.x} ${pos.y})`}
                onClick={() => {
                  if (panRef.current?.moved) return;
                  if (!unlocked) {
                    store.toast?.(`Locked — complete ${l.prereqs.map((p) => LEVEL_BY_ID.get(p)?.title).join(" and ")} first.`);
                    return;
                  }
                  if (missingComponents.length) {
                    alertMissing(missingComponents);
                    return;
                  }
                  store.openLevel(l.id);
                }}
                role="button"
                aria-label={`${l.title} — ${cls}`}
              >
                <title>
                  {l.title} — {cls}
                  {missingComponents.length ? ` (needs saved: ${missingComponents.join(", ")})` : ""}
                  {"\n"}
                  {l.contract}
                </title>
                <rect x={-4.5} y={-2.6} width={9} height={5.2} rx={0.5} />
                <text className="map-n" y={-0.6}>
                  {l.n}
                </text>
                <text className="map-title" y={1.4}>
                  {l.title}
                </text>
                {complete && <text className="map-check" x={3.4} y={-1.3}>✔</text>}
                {!unlocked && <text className="map-lock" x={0} y={-1.2}>🔒</text>}
              </g>
            );
          })}
        </g>
      </svg>
      <footer className="map-foot">
        <div className="journal">
          <h4>Apprentice's journal</h4>
          {journalNotes.length === 0 ? (
            <p className="dock-note">Field notes collect here as you complete assignments — by the end, the journal explains the whole machine.</p>
          ) : (
            <ol>
              {journalNotes.map((l) => (
                <li key={l.id}>
                  <strong>{l.title}.</strong> {l.fieldNote}
                </li>
              ))}
            </ol>
          )}
        </div>
      </footer>
      {app.toast && <div className="toast map-toast" role="status">{app.toast}</div>}
    </div>
  );
}

function alertMissing(names: string[]): void {
  store.toast(`This assignment needs your saved ${names.join(" and ")} — build and save ${names.length > 1 ? "them" : "it"} first.`);
}
