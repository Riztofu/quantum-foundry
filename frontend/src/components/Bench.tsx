/**
 * Circuit workbench: toolbar, left execution strip, canvas, part drawer,
 * contract line, bottom dock. Owns the derived simulation for the open level.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { compileGraph } from "../quantum/compile";
import { basisState, opsToUnitary, sampleShots, simulate, simulateSteps } from "../quantum/sim";
import { gradeLevel, type GradeResult } from "../quantum/grade";
import type { LevelDef, Op, StateVec, TestCase } from "../model/types";
import { levelFor, store, unlockedParts, useApp } from "../state/store";
import { Canvas, fitCanvas, type CanvasDerived } from "./Canvas";
import { Dock } from "./Dock";
import { Overlay } from "./Overlay";

export interface BenchDerived {
  level: LevelDef;
  test: TestCase;
  compiled: ReturnType<typeof compileGraph>;
  snapshots: StateVec[] | null;
  shownState: StateVec | null;
  finalState: StateVec | null;
  execIndex: number; // snapshot index currently displayed
  grade: GradeResult;
  isFree: boolean; // sandbox / demo: inputs toggled on the IN parts
}

function prepOpsFor(test: TestCase): Op[] {
  return (test.prep ?? []).map((p, i) => ({ ...p, nodeId: `prep${i}`, layer: 0 }));
}

export function useBenchDerived(): BenchDerived | null {
  const app = useApp();
  const level = levelFor(app);
  return useMemo(() => {
    if (!level) return null;
    const isFree = level.id === "sandbox" || level.id === "demo";
    const test = level.tests[Math.min(app.testIndex, level.tests.length - 1)];
    const compileFor = (t: TestCase) => compileGraph(app.graph, store.registry, { message: t.message });
    const compiled = compileFor(test);
    const inputs: (0 | 1)[] = [];
    for (let q = 0; q < level.numQubits; q++) {
      if (isFree) {
        const inNode = app.graph.nodes.find((n) => n.type === "IN" && (n.qubit ?? 0) === q);
        inputs.push((inNode?.value ?? 0) as 0 | 1);
      } else {
        inputs.push(test.inputs[q] ?? 0);
      }
    }
    let snapshots: StateVec[] | null = null;
    if (compiled.ok) {
      let input = basisState(level.numQubits, inputs);
      const prep = prepOpsFor(test);
      if (prep.length) input = simulate(input, prep);
      snapshots = simulateSteps(input, compiled.ops);
    }
    const execIndex =
      snapshots === null
        ? 0
        : app.execStep === null
          ? snapshots.length - 1
          : Math.min(Math.max(app.execStep, 0), snapshots.length - 1);
    const shownState = snapshots ? snapshots[execIndex] : null;
    const finalState = snapshots ? snapshots[snapshots.length - 1] : null;
    const realized = compiled.ok && level.operatorCheck ? opsToUnitary(level.numQubits, compiled.ops) : null;
    const freeTestLevel = isFree && level.id === "sandbox";
    const grade: GradeResult = freeTestLevel
      ? { compiled: compiled.ok, cases: [], allPass: false }
      : gradeLevel(level, compileFor, realized);
    return { level, test, compiled, snapshots, shownState, finalState, execIndex, grade, isFree };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.graph, app.revision, app.testIndex, app.execStep, level?.id]);
}

export function Bench(): JSX.Element | null {
  const app = useApp();
  const d = useBenchDerived();
  const [drawerOpen, setDrawerOpen] = useState(true);
  const playTimer = useRef<number | null>(null);

  // play loop
  useEffect(() => {
    if (!app.playing) {
      if (playTimer.current) window.clearInterval(playTimer.current);
      playTimer.current = null;
      return;
    }
    playTimer.current = window.setInterval(() => {
      const snaps = d?.snapshots;
      if (!snaps) {
        store.set({ playing: false });
        return;
      }
      const cur = store.state.execStep ?? 0;
      if (cur >= snaps.length - 1) store.set({ playing: false });
      else store.set({ execStep: cur + 1 });
    }, 650);
    return () => {
      if (playTimer.current) window.clearInterval(playTimer.current);
    };
  }, [app.playing, d?.snapshots?.length]);

  // single-step shortcut
  useEffect(() => {
    const onStep = () => {
      const snaps = d?.snapshots;
      if (!snaps) return;
      const cur = store.state.execStep;
      store.set({ execStep: cur === null ? 0 : Math.min(cur + 1, snaps.length - 1), playing: false });
    };
    window.addEventListener("qf-step", onStep);
    return () => window.removeEventListener("qf-step", onStep);
  }, [d?.snapshots]);

  if (!d) return null;
  const { level, compiled } = d;

  const canvasDerived: CanvasDerived = buildCanvasDerived(d);

  return (
    <div className="bench">
      <Toolbar d={d} />
      <div className="bench-main">
        <LeftStrip d={d} />
        <div className="canvas-wrap">
          <Canvas derived={canvasDerived} />
          {app.toast && <div className={`toast ${app.toastKind}`} role="status">{app.toast}</div>}
          <div className="contract-line" title="Mission contract">
            <span className="contract-chip">{level.group}</span> {level.contract}
          </div>
        </div>
        {drawerOpen ? (
          <Drawer d={d} onCollapse={() => setDrawerOpen(false)} />
        ) : (
          <button className="drawer-expand" onClick={() => setDrawerOpen(true)} title="Open component drawer">
            ◀ Parts
          </button>
        )}
      </div>
      <Dock d={d} />
      {app.overlay && <Overlay d={d} />}
      {compiled.issues.length > 0 && (
        <div className="issue-bar" role="alert">
          {compiled.issues[0].message}
          {compiled.issues.length > 1 && <span className="issue-more"> (+{compiled.issues.length - 1} more)</span>}
        </div>
      )}
    </div>
  );
}

export function buildCanvasDerived(d: BenchDerived): CanvasDerived {
  const { compiled, finalState, level, test, isFree } = d;
  const issuePorts = new Set<string>();
  const issueNodes = new Set<string>();
  for (const issue of compiled.issues) {
    for (const p of issue.ports ?? []) issuePorts.add(`${p.node}:${p.port}`);
    for (const n of issue.nodes ?? []) issueNodes.add(n);
  }
  const outReadings = new Map<string, string>();
  if (finalState) {
    for (const m of compiled.measurements) {
      let p1 = 0;
      const dim = 1 << finalState.n;
      for (let i = 0; i < dim; i++) {
        if ((i >> m.qubit) & 1) p1 += finalState.re[i] * finalState.re[i] + finalState.im[i] * finalState.im[i];
      }
      outReadings.set(m.nodeId, p1 < 1e-9 ? "0" : p1 > 1 - 1e-9 ? "1" : `${Math.round(p1 * 100)}% →1`);
    }
  }
  const inValues = new Map<string, 0 | 1>();
  for (const n of store.state.graph.nodes) {
    if (n.type === "IN") {
      const q = n.qubit ?? 0;
      inValues.set(n.id, isFree ? ((n.value ?? 0) as 0 | 1) : ((test.inputs[q] ?? 0) as 0 | 1));
    }
  }
  const activeNodeId =
    store.state.execStep !== null && d.execIndex > 0 && compiled.ops[d.execIndex - 1]
      ? compiled.ops[d.execIndex - 1].nodeId
      : null;
  void level;
  return { activeNodeId, issuePorts, issueNodes, outReadings, inValues };
}

/* ------------------------------- Toolbar -------------------------------- */

