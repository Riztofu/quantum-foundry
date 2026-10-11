(function () {
  'use strict';
  const C = window.FoundryCore, L = window.FoundryLessons, $ = id => document.getElementById(id), esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const KEY = 'quantum-foundry-offline-v3';
  const totalMissions = C.levels.filter(l => l.number).length;
  const fresh = () => ({ format: 'quantum-foundry-project', version: 3, current: 'link', lastView: 'map', progress: {}, modules: [], circuits: {}, sandboxes: {}, cameras: {}, inputs: {}, hints: {}, briefings: {}, best: {}, ionqRuns: [], seenPrimer: false, settings: { shots: 512, dock: 172, dockCollapsed: false, partsCollapsed: false, layout: 1, sandboxQubits: 2, music: true, volume: .22, track: 'km-monkeys', chapter: 0 } });
  const levelFor = (id, p) => id === 'sandbox' ? { ...C.getLevel(id), qubits: p.settings.sandboxQubits } : C.getLevel(id);
  // ── Saved IonQ runs ─ optional in saves; older saves simply have none. Malformed entries are dropped,
  // never the whole save, and older game versions ignore the field when importing a newer save.
  const MAX_SAVED_RUNS = 30, RUN_STATUSES = ['submitted', 'queued', 'validating', 'running', 'done', 'cancelled', 'failed'];
  function cleanIonqRun(r) {
    const text = (v, max) => typeof v === 'string' && v.length <= max ? v : null, finite = v => typeof v === 'number' && Number.isFinite(v);
    if (!r || typeof r !== 'object' || !text(r.job_id, 128) || !/^[A-Za-z0-9._:-]+$/.test(r.job_id)) return null;
    const qubits = r.qubits, labels = r.labels;
    if (!Number.isInteger(qubits) || qubits < 1 || qubits > C.LIMITS.qubits || !Array.isArray(labels) || !labels.length || labels.length > 16 || !labels.every(l => text(l, 80) !== null)) return null;
    if (!Number.isInteger(r.shots) || r.shots < 1 || r.shots > 100000 || !RUN_STATUSES.includes(r.status) || !finite(r.created)) return null;
    const run = { job_id: r.job_id, name: text(r.name, 120) || 'IonQ job', target: text(r.target, 80) || 'ionq', target_label: text(r.target_label, 80) || 'IonQ', paid: r.paid === true, labels: [...labels], qubits, shots: r.shots, error_mitigation: r.error_mitigation === true, created: r.created, status: r.status };
    const bitsKey = new RegExp('^[01]{' + qubits + '}$');
    if (Array.isArray(r.counts) && r.counts.length === labels.length && r.counts.every(t => t && typeof t === 'object' && Object.entries(t).every(([k, v]) => bitsKey.test(k) && Number.isInteger(v) && v >= 0 && v <= 1e7))) run.counts = r.counts.map(t => ({ ...t }));
    else if (run.status === 'done') return null;
    if (Array.isArray(r.ideal) && r.ideal.length === labels.length && r.ideal.every(a => Array.isArray(a) && a.length === 2 ** qubits && a.every(v => finite(v) && v >= 0 && v <= 1))) run.ideal = r.ideal.map(a => [...a]);
    if (text(r.error, 300)) run.error = r.error;
    if (finite(r.execution_seconds) && r.execution_seconds >= 0) run.execution_seconds = r.execution_seconds;
    if (text(r.levelTitle, 80)) run.levelTitle = r.levelTitle;
    if (C.getLevel(r.levelId)) run.levelId = r.levelId;
    return run;
  }
  function validateProject(raw) {
    if (!raw || raw.format !== 'quantum-foundry-project' || raw.version !== 3 || !Array.isArray(raw.modules) || raw.modules.length > C.LIMITS.modules) throw Error('Choose a Quantum Foundry project backup (version 3).');
    const p = fresh(), ids = new Set();
    if (Number.isInteger(raw.settings?.sandboxQubits) && raw.settings.sandboxQubits >= 1 && raw.settings.sandboxQubits <= C.LIMITS.qubits) p.settings.sandboxQubits = raw.settings.sandboxQubits;
    p.modules = raw.modules.map(m => {
      if (typeof m.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(m.id) || ids.has(m.id) || typeof m.name !== 'string' || m.name.length < 1 || m.name.length > 32 || !C.moduleContract(m)) throw Error('The backup contains an invalid saved component.');
      ids.add(m.id); return { ...C.clone(m), gates: C.expandGates(m.gates) };
    });
    for (const m of p.modules) {
      if (!m.graph || m.graph.nodes.some(n => n.moduleId === m.id)) throw Error('Saved components cannot contain themselves.');
      const compiled = C.compile(m.graph, p.modules, m.qubits);
      if (C.operatorScore(compiled.gates, m.gates, m.qubits) < 1 - C.EPS) throw Error('A saved component does not match the circuit inside it.');
    }
    for (const base of C.levels) {
      const level = levelFor(base.id, p);
      const graph = raw.circuits?.[level.id];
      if (graph) { C.validateShape(graph, p.modules, level.qubits); C.validateFixtures(graph, level, p.modules); p.circuits[level.id] = C.clone(graph); }
      if (raw.progress?.[level.id] === true && level.id !== 'sandbox') p.progress[level.id] = true;
      const best = raw.best?.[level.id]; if (best && Number.isInteger(best.count) && Number.isInteger(best.depth) && best.count >= 0 && best.count <= C.LIMITS.gates && best.depth >= 0 && best.depth <= C.LIMITS.gates) p.best[level.id] = { count: best.count, depth: best.depth };
      const camera = raw.cameras?.[level.id];
      if (camera && [camera.x, camera.y, camera.zoom].every(Number.isFinite) && camera.zoom >= .3 && camera.zoom <= 2 && Math.abs(camera.x) < 100000 && Math.abs(camera.y) < 100000) p.cameras[level.id] = C.clone(camera);
      p.hints[level.id] = Math.max(0, Math.min(10, Number(raw.hints?.[level.id]) || 0));
      p.briefings[level.id] = raw.briefings?.[level.id] === true;
      p.seenPrimer = p.seenPrimer || raw.seenPrimer === true;
      const input = raw.inputs?.[level.id];
      p.inputs[level.id] = Number.isInteger(input) && input >= 0 && input < C.cases(level).length ? input : 0;
    }
    for (let n = 1; n <= C.LIMITS.qubits; n++) {
      const saved = raw.sandboxes?.[n];
      if (saved) { const sandbox = { ...C.getLevel('sandbox'), qubits: n }; C.validateShape(saved, p.modules, n); C.validateFixtures(saved, sandbox, p.modules); p.sandboxes[n] = C.clone(saved); }
    }
    if (p.circuits.sandbox) p.sandboxes[p.settings.sandboxQubits] = C.clone(p.circuits.sandbox);
    const candidate = C.getLevel(raw.current);
    if (candidate && C.available(candidate, p.progress, p.modules)) p.current = candidate.id;
    p.lastView = raw.lastView === 'workbench' ? 'workbench' : 'map';
    if ([128, 512, 1024].includes(raw.settings?.shots)) p.settings.shots = raw.settings.shots;
    p.settings.dock = Math.min(420, Math.max(130, Number(raw.settings?.dock) || 172));
    if (raw.settings?.layout !== 1) p.settings.dock = Math.min(172, p.settings.dock);
    p.settings.dockCollapsed = raw.settings?.dockCollapsed === true;
    p.settings.partsCollapsed = raw.settings?.partsCollapsed === true;
    p.settings.music = raw.settings?.music !== false;
    if (Number.isFinite(raw.settings?.volume)) p.settings.volume = Math.max(0, Math.min(.6, raw.settings.volume));
    if (window.FoundryAudio.tracks[raw.settings?.track]) p.settings.track = raw.settings.track;
    p.settings.chapter = raw.settings?.chapter === 1 ? 1 : 0;
    p.ionqRuns = Array.isArray(raw.ionqRuns) ? raw.ionqRuns.slice(0, MAX_SAVED_RUNS).map(cleanIonqRun).filter(Boolean) : [];
    if (typeof raw.settings?.ionqTarget === 'string' && /^[a-z0-9.@_-]{1,60}$/.test(raw.settings.ionqTarget)) p.settings.ionqTarget = raw.settings.ionqTarget;
    return p;
  }
  let project = fresh(), storageOK = true, restoreWarning = '';
  try { const saved = localStorage.getItem(KEY); if (saved) project = validateProject(JSON.parse(saved)); localStorage.setItem(KEY, JSON.stringify(project)); } catch (error) { storageOK = false; restoreWarning = 'Browser saving is unavailable here (for example inside Qollab) or a previous save could not be read. Use 💾 Save on the map (or Menu → Download backup) to keep your work, and Import save to continue later.'; }
  let level = levelFor(project.current, project), graph = C.clone(project.circuits[level.id] || C.starter(level.id, level.qubits)), camera = C.clone(project.cameras[level.id] || { x: 0, y: 0, zoom: 1 });
  let selected = null, placement = null, pendingWire = null, mode = 'select', pointer = { x: 500, y: 160 }, drag = null, spaceDown = false, undo = [], redo = [], activeTab = 'tests', caseIndex = project.inputs[level.id] || 0, stepIndex = 0, result = null, counts = null, compiled = null, trace = [], graphError = null, interval = null, toastTimer = null, modalFocus = null, uid = Date.now();
  let lessonPage = 0, exampleStep = 0, exampleInput = 0, attempted = false, countsEngine = 'random sampling';
  let qiskitVerdict = null, verifying = false;
  const svg = $('canvas');
  const source = () => C.cases(level)[caseIndex] || C.cases(level)[0];
  const modules = () => project.modules;
  const audio = window.FoundryAudio.create({ enabled: project.settings.music, volume: project.settings.volume, track: project.settings.track, onState: renderAudio });
  (function populateTrackMenu() {
    const A = window.FoundryAudio;
    $('music-track').innerHTML = `<optgroup label="Kevin MacLeod · CC BY">${A.playlist.map(id => `<option value="${id}">${esc(A.tracks[id].title)}</option>`).join('')}</optgroup><optgroup label="Original score">${Object.keys(A.scores).map(id => `<option value="${id}">${esc(A.tracks[id].title)}</option>`).join('')}</optgroup>`;
  })();
  function renderAudio() {
    const s = audio.status(), text = !s.available ? 'Audio unavailable in this browser' : s.playing ? 'Playing ' + s.title + (s.credit ? ' — ' + s.credit : '') : !s.enabled ? 'Music muted' : 'Click ♫ or Build circuit to start music';
    for (const id of ['music-toggle', 'map-music']) { $(id).setAttribute('aria-pressed', String(s.playing)); $(id).setAttribute('aria-label', s.playing ? 'Mute music' : 'Start music'); $(id).title = text; $(id).classList.toggle('active', s.playing); }
    $('map-music').textContent = s.playing ? '♫ Music on' : '♫ Music off'; $('music-toggle').textContent = s.enabled ? '♫' : '♪';
    $('music-status').textContent = s.note || text; $('music-track').value = s.track; $('music-volume').value = String(Math.round(s.volume * 100)); $('music-volume-label').textContent = Math.round(s.volume * 100) + '%';
  }
  function ensureMusic() { if (project.settings.music) audio.start(); }
  async function toggleMusic() {
    const enable = !audio.status().playing; project.settings.music = enable; audio.setEnabled(enable);
    if (enable && !await audio.start()) notify('Audio could not start. Try the music button in Safari or Chrome.'); persist(); renderAudio();
  }
  // Terminals are fixed in role and wiring but may be dragged; other fixtures stay where the experiment puts them.
  const movable = node => !node.locked || node.type === 'INPUT' || node.type === 'OUTPUT';
  function nextId(prefix) { let id; do { id = prefix + (++uid); } while (graph.nodes.some(n => n.id === id) || modules().some(m => m.id === id)); return id; }
  function persist() {
    project.current = level.id; project.circuits[level.id] = C.clone(graph); project.cameras[level.id] = C.clone(camera);
    if (level.id === 'sandbox') project.sandboxes[level.qubits] = C.clone(graph);
    if (storageOK) try { localStorage.setItem(KEY, JSON.stringify(project)); } catch { storageOK = false; notify('Browser storage is full or disabled. Download a Backup to keep your work.'); }
    $('save-status').textContent = storageOK ? 'Saved locally' : 'Use Backup to save'; $('save-status').style.color = storageOK ? 'var(--green)' : 'var(--orange)';
  }
  function notify(text) { $('toast').textContent = text; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4200); $('status-text').textContent = text; }
  function pause() { if (interval) clearInterval(interval); interval = null; $('play').textContent = '▶ Play'; }
  function invalidate() { pause(); attempted = false; stepIndex = 0; result = null; counts = null; compute(); }
  function compute() {
    compiled = null; trace = []; graphError = null;
    try { C.validateFixtures(graph, level, modules()); compiled = C.compile(graph, modules(), level.qubits, source().message); trace = C.evolve(compiled.gates, level.qubits, source().initial).trace; stepIndex = Math.min(stepIndex, compiled.gates.length); }
    catch (e) { graphError = { message: e.message, nodeId: e.nodeId }; }
  }
  function commit(next, message = '') {
    undo.push(C.clone(graph)); if (undo.length > 80) undo.shift(); redo = []; graph = next; pendingWire = null;
    invalidate(); persist(); render(); if (message) notify(message);
  }
  function history(direction) {
    const from = direction === 'undo' ? undo : redo, to = direction === 'undo' ? redo : undo;
    if (!from.length) return; to.push(C.clone(graph)); graph = from.pop(); selected = null; pendingWire = null; placement = null; invalidate(); persist(); render();
  }
  function chooseCase(index) { pause(); caseIndex = index; project.inputs[level.id] = index; stepIndex = 0; counts = null; compute(); render(); persist(); }
  // On-screen size ÷ layout size: 1 normally, the stage scale when an embedding (the Qollab build) scales the whole page.
  const uiScale = () => { const b = svg.getBoundingClientRect(); return svg.clientWidth && b.width ? b.width / svg.clientWidth : 1; };
  const layoutHeight = el => el.clientHeight || el.getBoundingClientRect().height;
  function worldPoint(event) { const b = svg.getBoundingClientRect(), s = uiScale(); return { x: ((event.clientX - b.left) / s - camera.x) / camera.zoom, y: ((event.clientY - b.top) / s - camera.y) / camera.zoom }; }
  function geometry(node, pool = modules()) { const a = C.arity(node, pool); return { w: 96, h: 80 + (a - 1) * 120 }; }
  function pin(node, dir, port, pool = modules()) { return { x: node.x + (dir === 'out' ? geometry(node, pool).w : 0), y: node.y + 40 + port * 120 }; }
  function route(a, b) {
    if (b.x >= a.x + 30) { const mid = Math.round((a.x + b.x) / 2); return `M ${a.x} ${a.y} H ${mid} V ${b.y} H ${b.x}`; }
    const y = Math.max(a.y, b.y) + 65; return `M ${a.x} ${a.y} H ${a.x + 35} V ${y} H ${b.x - 35} V ${b.y} H ${b.x}`;
  }
  function nodeSVG(node, pool = modules(), options = {}) {
    const a = C.arity(node, pool), { w, h } = geometry(node, pool), p = C.ports(node, pool), m = node.type === 'MODULE' ? pool.find(m => m.id === node.moduleId) : null;
    const name = m ? m.name : node.label || ({ CX: 'CNOT', ENCODE: 'ENCODE', TRANSFER: 'SEND A' }[node.type] || node.type);
    const cls = ['node', node.locked ? 'fixed' : '', node.type.toLowerCase(), !options.readonly && selected?.type === 'node' && selected.id === node.id ? 'selected' : '', !options.readonly && compiled?.gates[stepIndex - 1]?.nodeId === node.id ? 'executing' : '', !options.readonly && attempted && graphError?.nodeId === node.id ? 'problem' : ''].join(' ');
    let html = `<g class="${cls}" data-node="${esc(node.id)}" transform="translate(${node.x} ${node.y})"><title>${esc(name)}${node.locked ? movable(node) ? ' · fixed terminal · drag to move' : ' · fixed assignment part' : ''}</title><rect class="node-body node-handle" x="0" y="0" width="${w}" height="${h}" rx="1"/>`;
    if (node.type === 'CX') {
      html += '<path class="gate-symbol" d="M 48 46 V 82 M 48 120 V 149 M 39 160 H 57 M 48 151 V 169"/><circle class="gate-symbol-dot" cx="48" cy="40" r="4"/><circle class="gate-symbol" cx="48" cy="160" r="12"/><text class="node-small-label" x="48" y="101" text-anchor="middle">CNOT</text><text class="node-meta" x="48" y="115" text-anchor="middle">CONTROL → TARGET</text>';
    } else if (m) {
      let lines = [name];
      if (name.length > 13) {
        const spaced = name.replace(/([a-z])([A-Z])/g, '$1 $2'), words = spaced.split(/\s+/); lines = [''];
        for (const word of words) { if (lines[lines.length - 1] && lines[lines.length - 1].length + word.length + 1 > 13) lines.push(''); if (word.length > 13) { if (lines[lines.length - 1]) lines.push(''); for (let i = 0; i < word.length; i += 13) { if (i) lines.push(''); lines[lines.length - 1] = word.slice(i, i + 13); } } else lines[lines.length - 1] += (lines[lines.length - 1] ? ' ' : '') + word; }
        if (lines.length > 3) lines = [name.slice(0, 13), name.slice(13, 26), name.slice(26)].filter(Boolean);
      }
      const center = h / 2 - 2;
      html += lines.map((line, i) => `<text class="node-small-label" x="48" y="${center + (i - (lines.length - 1) / 2) * 13}" text-anchor="middle">${esc(line)}</text>`).join('');
      html += `<text class="node-meta" x="48" y="${h - 14}" text-anchor="middle">${m.gates.length} GATES · v${m.version || 1}</text>`;
    } else if (node.type === 'SWAP') {
      html += '<path class="gate-symbol" d="M 48 45 V 155 M 40 32 L 56 48 M 40 48 L 56 32 M 40 152 L 56 168 M 40 168 L 56 152"/><text class="node-small-label" x="48" y="99" text-anchor="middle">SWAP</text><text class="node-meta" x="48" y="114" text-anchor="middle">3 CNOTS</text>';
    } else if (node.type === 'ORACLE') {
      html += `<text class="node-small-label" x="48" y="${h / 2 - 8}" text-anchor="middle">BLACK BOX</text><text class="node-meta" x="48" y="${h / 2 + 12}" text-anchor="middle">ONE QUERY</text><path class="gate-symbol" d="M 34 ${h / 2 + 30} H 62"/>`;
    } else {
      const terminal = node.type === 'INPUT' || node.type === 'OUTPUT';
      html += `<text class="${name.length > 3 ? 'node-small-label' : 'node-label'}" x="48" y="${terminal ? 43 : 46}" text-anchor="middle">${esc(name)}</text>`;
      html += `<text class="node-meta" x="48" y="66" text-anchor="middle">${terminal ? 'q' + node.qubit : node.type === 'TRANSFER' ? 'TO BOB →' : node.type === 'ENCODE' ? 'Xᶜ Zᵈ' : {X:'BIT FLIP',H:'HADAMARD',Z:'PHASE FLIP'}[node.type] || ''}</text>`;
    }
    if (node.locked && node.type !== 'INPUT' && node.type !== 'OUTPUT') html += '<path d="M 80 7 H 89 V 16" fill="none" stroke="#d0e0e6" stroke-width="1.5" pointer-events="none"/>';
    for (const dir of ['in', 'out']) for (let j = 0; j < (dir === 'in' ? p.input : p.output); j++) {
      const x = dir === 'out' ? w : 0, y = 40 + j * 120, pending = pendingWire?.node === node.id && pendingWire?.dir === dir && pendingWire?.port === j;
      const label = a > 1 ? node.type === 'CX' ? (j ? 'T' : 'C') : C.qubitName(j) : '';
      const role = node.type === 'CX' ? (j ? 'target' : 'control') : label;
      const connected = !options.readonly && graph.edges.some(e => (dir === 'out' ? e.from : e.to).node === node.id && (dir === 'out' ? e.from : e.to).port === j);
      if (!options.readonly) html += `<circle cx="${x}" cy="${y}" r="13" fill="transparent" data-pin="${esc(node.id)}" data-dir="${dir}" data-port="${j}" aria-hidden="true"/>`;
      html += `<circle class="port${pending ? ' wiring' : ''}${connected ? ' connected' : ''}" cx="${x}" cy="${y}" r="5" data-pin="${esc(node.id)}" data-dir="${dir}" data-port="${j}"${options.readonly ? '' : ` tabindex="0" role="button" aria-label="${esc(name)} ${dir === 'out' ? 'output' : 'input'} ${role || 'pin'}"`}><title>${esc(name)} ${dir === 'out' ? 'output' : 'input'} ${role}</title></circle>`;
      if (label) html += `<text class="port-label" x="${dir === 'out' ? w - 10 : 10}" y="${y + 4}" text-anchor="${dir === 'out' ? 'end' : 'start'}">${label}</text>`;
    }
    return html + '</g>';
  }
  function graphSVG(g, pool = modules(), readonly = false) {
    let html = '';
    for (const e of g.edges) {
      const a = g.nodes.find(n => n.id === e.from.node), b = g.nodes.find(n => n.id === e.to.node); if (!a || !b) continue;
      const path = route(pin(a, 'out', e.from.port, pool), pin(b, 'in', e.to.port, pool));
      if (!readonly) html += `<path class="wire-hit" d="${path}" data-edge="${esc(e.id)}"/>`;
      html += `<path class="wire${!readonly && selected?.type === 'edge' && selected.id === e.id ? ' selected' : ''}" d="${path}"${readonly ? '' : ` data-edge="${esc(e.id)}"`}/>`;
    }
    return html + g.nodes.map(n => nodeSVG(n, pool, { readonly })).join('');
  }
  function renderCanvas() {
    $('world').setAttribute('transform', `translate(${camera.x} ${camera.y}) scale(${camera.zoom})`);
    $('grid').setAttribute('patternTransform', `translate(${camera.x} ${camera.y}) scale(${camera.zoom})`);
    let html = level.id === 'courier' ? '<text class="zone-label" x="200" y="78">SHARE PAIR</text><text class="zone-label" x="430" y="78">ALICE</text><text class="zone-label" x="830" y="78">BOB</text><path class="zone-line" d="M 780 90 V 435"/><text class="zone-label" x="375" y="365">B IS ALREADY WITH BOB</text>' : '';
    if (level.adjacentOnly) html += `<text class="zone-label" x="40" y="60">HARDWARE LINKS · ${Array.from({length:level.qubits},(_,q)=>C.qubitName(q)).join(' — ')}</text><text class="zone-label" x="40" y="84">PHYSICAL QUBITS · CROSSINGS KEEP THEIR IDENTITY</text>`;
    if (['kickback', 'oracle'].includes(level.id)) html += '<text class="zone-label" x="185" y="65">PREPARE</text><text class="zone-label" x="535" y="65">QUERY</text><text class="zone-label" x="820" y="65">INTERFERE</text>';
    html += graphSVG(graph);
    if (pendingWire) {
      const node = graph.nodes.find(n => n.id === pendingWire.node), p = pin(node, pendingWire.dir, pendingWire.port);
      html += `<path class="wire-preview" d="${pendingWire.dir === 'out' ? route(p, pointer) : route(pointer, p)}"/>`;
    }
    if (placement) html += `<g class="ghost">${nodeSVG({ id: 'ghost', type: placement.type, moduleId: placement.moduleId, x: Math.round(pointer.x / 20) * 20, y: Math.round(pointer.y / 20) * 20 })}</g>`;
    $('world').innerHTML = html;
    svg.classList.toggle('placing', !!placement); svg.classList.toggle('panning', drag?.type === 'pan');
    $('zoom-label').textContent = Math.round(camera.zoom * 100) + '%';
    const placingName = placement ? placement.type === 'MODULE' ? modules().find(m => m.id === placement.moduleId)?.name : placement.type : '';
    $('canvas-mode').textContent = placement ? 'Place ' + placingName + ' · Esc cancels' : pendingWire ? 'Choose the matching pin · Esc cancels' : mode === 'wire' ? 'Wire · click two pins' : 'Select · click a pin to wire';
    $('select-tool').classList.toggle('active', mode === 'select'); $('wire-tool').classList.toggle('active', mode === 'wire');
    $('graph-error').hidden = !graphError || !attempted;
    $('graph-error').textContent = graphError?.message || '';
    $('canvas-help').textContent = level.id === 'link' ? 'Click INPUT A’s right pin, then OUTPUT A’s left pin' : pendingWire ? 'Click a compatible pin to finish this wire' : 'Move parts by dragging · scroll to pan · pinch / ⌘ scroll to zoom';
  }
  function fit() {
    const r = svg.getBoundingClientRect(), s = uiScale(), b = { width: r.width / s, height: r.height / s }; if (!b.width || !b.height) return;
    const minX = Math.min(...graph.nodes.map(n => n.x)) - 60, maxX = Math.max(...graph.nodes.map(n => n.x + 96)) + 60;
    const minY = Math.min(...graph.nodes.map(n => n.y)) - 70, maxY = Math.max(...graph.nodes.map(n => n.y + geometry(n).h)) + 110;
    camera.zoom = Math.max(.3, Math.min(1.3, b.width / (maxX - minX), b.height / (maxY - minY)));
    camera.x = (b.width - (maxX - minX) * camera.zoom) / 2 - minX * camera.zoom; camera.y = (b.height - (maxY - minY) * camera.zoom) / 2 - minY * camera.zoom;
    renderCanvas(); persist();
  }
  function zoomBy(factor, x, y) {
    const r = svg.getBoundingClientRect(), s = uiScale(), px = x ?? r.width / s / 2, py = y ?? r.height / s / 2, old = camera.zoom;
    camera.zoom = Math.max(.3, Math.min(2, old * factor)); camera.x = px - (px - camera.x) * camera.zoom / old; camera.y = py - (py - camera.y) * camera.zoom / old;
    renderCanvas(); persist();
  }
  function paletteModules() {
    const kinds = C.allowedKinds(level);
    return modules().filter(m => m.qubits <= level.qubits && (!kinds || kinds.includes(m.kind)));
  }
  const descriptions = { X: ['Bit flip', '1Q', 'swaps 0 and 1'], H: ['Hadamard', '1Q', 'makes two equal paths from 0'], Z: ['Phase flip', '1Q', 'changes a hidden sign on the 1 path'], CX: ['CNOT', '2Q · C / T', 'flips the target only if the control is 1'], SWAP: ['Exchange', '2Q · 3 gates', 'exchanges the states of two qubits'] };
  function renderPalette() {
    let html = '';
    for (const [title, types] of [['1 QUBIT', level.parts.filter(t => !['CX', 'SWAP'].includes(t))], ['2 QUBITS', level.parts.filter(t => ['CX', 'SWAP'].includes(t) && level.qubits >= 2)]]) if (types.length) {
      html += `<div class="palette-group"><h3>${title}</h3>`;
      html += types.map(t => `<button class="part-tile${placement?.type === t ? ' active' : ''}" data-part="${t}" title="${descriptions[t][0]}: ${descriptions[t][2]} · ${t === 'CX' ? 'upper control, lower target · shortcut C' : 'shortcut ' + (t === 'SWAP' ? 'S' : t)}"><span class="part-glyph">${t === 'CX' ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M 12 4 V 20 M 7 17 H 17" stroke="currentColor" stroke-width="1.5" fill="none"/><circle cx="12" cy="5" r="2.5" fill="currentColor"/><circle cx="12" cy="17" r="5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>' : t === 'SWAP' ? '⇄' : t}</span><span class="part-copy"><strong>${descriptions[t][0]}</strong><small>${descriptions[t][1]}</small></span></button>`).join('') + '</div>';
    }
    const custom = paletteModules();
    if (custom.length) html += `<div class="palette-group custom-parts"><h3>YOUR BLOCKS</h3>${custom.map(m => `<button class="part-tile${placement?.moduleId === m.id ? ' active' : ''}" data-module="${esc(m.id)}" title="${esc(m.name)} — ${m.gates.length} primitive gates"><span class="part-glyph module">${m.qubits}Q</span><span class="part-copy"><strong>${esc(m.name)}</strong><small>${m.gates.length} gates · v${m.version || 1}</small></span></button>`).join('')}</div>`;
    if (!html) html = `<p class="palette-empty">${level.id === 'link' ? 'No gates needed yet. Connect the supplied terminals to unlock your first part.' : 'Save BellPrep and BellDecode in their assignments to unlock this device.'}</p>`;
    $('palette').innerHTML = html;
  }
  function stateText(state, n) {
    if (!state) return '—';
    return state.map((a, i) => Math.hypot(...a) > 1e-6 ? (Math.abs(a[1]) > 1e-6 ? '+(' + amplitudeText(a) + ') ' : (a[0] < -1e-6 ? '−' : '+') + (Math.abs(a[0]) > .999 ? '' : Math.abs(a[0]).toFixed(3) + ' ')) + '|' + C.bits(i, n) + '⟩' : '').filter(Boolean).join(' ').replace(/^\+/, '');
  }
  function amplitudeText(a) { return (a[0] < -1e-8 ? '−' : '+') + Math.abs(a[0]).toFixed(3) + (Math.abs(a[1]) > 1e-8 ? (a[1] < 0 ? '−' : '+') + Math.abs(a[1]).toFixed(3) + 'i' : ''); }
  function stateRows(state, n) { const probabilities = C.probabilities(state); return state.map((a, i) => `<div class="state-row"><span>|${C.bits(i, n)}⟩</span><span style="color:${a[0] < -1e-8 ? 'var(--orange)' : 'var(--cyan)'}">${amplitudeText(a)}</span><div class="amplitude-track"><div class="amplitude-bar${a[0] < -1e-8 ? ' negative' : ''}" style="width:${Math.hypot(...a) * 50}%"></div></div><span>${(probabilities[i] * 100).toFixed(1)}%</span></div>`).join(''); }
  function currentState() { return trace[stepIndex] || (Array.isArray(source().initial) ? source().initial : C.basis(level.qubits, source().initial)); }
  function revealDock(tab) { activeTab = tab; project.settings.dockCollapsed = false; $('app').classList.remove('dock-collapsed'); }
  function renderDock() {
    $('app').classList.toggle('dock-collapsed', project.settings.dockCollapsed);
    $('toggle-dock').textContent = project.settings.dockCollapsed ? '▴' : '▾';
    $('toggle-dock').setAttribute('aria-expanded', String(!project.settings.dockCollapsed));
    $('toggle-dock').setAttribute('aria-label', project.settings.dockCollapsed ? 'Expand test bench' : 'Collapse test bench');
    $('measurement-settings').hidden = activeTab !== 'measurements' || project.settings.dockCollapsed;
    document.querySelectorAll('[data-tab]').forEach(b => { const active = b.dataset.tab === activeTab; b.classList.toggle('active', active); b.setAttribute('aria-selected', String(active)); });
    $('dock-content').setAttribute('aria-labelledby', 'tab-' + activeTab);
    if (activeTab === 'tests') {
      const rows = result?.tests || C.cases(level).map(c => ({ ...c, label: c.input, type: 'state' })), verdict = result ? verdictNow() : null;
      const qiskitCell = (t, i) => { if (!verdict) return ''; const c = t.type === 'state' ? verdict.cases[i] : null, o = t.type === 'operator' ? verdict.operator : null; return `<td>${c ? `<span class="badge${c.passed ? ' pass' : ' fail'}" title="Qiskit state_fidelity">${c.passed ? '✓' : '✗'} F ${c.fidelity.toFixed(6)}</span>` : o ? `<span class="badge${o.equivalent ? ' pass' : ' fail'}" title="Qiskit Operator.equiv, process fidelity ${o.process_fidelity.toFixed(6)}">${o.equivalent ? '✓' : '✗'} equiv</span>` : '<span class="tiny" title="Structural rule, checked by the game">rule</span>'}</td>`; };
      const grader = !result ? '' : verifying ? '<p class="grader-note">Confirming on Qiskit…</p>' : verdict ? `<p class="grader-note qiskit">Graded by Qiskit ${esc(verdict.qiskit)} — Statevector fidelity per case${verdict.operator ? ' + Operator.equiv for the whole operation' : ''} · ${esc(verdict.summary)}</p>` : `<p class="grader-note">Graded by the local exact simulator${service.kind === 'qiskit' ? '' : ' · start the Quantum Foundry service for Qiskit confirmation'}</p>`;
      $('dock-content').innerHTML = level.id === 'sandbox' ? '<p class="empty-panel">Sandbox circuits have no campaign contract. Run the circuit, inspect the state, or save a custom component.</p>' : `${grader}<table class="test-table"><thead><tr><th>CASE</th><th>INPUT</th><th>EXPECTED</th><th>ACTUAL</th><th>RESULT</th>${verdict ? '<th>QISKIT</th>' : ''}</tr></thead><tbody>${rows.map((t, i) => `<tr${t.type === 'state' ? ` data-case="${i}" class="${caseIndex === i ? 'selected' : ''}"` : ''}><td>${String(i + 1).padStart(2, '0')}</td><td>${esc(t.label)}</td><td>${t.type === 'state' ? esc(stateText(t.expected, level.qubits)) : t.type === 'operator' ? 'Same operation, one global phase' : t.type === 'hardware' ? 'Adjacent physical pairs only' : t.type === 'query' ? '1 fixed query' : 'Use saved component'}</td><td>${t.actual ? esc(stateText(t.actual, level.qubits)) : t.score !== undefined ? ['resource', 'hardware', 'query'].includes(t.type) ? t.passed ? 'Satisfied' : 'Missing / invalid' : (t.score * 100).toFixed(2) + '% match' : '—'}</td><td><span class="badge${t.passed === true ? ' pass' : t.passed === false ? ' fail' : ''}">${t.passed === true ? 'PASS' : t.passed === false ? 'FAIL' : 'READY'}</span></td>${qiskitCell(t, i)}</tr>`).join('')}</tbody></table>`;
    } else if (activeTab === 'state') {
      const s = currentState();
      $('dock-content').innerHTML = `<div class="state-layout"><div class="joint-state">${stateRows(s, level.qubits)}</div><div class="state-explainer"><b>Signed amplitude → probability</b><br>+0.707 and −0.707 both give 50%. Their signs can affect the next operation.<br>${level.qubits === 2 ? 'Pure-state entanglement: <b>' + C.concurrence(s).toFixed(3) + '</b><br>' : ''}<div class="register-marginals">${C.marginals(s).map(q => `<div><b>${C.qubitName(q.qubit)}</b><span>P(1) ${(q.p1 * 100).toFixed(0)}%</span><span title="Entanglement entropy of this qubit with the rest of the ideal pure register">S ${q.entropy.toFixed(2)}</span></div>`).join('')}</div>Step ${stepIndex} · ${level.qubits} qubits · bit order ${C.bitOrder(level.qubits)}.<br>S: qubit entropy, 0 separate / 1 maximally entangled with the rest.<br>Open Assignment → How it works for an example.</div></div>`;
    } else if (activeTab === 'measurements') {
      $('dock-content').innerHTML = counts ? `<p class="tiny" style="margin:0 0 10px">${Object.values(counts).reduce((a, b) => a + b, 0)} fresh preparations of the final circuit · ${esc(source().input)} · ${esc(countsEngine)}${level.qubits > 2 ? ' · zero-count outcomes hidden' : ''}</p>${Object.entries(counts).filter(([,count]) => level.qubits <= 2 || count > 0).map(([bit, count]) => `<div class="measurement-row"><span>|${bit}⟩</span><div class="measurement-track"><div style="width:${count / Object.values(counts).reduce((a, b) => a + b, 0) * 100}%"></div></div><span>${count} shots</span></div>`).join('')}` : '<p class="empty-panel">Press Sample output to measure fresh preparations of the completed circuit. Every shot begins from the selected input. Random counts do not determine pass/fail.</p>';
    } else {
      const node = selected?.type === 'node' ? graph.nodes.find(n => n.id === selected.id) : null;
      if (!node) $('dock-content').innerHTML = '<p class="empty-panel">Select a component or a wire on the canvas to inspect it.</p>';
      else {
        const m = node.type === 'MODULE' ? modules().find(m => m.id === node.moduleId) : null;
        const title = m ? m.name : node.label || node.type;
        const explanation = {X:'X flips 0 to 1 and 1 to 0. It does not measure the qubit. Two X gates undo each other.',H:'H gives a starting 0 two equal quantum paths. A readout has equal chances; another H brings a starting 0 back.',Z:'Z changes the sign on the 1 path. A later gate can make that change affect the readout.',SWAP:'Exchanges the states of two paths. It uses three CNOT gates; crossing wires alone cannot do this.',ORACLE:'One hidden rule is selected for each test. Your circuit must work for every selected rule.',CX:'CNOT checks the upper control without measuring it. If control is 1, the lower target flips; if control is 0, it stays. The control never changes.',ENCODE:'For message cd, Alice changes A using its two message bits.',TRANSFER:'Alice sends A to Bob, who already has B from the shared pair.',INPUT:'Starts the circuit with the selected bits. For shared-pair inputs, A and B start together.',OUTPUT:'End of this path. Read bitstrings from the highest qubit down to A = q0.'}[node.type];
        $('dock-content').innerHTML = `<div class="inspector"><div><h3>${esc(title)}</h3><p>${C.arity(node, modules())} qubit${C.arity(node, modules()) === 1 ? '' : 's'} · ${node.locked ? movable(node) ? 'fixed terminal · drag or use arrow keys to move' : 'fixed assignment part' : 'moveable component'}${m ? ' · ' + m.gates.length + ' primitive gates' : ''}</p><p>${m ? m.kind === 'BellPrep' ? 'Verified preparation from |00⟩. The input assumption is part of its contract.' : 'Saved circuit: ' + esc(m.kind) : esc(explanation || 'Connections define the operation. Position affects the drawing only.')}</p>${m ? `<button class="secondary" data-inspect="${esc(m.id)}">Inspect inside →</button>` : ''}${!node.locked ? ' <button class="text-button" data-action="duplicate-selected">Duplicate</button> <button class="text-button" data-action="delete-selected">Delete part</button>' : ''}</div></div>`;
      }
    }
  }
  function render() {
    $('chapter-label').textContent = level.chapter; $('mission-title').textContent = level.title;
    $('assignment-number').textContent = level.number ? String(level.number).padStart(2, '0') : '∞';
    $('contract-text').textContent = level.contract; $('contract-text').title = level.contract;
    $('bit-order').textContent = 'A = q0 · read ' + C.bitOrder(level.qubits); $('dock-note').textContent = 'Bitstrings read ' + C.bitOrder(level.qubits);
    $('input-heading').textContent = level.id === 'courier' ? 'MESSAGE cd' : level.id === 'decode' ? 'BELL INPUT' : level.id === 'kickback' ? 'ORACLE f(0)f(1)' : level.id === 'oracle' ? 'SECRET C B A' : 'INPUT';
    const inputLabel = (c, i) => ['courier', 'kickback', 'oracle'].includes(level.id) ? c.message : level.id === 'decode' ? ['Φ+', 'Φ−', 'Ψ+', 'Ψ−'][i] : C.bits(typeof c.initial === 'number' ? c.initial : i, level.qubits);
    const cases = C.cases(level), compactInput = cases.length > 8;
    $('input-buttons').hidden = compactInput; $('input-select').hidden = !compactInput;
    $('input-buttons').innerHTML = compactInput ? '' : cases.map((c, i) => `<button class="${caseIndex === i ? 'active' : ''}" data-input="${i}" aria-pressed="${caseIndex === i}" title="${esc(c.input)}">${esc(inputLabel(c, i))}</button>`).join('');
    $('input-select').innerHTML = cases.map((c, i) => `<option value="${i}"${caseIndex === i ? ' selected' : ''}>${esc(c.input)}</option>`).join(''); $('input-select').value = String(caseIndex);
    $('register-control').hidden = level.id !== 'sandbox'; $('register-size').value = String(level.qubits);
    $('undo').disabled = !undo.length; $('redo').disabled = !redo.length; $('check').hidden = level.id === 'sandbox'; $('check').disabled = level.id === 'sandbox';
    $('save-component').disabled = level.id !== 'sandbox' && (!level.kind || !result?.passed);
    $('save-component').hidden = level.id !== 'sandbox' && !level.kind;
    $('app').classList.toggle('parts-collapsed', project.settings.partsCollapsed);
    $('toggle-parts').setAttribute('aria-expanded', String(!project.settings.partsCollapsed));
    $('gate-cost').textContent = (compiled?.count ?? '—') + ' gates' + (['kickback', 'oracle'].includes(level.id) ? ' · 1 query' : ''); $('depth-cost').textContent = 'depth ' + (compiled?.depth ?? '—');
    $('step-count').textContent = stepIndex + ' / ' + (compiled?.count || 0); $('step-label').textContent = stepIndex ? compiled?.gates[stepIndex - 1]?.type + ' executed' : 'Input state';
    const p = C.probabilities(currentState()), outcomes = p.map((v, i) => ({v, i})), visible = level.qubits <= 2 ? outcomes : outcomes.filter(o => o.v > 1e-8).sort((a,b) => b.v - a.v || a.i - b.i).slice(0, 8);
    $('readout').innerHTML = visible.map(({v,i}) => `<div style="--prob:${(v * 100).toFixed(2)}%"><b>${C.bits(i, level.qubits)}</b><span>${(v * 100).toFixed(0)}%</span></div>`).join('') + (level.qubits > 2 ? `<p class="tiny">${outcomes.filter(o => o.v > 1e-8).length > 8 ? 'Top 8 outcomes · ' : ''}Full register in State</p>` : '');
    $('shots').value = String(project.settings.shots);
    $('test-summary').textContent = verifying ? 'Confirming on Qiskit…' : result ? (result.passed ? 'All tests passed' : result.tests.filter(t => t.passed).length + ' / ' + result.tests.length + ' passed') + (verdictNow() ? ' · Qiskit ' + (verdictNow().passed ? '✓' : '✗') : '') : level.id === 'sandbox' ? 'Free build' : 'Untested';
    $('test-summary').className = 'test-summary' + (result ? result.passed ? ' pass' : ' fail' : '');
    $('campaign-status').textContent = Object.values(project.progress).filter(Boolean).length + ' / ' + totalMissions + ' complete';
    renderPalette(); renderCanvas(); renderDock();
  }
  function openLevel(id, force = false) {
    const next = levelFor(id, project); if (!next || !force && !C.available(next, project.progress, modules())) { notify('Finish the prerequisite assignments and save the required components first.'); return; }
    persist(); pause(); level = next; project.current = id; graph = C.clone(project.circuits[id] || C.starter(id, level.qubits)); camera = C.clone(project.cameras[id] || { x: 0, y: 0, zoom: 1 });
    selected = null; placement = null; pendingWire = null; undo = []; redo = []; result = null; counts = null; attempted = false; caseIndex = project.inputs[id] || 0; stepIndex = 0; activeTab = 'tests';
    $('campaign').hidden = true; project.lastView = 'workbench'; compute(); render(); persist(); requestAnimationFrame(() => { if (!project.cameras[id] || camera.zoom === 1 && camera.x === 0 && camera.y === 0) fit(); });
    $('status-text').textContent = level.contract;
    if (level.number || id === 'sandbox') { if (level.number) project.settings.chapter = level.number > 8 ? 1 : 0; project.briefings[id] = true; persist(); briefing(); } else { closeModal(); ensureMusic(); }
  }
  const mapPositions = [[0, 180], [225, 180], [450, 180], [680, 45], [680, 300], [915, 300], [915, 170], [915, 30]];
  const advancedPositions = [[0, 100], [280, 100], [560, 100], [840, 100], [840, 310], [560, 310], [280, 310], [0, 310]];
  function renderMap() {
    const chapter = project.settings.chapter, all = C.levels.filter(l => l.number), page = all.slice(chapter * 8, chapter * 8 + 8), positions = chapter ? advancedPositions : mapPositions;
    $('map-chapters').innerHTML = ['I · Gates & communication', 'II · Registers & algorithms'].map((name, i) => `<button data-chapter="${i}" class="${chapter === i ? 'active' : ''}" aria-pressed="${chapter === i}">${name}<span>${all.slice(i * 8, i * 8 + 8).filter(l => project.progress[l.id]).length} / 8</span></button>`).join('');
    $('map-nodes').innerHTML = page.map((l, i) => {
      const done = project.progress[l.id], can = C.available(l, project.progress, modules()), pos = positions[i];
      const missingBlocks = l.requires.every(id => project.progress[id]) && !can, best = project.best[l.id];
      return `<button class="map-node${done ? ' complete' : can ? '' : ' locked'}${level.id === l.id ? ' current' : ''}" data-level="${l.id}" style="left:${pos[0] / 1130 * 100}%;top:${pos[1] / 530 * 100}%" ${!can ? 'disabled' : ''} title="${esc(l.contract)}"><span class="map-number">${String(l.number).padStart(2, '0')}</span><span class="eyebrow">${l.chapter} · ${l.qubits}Q</span><strong>${esc(l.title)}</strong><span class="map-node-status">${done ? best ? '✓ ' + best.count + ' gates · replay' : '✓ Complete · replay' : can ? 'Build circuit →' : missingBlocks ? 'Save required components' : 'Locked · ' + l.requires.map(id => C.getLevel(id).number).join(', ')}</span></button>`;
    }).join('');
    const paths = page.flatMap((l,b) => l.requires.map(id => [page.findIndex(p => p.id === id),b]).filter(([a]) => a >= 0));
    $('map-links').innerHTML = paths.map(([a, b]) => {
      const p = positions[a], q = positions[b], color = project.progress[page[a].id] ? '#d9a26c' : '#4f5b61';
      const down = q[1] > p[1], forward = q[0] > p[0], path = p[0] === q[0] ? `M ${p[0] + 95} ${p[1] + (down ? 94 : 0)} V ${q[1] + (down ? 0 : 94)}` : forward ? `M ${p[0] + 190} ${p[1] + 47} H ${(p[0] + 190 + q[0]) / 2} V ${q[1] + 47} H ${q[0]}` : `M ${p[0]} ${p[1] + 47} H ${(p[0] + q[0] + 190) / 2} V ${q[1] + 47} H ${q[0] + 190}`;
      return `<path d="${path}" fill="none" stroke="${color}" stroke-width="2"/>`;
    }).join('');
    const complete = Object.values(project.progress).filter(Boolean).length;
    $('map-progress').textContent = complete + ' / ' + totalMissions + ' assignments complete · ' + modules().length + ' saved components';
  }
  function openMap() { pause(); setMenu(false); pendingWire = null; placement = null; persist(); project.lastView = 'map'; renderMap(); $('campaign').hidden = false; persist(); }
  function changeRegister(n) {
    if (level.id !== 'sandbox' || !Number.isInteger(n) || n < 1 || n > C.LIMITS.qubits || n === level.qubits) return;
    persist(); pause(); project.settings.sandboxQubits = n; level = levelFor('sandbox', project); graph = C.clone(project.sandboxes[n] || C.starter('sandbox', n));
    camera = {x:0,y:0,zoom:1}; selected = null; placement = null; pendingWire = null; undo = []; redo = []; result = null; counts = null; attempted = false; caseIndex = 0; stepIndex = 0; project.inputs.sandbox = 0;
    compute(); render(); fit(); persist(); notify(n + '-qubit Sandbox opened. Each register size keeps its own circuit.');
  }
  // ── Ground-up teaching: the from-zero primer and the plain-words dictionary ──
  let primerPage = 0;
  function glossaryModal() {
    modal('Foundry dictionary', '<p class="primer-intro">Every term the game uses, in plain words. Missions always introduce a word before they rely on it — this page is for looking things up later.</p><dl class="glossary">' + window.FoundryGlossary.map(([t, d]) => `<dt>${esc(t)}</dt><dd>${esc(d)}</dd>`).join('') + '</dl>', [{ label: 'Close', primary: true, run: closeModal }], true);
    $('dialog-kicker').textContent = 'EVERY TERM · NO JARGON';
  }
  // Interactive teaching widgets for the primer. Pure DOM + the squaring rule;
  // the interference numbers are the real ones from the H–Z–H circuit.
  let pwTally = [0, 0], pwLast = null, pwFlipped = false;
  const pwAmpRow = (label, a, color) => `<div class="pw-row-bar"><span class="pw-ket">|${label}⟩</span><span class="pw-num" style="color:${a < -1e-9 ? '#f7b258' : color || '#63cdd6'}">${(a < -1e-9 ? '−' : '+') + Math.abs(a).toFixed(2)}</span><div class="pw-track pw-signed"><div class="pw-bar${a < -1e-9 ? ' pw-neg-bar' : ''}" style="width:${Math.abs(a) * 50}%"></div></div><span class="pw-pct">${(a * a * 100).toFixed(0)}%</span></div>`;
  function ampWidgetBody() {
    const slider = $('pw-lean'), negBox = $('pw-neg');
    const lean = slider ? Number(slider.value) : 50, angle = lean / 100 * Math.PI / 2;
    const a0 = Math.cos(angle), a1 = Math.sin(angle) * (negBox && negBox.checked ? -1 : 1);
    return pwAmpRow('0', a0) + pwAmpRow('1', a1) + `<p class="pw-formula">chance of reading 1 = ${(a1 < 0 ? '(−' : '') + Math.abs(a1).toFixed(2) + (a1 < 0 ? ')' : '')} × ${(a1 < 0 ? '(−' : '') + Math.abs(a1).toFixed(2) + (a1 < 0 ? ')' : '')} = ${(a1 * a1).toFixed(2)} → <b>${(a1 * a1 * 100).toFixed(0)}%</b>${negBox && negBox.checked ? ' · the minus sign changed the state, not the chances' : ''}</p>`;
  }
  function tallyWidgetBody() {
    const total = pwTally[0] + pwTally[1];
    const bar = i => `<div class="pw-row-tally"><span class="pw-ket">${i}</span><div class="pw-track"><div class="pw-bar pw-green" style="width:${total ? pwTally[i] / total * 100 : 0}%"></div></div><span class="pw-pct">${pwTally[i]}</span></div>`;
    return `<p class="pw-formula">${total ? 'Shots so far: <b>' + total + '</b> · last answer: <b>' + pwLast + '</b> · each press prepared a FRESH qubit and asked once' : 'The qubit below leans 50/50. No measurements yet — press a button and force it to answer.'}</p>` + bar(0) + bar(1);
  }
  function interfWidgetBody() {
    const b = pwFlipped ? -0.5 : 0.5, sum = 0.5 + b;
    return pwAmpRow('path 1', 0.5, '#9caab4').replace('|path 1⟩', 'path 1') + pwAmpRow('path 2', b, '#9caab4').replace('|path 2⟩', 'path 2') + pwAmpRow('added', sum).replace('|added⟩', 'together') + `<p class="pw-formula">(0.50 ${pwFlipped ? '−' : '+'} 0.50)² = ${(sum * sum).toFixed(2)} → the answer "0" is ${pwFlipped ? '<b>impossible — the paths cancelled</b>' : '<b>certain — the paths reinforced</b>'}. These are the real numbers inside mission 4’s H–Z–H circuit.</p>`;
  }
  function primerWidget(page) {
    if (page === 0) return `<div class="primer-widget"><svg viewBox="0 0 620 130" class="pw-svg" aria-label="A bit is a switch with one position; a qubit holds a lean toward both answers"><text x="70" y="22" class="pws-head">BIT</text><rect x="20" y="34" width="100" height="34" rx="17" class="pws-slot"/><circle cx="103" cy="51" r="13" class="pws-knob"/><text x="38" y="56" class="pws-big">0</text><text x="99" y="56" class="pws-big pws-on">1</text><text x="20" y="94" class="pws-cap">always exactly 0 or 1 —</text><text x="20" y="110" class="pws-cap">nothing in between</text><text x="330" y="22" class="pws-head">QUBIT (between readings)</text><text x="300" y="56" class="pws-big">|0⟩</text><rect x="340" y="40" width="180" height="16" class="pws-trackbg"/><rect x="340" y="40" width="126" height="16" class="pws-fill"/><text x="528" y="54" class="pws-cap">lean 70%</text><text x="300" y="86" class="pws-big">|1⟩</text><rect x="340" y="70" width="180" height="16" class="pws-trackbg"/><rect x="340" y="70" width="54" height="16" class="pws-fill2"/><text x="528" y="84" class="pws-cap">lean 30%</text><text x="300" y="112" class="pws-cap">leans toward both at once — but when read, answers plainly 0 or 1</text></svg></div>`;
    if (page === 1) return `<div class="primer-widget"><div class="pw-controls"><label class="pw-label">Drag the lean <input id="pw-lean" type="range" min="0" max="100" value="50" data-primer-range aria-label="Lean between 0 and 1"></label><label class="pw-label pw-check"><input id="pw-neg" type="checkbox" data-primer-neg> make the |1⟩ amplitude negative</label></div><div id="pw-amp-view">${ampWidgetBody()}</div><p class="pw-caption">Left bars: the amplitudes (they can dip negative). Right numbers: the chances, always amplitude × itself. Notice the checkbox flips a bar downward while the percentages refuse to move.</p></div>`;
    if (page === 2) return `<div class="primer-widget"><div class="pw-controls"><button class="secondary" data-primer-measure="1">Measure once</button><button class="secondary" data-primer-measure="100">Measure ×100</button><button class="text-button" data-primer-tally-reset>Reset</button></div><div id="pw-tally-view">${tallyWidgetBody()}</div><p class="pw-caption">A 50/50 qubit never answers “half” — every single shot is a plain 0 or a plain 1. Only the long-run tally shows the lean.</p></div>`;
    if (page === 3) return `<div class="primer-widget"><div class="pw-controls"><button class="secondary" data-primer-flip>${pwFlipped ? 'Make both signs positive' : 'Flip one path’s sign'}</button></div><div id="pw-interf-view">${interfWidgetBody()}</div><p class="pw-caption">Two routes lead to the answer “0”. Same strengths either way — only a sign differs — yet certainty becomes impossibility. No dice could ever do this.</p></div>`;
    return `<div class="primer-widget"><svg viewBox="0 0 640 140" class="pw-svg" aria-label="Anatomy of a circuit: input terminal, wire, gate, pin, output terminal"><text x="310" y="30" text-anchor="middle" class="pws-cap">a gate</text><rect x="12" y="46" width="96" height="44" rx="5" class="pws-slot"/><text x="60" y="72" text-anchor="middle" class="pws-cap">INPUT A</text><circle cx="108" cy="68" r="6" class="pws-pin"/><line x1="114" y1="68" x2="262" y2="68" class="pws-wire"/><text x="188" y="56" text-anchor="middle" class="pws-cap">a wire carries one qubit</text><circle cx="268" cy="68" r="6" class="pws-pin"/><rect x="274" y="40" width="72" height="56" rx="6" class="pws-gate"/><text x="310" y="74" text-anchor="middle" class="pws-big pws-on">H</text><circle cx="352" cy="68" r="6" class="pws-pin"/><line x1="358" y1="68" x2="506" y2="68" class="pws-wire"/><text x="432" y="56" text-anchor="middle" class="pws-cap">flowing left → right</text><circle cx="512" cy="68" r="6" class="pws-pin"/><rect x="518" y="46" width="110" height="44" rx="5" class="pws-slot"/><text x="573" y="72" text-anchor="middle" class="pws-cap">OUTPUT A</text><text x="320" y="126" text-anchor="middle" class="pws-cap">orange pins: click one, then its partner, to wire</text></svg></div>`;
  }
  function renderPrimerPage(page) {
    const pages = window.FoundryPrimer; if (!$('primer-content')) return;
    primerPage = Math.max(0, Math.min(pages.length - 1, page));
    pwTally = [0, 0]; pwLast = null;
    document.querySelectorAll('[data-primer-page]').forEach(b => { const active = Number(b.dataset.primerPage) === primerPage; b.classList.toggle('active', active); b.setAttribute('aria-selected', String(active)); });
    const p = pages[primerPage];
    $('primer-content').innerHTML = `<h3 class="primer-title">${esc(p.title)}</h3>${p.body.map(t => `<p>${esc(t)}</p>`).join('')}${primerWidget(primerPage)}<div class="primer-nav"><span class="tiny">Page ${primerPage + 1} of ${pages.length}</span><span>${primerPage > 0 ? '<button class="secondary" data-primer-step="-1">← Back</button> ' : ''}${primerPage < pages.length - 1 ? '<button class="primary" data-primer-step="1">Next →</button>' : '<button class="primary" data-primer-done>To the workshop →</button>'}</span></div>`;
  }
  function primerModal() {
    if (!project.seenPrimer) { project.seenPrimer = true; persist(); $('primer-button').classList.remove('pulse'); }
    const pages = window.FoundryPrimer;
    modal('Start from zero', `<p class="primer-intro">Five short pages, nothing assumed — not even what a bit is. After these, every mission briefing will make sense. Each mission also defines its new words as it goes.</p><nav class="briefing-tabs" role="tablist" aria-label="Primer pages">${pages.map((p, i) => `<button data-primer-page="${i}" role="tab" aria-selected="${i === 0}" class="${i === 0 ? 'active' : ''}">${i + 1} · ${esc(p.title.split(/[:,]/)[0])}</button>`).join('')}</nav><div id="primer-content" class="briefing-content"></div>`, [{ label: '📖 Dictionary', run: glossaryModal }, { label: 'Done', primary: true, run: closeModal }], true);
    $('dialog-kicker').textContent = 'THE 2-MINUTE PRIMER · NO BACKGROUND NEEDED';
    renderPrimerPage(0);
  }
  document.addEventListener('click', e => {
    const page = e.target.closest('[data-primer-page]'); if (page) { renderPrimerPage(Number(page.dataset.primerPage)); return; }
    const step = e.target.closest('[data-primer-step]'); if (step) { renderPrimerPage(primerPage + Number(step.dataset.primerStep)); return; }
    if (e.target.closest('[data-primer-done]')) { closeModal(); return; }
    if (e.target.closest('[data-open-primer]')) { primerModal(); return; }
    if (e.target.closest('[data-open-glossary]')) { glossaryModal(); return; }
    const measure = e.target.closest('[data-primer-measure]');
    if (measure) { const n = Number(measure.dataset.primerMeasure) || 1; for (let i = 0; i < n; i++) { pwLast = Math.random() < .5 ? 0 : 1; pwTally[pwLast]++; } if ($('pw-tally-view')) $('pw-tally-view').innerHTML = tallyWidgetBody(); return; }
    if (e.target.closest('[data-primer-tally-reset]')) { pwTally = [0, 0]; pwLast = null; if ($('pw-tally-view')) $('pw-tally-view').innerHTML = tallyWidgetBody(); return; }
    if (e.target.closest('[data-primer-flip]')) { pwFlipped = !pwFlipped; renderPrimerPage(primerPage); return; }
  });
  document.addEventListener('input', e => { if (e.target.closest && e.target.closest('[data-primer-range]') && $('pw-amp-view')) $('pw-amp-view').innerHTML = ampWidgetBody(); });
  document.addEventListener('change', e => { if (e.target.closest && e.target.closest('[data-primer-neg]') && $('pw-amp-view')) $('pw-amp-view').innerHTML = ampWidgetBody(); });
  function setMenu(open) { $('game-menu').hidden = !open; $('menu-button').setAttribute('aria-expanded', String(open)); }
  function showCredits() {
    const names = ['Maverick Pil', 'Yujie Wu', 'Kenneth Zhong', 'Anissa Li', 'Kevin MacLeod', 'Qollab', 'Carnegie Mellon University'];
    modal('Credits', `<ul class="credit-list">${names.map(name => `<li>${esc(name)}</li>`).join('')}</ul>`, [{ label: 'Back to game', primary: true, run: closeModal }]);
  }
  function showMusicCredits() {
    const songs = window.FoundryAudio.playlist.map(id => window.FoundryAudio.tracks[id]);
    const rows = songs.map(t => {
      const link = 'https://incompetech.com/music/royalty-free/index.html?isrc=' + encodeURIComponent(t.isrc);
      return `<li><a href="${link}" target="_blank" rel="noopener noreferrer">${esc(t.title)}</a> — Kevin MacLeod (incompetech.com), licensed under CC BY 4.0.</li>`;
    }).join('');
    modal('Music credits', `<p>These recordings are included unchanged for offline play. Each is licensed under <a href="${window.FoundryAudio.licenseUrl}" target="_blank" rel="noopener noreferrer">Creative Commons Attribution 4.0 International</a>.</p><ul class="music-credit-list">${rows}</ul>`, [{ label: 'Back to game', primary: true, run: closeModal }], true);
  }
  function closeModal() { $('modal-root').innerHTML = ''; if (modalFocus?.isConnected) modalFocus.focus(); else svg.focus(); modalFocus = null; }
  function modal(title, body, actions, large = false) {
    pause(); setMenu(false); if (!$('modal-root').firstChild) modalFocus = document.activeElement;
    $('modal-root').innerHTML = `<div class="modal-backdrop"><section class="modal${large ? ' large' : ''}" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><span id="dialog-kicker" class="eyebrow">QUANTUM FOUNDRY</span><h2 id="dialog-title">${esc(title)}</h2>${body}<div class="modal-actions">${actions.map((a, i) => `<button class="${a.primary ? 'primary' : 'secondary'}" data-modal-action="${i}">${esc(a.label)}</button>`).join('')}</div></section></div>`;
    $('modal-root').querySelectorAll('[data-modal-action]').forEach(b => b.addEventListener('click', () => actions[Number(b.dataset.modalAction)].run()));
    requestAnimationFrame(() => { const target = $('modal-root').querySelector('input') || $('modal-root').querySelector('button'); target?.focus(); });
  }
  function briefing() {
    lessonPage = 0; exampleStep = 0; exampleInput = 0;
    modal(level.title, `<nav class="briefing-tabs" role="tablist" aria-label="Assignment briefing"><button id="lesson-tab-0" data-lesson-page="0" role="tab" aria-selected="true" class="active">Build</button><button id="lesson-tab-1" data-lesson-page="1" role="tab" aria-selected="false">How it works</button><button id="lesson-tab-2" data-lesson-page="2" role="tab" aria-selected="false">Try &amp; observe</button></nav><div class="briefing-content" id="briefing-content" role="tabpanel" aria-labelledby="lesson-tab-0"></div>`, [{label:'Build circuit',primary:true,run:() => { closeModal(); ensureMusic(); }}], true);
    $('dialog-kicker').textContent = level.number ? 'MISSION ' + String(level.number).padStart(2, '0') + ' / ' + totalMissions + ' · ' + level.chapter.toUpperCase() : 'SANDBOX · FREE BUILD';
    renderBriefingPage(0);
  }
  function renderBriefingPage(page) {
    if (!$('briefing-content')) return;
    lessonPage = Math.max(0, Math.min(2, page));
    document.querySelectorAll('[data-lesson-page]').forEach(b => { const active = Number(b.dataset.lessonPage) === lessonPage; b.classList.toggle('active', active); b.setAttribute('aria-selected', String(active)); b.setAttribute('tabindex', active ? '0' : '-1'); });
    const target = $('briefing-content'), lesson = L[level.id]; target.setAttribute('aria-labelledby', 'lesson-tab-' + lessonPage);
    if (lessonPage === 0) {
      const cases = C.cases(level);
      const table = rows => `<table class="briefing-contract"><thead><tr><th>${level.id === 'courier' ? 'MESSAGE cd' : 'INPUT'}</th><th>REQUIRED OUTPUT · ${C.bitOrder(level.qubits)}</th></tr></thead><tbody>${rows.map(c => `<tr><td>${esc(c.input)}</td><td>${esc(stateText(c.expected, level.qubits))}</td></tr>`).join('')}</tbody></table>`;
      const gateGuide = `<section class="gate-guide" aria-label="Gate guide"><h3>Two gates you will meet</h3><div><p><b>H · Hadamard</b><br>H turns a starting 0 into a quantum mix of 0 and 1, with equal chances when read. Later gates can make those paths combine and change the result.</p><p><b>CNOT · controlled flip</b><br>CNOT has a control and a target. If the control is 1, it flips the target; if the control is 0, the target stays the same. It does not measure either qubit.</p></div></section>`;
      target.innerHTML = `<p class="briefing-goal">${esc(lesson.goal)}</p>${gateGuide}<p class="primer-link"><button class="text-button" data-open-primer>🧭 New to qubits? Start from zero — 2 minutes, nothing assumed</button><button class="text-button" data-open-glossary>📖 Dictionary</button></p><div class="mission-spec"><span>${level.qubits} qubit${level.qubits === 1 ? '' : 's'}</span><span>${level.number ? cases.length + ' input case' + (cases.length === 1 ? '' : 's') : 'No grading'}</span>${level.adjacentOnly ? '<span>Neighbor links only</span>' : ''}${['kickback', 'oracle'].includes(level.id) ? '<span>1 oracle query</span>' : ''}${project.best[level.id] ? '<span>Best: ' + project.best[level.id].count + ' gates</span>' : ''}</div>${level.number ? table(cases.slice(0, 4)) + (cases.length > 4 ? `<details class="more-cases"><summary>Show ${cases.length - 4} more required inputs</summary>${table(cases.slice(4))}</details>` : '') : ''}<div class="briefing-columns"><section><h3>What you have</h3><p>${esc(lesson.provided)}</p></section><section><h3>Build</h3><p>${esc(lesson.build)}</p></section></div><p class="lesson-reward">${level.reward ? 'Unlocks: ' + esc(level.reward) : 'Free build · no campaign contract'}</p>`;
    } else if (lessonPage === 1) {
      target.innerHTML = `${(lesson.words || []).length ? `<div class="new-words"><span class="new-words-title">NEW WORDS IN THIS MISSION</span>${lesson.words.map(([t, d]) => `<p><b>${esc(t)}</b> — ${esc(d)}</p>`).join('')}<button class="text-button" data-open-glossary>📖 Full dictionary</button></div>` : ''}${lesson.concepts.map(p => `<p>${esc(p)}</p>`).join('')}<div id="concept-example" class="concept-lab"></div><p class="lesson-note">${esc(lesson.note)}</p>${level.number >= 3 ? '<p class="tiny">A single overall phase of the entire state does not change observations. The tests ignore it; relative signs between alternatives still matter.</p>' : ''}`;
      renderExample();
    } else {
      const sandbox = level.id === 'sandbox';
      target.innerHTML = `<h3>${sandbox ? 'Try an experiment' : 'Try this experiment'}</h3><ol class="experiment-steps">${lesson.experiment.map(p => `<li>${esc(p)}</li>`).join('')}</ol><h3>What the result means</h3><p>${esc(lesson.observe)}</p><h3>${sandbox ? 'Sandbox rules' : 'What Check circuit verifies'}</h3><ul class="lesson-checklist">${lesson.checks.map(p => `<li>${esc(p)}</li>`).join('')}</ul><p class="lesson-note">${sandbox ? 'Sandbox has no Check circuit button. Use Step and Sample output to explore your circuit.' : 'Use Need a hint? on the workbench for progressively more specific help.'}</p>`;
    }
  }
  function renderExample() {
    const target = $('concept-example'); if (!target) return;
    const example = L[level.id].example, input = example.inputs[exampleInput] || example.inputs[0];
    let gates = example.gates || [];
    if (example.courier) gates = [{type:'H',target:0},{type:'CX',control:0,target:1},...(input.message[1] === '1' ? [{type:'Z',target:0}] : []),...(input.message[0] === '1' ? [{type:'X',target:0}] : []),{type:'CX',control:0,target:1},{type:'H',target:0}];
    let stages = gates.map(g => ({ label: gateLabel(g), gates: [g] }));
    if (example.query) {
      const n = example.qubits, dataH = Array.from({length:n - 1}, (_,target) => ({type:'H',target}));
      stages = [{label:n === 2 ? 'H A' : 'H A B C',gates:dataH},{label:'X ' + C.qubitName(n - 1),gates:[{type:'X',target:n - 1}]},{label:'H ' + C.qubitName(n - 1),gates:[{type:'H',target:n - 1}]},{label:'Oracle · 1 query',oracle:true,gates:C.oracleGates(example.query,input.message,Array.from({length:n},(_,q)=>q))},{label:n === 2 ? 'H A' : 'H A B C',gates:dataH}];
      gates = stages.flatMap(stage => stage.gates);
    }
    const initial = example.prepare ? C.evolve(example.prepare, example.qubits, input.initial).state : input.initial;
    const evolution = C.evolve(gates, example.qubits, initial); exampleStep = Math.max(0, Math.min(exampleStep, stages.length));
    const operationStep = stages.slice(0,exampleStep).reduce((sum,s)=>sum+s.gates.length,0), s = evolution.trace[operationStep];
    let caption = example.captions?.[exampleStep];
    if (example.courier) caption = exampleStep === 0 ? 'Begin with |00⟩. Before communication, prepare the shared pair.' : exampleStep === 1 ? 'H changes A’s amplitudes.' : exampleStep === 2 ? 'Alice and Bob now share an entangled pair. Bob holds B.' : exampleStep === gates.length ? 'Bob’s decoder recovers message ' + input.message + '. The output bit order is B A.' : exampleStep === gates.length - 1 ? 'After Alice sends A, Bob begins decoding with both qubits.' : 'Alice encodes on A. The pair’s amplitudes change; Bob still needs A before he can decode.';
    if (example.query) caption = ['Start with a zero register.', 'H creates coherent data alternatives.', 'X changes the auxiliary input from 0 to 1.', 'H turns that auxiliary input into |−⟩.', 'One oracle query writes a relative phase on the data alternatives. The auxiliary qubit stays in |−⟩.', example.query === 'bv' ? 'Final H gates reveal secret ' + input.message + ' on C B A. D remains in |−⟩.' : 'Final H reveals ' + (input.message[0] === input.message[1] ? 'constant: A=0' : 'balanced: A=1') + '. B remains in |−⟩.'][exampleStep];
    target.innerHTML = `<div class="concept-lab-header"><span>${esc(example.title)}</span>${example.inputs.length > 1 ? `<div class="example-inputs" aria-label="Example input">${example.inputs.map((c,i) => `<button data-demo-input="${i}" class="${exampleInput === i ? 'active' : ''}" aria-pressed="${exampleInput === i}">${esc(c.label)}</button>`).join('')}</div>` : ''}</div>${exampleSchematic(stages,example.qubits)}<div class="example-steps" aria-label="Example operation step">${['Input',...stages.map(stage => stage.label)].map((label,i) => `<button data-demo-step="${i}" class="${exampleStep === i ? 'active' : ''}" aria-pressed="${exampleStep === i}">${i ? i + '. ' : ''}${esc(label)}</button>`).join('')}</div><div class="example-state" aria-label="Example amplitudes and probabilities">${stateRows(s,example.qubits)}</div><p class="example-caption" aria-live="polite">${esc(caption || '')}</p><p class="tiny">Worked example · your circuit is unchanged${example.qubits === 2 ? ' · pure-state entanglement ' + C.concurrence(s).toFixed(3) : ''} · bit order ${C.bitOrder(example.qubits)}</p>`;
  }
  function gateLabel(g) { return ['CX','SWAP'].includes(g.type) ? (g.type === 'CX' ? 'CX ' : 'SWAP ') + C.qubitName(g.control) + '→' + C.qubitName(g.target) : g.type + ' ' + C.qubitName(g.target); }
  function exampleSchematic(stages, n) {
    const width = Math.max(280, stages.length * 76 + 70), height = n * 40 + 18, y = q => 29 + q * 40;
    let drawing = Array.from({length:n},(_,q)=>`<text x="9" y="${y(q)+4}" class="example-wire-label">${C.qubitName(q)}</text><path class="example-wire" d="M 30 ${y(q)} H ${width-10}"/>`).join('');
    stages.forEach((stage,i)=>{ const px = 61 + i * 76, color = i + 1 === exampleStep ? '#ffe0ac' : i + 1 < exampleStep ? '#b9d19d' : '#88c4cc';
      if (stage.oracle) drawing += `<rect x="${px-23}" y="13" width="46" height="${(n-1)*40+32}" fill="#31434d" stroke="${color}"/><text x="${px}" y="${height/2+4}" class="example-gate-label" text-anchor="middle" fill="${color}">U</text>`;
      else stage.gates.forEach(g=>{ if (['CX','SWAP'].includes(g.type)) { drawing += `<path d="M ${px} ${y(g.control)} V ${y(g.target)}" stroke="${color}" fill="none"/>`; if(g.type==='CX') drawing+=`<circle cx="${px}" cy="${y(g.control)}" r="4" fill="${color}"/><circle cx="${px}" cy="${y(g.target)}" r="10" stroke="${color}" fill="#26343b"/><path d="M ${px-7} ${y(g.target)} H ${px+7} M ${px} ${y(g.target)-7} V ${y(g.target)+7}" stroke="${color}"/>`; else [g.control,g.target].forEach(q=>drawing+=`<path d="M ${px-6} ${y(q)-6} L ${px+6} ${y(q)+6} M ${px-6} ${y(q)+6} L ${px+6} ${y(q)-6}" stroke="${color}"/>`); }
        else drawing+=`<rect x="${px-15}" y="${y(g.target)-14}" width="30" height="28" fill="#26343b" stroke="${color}"/><text x="${px}" y="${y(g.target)+4}" text-anchor="middle" class="example-gate-label" fill="${color}">${g.type}</text>`; });
    });
    return `<svg class="example-schematic" viewBox="0 0 ${width} ${height}" role="img" aria-label="Worked circuit diagram. Choose the numbered steps below to inspect it.">${drawing}</svg>`;
  }
  function help() {
    const sandbox = level.id === 'sandbox' ? '<p>Sandbox has no Check circuit button or campaign pass/fail score. Use Step to follow each gate and Sample output to explore possible results.</p>' : '<p><b>Check circuit</b> verifies every required test. Passing component assignments can be saved as blocks.</p>';
    modal('Controls & saving', '<p>Choose a part on the right, then click the board to place it. Drag its body to move it. Click an <b>output pin</b>, then an <b>input pin</b> to connect them.</p><p>Orange wires carry qubits. Each output has one destination. Crossing wires stay separate. Select a wire or part and press Delete to remove it.</p><p><b>Assignment</b> opens the goal and a guided explanation. The Build page explains H and CNOT before you play. <b>H</b> makes a starting 0 have equal chances of reading 0 or 1; later gates can combine those paths. <b>CNOT</b> flips its target only when its control is 1 and does not measure either qubit.</p>' + sandbox + '<p><b>Step</b> reveals intermediate states. <b>Sample output</b> measures fresh preparations. Bitstrings read from the highest qubit down to A=q0.</p><div class="help-keys"><b>V / W</b><span>Select / wire</span><b>X H Z C S</b><span>Choose X / H / Z / CNOT / SWAP</span><b>⌘ Z / ⇧ ⌘ Z</b><span>Undo / redo</span><b>Delete / Esc</b><span>Remove / cancel</span><b>F / arrows</b><span>Fit / move selected part</span><b>Space + drag</b><span>Pan canvas</span><b>Pinch / ⌘ scroll</b><span>Zoom around pointer</span></div><p>Work saves in this browser when local storage is available. <b>Menu → Download backup</b> saves a portable copy. Keep <b>assets/music/</b> beside index.html for the ten Kevin MacLeod recordings. Everything works offline. Optionally run the Quantum Foundry service (<b>./start-service.sh</b>, then open http://127.0.0.1:8000) for Qiskit-confirmed grading, Qiskit sampling, OpenQASM export, and IonQ simulator or QPU runs.</p>', [{ label: 'Back to game', primary: true, run: closeModal }]);
  }
  function deleteSelected() {
    if (!selected) return;
    const next = C.clone(graph);
    if (selected.type === 'node') { const n = next.nodes.find(n => n.id === selected.id); if (!n || n.locked) { notify('This is a fixed assignment fixture.'); return; } next.nodes = next.nodes.filter(n => n.id !== selected.id); next.edges = next.edges.filter(e => e.from.node !== selected.id && e.to.node !== selected.id); }
    else { const e = next.edges.find(e => e.id === selected.id); if (e?.locked) { notify('This wire is fixed for the experiment.'); return; } next.edges = next.edges.filter(e => e.id !== selected.id); }
    selected = null; commit(next, 'Removed.');
  }
  function selectPart(type, moduleId) { placement = { type, ...(moduleId ? { moduleId } : {}) }; pendingWire = null; mode = 'select'; renderPalette(); renderCanvas(); $('status-text').textContent = 'Click the canvas to place the component. Escape cancels.'; }
  function handlePin(node, dir, port) {
    placement = null;
    if (!pendingWire) { pendingWire = { node, dir, port }; selected = null; renderCanvas(); renderPalette(); return; }
    if (pendingWire.node === node && pendingWire.dir === dir && pendingWire.port === port) { pendingWire = null; renderCanvas(); return; }
    if (pendingWire.dir === dir) { pendingWire = { node, dir, port }; notify('Connect an output pin to an input pin.'); renderCanvas(); return; }
    const start = pendingWire.dir === 'out' ? pendingWire : { node, dir, port }, end = pendingWire.dir === 'in' ? pendingWire : { node, dir, port };
    try { const next = C.connect(graph, { node: start.node, port: start.port }, { node: end.node, port: end.port }, modules(), level.qubits); commit(next); }
    catch (e) { pendingWire = null; renderCanvas(); notify(e.message); }
  }
  function readyToRun() { if (compiled) return true; attempted = true; renderCanvas(); notify(graphError?.message || 'Finish connecting the circuit first.'); return false; }
  function step() { if (!readyToRun()) return; if (stepIndex >= compiled.count) stepIndex = 0; else stepIndex++; revealDock('state'); render(); }

  // ── Local quantum service (backend/main.py) ──────────────────────────────
  // The game is fully playable on its exact local simulator. When the service
  // runs, Qiskit independently grades every Check (Statevector fidelity +
  // Operator.equiv), samples measurements, and exports OpenQASM. Served by the
  // service (http://127.0.0.1:8000), the page can also reach IonQ; opened as a
  // file it can use only the free Qiskit endpoints, because IonQ runs can spend
  // credits and the service accepts them from its own page only.
  const servedOverHttp = /^https?:$/.test(window.location?.protocol || '');
  const SERVICE = servedOverHttp ? '' : 'http://127.0.0.1:8000';
  const service = { kind: 'local', qiskit: null, ionq: null, checking: false };
  // A host (the Qollab build's main.js) answers the same API inside the page: Qiskit runs in
  // Pyodide there, and the backend chosen in Qollab's Select QPU dialog replaces the HTTP service.
  let host = null;
  const circuitKey = () => level.id + '|' + level.qubits + '|' + JSON.stringify(graph);
  async function api(path, body, method) {
    if (host) return host.request(path, body, method);
    const options = body === undefined ? { method: method || 'GET', cache: 'no-store' } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
    const response = await fetch(SERVICE + path, options);
    let data = null; try { data = await response.json(); } catch { data = null; }
    if (!response.ok) throw Object.assign(Error(typeof data?.detail === 'string' ? data.detail : 'The quantum service answered ' + response.status + '.'), { status: response.status });
    return data;
  }
  const ionqReady = () => (host || servedOverHttp) && !!service.ionq?.configured && service.ionq.targets?.length > 0;
  function renderEngine() {
    const tag = $('engine-tag'), live = service.kind === 'qiskit';
    tag.classList.toggle('live', live);
    tag.innerHTML = `<span class="status-dot"></span> ${live ? 'QISKIT ' + esc(service.qiskit) + ' · LIVE' : 'LOCAL SIMULATION'}`;
    tag.title = live && host ? 'Check circuit is confirmed by Qiskit ' + service.qiskit + ' running in this page on Qollab (Statevector + Operator.equiv); Sample output is measured by Qiskit.'
      : live ? 'Check circuit is confirmed by Qiskit ' + service.qiskit + ' (Statevector + Operator.equiv) and Sample output is measured by Qiskit. Click to re-check the connection.'
      : 'Exact local statevector simulation. Click to look for the Quantum Foundry service (python3 backend/main.py).';
    $('qiskit-connect').innerHTML = (live ? 'Qiskit ' + esc(service.qiskit) + ' connected' : 'Connect Qiskit service') + ' <span>⇄</span>';
    renderIonQStatus();
  }
  function renderIonQStatus() {
    const ready = ionqReady(), qpu = service.ionq?.targets?.some(t => t.paid);
    $('qpu-run').disabled = false;
    const target = host ? service.ionq?.targets?.[0] : null;
    $('ionq-open').textContent = 'Run on ' + (target ? target.short || target.label : 'IonQ') + ' ↗'; $('ionq-open').title = target ? 'Run on ' + target.label + ' (chosen in Qollab’s Select QPU dialog)' : 'Run this circuit on an IonQ simulator or quantum computer';
    $('qpu-run').innerHTML = esc('Run on ' + (target ? target.label : 'IonQ')) + '… <span>' + (host ? 'QOLLAB' : 'SIM / QPU') + '</span>';
    $('qpu-status').textContent = ready ? `IonQ ready · ${service.ionq.targets.length} target${service.ionq.targets.length === 1 ? '' : 's'}${qpu ? ' incl. paid QPU' : ' (cloud simulators)'}${ionqJob && !ionqFinal(ionqJob.status) ? ' · job ' + ionqStatusName(ionqJob.status).toLowerCase() : ''}`
      : service.kind !== 'qiskit' ? 'Start the Quantum Foundry service to use IonQ.' : !servedOverHttp ? 'Open the game from http://127.0.0.1:8000 to use IonQ.' : 'Add an IonQ API key to the service to enable runs.';
  }
  async function probeEngine(quiet) {
    if (!host && window.FoundryHostPending) return; // the Qollab build attaches its host right after loading
    if (!host && typeof fetch !== 'function') { if (!quiet) notify('This browser cannot reach the Quantum Foundry service; the local simulator stays active.'); return; }
    if (service.checking) return;
    service.checking = true;
    try {
      const data = await api('/api/health');
      if (data?.service !== 'quantum-foundry') throw Error('unexpected service');
      Object.assign(service, { kind: 'qiskit', qiskit: String(data.qiskit || '?'), ionq: data.ionq || null });
      renderEngine();
      if (!quiet) notify('Qiskit ' + service.qiskit + ' connected. Check circuit is now confirmed by Qiskit' + (ionqReady() ? '; IonQ runs are available.' : '.'));
    } catch {
      const was = service.kind; Object.assign(service, { kind: 'local', qiskit: null, ionq: null }); renderEngine();
      if (!quiet) notify(was === 'qiskit' ? 'Quantum service disconnected — back to the local simulator.' : 'No Quantum Foundry service found. Start it with: python3 backend/main.py');
    }
    service.checking = false;
  }
  function lostService(error) { if (error && error.status === undefined) { Object.assign(service, { kind: 'local', qiskit: null, ionq: null }); renderEngine(); } }

  async function runOnQiskit() {
    const key = circuitKey(), [circuit] = C.serviceCircuits(level, graph, modules(), [caseIndex]);
    try {
      const data = await api('/api/run', { qubits: circuit.qubits, shots: project.settings.shots, initial: circuit.initial, operations: circuit.operations });
      if (key !== circuitKey()) return;
      const drift = Math.max(...circuit.ideal.map((p, i) => Math.abs(p - (data.probabilities?.[i] ?? 0))));
      counts = Object.fromEntries(C.labels(level.qubits).map(b => [b, Number(data.counts?.[b]) || 0]));
      countsEngine = 'sampled by Qiskit ' + (data.qiskit || service.qiskit) + (drift < 1e-9 ? ' · matches the local preview' : ' · differs from the local preview by ' + drift.toExponential(1));
      revealDock('measurements'); render(); notify('Sampled ' + project.settings.shots + ' shots on Qiskit.');
    } catch (error) {
      lostService(error); if (key !== circuitKey()) return;
      counts = C.sample(trace[trace.length - 1], project.settings.shots); countsEngine = 'random sampling';
      revealDock('measurements'); render(); notify('Qiskit sampling unavailable (' + error.message + ') — sampled locally instead.');
    }
  }
  function run() {
    pause(); if (!readyToRun()) return; stepIndex = compiled.count;
    if (service.kind === 'qiskit' && (host || typeof fetch === 'function')) { runOnQiskit(); return; }
    counts = C.sample(trace[trace.length - 1], project.settings.shots); countsEngine = 'random sampling';
    revealDock('measurements'); render(); notify('Sampled ' + project.settings.shots + ' fresh preparations of the final circuit.');
  }
  function check() {
    pause(); pendingWire = null; placement = null;
    try {
      result = C.grade(level.id, graph, modules()); qiskitVerdict = null; revealDock('tests'); compute(); stepIndex = compiled.count;
      if (service.kind === 'qiskit' && (host || typeof fetch === 'function')) { confirmOnQiskit(result); return; }
      render(); finishCheck();
    } catch (e) { attempted = true; notify(e.message); graphError = { message: e.message, nodeId: e.nodeId }; renderCanvas(); }
  }
  async function confirmOnQiskit(local) {
    const key = circuitKey(); verifying = true; render();
    let verdict;
    try { verdict = await api('/api/verify', C.verificationRequest(level.id, graph, modules())); }
    catch (error) {
      verifying = false; lostService(error); if (key !== circuitKey() || result !== local) { render(); return; }
      render(); notify('Qiskit could not grade this circuit (' + error.message + '). Graded by the local exact simulator.'); finishCheck(true); return;
    }
    verifying = false;
    if (key !== circuitKey() || result !== local) { render(); return; } // the circuit changed while Qiskit was working
    qiskitVerdict = { key, ...verdict };
    if (local.passed && !verdict.passed) {
      result = { ...local, passed: false }; render();
      notify('Qiskit disagrees with the local preview: ' + verdict.summary + '. Progress was not awarded.'); return;
    }
    render(); finishCheck();
  }
  function finishCheck(fellBack = false) {
    if (!result.passed) { const bad = result.tests.find(t => !t.passed); if (!fellBack) notify(bad.type === 'operator' ? 'The coherent operation differs. Check relative phase and port roles.' : bad.type === 'hardware' ? 'This register allows only neighboring interactions, including inside saved blocks.' : bad.type === 'resource' ? bad.label + ': place your saved component.' : 'This circuit does not satisfy ' + bad.label + '. Inspect that test and its state.'); return; }
    const best = project.best[level.id]; if (!best || result.count < best.count || result.count === best.count && result.depth < best.depth) project.best[level.id] = {count: result.count, depth: result.depth};
    project.progress[level.id] = true; persist(); renderMap(); render(); audio.chime(); completion();
  }
  const verdictNow = () => qiskitVerdict && qiskitVerdict.key === circuitKey() ? qiskitVerdict : null;

  async function exportQasm() {
    if (!readyToRun()) return;
    const name = 'quantum_foundry_' + level.id + '.qasm', c = source();
    if (service.kind === 'qiskit' && (host || typeof fetch === 'function')) {
      try {
        const [circuit] = C.serviceCircuits(level, graph, modules(), [caseIndex]);
        const data = await api('/api/qasm', { qubits: circuit.qubits, initial: circuit.initial, operations: circuit.operations });
        download(name, '// Generated by Qiskit ' + data.qiskit + ' · ' + level.title + ' · input ' + c.input + '\n// ' + data.bitOrder + '\n' + data.qasm2, 'text/plain');
        notify('OpenQASM 2.0 exported by Qiskit ' + data.qiskit + '.'); return;
      } catch (error) { lostService(error); }
    }
    download(name, C.qasm(compiled, level.qubits, typeof c.initial === 'number' ? c.initial : c.basisInput || 0, c.message, level.id), 'text/plain');
    notify('OpenQASM 2.0 exported by the local generator.');
  }

  // ── IonQ: cloud simulators and trapped-ion QPUs through qiskit-ionq ─────
  // Each run prepares one or more selected inputs and samples them on IonQ.
  // Results sit beside the ideal prediction; they never decide grading.
  let ionqJob = null, ionqPoll = null, ionqEstimateToken = 0, ionqRunUsed = false; // ionqRunUsed: Qollab's one IonQ job per Run is spent
  const IONQ_KEY = 'quantum-foundry-ionq-jobs';
  const ionqFinal = s => ['done', 'cancelled', 'failed'].includes(s);
  const ionqStatusName = s => ({ submitted: 'Submitted', queued: 'Waiting in the IonQ queue', validating: 'Validating', running: 'Running', done: 'Complete', cancelled: 'Cancelled', failed: 'Failed' }[s] || 'Unknown');
  const ionqMemory = {}; // also keeps comparisons where browser storage is unavailable (Qollab)
  function ionqContexts() {
    const saved = Object.fromEntries((project.ionqRuns || []).filter(r => r.ideal).map(r => [r.job_id, { title: r.levelTitle, levelId: r.levelId, ideal: r.ideal, labels: r.labels, qubits: r.qubits }]));
    try { const all = JSON.parse(localStorage.getItem(IONQ_KEY) || '{}'); return { ...saved, ...(all && typeof all === 'object' ? all : {}), ...ionqMemory }; } catch { return { ...saved, ...ionqMemory }; }
  }
  // Keep every IonQ run (with its counts and ideal prediction) in the project, so 💾 Save carries it.
  function recordIonqRun(job) {
    const context = ionqContexts()[job?.job_id] || {};
    const run = cleanIonqRun({ ...job, levelTitle: context.title, levelId: context.levelId, ideal: context.ideal });
    if (!run) return;
    project.ionqRuns = [run, ...(project.ionqRuns || []).filter(r => r.job_id !== run.job_id)].slice(0, MAX_SAVED_RUNS);
    persist();
  }
  function rememberIonqContext(id, context) {
    ionqMemory[id] = context;
    try { const all = { ...ionqContexts(), [id]: context }, keep = Object.keys(all).sort((a, b) => (all[b].created || 0) - (all[a].created || 0)).slice(0, 30); localStorage.setItem(IONQ_KEY, JSON.stringify(Object.fromEntries(keep.map(k => [k, all[k]])))); } catch { /* history is a convenience */ }
  }
  function ionqSetup() {
    const steps = service.kind !== 'qiskit' || !servedOverHttp
      ? '<ol><li>In a terminal: <code>cd backend</code>, create the virtual environment, and <code>pip install -r requirements.txt</code>.</li><li><code>export IONQ_API_KEY="your key"</code> (add <code>IONQ_ENABLE_QPU=1</code> for paid hardware).</li><li><code>python main.py</code>, then open <b>http://127.0.0.1:8000</b>.</li></ol>'
      : '<p>The service is running but has no IonQ API key. Stop it, run <code>export IONQ_API_KEY="your key"</code>, and start <code>python main.py</code> again. Add <code>IONQ_ENABLE_QPU=1</code> to offer paid QPUs.</p>';
    modal('Run on IonQ', `<p>Quantum Foundry can send your circuit to IonQ: the free cloud simulator (ideal or with Aria / Forte noise models) or a real trapped-ion QPU. The API key stays inside the local service.</p>${steps}<p class="lesson-note">${!servedOverHttp && service.kind === 'qiskit' ? 'Qiskit is connected, but this page was opened as a file. IonQ runs need the page served by the service at http://127.0.0.1:8000.' : 'Everything else in the game works without IonQ.'}</p>`,
      [{ label: 'Check again', run: async () => { await probeEngine(false); if (ionqReady()) ionqPanel(); } }, ...(project.ionqRuns?.length ? [{ label: 'Previous runs', run: ionqHistory }] : []), { label: 'Close', primary: true, run: closeModal }], true);
  }
  function ionqRestart() {
    modal('Save, then start a new Run', `<p>Qollab sends <b>one IonQ job per Run</b>, and this Run has already used it. To send another:</p><ol class="experiment-steps"><li><b>Save your progress.</b> Qollab keeps nothing once the Run stops.</li><li>Press <b>Stop</b>, then <b>Run</b> again and choose an IonQ simulator in Select QPU.</li><li>On the map, press <b>Import save</b> and pick the file to continue where you left off.</li></ol><p id="restart-saved" class="tiny" aria-live="polite"></p>`, [
      { label: '💾 Save progress', primary: true, run: () => { backup(); if ($('restart-saved')) $('restart-saved').textContent = host ? 'Your save is in the Qollab console below: use its download (or copy) button, then press Stop, then Run.' : 'Saved Quantum-Foundry-Backup.json. Now press Stop, then Run.'; } },
      ...(ionqJob ? [{ label: 'View last job', run: () => showIonqJob(ionqJob) }] : []),
      { label: 'Close', run: closeModal }
    ]);
  }
  function ionqPanel() {
    if (!ionqReady()) { ionqSetup(); return; }
    if (ionqRunUsed) { ionqRestart(); return; }
    if (!readyToRun()) return;
    const cases = C.cases(level), maxQubits = service.ionq.max_qubits || Infinity, all = cases.length > 1 && cases.length <= 16 && cases.length * level.qubits <= maxQubits, targets = service.ionq.targets;
    const chosen = targets.some(t => t.id === project.settings.ionqTarget) ? project.settings.ionqTarget : service.ionq.default || targets[0].id;
    modal('Run on IonQ', `<p>Prepare the selected input${all ? '(s)' : ''}, run <b>${esc(level.title)}</b> on IonQ, and compare the measured samples with the ideal prediction. These runs never change your grade — Check circuit is exact.</p>${service.ionq.note ? `<p class="lesson-note">${esc(service.ionq.note)}</p>` : ''}
      <div class="ionq-form">
        <label for="ionq-target">Target<select id="ionq-target">${targets.map(t => `<option value="${esc(t.id)}"${t.id === chosen ? ' selected' : ''}>${esc(t.label)}${t.paid ? ' · paid' : ' · free'}</option>`).join('')}</select></label>
        <label for="ionq-scope">Inputs<select id="ionq-scope"><option value="one">Selected: ${esc(source().input)}</option>${all ? `<option value="all">All ${cases.length} test inputs (one job${host ? ', side by side in one circuit' : ''})</option>` : ''}</select></label>
        <label for="ionq-shots">Shots<select id="ionq-shots">${[128, 512, 1024].map(n => `<option value="${n}"${n === project.settings.shots ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
        <label class="ionq-check" id="ionq-mitigation-row"><input type="checkbox" id="ionq-mitigation"> Error mitigation (debiasing)</label>
      </div>
      <div id="ionq-estimate" class="ionq-estimate" aria-live="polite"></div>
      <label class="ionq-check ionq-paid" id="ionq-paid-row"><input type="checkbox" id="ionq-paid"> I understand this QPU run uses paid IonQ credits.</label>
      <p id="ionq-error" class="error"></p>`,
      [{ label: 'Previous runs', run: ionqHistory }, { label: 'Cancel', run: closeModal }, { label: 'Submit to IonQ', primary: true, run: submitIonq }], true);
    for (const id of ['ionq-target', 'ionq-scope', 'ionq-shots', 'ionq-mitigation']) $(id).onchange = updateIonqForm;
    updateIonqForm();
  }
  function ionqSelection() {
    const target = service.ionq.targets.find(t => t.id === $('ionq-target').value) || service.ionq.targets[0];
    const indices = $('ionq-scope').value === 'all' ? C.cases(level).map((_, i) => i) : [caseIndex];
    return { target, indices, shots: [128, 512, 1024].includes(Number($('ionq-shots').value)) ? Number($('ionq-shots').value) : project.settings.shots, mitigation: target.paid && !!$('ionq-mitigation').checked };
  }
  function ionqBody(selection, circuits) {
    return { target: selection.target.id, shots: selection.shots, error_mitigation: selection.mitigation, name: 'Quantum Foundry · ' + level.title, circuits: circuits.map(({ ideal, ...c }) => c) };
  }
  async function updateIonqForm() {
    if (!$('ionq-target')) return;
    const selection = ionqSelection(), token = ++ionqEstimateToken;
    project.settings.ionqTarget = selection.target.id; persist();
    $('ionq-mitigation-row').hidden = !selection.target.paid; $('ionq-paid-row').hidden = !selection.target.paid; $('ionq-error').textContent = '';
    const runs = selection.indices.length + ' circuit' + (selection.indices.length === 1 ? '' : 's') + ' × ' + selection.shots + ' shots';
    if (!selection.target.paid) { $('ionq-estimate').innerHTML = `<b>Free</b> · ${runs} on the IonQ cloud simulator${selection.target.noise_model && selection.target.noise_model !== 'ideal' ? ' with the ' + esc(selection.target.noise_model) + ' noise model — expect hardware-like errors' : ' — ideal, so samples should match the prediction'}.`; return; }
    $('ionq-estimate').textContent = 'Asking IonQ for a cost estimate…';
    try {
      const estimate = await api('/api/ionq/estimate', ionqBody(selection, C.serviceCircuits(level, graph, modules(), selection.indices)));
      if (token !== ionqEstimateToken || !$('ionq-estimate')) return;
      if (typeof estimate.cost !== 'number') { $('ionq-estimate').textContent = (estimate.note || 'No estimate available.') + ' · ' + runs; return; }
      const minutes = s => s === null || s === undefined ? 'unknown' : s < 90 ? Math.round(s) + ' s' : s < 5400 ? Math.round(s / 60) + ' min' : (s / 3600).toFixed(1) + ' h';
      $('ionq-estimate').innerHTML = `<b>Estimated cost: ${esc(estimate.cost.toFixed(2))} ${esc(estimate.cost_unit)}</b> · ${runs} · queue ≈ ${esc(minutes(estimate.queue_seconds))} · run ≈ ${esc(minutes(estimate.execution_seconds))}. IonQ's estimate; your bill may differ.`;
    } catch (error) {
      if (token !== ionqEstimateToken || !$('ionq-estimate')) return;
      $('ionq-estimate').textContent = 'No estimate available (' + error.message + '). Real QPU runs may still use paid credits.';
    }
  }
  async function submitIonq() {
    const selection = ionqSelection();
    if (selection.target.paid && !$('ionq-paid').checked) { $('ionq-error').textContent = 'Tick the box to confirm paid QPU use, or choose a free simulator.'; return; }
    let circuits;
    try { circuits = C.serviceCircuits(level, graph, modules(), selection.indices); } catch (error) { $('ionq-error').textContent = error.message; return; }
    const button = $('modal-root').querySelector('[data-modal-action="2"]'); if (button) { button.disabled = true; button.textContent = 'Submitting…'; }
    try {
      const job = await api('/api/ionq/jobs', { ...ionqBody(selection, circuits), confirm_paid: selection.target.paid });
      rememberIonqContext(job.job_id, { title: level.title, levelId: level.id, qubits: level.qubits, labels: circuits.map(c => c.label), ideal: circuits.map(c => c.ideal), created: Date.now() });
      if (service.ionq?.one_job_per_run) ionqRunUsed = true;
      ionqJob = job; recordIonqRun(job); renderIonQStatus(); showIonqJob(job); watchIonq(job.job_id, selection.target.paid ? 15000 : 2500);
      notify('Submitted to ' + job.target_label + ' · job ' + job.job_id);
    } catch (error) {
      lostService(error);
      if (error.status === 429) { ionqRunUsed = true; ionqRestart(); return; }
      if ($('ionq-error')) { $('ionq-error').textContent = error.message; if (button) { button.disabled = false; button.textContent = 'Submit to IonQ'; } } else notify('IonQ: ' + error.message);
    }
  }
  function watchIonq(jobId, delay) {
    clearTimeout(ionqPoll);
    ionqPoll = setTimeout(async () => {
      const job = await refreshIonq(jobId, true);
      if (job && !ionqFinal(job.status)) watchIonq(jobId, Math.min(60000, delay * 1.5));
    }, delay);
  }
  async function refreshIonq(jobId, quiet = false) {
    try {
      const job = await api('/api/ionq/jobs/' + encodeURIComponent(jobId));
      if (!ionqJob || ionqJob.job_id === jobId) ionqJob = job;
      recordIonqRun(job);
      renderIonQStatus();
      if ($('ionq-job-view')?.dataset.job === jobId) showIonqJob(job);
      else if (ionqFinal(job.status) && quiet) notify('IonQ job ' + ionqStatusName(job.status).toLowerCase() + ': ' + job.name + '. Open Run on IonQ → Previous runs.');
      return job;
    } catch (error) { lostService(error); if (!quiet) notify('Could not read the IonQ job: ' + error.message); return null; }
  }
  function ionqComparison(job, context) {
    const n = job.qubits;
    return job.counts.map((raw, i) => {
      const ideal = context?.ideal?.[i], total = Object.values(raw).reduce((a, b) => a + b, 0) || 1, label = job.labels[i] || 'Circuit ' + (i + 1);
      const keys = new Set(Object.keys(raw).filter(k => raw[k] > 0));
      if (ideal) ideal.forEach((p, k) => { if (p > 1e-6) keys.add(C.bits(k, n)); });
      const rows = [...keys].map(bits => ({ bits, ideal: ideal ? ideal[parseInt(bits, 2)] || 0 : null, seen: (raw[bits] || 0) / total })).sort((a, b) => (b.ideal ?? 0) - (a.ideal ?? 0) || b.seen - a.seen).slice(0, 8);
      const certain = ideal ? ideal.findIndex(p => p > 1 - 1e-6) : -1, fidelity = ideal ? C.classicalFidelity(ideal, raw, n) : null;
      const headline = certain >= 0 ? `correct outcome |${C.bits(certain, n)}⟩ in <b>${((raw[C.bits(certain, n)] || 0) / total * 100).toFixed(1)}%</b> of shots` : fidelity !== null ? `distribution fidelity <b>${(fidelity * 100).toFixed(1)}%</b>` : '';
      return `<div class="ionq-case"><h4>${esc(label)} <span>${headline}</span></h4>${rows.map(r => `<div class="ionq-row"><span>|${esc(r.bits)}⟩</span><div class="ionq-bars">${r.ideal !== null ? `<div class="ideal" style="width:${(r.ideal * 100).toFixed(1)}%"></div>` : ''}<div class="device" style="width:${(r.seen * 100).toFixed(1)}%"></div></div><span>${r.ideal !== null ? (r.ideal * 100).toFixed(0) + '% → ' : ''}${(r.seen * 100).toFixed(1)}%</span></div>`).join('')}</div>`;
    }).join('');
  }
  function showIonqJob(job) {
    const context = ionqContexts()[job.job_id], done = job.status === 'done' && Array.isArray(job.counts), final = ionqFinal(job.status);
    const when = job.created ? new Date(job.created * 1000).toLocaleString() : '';
    const body = `<div id="ionq-job-view" data-job="${esc(job.job_id)}"><p><b>${esc(job.name || 'IonQ job')}</b><br>${esc(job.target_label || job.target)} · ${job.labels?.length || 1} circuit${job.labels?.length === 1 ? '' : 's'} × ${job.shots} shots${job.error_mitigation ? ' · debiased' : ''}<br><span class="tiny">Job <code>${esc(job.job_id)}</code>${when ? ' · ' + esc(when) : ''}${job.execution_seconds ? ' · ran ' + Number(job.execution_seconds).toFixed(1) + ' s' : ''}</span></p>
      <p class="ionq-status ${esc(job.status || '')}">${esc(ionqStatusName(job.status))}${final ? '' : ' · this page checks again automatically'}</p>
      ${job.error ? `<p class="error">${esc(job.error)}</p>` : ''}
      ${done ? `<div class="ionq-legend"><span class="ideal">Ideal prediction</span><span class="device">${job.paid ? 'QPU' : 'IonQ'} samples</span></div>${ionqComparison(job, context)}` : ''}
      <p class="lesson-note">${job.paid ? 'Real trapped-ion hardware: gates and readout are imperfect, so small wrong-outcome counts are expected.' : 'IonQ cloud simulator results.'} Samples cover the listed inputs only; Check circuit verifies the complete contract exactly.</p></div>`;
    modal('IonQ job', body, [
      ...(final ? [] : [{ label: 'Cancel job', run: async () => { try { ionqJob = await api('/api/ionq/jobs/' + encodeURIComponent(job.job_id) + '/cancel', {}); recordIonqRun(ionqJob); showIonqJob(ionqJob); renderIonQStatus(); } catch (error) { notify('Could not cancel: ' + error.message); } } }, { label: 'Refresh', run: () => refreshIonq(job.job_id) }]),
      { label: 'Previous runs', run: ionqHistory },
      { label: 'Close', primary: true, run: closeModal }
    ], true);
  }
  async function ionqHistory() {
    let live = [];
    if (service.kind === 'qiskit' && (host || typeof fetch === 'function')) { try { live = (await api('/api/ionq/jobs')).jobs || []; } catch (error) { lostService(error); } }
    const saved = new Map((project.ionqRuns || []).map(r => [r.job_id, r]));
    const runs = [...new Map([...live.map(j => [j.job_id, { ...saved.get(j.job_id), ...j }]), ...[...saved.values()].filter(r => !live.some(j => j.job_id === r.job_id)).map(r => [r.job_id, r])]).values()].sort((a, b) => b.created - a.created);
    modal('Previous IonQ runs', runs.length ? `<p>Newest first. Runs are kept in your project, so <b>💾 Save</b> carries them to your next session. Open one to see its results.</p>${runs.map(r => `<div class="workshop-item"><div><strong>${esc(r.name)}</strong><p>${esc(r.target_label)} · ${r.labels.length} circuit${r.labels.length === 1 ? '' : 's'} · ${esc(ionqStatusName(r.status))} · ${new Date(r.created * 1000).toLocaleString()}</p></div><button class="secondary" data-ionq-job="${esc(r.job_id)}">Open →</button></div>`).join('')}` : '<p>No IonQ runs yet.</p>',
      [...(ionqReady() ? [{ label: 'New run', run: ionqPanel }] : []), { label: 'Close', primary: true, run: closeModal }], true);
  }
  async function openIonqJob(jobId) {
    const saved = (project.ionqRuns || []).find(r => r.job_id === jobId);
    if (!saved || !ionqFinal(saved.status)) {
      // Unfinished (or unsaved) runs: ask the service for fresh status. A run from an earlier Qollab Run is unknown there.
      try {
        if (service.kind !== 'qiskit') throw Error('offline');
        const job = await api('/api/ionq/jobs/' + encodeURIComponent(jobId)); recordIonqRun(job); showIonqJob(job);
        if (!ionqFinal(job.status)) watchIonq(jobId, job.paid ? 15000 : 2500);
        return;
      } catch (error) { if (!saved) { notify('Could not read that IonQ run: ' + error.message); return; } }
    }
    showIonqJob(saved);
  }
  function nextAssignment() {
    closeModal(); const next = C.levels.find(l => l.number && !project.progress[l.id] && C.available(l, project.progress, modules()));
    if (next) openLevel(next.id); else openMap();
  }
  // ── The finale: completing the last mission ───────────────────────────────
  function finale() {
    const done = C.levels.filter(l => l.number && project.progress[l.id]).length, best = Object.values(project.best).reduce((sum, b) => sum + b.count, 0);
    const verdict = verdictNow(), runs = (project.ionqRuns || []).length;
    const built = [['Superposition & interference', 'The Hidden Sign'], ['An entangled Bell pair', 'BellPrep'], ['Superdense coding', 'Quantum Courier'], ['Qubit routing', 'Across the Register'], ['GHZ entanglement', 'A Four-Way Link'], ['Uncomputation', 'Undo the Machine'], ['Phase kickback', 'Deutsch'], ['A full quantum algorithm', 'Bernstein–Vazirani']];
    const body = `<div class="finale"><div class="finale-burst" aria-hidden="true">🎉</div><h3 class="finale-title">Foundry complete!</h3>
      <p class="finale-lead">You started with a single wire and finished with a working quantum algorithm. Every circuit along the way was yours, and every one was verified.</p>
      <div class="finale-stats"><div><b>${done} / ${totalMissions}</b>missions</div><div><b>${modules().length}</b>saved components</div><div><b>${best}</b>gates in your best builds</div><div><b>${runs}</b>IonQ run${runs === 1 ? '' : 's'}</div></div>
      <ul class="finale-built">${built.map(([what, where]) => `<li><b>${esc(what)}</b><span>${esc(where)}</span></li>`).join('')}</ul>
      ${verdict ? `<p class="grader-note qiskit">Final circuit confirmed by Qiskit ${esc(verdict.qiskit)}: ${esc(verdict.summary)}.</p>` : ''}
      <p class="tiny">Keep exploring: Sandbox goes up to six qubits, your saved blocks stay available, and every mission can be replayed for a smaller design.</p></div>`;
    modal('Hooray — you did it!', body, [
      { label: 'Keep building', run: closeModal },
      { label: '💾 Save progress', run: backup },
      { label: 'Open Sandbox', run: () => { closeModal(); openLevel('sandbox'); } },
      { label: 'Campaign map', primary: true, run: () => { closeModal(); openMap(); } }
    ], true);
    $('dialog-kicker').textContent = 'CAMPAIGN COMPLETE · ' + done + ' / ' + totalMissions;
    confetti();
    [0, 450, 900].forEach(delay => setTimeout(() => audio.chime(), delay));
  }
  function confetti() {
    const backdrop = $('modal-root').querySelector('.modal-backdrop'); if (!backdrop) return;
    const colors = ['#eaa368', '#81ccd0', '#a9ca90', '#efa298', '#e9d58a', '#b9a3e3'], rand = (a, b) => a + Math.random() * (b - a);
    const pieces = Array.from({ length: 140 }, (_, i) => `<i style="left:${rand(0, 100).toFixed(1)}%;background:${colors[i % colors.length]};width:${rand(6, 11).toFixed(0)}px;height:${rand(9, 16).toFixed(0)}px;animation-delay:${rand(0, 2.4).toFixed(2)}s;animation-duration:${rand(2.8, 5.2).toFixed(2)}s;--spin:${rand(-900, 900).toFixed(0)}deg;--drift:${rand(-90, 90).toFixed(0)}px${i % 3 ? '' : ';border-radius:50%'}"></i>`).join('');
    try { const layer = document.createElement('div'); layer.className = 'confetti'; layer.setAttribute('aria-hidden', 'true'); layer.innerHTML = pieces; backdrop.appendChild(layer); } catch { /* celebration only */ }
  }
  function completion() {
    const final = level.id === 'oracle', courier = level.id === 'courier';
    if (final) { finale(); return; }
    const body = `<p>${final ? 'All eight hidden registers recovered with one query each. You built a complete quantum algorithm from the operations you learned.' : courier ? 'Every message arrived correctly. Your saved circuits form a working communication device. Chapter II is now available: routing, registers, and algorithms.' : 'Your circuit satisfies every required test. ' + esc(level.reward) + ' unlocked.'}</p>${verdictNow() ? `<p class="grader-note qiskit">Confirmed by Qiskit ${esc(verdictNow().qiskit)}: ${esc(verdictNow().summary)}.</p>` : ''}<div class="completion-metrics"><div><b>${result.tests.length}</b>tests passed</div><div><b>${result.count}</b>gates, hardest case</div><div><b>${result.depth}</b>maximum depth</div></div>${level.targetCost ? `<p class="tiny">Compact design benchmark: ${level.targetCost} gates. Best verified build: ${project.best[level.id].count} gates. Benchmarks are optional; every correct circuit passes.</p>` : ''}${level.kind ? `<p>Package this circuit as <b>${esc(level.kind)}</b> to use it as a part in later assignments.</p><label for="component-name">Component name<input id="component-name" maxlength="32" value="${esc(level.kind)}"></label><p id="component-error" class="error"></p>` : ''}${courier ? '<p>The protocol uses one transmitted qubit and a previously shared entangled pair. Your next device will route states through a three-qubit register.</p>' : ''}${final ? '<p>Explore up to six qubits in Sandbox, combine your saved blocks, or export a selected circuit to Qiskit. Your entire campaign remains available for replay.</p>' : ''}`;
    modal(final ? 'The Hidden Register: complete' : courier ? 'Chapter I complete' : 'Circuit verified', body, [
      { label: 'Keep building', run: closeModal },
      { label: level.kind ? 'Save component & continue →' : final ? 'Campaign map' : 'Next assignment →', primary: true, run: level.kind ? () => { if (saveModule($('component-name').value)) nextAssignment(); } : final ? () => { closeModal(); openMap(); } : nextAssignment }
    ]);
  }
  function saveModule(name) {
    name = name.trim(); if (!name || name.length > 32) { if ($('component-error')) $('component-error').textContent = 'Use a name between 1 and 32 characters.'; return false; }
    if (modules().length >= C.LIMITS.modules) { if ($('component-error')) $('component-error').textContent = 'The prototype supports ' + C.LIMITS.modules + ' saved versions. Export a backup before starting another project.'; return false; }
    try {
      if (level.id !== 'sandbox' && !C.grade(level.id, graph, modules()).passed) throw Error('Verify this circuit before saving its component.');
      const compiled = C.compile(graph, modules(), level.qubits);
      const kind = level.kind || 'Custom', gates = compiled.gates.map(({ type, target, control }) => ({ type, target, ...(['CX', 'SWAP'].includes(type) ? { control } : {}) }));
      if (gates.length > C.LIMITS.moduleGates) throw Error('Saved blocks support up to ' + C.LIMITS.moduleGates + ' primitive gates.');
      const m = { id: nextId('component_'), name, kind, qubits: level.qubits, gates, graph: C.clone(graph), sourceLevel: level.id, version: 1 + modules().filter(m => m.kind === kind && m.name === name).length, created: new Date().toISOString() };
      if (!C.moduleContract(m)) throw Error('This circuit does not satisfy its component contract.');
      project.modules.push(m); persist(); render(); renderMap(); notify(name + ' saved to your components.'); return true;
    } catch (e) { if ($('component-error')) $('component-error').textContent = e.message; else notify(e.message); return false; }
  }
  function saveComponentDialog() {
    if (!compiled) { notify(graphError?.message || 'Finish the circuit first.'); return; }
    if (level.id !== 'sandbox' && (!level.kind || !result?.passed)) { notify('Pass this component assignment before saving.'); return; }
    modal('Package your circuit', `<p>Save a stable version of this circuit with ${level.qubits} input and output ports. The block contains ${compiled.count} primitive gates.</p><label for="component-name">Component name<input id="component-name" maxlength="32" value="${esc(level.kind || 'MyCircuit')}"></label><p id="component-error" class="error"></p>`, [{ label: 'Cancel', run: closeModal }, { label: 'Save component', primary: true, run: () => { if (saveModule($('component-name').value)) closeModal(); } }]);
  }
  function workshop() {
    const body = modules().length ? `<p>These are stable versions of your own verified circuits. Open a block to inspect its original schematic.</p>${modules().map(m => `<div class="workshop-item"><div><strong>${esc(m.name)}</strong><p>${esc(m.kind)} · ${m.qubits} qubits · ${m.gates.length} gates · version ${m.version}</p></div><button class="secondary" data-inspect="${esc(m.id)}">Inspect →</button></div>`).join('')}` : '<p>No components saved yet. Pass The Inverter, Conditional Flip, A Shared Pair, or Read the Bell State, then save your solution.</p>';
    modal('Component Workshop', body, [{ label: 'Back to workbench', primary: true, run: closeModal }], true);
  }
  function inspect(id) {
    const m = modules().find(m => m.id === id); if (!m) return;
    const b = m.graph.nodes, minX = Math.min(...b.map(n => n.x)) - 50, minY = Math.min(...b.map(n => n.y)) - 40, w = Math.max(...b.map(n => n.x + 96)) - minX + 50, h = Math.max(...b.map(n => n.y + geometry(n).h)) - minY + 40;
    const schematic = `<svg class="module-schematic" viewBox="${minX} ${minY} ${w} ${h}" aria-label="Saved circuit inside ${esc(m.name)}">${graphSVG(m.graph, modules(), true)}</svg>`;
    const actions = [{ label: 'Workshop', run: workshop }];
    const origin = C.getLevel(m.sourceLevel);
    if (origin && C.available(origin, project.progress, modules())) actions.push({ label: 'Edit a new version', run: () => { closeModal(); openLevel(origin.id); if (origin.id === 'sandbox') changeRegister(m.qubits); commit(C.clone(m.graph), 'Opened the saved circuit for editing. The original block stays unchanged. Undo restores the previous assignment circuit.'); fit(); } });
    actions.push({ label: 'Close', primary: true, run: closeModal });
    modal(m.name + ' · inside the block', `<p>${esc(m.kind)} · ${m.qubits} qubits · ${m.gates.length} primitive gates · version ${m.version}. ${m.kind === 'BellPrep' ? 'Preparation contract assumes input |00⟩.' : 'The stored gate sequence preserves the original input/output mapping.'}</p>${schematic}<div class="gate-list">${m.gates.map((g, i) => `${i + 1}. ${g.type === 'CX' ? 'CNOT q' + g.control + ' → q' + g.target : g.type + ' q' + g.target}`).join('<br>') || 'Direct quantum connections (identity)'}</div>`, actions, true);
  }
  function download(name, text, mime) {
    // Qollab's sandboxed page blocks browser downloads: hand the file to Qollab's console (sendFile) instead.
    if (host?.saveFile) {
      console.log('──── ' + name + ' ────\n' + text);
      host.saveFile(name, mime, text).then(() => notify(name + ' is in the Qollab console below — use its download or copy button.'), () => textFallback(name, text));
      return;
    }
    const url = URL.createObjectURL(new Blob([text], { type: mime })); const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  function textFallback(name, text) {
    modal('Copy ' + name, `<p>This page cannot save files here. Select all the text below, copy it, and save it as <b>${esc(name)}</b>.</p><textarea id="export-text" class="export-text" readonly spellcheck="false">${esc(text)}</textarea>`, [{ label: 'Select all', run: () => { $('export-text').focus(); $('export-text').select(); } }, { label: 'Done', primary: true, run: closeModal }], true);
  }
  function importText(text) {
    try {
      if (text.length > 8 * 1024 * 1024) throw Error('Project backups must be smaller than 8 MB.');
      const imported = validateProject(JSON.parse(text));
      modal('Import project backup?', '<p>This replaces the progress, circuits, and components in this browser. Download a Backup of your current work first if needed.</p>', [{ label: 'Cancel', run: closeModal }, { label: 'Import project', primary: true, run: () => {
        closeModal(); pause(); project = imported;
        // Do not persist the previous workbench over the newly imported project.
        level = levelFor(project.current, project); graph = C.clone(project.circuits[level.id] || C.starter(level.id, level.qubits)); camera = C.clone(project.cameras[level.id] || { x: 0, y: 0, zoom: 1 });
        selected = null; placement = null; pendingWire = null; undo = []; redo = []; attempted = false; caseIndex = project.inputs[level.id] || 0; stepIndex = 0; result = null; counts = null; activeTab = 'tests';
        audio.setEnabled(project.settings.music); audio.setVolume(project.settings.volume); audio.setTrack(project.settings.track); renderAudio();
        document.documentElement.style.setProperty('--dock', project.settings.dock + 'px'); compute(); render(); persist(); openMap(); notify('Project imported. Your components and progress are ready.');
      } }]);
    } catch (error) { notify('Import could not be read: ' + error.message); }
  }
  function importSave() {
    if (!host) { $('import-file').click(); return; }
    modal('Import save', '<p>Choose your saved <b>Quantum-Foundry-Backup.json</b>, or open it in a text editor, copy everything, and paste it here.</p><textarea id="import-text" class="export-text" spellcheck="false" placeholder="Paste the save text here"></textarea>', [
      { label: 'Choose file…', run: () => $('import-file').click() },
      { label: 'Cancel', run: closeModal },
      { label: 'Import pasted save', primary: true, run: () => { const text = $('import-text').value.trim(); if (!text) { notify('Paste the save text first, or choose the file.'); return; } importText(text); } }
    ]);
  }
  function backup() { persist(); download('Quantum-Foundry-Backup.json', JSON.stringify(project, null, 2), 'application/json'); notify('Backup downloaded: circuits, progress, and saved components.'); }
  function exportPython() { if (!readyToRun()) return; download('quantum_foundry_' + level.id + '.py', C.qiskit(compiled, level.qubits, typeof source().initial === 'number' ? source().initial : source().basisInput || 0, source().message, level.id), 'text/x-python'); notify('Qiskit Python exported. Its shebang is included; install Qiskit separately to run it.'); }
  function hint() { const hints = L[level.id].hints, index = Math.min(project.hints[level.id] || 0, hints.length - 1); project.hints[level.id] = index + 1; persist(); modal('Hint ' + (index + 1) + ' / ' + hints.length, `<p>${esc(hints[index])}</p>`, [{ label: 'Back to circuit', primary: true, run: closeModal }]); }

  svg.addEventListener('pointerdown', e => {
    if (e.button === 2) return;
    const p = worldPoint(e); pointer = p;
    if (e.button === 1 || spaceDown && e.button === 0) {
      e.preventDefault(); svg.focus(); svg.setPointerCapture(e.pointerId); drag = { type: 'pan', startX: e.clientX, startY: e.clientY, x: camera.x, y: camera.y }; renderCanvas(); return;
    }
    const port = e.target.closest('[data-pin]');
    if (port) { e.preventDefault(); handlePin(port.dataset.pin, port.dataset.dir, Number(port.dataset.port)); return; }
    const nodeTarget = e.target.closest('[data-node]'), edgeTarget = e.target.closest('[data-edge]');
    if (nodeTarget && nodeTarget.dataset.node !== 'ghost') {
      e.preventDefault(); svg.focus(); placement = null; pendingWire = null;
      const node = graph.nodes.find(n => n.id === nodeTarget.dataset.node); selected = { type: 'node', id: node.id }; revealDock('selected');
      if (movable(node)) { pause(); svg.setPointerCapture(e.pointerId); drag = { type: 'move', id: node.id, dx: p.x - node.x, dy: p.y - node.y, before: C.clone(graph), changed: false }; }
      render(); return;
    }
    if (edgeTarget) { placement = null; pendingWire = null; selected = { type: 'edge', id: edgeTarget.dataset.edge }; renderCanvas(); renderDock(); renderPalette(); svg.focus(); return; }
    e.preventDefault(); svg.focus();
    if (placement) {
      if (graph.nodes.length >= C.LIMITS.nodes) { notify('The prototype supports 160 parts per schematic.'); return; }
      const next = C.clone(graph), type = placement.type;
      next.nodes.push({ id: nextId('part_'), type, ...(placement.moduleId ? { moduleId: placement.moduleId } : {}), x: Math.max(-18000, Math.min(18000, Math.round(p.x / 20) * 20)), y: Math.max(-18000, Math.min(18000, Math.round(p.y / 20) * 20)) });
      placement = null; selected = { type: 'node', id: next.nodes[next.nodes.length - 1].id }; commit(next); return;
    }
    selected = null; pendingWire = null; renderCanvas(); renderDock();
  });
  svg.addEventListener('pointermove', e => {
    pointer = worldPoint(e);
    if (drag?.type === 'pan') { const s = uiScale(); camera.x = drag.x + (e.clientX - drag.startX) / s; camera.y = drag.y + (e.clientY - drag.startY) / s; renderCanvas(); }
    else if (drag?.type === 'move') {
      const node = graph.nodes.find(n => n.id === drag.id), x = Math.max(-18000, Math.min(18000, Math.round((pointer.x - drag.dx) / 20) * 20)), y = Math.max(-18000, Math.min(18000, Math.round((pointer.y - drag.dy) / 20) * 20));
      if (node.x !== x || node.y !== y) { node.x = x; node.y = y; drag.changed = true; renderCanvas(); }
    } else if (placement || pendingWire) renderCanvas();
  });
  function finishDrag() {
    if (drag?.type === 'move' && drag.changed) { undo.push(drag.before); if (undo.length > 80) undo.shift(); redo = []; invalidate(); persist(); }
    else if (drag?.type === 'pan') persist();
    drag = null; render();
  }
  svg.addEventListener('pointerup', finishDrag);
  svg.addEventListener('pointercancel', finishDrag);
  svg.addEventListener('contextmenu', e => e.preventDefault());
  svg.addEventListener('wheel', e => {
    e.preventDefault(); const b = svg.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey) zoomBy(Math.exp(-e.deltaY * .008), (e.clientX - b.left) / uiScale(), (e.clientY - b.top) / uiScale());
    else { camera.x -= e.deltaX; camera.y -= e.deltaY; renderCanvas(); persist(); }
  }, { passive: false });
  svg.addEventListener('keydown', e => {
    const p = e.target.closest('[data-pin]');
    if (p && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); handlePin(p.dataset.pin, p.dataset.dir, Number(p.dataset.port)); svg.querySelector(`circle.port[data-pin="${p.dataset.pin}"][data-dir="${p.dataset.dir}"][data-port="${p.dataset.port}"]`)?.focus(); }
  });
  $('palette').addEventListener('click', e => {
    const b = e.target.closest('[data-part],[data-module]'); if (!b) return;
    selectPart(b.dataset.part || 'MODULE', b.dataset.module); svg.focus();
  });
  $('input-buttons').addEventListener('click', e => { const b = e.target.closest('[data-input]'); if (b) chooseCase(Number(b.dataset.input)); });
  $('input-select').onchange = () => chooseCase(Number($('input-select').value));
  $('register-size').onchange = () => changeRegister(Number($('register-size').value));
  $('dock').addEventListener('click', e => {
    const tab = e.target.closest('[data-tab]'), row = e.target.closest('[data-case]');
    if (tab) { revealDock(tab.dataset.tab); renderDock(); persist(); }
    if (row) { const tab = activeTab; chooseCase(Number(row.dataset.case)); activeTab = tab; renderDock(); }
  });
  document.addEventListener('click', e => {
    const lessonTab = e.target.closest('[data-lesson-page]');
    if (lessonTab) { renderBriefingPage(Number(lessonTab.dataset.lessonPage)); lessonTab.focus(); }
    const demoInput = e.target.closest('[data-demo-input]'), demoStep = e.target.closest('[data-demo-step]');
    if (demoInput) { exampleInput = Number(demoInput.dataset.demoInput); exampleStep = 0; renderExample(); $('modal-root').querySelector(`[data-demo-input="${exampleInput}"]`)?.focus(); }
    if (demoStep) { exampleStep = Number(demoStep.dataset.demoStep); renderExample(); $('modal-root').querySelector(`[data-demo-step="${exampleStep}"]`)?.focus(); }
    if (!$('game-menu').hidden && (!e.target.closest('.menu-anchor') || e.target.closest('#game-menu') && e.target.closest('button'))) setMenu(false);
    const inspectButton = e.target.closest('[data-inspect]'); if (inspectButton) inspect(inspectButton.dataset.inspect);
    const ionqButton = e.target.closest('[data-ionq-job]'); if (ionqButton) openIonqJob(ionqButton.dataset.ionqJob);
    const action = e.target.closest('[data-action]'); if (action?.dataset.action === 'delete-selected') deleteSelected();
    if (action?.dataset.action === 'duplicate-selected' && selected?.type === 'node') {
      const original = graph.nodes.find(n => n.id === selected.id); if (!original || original.locked) return;
      if (graph.nodes.length >= C.LIMITS.nodes) { notify('The prototype supports 160 parts per schematic.'); return; }
      const next = C.clone(graph), copy = { ...C.clone(original), id: nextId('part_'), x: Math.max(-18000, Math.min(18000, original.x + 120)), y: Math.max(-18000, Math.min(18000, original.y + 80)) }; next.nodes.push(copy); selected = { type: 'node', id: copy.id }; commit(next, 'Duplicated the part. Connect its pins to use it.');
    }
  });
  $('map-nodes').addEventListener('click', e => { const b = e.target.closest('[data-level]'); if (b && !b.disabled) openLevel(b.dataset.level); });
  $('map-chapters').addEventListener('click', e => { const b = e.target.closest('[data-chapter]'); if (b) { project.settings.chapter = Number(b.dataset.chapter); persist(); renderMap(); $('map-chapters').querySelector(`[data-chapter="${project.settings.chapter}"]`)?.focus(); } });
  $('select-tool').onclick = () => { mode = 'select'; placement = null; pendingWire = null; renderCanvas(); renderPalette(); svg.focus(); };
  $('wire-tool').onclick = () => { mode = 'wire'; placement = null; renderCanvas(); renderPalette(); svg.focus(); };
  $('undo').onclick = () => history('undo'); $('redo').onclick = () => history('redo'); $('fit').onclick = fit;
  $('zoom-out').onclick = () => zoomBy(.85); $('zoom-in').onclick = () => zoomBy(1 / .85);
  $('map-button').onclick = openMap; $('map-back').onclick = () => openLevel(level.id);
  $('sandbox').onclick = () => openLevel('sandbox');
  $('demo').onclick = () => {
    const enter = () => { closeModal(); openLevel('sandbox'); if (project.settings.sandboxQubits !== 2) changeRegister(2); briefing(); commit(C.solution('sandbox'), 'Bell demo loaded. Read the gate guide, then build or inspect this circuit.'); revealDock('state'); compute(); stepIndex = compiled.count; render(); fit(); };
    const target = project.settings.sandboxQubits === 2 ? project.circuits.sandbox : project.sandboxes[2];
    if (target?.nodes.some(n => !n.locked)) modal('Load the Bell demo?', '<p>This replaces the two-qubit Sandbox circuit. Download a Backup first if you want to keep it. Other register sizes and campaign circuits stay saved. Undo restores the previous two-qubit circuit.</p>', [{ label: 'Cancel', run: closeModal }, { label: 'Load demo', primary: true, run: enter }]); else enter();
  };
  $('help').onclick = help; $('map-help').onclick = help; $('hint').onclick = hint; $('workshop').onclick = workshop; $('assignment').onclick = briefing;
  $('menu-button').onclick = () => setMenu($('game-menu').hidden);
  $('music-toggle').onclick = toggleMusic; $('map-music').onclick = toggleMusic;
  $('music-volume').oninput = () => { project.settings.volume = Number($('music-volume').value) / 100; audio.setVolume(project.settings.volume); persist(); };
  $('music-track').onchange = () => { project.settings.track = $('music-track').value; audio.setTrack(project.settings.track); persist(); renderAudio(); };
  $('music-credits').onclick = showMusicCredits; $('credits').onclick = showCredits;
  $('qpu-run').onclick = () => { setMenu(false); ionqPanel(); }; $('ionq-open').onclick = ionqPanel; $('export-qasm').onclick = exportQasm;
  document.addEventListener('visibilitychange', () => audio.visibility(document.hidden));
  $('toggle-dock').onclick = () => { project.settings.dockCollapsed = !project.settings.dockCollapsed; renderDock(); persist(); };
  $('check').onclick = check; $('run').onclick = run; $('step').onclick = () => { pause(); step(); };
  $('play').onclick = () => {
    if (interval) { pause(); return; }
    if (!readyToRun()) return;
    if (stepIndex >= compiled.count) stepIndex = 0;
    revealDock('state'); $('play').textContent = '❚❚ Pause'; render();
    interval = setInterval(() => { if (!compiled || stepIndex >= compiled.count) { pause(); return; } stepIndex++; render(); if (stepIndex >= compiled.count) pause(); }, 550);
  };
  $('rewind').onclick = () => { pause(); stepIndex = Math.max(0, stepIndex - 1); revealDock('state'); render(); };
  $('reset-execution').onclick = () => { pause(); stepIndex = 0; revealDock('state'); render(); };
  $('shots').onchange = () => { project.settings.shots = Number($('shots').value); persist(); };
  $('engine-tag').onclick = () => probeEngine(false);
  $('qiskit-connect').onclick = () => { setMenu(false); probeEngine(false); };
  $('primer-button').onclick = primerModal;
  $('primer-button').classList.toggle('pulse', !project.seenPrimer);
  $('glossary-button').onclick = () => { setMenu(false); glossaryModal(); };
  $('save-component').onclick = saveComponentDialog;
  $('backup').onclick = backup; $('import').onclick = importSave;
  $('map-save').onclick = backup; $('map-import').onclick = importSave; $('export').onclick = exportPython;
  $('reset-circuit').onclick = () => modal('Reset this schematic?', '<p>Clear your placed parts and wires for this assignment. Saved components and earned campaign progress stay available. Undo restores the circuit after a reset.</p>', [{ label: 'Cancel', run: closeModal }, { label: 'Reset circuit', primary: true, run: () => { closeModal(); selected = null; placement = null; commit(C.starter(level.id, level.qubits), 'Assignment reset. Undo can restore your circuit.'); fit(); } }]);
  $('toggle-parts').onclick = () => { project.settings.partsCollapsed = !project.settings.partsCollapsed; $('app').classList.toggle('parts-collapsed', project.settings.partsCollapsed); $('toggle-parts').setAttribute('aria-expanded', String(!project.settings.partsCollapsed)); persist(); requestAnimationFrame(fit); };
  $('import-file').onchange = async e => {
    const file = e.target.files[0]; e.target.value = ''; if (!file) return;
    if (file.size > 8 * 1024 * 1024) { notify('Import could not be read: Project backups must be smaller than 8 MB.'); return; }
    importText(await file.text());
  };
  const resizer = $('dock-resizer'); let dockDrag = null;
  const maxDockHeight = () => Math.max(130, Math.min(420, window.innerHeight / 2, layoutHeight(document.querySelector('.workspace')) - 220));
  resizer.addEventListener('pointerdown', e => { dockDrag = { y: e.clientY, height: layoutHeight($('dock')), scale: uiScale() }; resizer.setPointerCapture(e.pointerId); e.preventDefault(); });
  resizer.addEventListener('pointermove', e => { if (!dockDrag) return; project.settings.dock = Math.max(130, Math.min(maxDockHeight(), dockDrag.height + (dockDrag.y - e.clientY) / dockDrag.scale)); document.documentElement.style.setProperty('--dock', project.settings.dock + 'px'); });
  resizer.addEventListener('pointerup', () => { dockDrag = null; persist(); });
  resizer.addEventListener('keydown', e => { if (['ArrowUp', 'ArrowDown'].includes(e.key)) { e.preventDefault(); project.settings.dock = Math.max(130, Math.min(maxDockHeight(), project.settings.dock + (e.key === 'ArrowUp' ? 20 : -20))); document.documentElement.style.setProperty('--dock', project.settings.dock + 'px'); persist(); } });
  document.addEventListener('keydown', e => {
    if (!$('game-menu').hidden && e.key === 'Escape') { e.preventDefault(); setMenu(false); $('menu-button').focus(); return; }
    if ($('modal-root').firstChild) {
      if (e.key === 'Escape') { e.preventDefault(); closeModal(); return; }
      const lessonTab = e.target.closest('[data-lesson-page]');
      if (lessonTab && ['ArrowLeft','ArrowRight','Home','End'].includes(e.key)) { e.preventDefault(); const page = e.key === 'Home' ? 0 : e.key === 'End' ? 2 : (lessonPage + (e.key === 'ArrowRight' ? 1 : 2)) % 3; renderBriefingPage(page); $('lesson-tab-' + page).focus(); return; }
      if (e.key === 'Tab') { const focusable = [...$('modal-root').querySelectorAll('button,input,[tabindex="0"]')].filter(n => !n.disabled), first = focusable[0], last = focusable[focusable.length - 1]; if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); } }
      return;
    }
    const benchTab = e.target.closest('[data-tab]');
    if (benchTab && ['ArrowLeft','ArrowRight','Home','End'].includes(e.key)) { e.preventDefault(); const tabs = [...$('dock').querySelectorAll('[data-tab]')], index = tabs.indexOf(benchTab), next = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (index + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length; revealDock(tabs[next].dataset.tab); renderDock(); persist(); tabs[next].focus(); return; }
    if (!$('campaign').hidden || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (e.key === 'Escape') { placement = null; pendingWire = null; selected = null; render(); return; }
    const inCanvas = e.target === svg || svg.contains(e.target);
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); history(e.shiftKey ? 'redo' : 'undo'); return; }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); history('redo'); return; }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === ' ' && inCanvas && !e.target.hasAttribute('data-pin')) { e.preventDefault(); spaceDown = true; return; }
    if (!inCanvas) return;
    const key = e.key.toUpperCase();
    if (['DELETE', 'BACKSPACE'].includes(key)) { e.preventDefault(); deleteSelected(); }
    else if (key === 'V' || key === 'W') { mode = key === 'W' ? 'wire' : 'select'; placement = null; pendingWire = null; render(); }
    else if (key === 'F') { e.preventDefault(); fit(); }
    else if (['X', 'H', 'Z', 'C', 'S'].includes(key)) { const type = key === 'C' ? 'CX' : key === 'S' ? 'SWAP' : key; if (level.parts.includes(type) && C.arity({type}) <= level.qubits) selectPart(type); }
    else if (e.key.startsWith('Arrow') && selected?.type === 'node') {
      const n = graph.nodes.find(n => n.id === selected.id); if (!n || !movable(n)) return;
      e.preventDefault(); const next = C.clone(graph), node = next.nodes.find(n => n.id === selected.id); node.x = Math.max(-18000, Math.min(18000, node.x + (e.key === 'ArrowRight' ? 20 : e.key === 'ArrowLeft' ? -20 : 0))); node.y = Math.max(-18000, Math.min(18000, node.y + (e.key === 'ArrowDown' ? 20 : e.key === 'ArrowUp' ? -20 : 0))); commit(next);
    }
  });
  document.addEventListener('keyup', e => { if (e.key === ' ') spaceDown = false; });
  window.addEventListener('blur', () => { spaceDown = false; pause(); });
  window.addEventListener('beforeunload', persist);
  window.addEventListener('resize', () => { renderCanvas(); });

  // Read-only diagnostics for reproducible integration tests and future Qollab bridges.
  window.quantumFoundry = Object.freeze({
    getProject: () => C.clone(project),
    getCircuit: () => ({ version: 3, qubits: level.qubits, bitOrder: Array.from({length:level.qubits},(_,i)=>'q'+(level.qubits-1-i)).join(''), level: level.id, message: source().message, initial: C.clone(source().initial), graph: C.clone(graph), operations: compiled ? C.clone(compiled.gates) : null }),
    getAudioStatus: () => ({ ...audio.status() }),
    getEngine: () => ({ kind: service.kind, qiskit: service.qiskit, service: SERVICE || 'same origin', ionq: ionqReady() }),
    getStatus: () => ({ level: level.id, step: stepIndex, error: graphError?.message || null, storage: storageOK, tested: !!result, passed: !!result?.passed }),
    exportQiskit: () => { if (!compiled) throw Error(graphError?.message || 'Incomplete circuit.'); return C.qiskit(compiled, level.qubits, typeof source().initial === 'number' ? source().initial : source().basisInput || 0, source().message, level.id); },
    validateProject: raw => C.clone(validateProject(raw)),
    attachHost: next => { host = next; Object.assign(service, { kind: 'local', qiskit: null, ionq: null, checking: false }); return probeEngine(true); }
  });
  document.documentElement.style.setProperty('--dock', project.settings.dock + 'px');
  compute(); render(); renderMap(); renderAudio(); renderEngine(); probeEngine(true); $('campaign').hidden = project.lastView === 'workbench';
  requestAnimationFrame(() => { if (!$('campaign').hidden) return; if (!project.cameras[level.id]) fit(); });
  if ($('campaign').hidden && (level.number || level.id === 'sandbox')) { project.briefings[level.id] = true; persist(); briefing(); }
  if (restoreWarning) notify(restoreWarning);
})();
