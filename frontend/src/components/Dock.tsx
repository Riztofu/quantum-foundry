/**
 * Bottom dock: Tests | Quantum State | Measurements | Selected Component.
 */
import { useMemo, useState } from "react";
import { basisLabel } from "../quantum/sim";
import { gradeLevel } from "../quantum/grade";
import { compileGraph } from "../quantum/compile";
import { opsToUnitary } from "../quantum/sim";
import type { TestCase } from "../model/types";
import { store, useApp } from "../state/store";
import type { BenchDerived } from "./Bench";
import { Canvas } from "./Canvas";

export function Dock({ d }: { d: BenchDerived }): JSX.Element {
  const app = useApp();
  const [height, setHeight] = useState(200);
  const tabs = [
    ["tests", "Tests"],
    ["state", "Quantum State"],
    ["measure", "Measurements"],
    ["component", "Selected Component"],
  ] as const;

  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = height;
    const move = (ev: PointerEvent) => setHeight(Math.min(420, Math.max(120, startH + (startY - ev.clientY))));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div className="dock" style={{ height }}>
      <div className="dock-resize" onPointerDown={startResize} title="Drag to resize" />
      <div className="dock-tabs" role="tablist">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={app.dockTab === id}
            className={app.dockTab === id ? "on" : ""}
            onClick={() => store.set({ dockTab: id })}
          >
            {label}
          </button>
        ))}
        <span className="spacer" />
        {!d.isFree && <CheckAll d={d} />}
      </div>
      <div className="dock-body">
        {app.dockTab === "tests" && <TestsTab d={d} />}
        {app.dockTab === "state" && <StateTab d={d} />}
        {app.dockTab === "measure" && <MeasureTab d={d} />}
        {app.dockTab === "component" && <ComponentTab />}
      </div>
    </div>
  );
}

function CheckAll({ d }: { d: BenchDerived }): JSX.Element {
  const app = useApp();
  const run = () => {
    const { level } = d;
    const compileFor = (t: TestCase) => compileGraph(store.state.graph, store.registry, { message: t.message });
    const probe = compileFor(level.tests[0]);
    const realized = probe.ok && level.operatorCheck ? opsToUnitary(level.numQubits, probe.ops) : null;
    const grade = gradeLevel(level, compileFor, realized);
    if (grade.allPass) {
      store.completeLevel(level.id);
    } else {
      const firstFail = grade.cases.find((c) => !c.pass);
      store.toast(
        grade.structural ??
          grade.operatorFeedback ??
          firstFail?.feedback ??
          (firstFail ? `${firstFail.test.label}: expected ${firstFail.expected}.` : "Not passing yet."),
      );
      store.set({ dockTab: "tests" });
    }
  };
  void app;
  return (
    <button className="check-all" onClick={run} title="Evaluate the entire mission contract">
      ✓ Check All
    </button>
  );
}

