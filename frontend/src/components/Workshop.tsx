/**
 * Component workshop: name, inspect, and reopen player-built modules, using
 * the same schematic renderer so the circuit inside a block is visible.
 */
import { useState } from "react";
import { store, useApp } from "../state/store";
import { Canvas } from "./Canvas";

export function Workshop(): JSX.Element {
  const app = useApp();
  const [renaming, setRenaming] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const open = app.inspectComponent
    ? app.components.find((c) => c.id === app.inspectComponent) ?? null
    : app.components[0] ?? null;

  const rename = (id: string) => {
    const name = newName.trim().slice(0, 24);
    if (!name) return;
    const components = app.components.map((c) => (c.id === id ? { ...c, name } : c));
    store.registry = new (store.registry.constructor as new (cs: typeof components) => typeof store.registry)(components);
    store.set({ components }, { persist: true });
    setRenaming(null);
  };

  return (
    <div className="workshop">
      <header className="workshop-head">
        <button onClick={() => store.set({ screen: "map" })}>▦ Map</button>
        <h2>Component Workshop</h2>
      </header>
      <div className="workshop-body">
        <aside className="workshop-list">
          {app.components.length === 0 && (
            <p className="dock-note">No components yet. Finish "The Inverter" and save your first block.</p>
          )}
          {app.components.map((c) => (
            <div key={c.id} className={`workshop-item ${open?.id === c.id ? "on" : ""}`}>
              <button className="workshop-open" onClick={() => store.set({ inspectComponent: c.id })}>
                <strong>{c.name}</strong>
                <span className="mono">
                  {c.arity}q · {c.gateCost} gates · v{c.version}
                </span>
              </button>
              {renaming === c.id ? (
                <span className="rename-row">
                  <input value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={24} aria-label="New name" />
                  <button onClick={() => rename(c.id)}>Save</button>
                </span>
              ) : (
                <button
                  className="rename-btn"
                  onClick={() => {
                    setRenaming(c.id);
                    setNewName(c.name);
                  }}
                >
                  rename
                </button>
              )}
            </div>
          ))}
        </aside>
        <main className="workshop-detail">
          {open ? (
            <>
              <div className="workshop-meta">
                <h3>{open.name}</h3>
                <p>{open.promise}</p>
                <p className="mono">
                  assumes: {open.assumes} · {open.gateCost} primitive gates · saved definitions stay stable (v{open.version})
                </p>
              </div>
              <div className="workshop-canvas">
                <Canvas
                  readOnly
                  graphOverride={open.graph}
                  derived={{
                    activeNodeId: null,
                    issuePorts: new Set(),
                    issueNodes: new Set(),
                    outReadings: new Map(),
                    inValues: new Map(),
                  }}
                />
              </div>
            </>
          ) : (
            <p className="dock-note">Select a component to see the circuit inside.</p>
          )}
        </main>
      </div>
    </div>
  );
}
