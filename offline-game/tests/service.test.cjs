'use strict';
// The packaged game talking to a fake Quantum Foundry service (backend/main.py):
// Qiskit-confirmed grading, Qiskit sampling, and the IonQ run/poll/compare flow.
const test = require('node:test'), assert = require('node:assert/strict'), { createEnvironment } = require('./dom-fixture.cjs');
const settle = async () => { for (let i = 0; i < 30; i++) await new Promise(resolve => setImmediate(resolve)); };
const TARGETS = [
  { id: 'simulator', label: 'IonQ cloud simulator (ideal)', kind: 'simulator', noise_model: 'ideal', paid: false },
  { id: 'qpu.forte-1', label: 'IonQ Forte 1 QPU', kind: 'qpu', device: 'forte-1', paid: true }
];
function fakeService(overrides = {}) {
  const calls = [], jobs = new Map();
  const routes = {
    'GET /api/health': () => ({ service: 'quantum-foundry', qiskit: '2.5.2', engine: 'qiskit-statevector', ionq: { configured: true, key: true, targets: TARGETS, default: 'simulator' } }),
    'POST /api/verify': body => ({ qiskit: '2.5.2', passed: true, summary: 'Qiskit confirms all cases', cases: body.cases.map((c, index) => ({ index, label: c.label, fidelity: 1, passed: true })), operator: body.operator ? { equivalent: true, process_fidelity: 1 } : null }),
    'POST /api/run': body => ({ qiskit: '2.5.2', probabilities: [1, 0], counts: { 0: body.shots, 1: 0 } }),
    'POST /api/ionq/estimate': () => ({ paid: true, cost: 12.34, cost_unit: 'USD', queue_seconds: 600, execution_seconds: 4 }),
    'POST /api/ionq/jobs': body => {
      const target = TARGETS.find(t => t.id === body.target), job = { job_id: 'job-' + (jobs.size + 1), status: 'submitted', target: target.id, target_label: target.label, paid: target.paid, name: body.name, labels: body.circuits.map(c => c.label), qubits: body.circuits[0].qubits, shots: body.shots, created: 1791700000 };
      jobs.set(job.job_id, job); return job;
    },
    'GET /api/ionq/jobs': () => ({ jobs: [...jobs.values()] }),
    ...overrides
  };
  const fetch = async (url, options = {}) => {
    const method = options.method || 'GET', body = options.body ? JSON.parse(options.body) : undefined, path = url.replace('http://127.0.0.1:8000', '');
    calls.push({ url, path, method, body });
    let handler = routes[method + ' ' + path];
    if (!handler && path.startsWith('/api/ionq/jobs/')) handler = routes['GET /api/ionq/jobs/:id'] || (() => jobs.get(path.split('/').pop()));
    if (!handler) return { ok: false, status: 404, json: async () => ({ detail: 'Not found' }) };
    const data = handler(body, path);
    if (data instanceof Error) throw data;
    return { ok: !data?.status_code, status: data?.status_code || 200, json: async () => data };
  };
  return { fetch, calls, jobs };
}
const served = service => createEnvironment({ fetch: service.fetch, location: { protocol: 'http:' } });

test('a live service confirms Check circuit on Qiskit before progress is awarded', async () => {
  const service = fakeService(), e = served(service); await settle();
  assert.match(e.get('engine-tag').textContent, /QISKIT 2\.5\.2 · LIVE/);
  await e.open('link'); await e.wire('in0', 'out0'); await e.get('check').click(); await settle();
  const verify = service.calls.find(c => c.path === '/api/verify');
  assert.equal(verify.body.qubits, 1); assert.equal(verify.body.cases.length, 2); assert.deepEqual(verify.body.operator.reference, []);
  assert.deepEqual(verify.body.cases[1].initial, { basis: 1 }); assert.deepEqual(verify.body.cases[1].expected, [[0, 0], [1, 0]]);
  assert.equal(e.win.quantumFoundry.getProject().progress.link, true);
  assert.match(e.get('modal-root').textContent, /Confirmed by Qiskit 2\.5\.2/);
  await e.modalAction(0);
  assert.match(e.get('dock-content').textContent, /Graded by Qiskit 2\.5\.2/); assert.match(e.get('dock-content').textContent, /F 1\.000000/);
  assert.match(e.get('test-summary').textContent, /Qiskit ✓/);
});

test('operator contracts and Bell inputs reach Qiskit as amplitudes plus a reference operation', async () => {
  const service = fakeService(), e = served(service); await settle();
  const decode = JSON.parse(JSON.stringify(e.win.FoundryCore.verificationRequest('decode', e.win.FoundryCore.solution('decode'), [])));
  assert.equal(decode.cases.length, 4); assert.ok(decode.cases.every(c => Array.isArray(c.initial.state) && c.initial.state.length === 4));
  assert.deepEqual(decode.operator.reference, [{ type: 'CX', control: 0, target: 1 }, { type: 'H', target: 0 }]);
});

