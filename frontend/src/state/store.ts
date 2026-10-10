/**
 * App store: one external store + useSyncExternalStore. Holds campaign
 * progress, the open circuit (with undo/redo), editor tool state, execution
 * state, and the custom-component library. Persists to localStorage.
 */
import { useSyncExternalStore } from "react";
import type {
  CircuitGraph,
  CustomComponentDef,
  LevelDef,
  PortRef,
} from "../model/types";
import { PartRegistry } from "../model/parts";
import { LEVELS, LEVEL_BY_ID } from "../model/levels";

export type Screen = "map" | "bench" | "workshop";
export type Tool = "select" | "wire";

export interface Selection {
  kind: "node" | "edge";
  id: string;
}

export interface WireDraft {
  from: PortRef;
}

export interface Camera {
  x: number; // world cell offset of viewport origin
  y: number;
  zoom: number; // px per cell
}

export interface ShotResult {
  counts: Record<string, number>;
  shots: number;
  revision: number;
  source: "local" | "qiskit";
}

export interface QiskitVerdict {
  revision: number;
  allPass: boolean;
  summary: string;
}

interface SaveFile {
  schema: 1;
  completed: string[];
  journal: string[];
  components: CustomComponentDef[];
  circuits: Record<string, CircuitGraph>;
  demoCompleted?: boolean;
}

export interface AppState {
  screen: Screen;
  levelId: string | null; // level id, or "sandbox", or "demo"
  demoMode: boolean;
  graph: CircuitGraph;
  undoStack: CircuitGraph[];
  redoStack: CircuitGraph[];
  revision: number; // bumps on every graph edit; ties async results to circuits
  tool: Tool;
  selection: Selection | null;
  wireDraft: WireDraft | null;
  placing: string | null; // part type being placed (ghost follows pointer)
  camera: Camera;
  testIndex: number;
  message: string; // courier message for free-run
  execStep: number | null; // null = show final; otherwise snapshot index
  playing: boolean;
  shotCount: 128 | 512 | 1024;
  shotResult: ShotResult | null;
  qiskitVerdict: QiskitVerdict | null;
  hintsRevealed: number;
  dockTab: "tests" | "state" | "measure" | "component";
  stateView: "amplitude" | "probability";
  completed: Set<string>;
  journal: string[]; // level ids whose field notes are collected
  components: CustomComponentDef[];
  circuits: Record<string, CircuitGraph>;
  overlay: null | { kind: "complete"; levelId: string } | { kind: "save-component"; levelId: string };
  inspectComponent: string | null; // component id open in workshop
  toast: string | null;
  toastKind: "warn" | "ok";
}

const SAVE_KEY = "quantum-foundry-save-v1";

const cloneGraph = (g: CircuitGraph): CircuitGraph => JSON.parse(JSON.stringify(g));

function loadSave(): SaveFile {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const s = JSON.parse(raw) as SaveFile;
      if (s.schema === 1) return s;
    }
  } catch {
    /* fresh save */
  }
  return { schema: 1, completed: [], journal: [], components: [], circuits: {} };
}

function persist(state: AppState): void {
  try {
    const file: SaveFile = {
      schema: 1,
      completed: [...state.completed],
      journal: state.journal,
      components: state.components,
      circuits: state.circuits,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(file));
  } catch {
    /* storage unavailable; play on in memory */
  }
}

function initialState(): AppState {
  const save = loadSave();
  return {
    screen: "map",
    levelId: null,
    demoMode: false,
    graph: { nodes: [], edges: [] },
    undoStack: [],
    redoStack: [],
    revision: 0,
    tool: "select",
    selection: null,
    wireDraft: null,
    placing: null,
    camera: { x: 0, y: 0, zoom: 18 },
    testIndex: 0,
    message: "00",
    execStep: null,
    playing: false,
    shotCount: 512,
    shotResult: null,
    qiskitVerdict: null,
    hintsRevealed: 0,
    dockTab: "tests",
    stateView: "amplitude",
    completed: new Set(save.completed),
    journal: save.journal,
    components: save.components,
    circuits: save.circuits,
    overlay: null,
    inspectComponent: null,
    toast: null,
    toastKind: "warn",
  };
}

type Listener = () => void;

class Store {
  state: AppState = initialState();
  private listeners = new Set<Listener>();
  registry: PartRegistry = new PartRegistry(this.state.components);

  subscribe = (fn: Listener): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getState = (): AppState => this.state;

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  set(partial: Partial<AppState>, opts: { persist?: boolean } = {}): void {
    this.state = { ...this.state, ...partial };
    if (opts.persist) persist(this.state);
    this.emit();
  }

