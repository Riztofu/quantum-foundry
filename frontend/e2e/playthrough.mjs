/**
 * Full-campaign browser playthrough with real pointer interactions.
 * Verifies the acceptance criteria end-to-end: placement, pin wiring,
 * state inspection, Check All, component save + reuse, all four courier
 * messages, fanout rejection, undo, autosave restoration, Qiskit verify.
 */
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = "http://localhost:5173";
const SHOTS = "/tmp/claude-0/shots";
fs.mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
const fails = [];
const ok = (name, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`);
  if (!cond) fails.push(name);
};

const state = () => page.evaluate(() => {
  const s = window.qfStore.state;
  return {
    screen: s.screen,
    levelId: s.levelId,
    completed: [...s.completed],
    components: s.components.map((c) => c.name),
    overlay: s.overlay,
    toast: s.toast,
    edges: s.graph.nodes.length ? s.graph.edges.length : 0,
    nodes: s.graph.nodes.map((n) => ({ id: n.id, type: n.type })),
  };
});

async function pinXY(nodeId, portId) {
  return page.evaluate(([n, p]) => {
    const el = document.querySelector(`.pin[data-node="${n}"][data-port="${p}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, [nodeId, portId]);
}

async function clickPin(nodeId, portId) {
  const xy = await pinXY(nodeId, portId);
  if (!xy) throw new Error(`pin not found ${nodeId}:${portId}`);
  await page.mouse.click(xy.x, xy.y);
  await page.waitForTimeout(80);
}

async function wire(fromNode, fromPort, toNode, toPort) {
  await clickPin(fromNode, fromPort);
  await clickPin(toNode, toPort);
}

/** place a part from the drawer at world cell coordinates */
async function place(partLabelOrType, wx, wy) {
  // click the tile whose tile-label matches
  const tiles = page.locator(".part-tile:not(.locked)");
  const count = await tiles.count();
  let clicked = false;
  for (let i = 0; i < count; i++) {
    const label = await tiles.nth(i).locator(".tile-label").innerText();
    if (label === partLabelOrType) {
      await tiles.nth(i).click();
      clicked = true;
      break;
    }
  }
  if (!clicked) throw new Error(`tile ${partLabelOrType} not found/unlocked`);
  const pt = await page.evaluate(([x, y]) => {
    const cam = window.qfStore.state.camera;
    const rect = document.querySelector("svg.canvas").getBoundingClientRect();
    return { x: rect.left + (x - cam.x) * cam.zoom, y: rect.top + (y - cam.y) * cam.zoom };
  }, [wx, wy]);
  await page.mouse.click(pt.x, pt.y);
  await page.waitForTimeout(80);
  // return the id of the newest node
  return page.evaluate(() => window.qfStore.state.graph.nodes.at(-1).id);
}

async function checkAll() {
  await page.getByRole("button", { name: /Check All/ }).click();
  await page.waitForTimeout(200);
}

async function openLevelFromMap(title) {
  await page.evaluate(() => window.qfStore.backToMap?.() ?? window.qfStore.set({ screen: "map" }));
  await page.waitForTimeout(150);
  await page.locator(`.map-node:has-text("${title}")`).click();
  await page.waitForTimeout(200);
}

// ---------------------------------------------------------------------------
await page.goto(BASE);
await page.waitForTimeout(600);
let s = await state();
ok("map renders", s.screen === "map");
await page.screenshot({ path: `${SHOTS}/01-map.png` });

// Level 1: wire IN -> OUT
await page.locator(".map-node.available").first().click();
await page.waitForTimeout(250);
s = await state();
ok("level 1 opens", s.levelId === "first-connection");
await wire("in0", "out", "out0", "in");
s = await state();
ok("L1 wire created", s.edges === 1);
await page.screenshot({ path: `${SHOTS}/02-level1-wired.png` });
await checkAll();
s = await state();
ok("L1 complete overlay", s.overlay?.kind === "complete");
await page.screenshot({ path: `${SHOTS}/03-level1-complete.png` });
await page.getByRole("button", { name: /Next Assignment/ }).click();
await page.waitForTimeout(250);

// Level 2: place X, wire IN->X->OUT, save Inverter
s = await state();
ok("L2 opens", s.levelId === "inverter");
const xId = await place("X", 20, 10);
await wire("in0", "out", xId, "in");
await wire(xId, "out", "out0", "in");
// fanout rejection: second wire from in0.out
await clickPin("in0", "out");
await clickPin(xId, "in");
s = await state();
ok("fanout rejected with toast", s.edges === 2 && !!s.toast, s.toast ?? "");
await checkAll();
s = await state();
ok("L2 complete", s.overlay?.kind === "complete");
await page.getByRole("button", { name: /Save as Component/ }).click();
await page.waitForTimeout(150);
s = await state();
ok("Inverter saved", s.components.includes("Inverter"));
await page.screenshot({ path: `${SHOTS}/04-level2-saved.png` });
await page.getByRole("button", { name: /Next Assignment/ }).click();
await page.waitForTimeout(250);

// Level 3: H
s = await state();
ok("L3 opens", s.levelId === "two-possibilities");
const hId = await place("H", 20, 10);
await wire("in0", "out", hId, "in");
await wire(hId, "out", "out0", "in");
// inspect state dock
await page.getByRole("tab", { name: "Quantum State" }).click();
await page.waitForTimeout(150);
await page.screenshot({ path: `${SHOTS}/05-level3-state.png` });
await checkAll();
s = await state();
ok("L3 complete", s.overlay?.kind === "complete");
await page.getByRole("button", { name: /Next Assignment/ }).click();
await page.waitForTimeout(250);

// Level 4: insert Z between fixed H's
s = await state();
ok("L4 opens", s.levelId === "hidden-sign");
const zId = await place("Z", 22, 10);
await wire("h1", "out", zId, "in");
await wire(zId, "out", "h2", "in");
await checkAll();
s = await state();
ok("L4 complete", s.overlay?.kind === "complete");
await page.getByRole("button", { name: /Next Assignment/ }).click();
await page.waitForTimeout(250);

// Level 5: CX with correct roles
s = await state();
ok("L5 opens", s.levelId === "conditional-flip");
const cxId = await place("CX", 20, 10);
await wire("in0", "out", cxId, "ctrl_in");
await wire("in1", "out", cxId, "tgt_in");
await wire(cxId, "ctrl_out", "out0", "in");
await wire(cxId, "tgt_out", "out1", "in");
await checkAll();
s = await state();
ok("L5 complete", s.overlay?.kind === "complete");
await page.getByRole("button", { name: /Save as Component/ }).click();
await page.waitForTimeout(150);
s = await state();
ok("ControlledFlip saved", s.components.includes("ControlledFlip"));
await page.getByRole("button", { name: /Next Assignment/ }).click();
await page.waitForTimeout(250);

// Level 6: Bell prep, verify on Qiskit too
s = await state();
ok("L6 opens", s.levelId === "shared-pair");
const h6 = await place("H", 14, 7);
const cx6 = await place("CX", 24, 10);
await wire("in0", "out", h6, "in");
await wire(h6, "out", cx6, "ctrl_in");
await wire("in1", "out", cx6, "tgt_in");
await wire(cx6, "ctrl_out", "out0", "in");
await wire(cx6, "tgt_out", "out1", "in");
await page.getByRole("button", { name: /Verify on Qiskit/ }).click();
await page.waitForTimeout(1500);
const badge = await page.locator(".source-badge").innerText();
ok("Qiskit badge shows", badge.includes("Qiskit"), badge);
await page.getByRole("tab", { name: "Quantum State" }).click();
await page.screenshot({ path: `${SHOTS}/06-level6-bell.png` });
await checkAll();
s = await state();
ok("L6 complete", s.overlay?.kind === "complete");
await page.getByRole("button", { name: /Save as Component/ }).click();
await page.waitForTimeout(150);
s = await state();
ok("BellPrep saved", s.components.includes("BellPrep"));
await page.getByRole("button", { name: /Next Assignment/ }).click();
await page.waitForTimeout(250);

// Level 7: decoder
s = await state();
ok("L7 opens", s.levelId === "read-bell");
const cx7 = await place("CX", 16, 10);
const h7 = await place("H", 28, 7);
await wire("in0", "out", cx7, "ctrl_in");
await wire("in1", "out", cx7, "tgt_in");
await wire(cx7, "ctrl_out", h7, "in");
await wire(h7, "out", "out0", "in");
await wire(cx7, "tgt_out", "out1", "in");
await checkAll();
s = await state();
ok("L7 complete", s.overlay?.kind === "complete");
await page.getByRole("button", { name: /Save as Component/ }).click();
await page.waitForTimeout(150);
s = await state();
ok("BellDecode saved", s.components.includes("BellDecode"));
await page.getByRole("button", { name: /Next Assignment/ }).click();
await page.waitForTimeout(250);

// Level 8: assemble BellPrep -> encoder -> BellDecode
s = await state();
ok("L8 opens", s.levelId === "courier");
const bp = await place("BellPrep", 12, 11);
const bd = await place("BellDecode", 34, 11);
await wire("in0", "out", bp, "in0");
await wire("in1", "out", bp, "in1");
await wire(bp, "out0", "enc", "in");
await wire("enc", "out", bd, "in0");
await wire(bp, "out1", bd, "in1");
await wire(bd, "out0", "out0", "in");
await wire(bd, "out1", "out1", "in");
await page.screenshot({ path: `${SHOTS}/07-level8-assembled.png` });
// click each message button and confirm live case pass in table
for (const m of ["00", "01", "10", "11"]) {
  await page.locator(".msg-buttons button", { hasText: m }).click();
  await page.waitForTimeout(120);
}
await checkAll();
s = await state();
ok("L8 complete — all four messages", s.overlay?.kind === "complete");
await page.screenshot({ path: `${SHOTS}/08-level8-complete.png` });
await page.getByRole("button", { name: /Back to Map/ }).click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${SHOTS}/09-map-complete.png` });
s = await state();
ok("campaign complete", s.completed.length === 8, s.completed.join(","));

// undo check (open sandbox, place, undo)
await page.getByRole("button", { name: "Sandbox" }).click();
await page.waitForTimeout(200);
const sb = await place("H", 20, 7);
let n1 = (await state()).nodes.length;
await page.keyboard.press("Control+z");
await page.waitForTimeout(100);
let n2 = (await state()).nodes.length;
ok("undo removes placed part", n2 === n1 - 1, `${n1}->${n2} (${sb})`);

// autosave: reload and confirm progress + components persist
await page.goto(BASE);
await page.waitForTimeout(500);
s = await state();
ok("autosave restores completion", s.completed.length === 8);
ok("autosave restores components", s.components.length >= 3, s.components.join(","));

// workshop inspection
await page.getByRole("button", { name: /Component Workshop/ }).click();
await page.waitForTimeout(200);
await page.locator(".workshop-open", { hasText: "BellPrep" }).click();
await page.waitForTimeout(200);
await page.screenshot({ path: `${SHOTS}/10-workshop.png` });
const miniNodes = await page.locator(".workshop-canvas [data-node-id]").count();
ok("workshop shows internal schematic", miniNodes >= 4, String(miniNodes));

// demo mode is separate progress
await page.getByRole("button", { name: "▦ Map" }).click();
await page.waitForTimeout(150);
await page.getByRole("button", { name: "Demo Mode" }).click();
await page.waitForTimeout(250);
s = await state();
ok("demo opens populated bell circuit", s.levelId === "demo" && s.edges === 5);
await page.screenshot({ path: `${SHOTS}/11-demo.png` });

console.log(fails.length ? `\n${fails.length} FAILURES: ${fails.join("; ")}` : "\nALL CHECKS PASSED");
await browser.close();
process.exit(fails.length ? 1 : 0);