test('a Qiskit disagreement withholds progress, and an unreachable service falls back honestly', async () => {
  const refusing = fakeService({ 'POST /api/verify': body => ({ qiskit: '2.5.2', passed: false, summary: '1/2 cases differ', cases: body.cases.map((c, index) => ({ index, label: c.label, fidelity: index ? 0 : 1, passed: !index })), operator: { equivalent: false, process_fidelity: 0.5 } }) });
  let e = served(refusing); await settle();
  await e.open('link'); await e.wire('in0', 'out0'); await e.get('check').click(); await settle();
  assert.notEqual(e.win.quantumFoundry.getProject().progress.link, true);
  assert.match(e.get('status-text').textContent, /Qiskit disagrees/); assert.equal(e.get('modal-root').firstChild, null);

  const offline = fakeService({ 'POST /api/verify': () => new TypeError('Failed to fetch') });
  e = served(offline); await settle();
  await e.open('link'); await e.wire('in0', 'out0'); await e.get('check').click(); await settle();
  assert.equal(e.win.quantumFoundry.getProject().progress.link, true);
  assert.match(e.get('engine-tag').textContent, /LOCAL SIMULATION/);
});

test('Sample output is measured by Qiskit while the service runs', async () => {
  const service = fakeService(), e = served(service); await settle();
  await e.open('link'); await e.wire('in0', 'out0'); await e.get('run').click(); await settle();
  const run = service.calls.find(c => c.path === '/api/run');
  assert.deepEqual(run.body, { qubits: 1, shots: 512, initial: { basis: 0 }, operations: [] });
  assert.match(e.get('dock-content').textContent, /sampled by Qiskit 2\.5\.2 · matches the local preview/);
});

test('IonQ simulator runs submit every selected input, poll, and compare with the ideal prediction', async () => {
  const service = fakeService(), e = served(service); await settle();
  await e.get('demo').click(); await e.begin();
  await e.get('ionq-open').click(); assert.match(e.get('dialog-title').textContent, /Run on IonQ/);
  assert.match(e.get('ionq-estimate').textContent, /Free/);
  e.get('ionq-scope').value = 'all'; e.get('ionq-shots').value = '1024';
  await e.modalAction(2); await settle();
  const submit = service.calls.find(c => c.path === '/api/ionq/jobs' && c.method === 'POST');
  assert.equal(submit.body.target, 'simulator'); assert.equal(submit.body.shots, 1024); assert.equal(submit.body.confirm_paid, false);
  assert.equal(submit.body.circuits.length, 4); assert.ok(submit.body.circuits.every(c => c.qubits === 2 && !('ideal' in c)));
  assert.ok(submit.body.circuits[0].operations.some(op => op.type === 'CX'));
  assert.match(e.get('dialog-title').textContent, /IonQ job/); assert.match(e.get('modal-root').textContent, /Submitted/);

  const job = service.jobs.get('job-1'); Object.assign(job, { status: 'done', counts: [{ '00': 500, '11': 510, '01': 14 }, { '01': 512, '10': 512 }, { '00': 512, '11': 512 }, { '01': 512, '10': 512 }] });
  await e.modalAction(1); await settle(); // Refresh
  const text = e.get('modal-root').textContent;
  assert.match(text, /Complete/); assert.match(text, /distribution fidelity/); assert.match(text, /\|00⟩/);
  assert.match(e.get('qpu-status').textContent, /IonQ ready/);
});

test('paid QPU runs show IonQ\'s estimate and require explicit confirmation', async () => {
  const service = fakeService(), e = served(service); await settle();
  await e.get('demo').click(); await e.begin();
  await e.get('ionq-open').click();
  e.get('ionq-target').value = 'qpu.forte-1'; await e.get('ionq-target').dispatch('change'); await settle();
  assert.match(e.get('ionq-estimate').textContent, /Estimated cost: 12\.34 USD/); assert.equal(e.get('ionq-paid-row').hidden, false);
  await e.modalAction(2); await settle();
  assert.equal(service.calls.some(c => c.path === '/api/ionq/jobs' && c.method === 'POST'), false);
  assert.match(e.get('ionq-error').textContent, /confirm paid QPU use/);
  e.get('ionq-paid').checked = true; await e.modalAction(2); await settle();
  const submit = service.calls.find(c => c.path === '/api/ionq/jobs' && c.method === 'POST');
  assert.equal(submit.body.target, 'qpu.forte-1'); assert.equal(submit.body.confirm_paid, true); assert.equal(submit.body.circuits.length, 1);
});