  /** mutate the graph with undo support */
  editGraph(mutate: (g: CircuitGraph) => CircuitGraph | void, clearExec = true): void {
    const before = cloneGraph(this.state.graph);
    const draft = cloneGraph(this.state.graph);
    const result = mutate(draft) ?? draft;
    const circuits = { ...this.state.circuits };
    if (this.state.levelId && !this.state.demoMode) circuits[this.state.levelId] = result;
    this.set(
      {
        graph: result,
        undoStack: [...this.state.undoStack.slice(-63), before],
        redoStack: [],
        revision: this.state.revision + 1,
        shotResult: null,
        qiskitVerdict: null,
        circuits,
        ...(clearExec ? { execStep: null, playing: false } : {}),
      },
      { persist: !this.state.demoMode },
    );
  }

  undo(): void {
    const prev = this.state.undoStack.at(-1);
    if (!prev) return;
    const circuits = { ...this.state.circuits };
    if (this.state.levelId && !this.state.demoMode) circuits[this.state.levelId] = prev;
    this.set(
      {
        graph: prev,
        undoStack: this.state.undoStack.slice(0, -1),
        redoStack: [...this.state.redoStack, cloneGraph(this.state.graph)],
        revision: this.state.revision + 1,
        selection: null,
        shotResult: null,
        qiskitVerdict: null,
        execStep: null,
        circuits,
      },
      { persist: true },
    );
  }

  redo(): void {
    const next = this.state.redoStack.at(-1);
    if (!next) return;
    const circuits = { ...this.state.circuits };
    if (this.state.levelId && !this.state.demoMode) circuits[this.state.levelId] = next;
    this.set(
      {
        graph: next,
        redoStack: this.state.redoStack.slice(0, -1),
        undoStack: [...this.state.undoStack, cloneGraph(this.state.graph)],
        revision: this.state.revision + 1,
        selection: null,
        shotResult: null,
        qiskitVerdict: null,
        execStep: null,
        circuits,
      },
      { persist: true },
    );
  }

  openLevel(levelId: string, demo = false): void {
    const level = LEVEL_BY_ID.get(levelId);
    let graph: CircuitGraph;
    if (demo) {
      graph = demoGraph();
    } else if (this.state.circuits[levelId]) {
      graph = cloneGraph(this.state.circuits[levelId]);
      if (level) graph = reconcileFixtures(graph, level);
    } else if (level) {
      graph = cloneGraph(level.fixtures);
    } else {
      graph = { nodes: [], edges: [] }; // sandbox
      graph = sandboxGraph();
    }
    this.set({
      screen: "bench",
      levelId,
      demoMode: demo,
      graph,
      undoStack: [],
      redoStack: [],
      revision: this.state.revision + 1,
      selection: null,
      wireDraft: null,
      placing: null,
      testIndex: 0,
      message: "00",
      execStep: null,
      playing: false,
      shotResult: null,
      qiskitVerdict: null,
      hintsRevealed: 0,
      dockTab: "tests",
      overlay: null,
      camera: { x: -2, y: 0, zoom: 18 },
      toast: null,
    });
  }

  backToMap(): void {
    // per-mission circuit already persisted on each edit
    this.set({ screen: "map", overlay: null, playing: false, toast: null });
  }

  completeLevel(levelId: string): void {
    const completed = new Set(this.state.completed);
    const first = !completed.has(levelId);
    completed.add(levelId);
    const journal = this.state.journal.includes(levelId) ? this.state.journal : [...this.state.journal, levelId];
    if (this.state.demoMode) {
      // demo progress never marks the campaign
      this.set({ overlay: { kind: "complete", levelId } });
      return;
    }
    this.set({ completed, journal, overlay: { kind: "complete", levelId } }, { persist: true });
    void first;
  }

  saveComponent(def: CustomComponentDef): void {
    const existing = this.state.components.filter((c) => c.name !== def.name);
    const components = [...existing, def];
    this.registry = new PartRegistry(components);
    this.set({ components, overlay: { kind: "complete", levelId: this.state.levelId! } }, { persist: true });
  }

  toast(msg: string, kind: "warn" | "ok" = "warn"): void {
    this.set({ toast: msg, toastKind: kind });
    setTimeout(() => {
      if (this.state.toast === msg) this.set({ toast: null });
    }, 3200);
  }
}