function TestsTab({ d }: { d: BenchDerived }): JSX.Element {
  const app = useApp();
  const { level, grade } = d;
  if (d.isFree && level.id === "sandbox") {
    return <p className="dock-note">Sandbox has no contract — flip the inputs on the left and watch the state dock.</p>;
  }
  return (
    <table className="test-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Case</th>
          <th>Expected</th>
          <th>Actual</th>
          <th>Result</th>
        </tr>
      </thead>
      <tbody>
        {grade.cases.map((c, i) => (
          <tr
            key={c.test.id}
            className={`${i === app.testIndex ? "current" : ""} ${c.pass ? "pass" : "fail"}`}
            onClick={() => store.set({ testIndex: i, execStep: null, playing: false, ...(c.test.message ? { message: c.test.message } : {}) })}
            title={c.feedback ?? "Click to load this case onto the bench"}
          >
            <td className="mono">{i + 1}</td>
            <td>{c.test.label}</td>
            <td className="mono">{c.expected}</td>
            <td className="mono">{c.actual}</td>
            <td>{c.pass ? "✔ pass" : "✘ fail"}</td>
          </tr>
        ))}
        {level.operatorCheck && (
          <tr className={grade.operatorPass ? "pass" : "fail"} title={grade.operatorFeedback ?? "Coherent full-operation check (unitary equivalence up to global phase)"}>
            <td className="mono">◆</td>
            <td>full operation</td>
            <td>{level.operatorCheck.descr}</td>
            <td>{grade.operatorPass ? "equivalent" : grade.operatorFeedback ?? "not equivalent"}</td>
            <td>{grade.operatorPass ? "✔ pass" : "✘ fail"}</td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

function StateTab({ d }: { d: BenchDerived }): JSX.Element {
  const app = useApp();
  const s = d.shownState;
  if (!s) return <p className="dock-note">Finish the wiring to see the joint state — missing connections are listed above the dock.</p>;
  const dim = 1 << s.n;
  const rows = [];
  for (let i = 0; i < dim; i++) {
    const re = s.re[i];
    const im = s.im[i];
    const mag2 = re * re + im * im;
    const phase = Math.atan2(im, re);
    rows.push({ i, re, im, mag2, phase });
  }
  const showProb = app.stateView === "probability";
  return (
    <div className="state-tab">
      <div className="state-head">
        <div className="view-toggle" role="group" aria-label="State view">
          <button className={!showProb ? "on" : ""} onClick={() => store.set({ stateView: "amplitude" })}>
            Amplitude
          </button>
          <button className={showProb ? "on" : ""} onClick={() => store.set({ stateView: "probability" })}>
            Probability
          </button>
        </div>
        <span className="sim-note" title="Real hardware never exposes all amplitudes in one measurement — this panel is a simulator privilege.">
          simulator view{s.n === 2 ? " · basis |q1 q0⟩ = |B A⟩" : ""}
        </span>
      </div>
      <div className="bars">
        {rows.map((r) => {
          const h = showProb ? r.mag2 : Math.sqrt(r.mag2);
          const neg = !showProb && Math.abs(r.phase) > Math.PI / 2 + 1e-9;
          const phaseDeg = Math.round((r.phase * 180) / Math.PI);
          return (
            <div key={r.i} className="bar-col" title={`amp ${r.re.toFixed(3)}${r.im >= 0 ? "+" : "−"}${Math.abs(r.im).toFixed(3)}i · P=${r.mag2.toFixed(3)} · phase ${phaseDeg}°`}>
              <div className="bar-area">
                <div className="bar-zero" />
                <div
                  className={`bar ${neg ? "neg" : "pos"}`}
                  style={
                    showProb
                      ? { height: `${h * 100}%`, bottom: "0%" }
                      : neg
                        ? { height: `${h * 50}%`, top: "50%" }
                        : { height: `${h * 50}%`, bottom: "50%" }
                  }
                />
              </div>
              <div className="bar-value mono">{showProb ? r.mag2.toFixed(2) : (neg ? "−" : "+") + Math.sqrt(r.mag2).toFixed(2)}</div>
              <div className="bar-label mono">|{basisLabel(r.i, s.n)}⟩</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MeasureTab({ d: _d }: { d: BenchDerived }): JSX.Element {
  const app = useApp();
  const r = app.shotResult;
  if (!r) return <p className="dock-note">Run shots from the left strip to sample fresh preparations of the final circuit.</p>;
  const stale = r.revision !== app.revision;
  const entries = Object.entries(r.counts).sort((a, b) => a[0].localeCompare(b[0]));
  const max = Math.max(...entries.map(([, c]) => c), 1);
  return (
    <div className="measure-tab">
      <p className="dock-note">
        {r.shots} shots · source: {r.source === "qiskit" ? "Qollab Simulator (Qiskit)" : "Local Preview"} · counts belong to the final circuit
        {stale && <strong className="stale"> — circuit edited since; run again</strong>}
      </p>
      <div className="hist">
        {entries.map(([label, c]) => (
          <div key={label} className="hist-row">
            <span className="mono hist-label">{label}</span>
            <div className="hist-bar" style={{ width: `${(c / max) * 100}%` }} />
            <span className="mono">{c}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ComponentTab(): JSX.Element {
  const app = useApp();
  // (BenchDerived not needed here: inspection reads the selection directly)
  const sel = app.selection;
  const node = sel?.kind === "node" ? app.graph.nodes.find((n) => n.id === sel.id) : null;
  const part = node ? store.registry.get(node.type) : null;
  const inspected = useMemo(() => {
    if (!part?.custom) return null;
    return part.custom;
  }, [part]);
  if (!node || !part) return <p className="dock-note">Select a part to inspect its name, port roles, underlying gates, and input assumptions.</p>;
  return (
    <div className="component-tab">
      <div className="component-info">
        <h4>{part.title}</h4>
        <p>{part.description}</p>
        <p className="mono">
          ports:{" "}
          {part.ports
            .map((p) => `${p.label || p.id} (${p.kind.startsWith("q") ? "quantum" : "classical"} ${p.kind.endsWith("in") ? "in" : "out"})`)
            .join(", ")}
        </p>
        {part.gate && <p className="mono">underlying gate: {part.gate}</p>}
        {inspected && (
          <>
            <p className="mono">
              {inspected.gateCost} primitive gates · assumes: {inspected.assumes} · v{inspected.version}
            </p>
            <p>{inspected.promise}</p>
          </>
        )}
        {node.fixture && <p className="fixture-note">Mission fixture — inspectable, not removable.</p>}
      </div>
      {inspected && (
        <div className="component-mini">
          <Canvas
            readOnly
            graphOverride={inspected.graph}
            derived={{
              activeNodeId: null,
              issuePorts: new Set(),
              issueNodes: new Set(),
              outReadings: new Map(),
              inValues: new Map(),
            }}
          />
        </div>
      )}
    </div>
  );
}