test('a page opened as a file uses free Qiskit on 127.0.0.1:8000 but explains how to reach IonQ', async () => {
  const service = fakeService(), e = createEnvironment({ fetch: service.fetch }); await settle();
  assert.equal(service.calls[0].url, 'http://127.0.0.1:8000/api/health');
  assert.match(e.get('engine-tag').textContent, /QISKIT 2\.5\.2/);
  await e.get('demo').click(); await e.begin(); await e.get('ionq-open').click();
  assert.match(e.get('modal-root').textContent, /opened as a file/);
  assert.equal(service.calls.some(c => c.path.startsWith('/api/ionq')), false);
});

test('an attached host (the Qollab build) replaces the HTTP service for grading and runs', async () => {
  const service = fakeService(), calls = [];
  const host = { request: async (path, body) => { calls.push(path); const r = await service.fetch(path, body ? { method: 'POST', body: JSON.stringify(body) } : {}); return r.json(); } };
  const e = createEnvironment(); // no fetch, no location: like Qollab's sandboxed frame
  assert.match(e.get('engine-tag').textContent, /LOCAL SIMULATION/);
  await e.win.quantumFoundry.attachHost(host); await settle();
  assert.match(e.get('engine-tag').textContent, /QISKIT 2\.5\.2 · LIVE/); assert.equal(e.win.quantumFoundry.getEngine().ionq, true);
  await e.open('link'); await e.wire('in0', 'out0'); await e.get('check').click(); await settle();
  assert.ok(calls.includes('/api/verify')); assert.equal(e.win.quantumFoundry.getProject().progress.link, true);
});

test('every game script publishes its globals even where a CommonJS `module` exists (Qollab)', () => {
  const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
  const window = {}, sandbox = { window, globalThis: window, module: { exports: {} }, console };
  vm.createContext(sandbox);
  for (const file of ['core.js', 'lessons.js', 'audio.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'source', file), 'utf8'), sandbox);
  const root = sandbox.window.FoundryLessons ? sandbox.window : sandbox;
  assert.ok(root.FoundryLessons?.link?.goal, 'FoundryLessons'); assert.ok(root.FoundryPrimer?.length, 'FoundryPrimer'); assert.ok(root.FoundryGlossary?.length, 'FoundryGlossary');
  assert.ok((sandbox.window.FoundryCore || sandbox.FoundryCore)?.levels, 'FoundryCore'); assert.ok(sandbox.window.FoundryAudio?.create, 'FoundryAudio');
});

test('on Qollab a second IonQ run asks the player to save, then Stop and Run again', async () => {
  const service = fakeService();
  const host = { request: async (path, body) => {
    const r = await service.fetch(path, body ? { method: 'POST', body: JSON.stringify(body) } : {}), data = await r.json();
    if (path === '/api/health') data.ionq.one_job_per_run = true;
    return data;
  } };
  const e = createEnvironment(); await e.win.quantumFoundry.attachHost(host); await settle();
  await e.get('demo').click(); await e.begin();
  await e.get('ionq-open').click(); await e.modalAction(2); await settle();
  assert.match(e.get('dialog-title').textContent, /IonQ job/);
  await e.key('Escape'); assert.equal(e.get('modal-root').firstChild, null);
  await e.get('ionq-open').click();
  assert.match(e.get('dialog-title').textContent, /Save, then start a new Run/);
  assert.match(e.get('modal-root').textContent, /one IonQ job per Run/); assert.match(e.get('modal-root').textContent, /Import save/);
  const posts = service.calls.filter(c => c.path === '/api/ionq/jobs' && c.method === 'POST').length;
  await e.modalAction(0); // 💾 Save progress
  assert.equal(e.doc.downloads.at(-1).name, 'Quantum-Foundry-Backup.json');
  assert.match(e.get('restart-saved').textContent, /press Stop, then Run/);
  assert.equal(service.calls.filter(c => c.path === '/api/ionq/jobs' && c.method === 'POST').length, posts, 'no second job was sent');
});

test('the main menu has Save and Import save buttons', async () => {
  const e = createEnvironment();
  assert.equal(e.get('campaign').hidden, false);
  await e.get('map-save').click();
  assert.equal(e.doc.downloads.at(-1).name, 'Quantum-Foundry-Backup.json');
  const saved = JSON.parse(await e.doc.downloads.at(-1).blob.text()); assert.equal(saved.format, 'quantum-foundry-project');
  let opened = false; e.get('import-file').addEventListener('click', () => { opened = true; });
  await e.get('map-import').click(); assert.equal(opened, true);
});