/** keep mission fixtures authoritative even against stale saves */
function reconcileFixtures(saved: CircuitGraph, level: LevelDef): CircuitGraph {
  const g = cloneGraph(saved);
  for (const fx of level.fixtures.nodes) {
    const existing = g.nodes.find((n) => n.id === fx.id);
    if (!existing) g.nodes.push({ ...fx });
    else Object.assign(existing, { type: fx.type, fixture: true, qubit: fx.qubit });
  }
  for (const fe of level.fixtures.edges) {
    if (!g.edges.find((e) => e.id === fe.id)) g.edges.push({ ...fe });
  }
  return g;
}

/** Demo Mode: a populated Bell-pair circuit for presentations. */
function demoGraph(): CircuitGraph {
  return {
    nodes: [
      { id: "in0", type: "IN", x: 3, y: 7, fixture: true, qubit: 0, value: 0 },
      { id: "in1", type: "IN", x: 3, y: 16, fixture: true, qubit: 1, value: 0 },
      { id: "h", type: "H", x: 14, y: 7 },
      { id: "cx", type: "CX", x: 24, y: 10 },
      { id: "out0", type: "OUT", x: 42, y: 7, fixture: true },
      { id: "out1", type: "OUT", x: 42, y: 16, fixture: true },
    ],
    edges: [
      { id: "e0", from: { node: "in0", port: "out" }, to: { node: "h", port: "in" } },
      { id: "e1", from: { node: "h", port: "out" }, to: { node: "cx", port: "ctrl_in" } },
      { id: "e2", from: { node: "in1", port: "out" }, to: { node: "cx", port: "tgt_in" } },
      { id: "e3", from: { node: "cx", port: "ctrl_out" }, to: { node: "out0", port: "in" } },
      { id: "e4", from: { node: "cx", port: "tgt_out" }, to: { node: "out1", port: "in" } },
    ],
  };
}

function sandboxGraph(): CircuitGraph {
  return {
    nodes: [
      { id: "in0", type: "IN", x: 3, y: 7, fixture: true, qubit: 0, value: 0 },
      { id: "in1", type: "IN", x: 3, y: 16, fixture: true, qubit: 1, value: 0 },
      { id: "out0", type: "OUT", x: 44, y: 7, fixture: true },
      { id: "out1", type: "OUT", x: 44, y: 16, fixture: true },
    ],
    edges: [],
  };
}

export const SANDBOX_LEVEL: LevelDef = {
  id: "sandbox",
  n: 0,
  title: "Sandbox",
  group: "Foundations",
  contract: "Free build — two qubits, every unlocked part, no contract.",
  briefing: ["The open bench. Wire anything; the state dock always tells the truth."],
  fieldNote: "",
  numQubits: 2,
  palette: ["X", "H", "Z", "CX"],
  fixtures: sandboxGraph(),
  tests: [
    { id: "t0", label: "input A=0 B=0", inputs: [0, 0], expect: { type: "state", amps: [[1, 0], [0, 0], [0, 0], [0, 0]], descr: "free run" } },
  ],
  prereqs: [],
  unlocks: {},
};

export const DEMO_LEVEL: LevelDef = {
  ...SANDBOX_LEVEL,
  id: "demo",
  title: "Demo — Bell Pair",
  contract: "Presentation demo: a prepared Bell-pair circuit, separate from campaign progress.",
  briefing: ["Demo Mode uses separate progress and never marks the campaign complete."],
  tests: [
    {
      id: "t0",
      label: "input |00⟩",
      inputs: [0, 0],
      expect: {
        type: "state",
        amps: [[Math.SQRT1_2, 0], [0, 0], [0, 0], [Math.SQRT1_2, 0]],
        descr: "(|00⟩+|11⟩)/√2",
      },
    },
  ],
};

export function levelFor(state: AppState): LevelDef | null {
  if (!state.levelId) return null;
  if (state.levelId === "sandbox") return SANDBOX_LEVEL;
  if (state.levelId === "demo") return DEMO_LEVEL;
  return LEVEL_BY_ID.get(state.levelId) ?? null;
}

export function isUnlocked(levelId: string, completed: Set<string>): boolean {
  const level = LEVEL_BY_ID.get(levelId);
  if (!level) return false;
  return level.prereqs.every((p) => completed.has(p));
}

export function unlockedParts(completed: Set<string>): Set<string> {
  const parts = new Set<string>(["IN", "OUT"]);
  for (const l of LEVELS) {
    if (completed.has(l.id) && l.unlocks.parts) for (const p of l.unlocks.parts) parts.add(p);
  }
  // X is unlocked by completing level 1; before that only wiring exists
  return parts;
}

export const store = new Store();

// debug/test handle (also handy in the judges' console)
if (typeof window !== "undefined") {
  (window as unknown as { qfStore: Store }).qfStore = store;
}

export function useApp(): AppState {
  return useSyncExternalStore(store.subscribe, store.getState);
}
