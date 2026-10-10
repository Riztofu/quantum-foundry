/**
 * Completion overlay: passed tests, gate count, depth, unlocks, and the
 * Save as Component / Continue Building / Next Assignment actions.
 */
import { useState } from "react";
import { LEVELS } from "../model/levels";
import type { CustomComponentDef } from "../model/types";
import { isUnlocked, store, useApp } from "../state/store";
import type { BenchDerived } from "./Bench";

export function Overlay({ d }: { d: BenchDerived }): JSX.Element | null {
  const app = useApp();
  const { level, compiled, grade } = d;
  const [name, setName] = useState(level.savesComponent?.suggestedName ?? "");
  if (!app.overlay) return null;

  const alreadySaved = level.savesComponent
    ? app.components.some((c) => c.name === (name || level.savesComponent!.suggestedName))
    : false;

  const saveComponent = () => {
    const spec = level.savesComponent!;
    const finalName = (name || spec.suggestedName).trim().slice(0, 24);
    const graph = JSON.parse(JSON.stringify(app.graph)) as typeof app.graph;
    const hasCustom = graph.nodes.some((n) => store.registry.get(n.type)?.custom);
    if (hasCustom) {
      store.toast("Components must be built from primitive parts — this circuit contains a custom block.");
      return;
    }
    const def: CustomComponentDef = {
      id: `custom:${finalName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}:v1`,
      name: finalName,
      arity: spec.arity,
      graph,
      gateCost: compiled.gateCount,
      promise: spec.promise,
      assumes: spec.assumes,
      version: 1,
    };
    store.saveComponent(def);
    store.toast(`${finalName} saved to the Custom drawer.`);
  };

  const nextAssignment = () => {
    const next = LEVELS.find((l) => !app.completed.has(l.id) && isUnlocked(l.id, app.completed));
    if (next) store.openLevel(next.id);
    else store.backToMap();
  };

  const passCount = grade.cases.filter((c) => c.pass).length;

  return (
    <div className="overlay-backdrop" role="dialog" aria-label="Assignment complete">
      <div className="overlay">
        <h2>{app.demoMode ? "Demo circuit verified" : "Assignment complete"}</h2>
        <h3>
          {level.n > 0 ? `${level.n}. ` : ""}
          {level.title}
        </h3>
        <div className="overlay-stats">
          <div>
            <span className="big">{passCount}/{grade.cases.length}</span> tests passed
            {level.operatorCheck && grade.operatorPass && <div className="op-ok">full operation verified ✔</div>}
          </div>
          <div>
            <span className="big">{compiled.gateCount}</span> primitive gates
          </div>
          <div>
            <span className="big">{compiled.depth}</span> logical depth
          </div>
        </div>
        {!app.demoMode && (
          <p className="field-note">
            <strong>Field note:</strong> {level.fieldNote}
          </p>
        )}
        {!app.demoMode && level.unlocks.note && <p className="unlock-note">⬡ {level.unlocks.note}</p>}
        <div className="overlay-actions">
          {level.savesComponent && !app.demoMode && (
            <span className="save-group">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={level.savesComponent.suggestedName}
                maxLength={24}
                aria-label="Component name"
              />
              <button className="primary" onClick={saveComponent} disabled={alreadySaved}>
                {alreadySaved ? "Component saved ✔" : "Save as Component"}
              </button>
            </span>
          )}
          <button onClick={() => store.set({ overlay: null })}>Continue Building</button>
          {!app.demoMode && (
            <button className="primary" onClick={nextAssignment}>
              Next Assignment →
            </button>
          )}
          <button onClick={() => store.backToMap()}>Back to Map</button>
        </div>
        {level.savesComponent && !alreadySaved && !app.demoMode && (
          <p className="overlay-tip">
            Saving packages your actual circuit — ports mapped, {compiled.gateCount} gates inside, verified {level.savesComponent.assumes}.
          </p>
        )}
      </div>
    </div>
  );
}