function Toolbar({ d }: { d: BenchDerived }): JSX.Element {
  const app = useApp();
  const { level, compiled } = d;
  const zoomBy = (f: number) => {
    const cam = store.state.camera;
    store.set({ camera: { ...cam, zoom: Math.min(48, Math.max(8, cam.zoom * f)) } });
  };
  const resetLevel = () => {
    store.editGraph(() => JSON.parse(JSON.stringify(level.fixtures)));
    store.set({ selection: null, wireDraft: null, placing: null });
  };
  const exportCircuit = () => {
    const payload = {
      schema: 1,
      game: "quantum-foundry",
      bitOrder: "q0 is least significant; bitstrings read q(n-1)..q0 (Qiskit)",
      level: level.id,
      numQubits: level.numQubits,
      graph: app.graph,
      components: store.state.components,
      camera: app.camera,
      revision: app.revision,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `quantum-foundry-${level.id}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const verdict = app.qiskitVerdict && app.qiskitVerdict.revision === app.revision ? app.qiskitVerdict : null;
  return (
    <div className="toolbar">
      <button onClick={() => store.backToMap()} title="Back to the campaign map">▦ Map</button>
      <span className="mission-name">
        {level.n > 0 ? `${level.n}. ` : ""}
        {level.title}
        {app.demoMode && <em className="demo-badge"> DEMO</em>}
      </span>
      <div className="tool-group" role="group" aria-label="Tools">
        <button className={app.tool === "select" ? "on" : ""} onClick={() => store.set({ tool: "select", placing: null })} title="Select (V)">
          ⟳ Select
        </button>
        <button className={app.tool === "wire" ? "on" : ""} onClick={() => store.set({ tool: "wire", placing: null })} title="Wire (W)">
          ─ Wire
        </button>
      </div>
      <button onClick={() => store.undo()} disabled={!app.undoStack.length} title="Undo (Ctrl+Z)">↶</button>
      <button onClick={() => store.redo()} disabled={!app.redoStack.length} title="Redo (Ctrl+Shift+Z)">↷</button>
      <button onClick={resetLevel} title="Reset the mission to its fixtures">Reset</button>
      <button onClick={() => zoomBy(1 / 1.25)} title="Zoom out">−</button>
      <button onClick={() => zoomBy(1.25)} title="Zoom in">+</button>
      <button onClick={() => fitCanvas()} title="Fit circuit (F)">Fit</button>
      <button onClick={exportCircuit} title="Export circuit JSON (saved automatically as you build)">Export</button>
      <span className="spacer" />
      <span className="stat" title="Primitive gates after expanding custom blocks">
        {compiled.gateCount} gates
      </span>
      <span className="stat" title="Logical depth (independent gates share a layer)">
        depth {compiled.depth}
      </span>
      <span className={`source-badge ${verdict ? "qiskit" : "local"}`} title="Which simulator produced the current numbers">
        {verdict ? `Qollab Simulator — Qiskit ${verdict.allPass ? "✓" : "✗"}` : "Local Preview"}
      </span>
    </div>
  );
}

/* ------------------------------ Left strip ------------------------------- */

function LeftStrip({ d }: { d: BenchDerived }): JSX.Element {
  const app = useApp();
  const { level, compiled, snapshots, isFree } = d;
  const [busy, setBusy] = useState(false);
  const atEnd = app.execStep === null || (snapshots && app.execStep >= snapshots.length - 1);

  const runShots = () => {
    if (!d.finalState) return;
    const counts = sampleShots(d.finalState, app.shotCount);
    const rec: Record<string, number> = {};
    for (const [idx, c] of counts) {
      const label = idx.toString(2).padStart(level.numQubits, "0");
      rec[label] = c;
    }
    store.set({
      shotResult: { counts: rec, shots: app.shotCount, revision: app.revision, source: "local" },
      dockTab: "measure",
    });
  };

  const verifyQiskit = async () => {
    setBusy(true);
    const revision = app.revision;
    try {
      const cases = level.tests.map((t) => {
        const c = compileGraph(store.state.graph, store.registry, { message: t.message });
        return {
          id: t.id,
          label: t.label,
          inputs: Array.from({ length: level.numQubits }, (_, q) => t.inputs[q] ?? 0),
          prep: t.prep ?? [],
          ops: c.ok ? c.ops.map((o) => ({ gate: o.gate, qubits: o.qubits })) : null,
          expect: t.expect,
        };
      });
      const body = {
        numQubits: level.numQubits,
        cases,
        operatorCheck: level.operatorCheck ?? null,
        shots: app.shotCount,
      };
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const out = (await res.json()) as { allPass: boolean; summary: string; counts?: Record<string, number> };
      if (store.state.revision !== revision) return; // stale response: circuit changed
      store.set({ qiskitVerdict: { revision, allPass: out.allPass, summary: out.summary } });
      if (out.counts) {
        store.set({
          shotResult: { counts: out.counts, shots: app.shotCount, revision, source: "qiskit" },
        });
      }
      store.toast(out.allPass ? "Qiskit agrees: contract satisfied." : `Qiskit: ${out.summary}`, out.allPass ? "ok" : "warn");
    } catch {
      store.toast("Qiskit runner not reachable — still on Local Preview. Start the backend to verify.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="left-strip">
      <section>
        <h4>Input state</h4>
        {Array.from({ length: level.numQubits }, (_, q) => {
          const inNode = app.graph.nodes.find((n) => n.type === "IN" && (n.qubit ?? 0) === q);
          const val = isFree ? inNode?.value ?? 0 : d.test.inputs[q] ?? 0;
          return (
            <div key={q} className="input-row">
              <span className="mono">q{q}{level.numQubits === 2 ? (q === 0 ? " (A)" : " (B)") : ""}</span>
              <button
                className="mono val"
                disabled={!isFree}
                title={isFree ? "Toggle the prepared basis state" : "Inputs follow the selected test case"}
                onClick={() => {
                  if (!inNode) return;
                  store.editGraph((g) => {
                    const n = g.nodes.find((x) => x.id === inNode.id)!;
                    n.value = n.value ? 0 : 1;
                  });
                }}
              >
                {`|${val}⟩`}
              </button>
            </div>
          );
        })}
        {level.id === "courier" && (
          <div className="msg-row">
            <span>Message</span>
            <div className="msg-buttons">
              {["00", "01", "10", "11"].map((m, i) => (
                <button
                  key={m}
                  className={`mono ${d.test.message === m ? "on" : ""}`}
                  onClick={() => store.set({ testIndex: i, message: m, execStep: null })}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>
      <section>
        <h4>Execution</h4>
        <div className="exec-buttons">
          <button onClick={() => store.set({ playing: !app.playing, execStep: app.execStep ?? 0 })} disabled={!compiled.ok} title="Play / pause the circuit animation">
            {app.playing ? "⏸ Pause" : "▶ Play"}
          </button>
          <button onClick={() => window.dispatchEvent(new CustomEvent("qf-step"))} disabled={!compiled.ok || !!atEnd && app.execStep !== null} title="Single step (.)">
            ⏭ Step
          </button>
          <button onClick={() => store.set({ execStep: 0, playing: false })} disabled={!compiled.ok} title="Rewind to the input state">
            ⏮ Reset
          </button>
        </div>
        <div className="exec-pos mono">
          {compiled.ok
            ? app.execStep === null
              ? `final — op ${compiled.ops.length}/${compiled.ops.length}`
              : `op ${d.execIndex}/${compiled.ops.length}`
            : "— incomplete —"}
        </div>
        <label className="shots-row">
          shots
          <select
            value={app.shotCount}
            onChange={(e) => store.set({ shotCount: Number(e.target.value) as 128 | 512 | 1024 })}
          >
            <option value={128}>128</option>
            <option value={512}>512</option>
            <option value={1024}>1024</option>
          </select>
        </label>
        <button onClick={runShots} disabled={!compiled.ok} title="Sample fresh preparations of the final circuit">
          ▤ Run shots
        </button>
        <button onClick={verifyQiskit} disabled={!compiled.ok || busy} title="Re-check this circuit on the Qiskit runner">
          {busy ? "Verifying…" : "⚕ Verify on Qiskit"}
        </button>
      </section>
      {level.hints && level.hints.length > 0 && (
        <section>
          <h4>Hints</h4>
          {level.hints.slice(0, app.hintsRevealed).map((h, i) => (
            <p key={i} className="hint">{h}</p>
          ))}
          {app.hintsRevealed < level.hints.length && (
            <button onClick={() => store.set({ hintsRevealed: app.hintsRevealed + 1 })}>
              Reveal hint {app.hintsRevealed + 1}/{level.hints.length}
            </button>
          )}
        </section>
      )}
      <section className="briefing">
        <h4>Briefing</h4>
        {level.briefing.map((b, i) => (
          <p key={i}>{b}</p>
        ))}
      </section>
    </div>
  );
}

/* -------------------------------- Drawer --------------------------------- */

function Drawer({ d, onCollapse }: { d: BenchDerived; onCollapse: () => void }): JSX.Element {
  const app = useApp();
  const { level } = d;
  const unlocked = unlockedParts(app.completed);
  const categories: ("1 Qubit" | "2 Qubits" | "I/O" | "Custom")[] = ["1 Qubit", "2 Qubits", "Custom"];
  const allParts = store.registry.all().filter((p) => p.category !== "I/O");
  return (
    <div className="drawer">
      <div className="drawer-head">
        <h3>Parts</h3>
        <button onClick={onCollapse} title="Collapse drawer">▶</button>
      </div>
      {categories.map((cat) => {
        const parts = allParts.filter((p) => p.category === cat);
        if (!parts.length) return null;
        return (
          <div key={cat} className="drawer-cat">
            <h5>{cat}</h5>
            <div className="part-grid">
              {parts.map((p) => {
                const inPalette =
                  p.category === "Custom"
                    ? level.id === "courier" || level.id === "sandbox" || level.id === "demo" ||
                      (level.palette.length > 0 && !level.requiresComponents) // customs usable wherever building is open
                    : level.palette.includes(p.type);
                const isUnlocked = p.category === "Custom" || unlocked.has(p.type) || app.demoMode || level.id === "sandbox";
                const usable = inPalette && isUnlocked;
                const lockedBy = !isUnlocked && p.unlockedBy ? `Locked — complete "${p.unlockedBy}"` : undefined;
                return (
                  <button
                    key={p.type}
                    className={`part-tile ${app.placing === p.type ? "on" : ""} ${usable ? "" : "locked"}`}
                    disabled={!usable}
                    title={lockedBy ?? `${p.title}\n${p.description}\nPorts: ${p.ports.length}`}
                    onClick={() => store.set({ placing: app.placing === p.type ? null : p.type, wireDraft: null })}
                  >
                    <span className="tile-label">{p.label}</span>
                    <span className="tile-ports">{p.ports.filter((x) => x.kind.endsWith("in")).length}→{p.ports.filter((x) => x.kind.endsWith("out")).length}</span>
                    {p.custom && <span className="tile-cost">{p.custom.gateCost}g</span>}
                    {!usable && <span className="tile-lock">🔒</span>}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
      <p className="drawer-tip">Click a tile, then click the canvas to place. Shift-click places repeatedly. Click an output pin, then an input pin, to wire.</p>
    </div>
  );
}
