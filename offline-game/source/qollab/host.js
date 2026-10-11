// Quantum Foundry on Qollab: answers the game's service API inside the page.
// Qiskit runs in Qollab's in-browser Python (foundry/bridge.py); hardware-style runs go to the
// backend picked in Qollab's Select QPU dialog. IonQ backends accept one job per Run.

const fail = (message, status) => Object.assign(new Error(message), { status });

export function createHost(bridge, backend) {
  const call = async (name, ...args) => {
    const out = JSON.parse(await bridge[name].callPromising(...args));
    if (!out.ok) throw fail(out.detail, out.status);
    return out.data;
  };
  const jobs = new Map();
  let info = null, used = false, sequence = 0;
  const describe = async () => (info ??= await call('describe', backend));

  async function health() {
    const d = await describe();
    const note = d.ionq
      ? `This page runs on ${d.label}, chosen in Qollab's Select QPU dialog. IonQ accepts one job per Run, so several inputs travel side by side in one circuit.${d.paid ? ' Real hardware uses your Qollab credits.' : ''}`
      : `This page runs on ${d.label}, chosen in Qollab's Select QPU dialog. Choose an IonQ simulator there (Stop, then Run) to sample on IonQ's cloud.`;
    return {
      service: 'quantum-foundry', host: 'qollab', engine: 'qiskit-statevector', qiskit: d.qiskit,
      ionq: { configured: true, key: true, provider: 'Qollab', qpu_enabled: d.paid, default: 'qollab', max_qubits: d.max_qubits, one_job_per_run: d.ionq, note,
        targets: [{ id: 'qollab', label: d.label, short: d.short, kind: d.paid ? 'qpu' : 'simulator', noise_model: d.noise_model, paid: d.paid }] }
    };
  }

  async function submit(body) {
    const d = await describe();
    if (d.ionq && used) throw fail('Qollab allows one IonQ job per Run, and this Run already sent one. Press Stop, then Run again to send another.', 429);
    used = true;
    const id = 'qollab-' + (++sequence), record = {
      job_id: id, status: 'running', target: 'qollab', target_label: d.label, paid: d.paid, name: body.name,
      labels: body.circuits.map(c => c.label), qubits: body.circuits[0].qubits, shots: body.shots,
      error_mitigation: !!(d.paid && body.error_mitigation), created: Date.now() / 1000
    };
    jobs.set(id, record);
    call('run_on_backend', backend, JSON.stringify(body)).then(
      out => Object.assign(record, { status: 'done', counts: out.counts, execution_seconds: out.seconds }),
      error => Object.assign(record, { status: 'failed', error: error.message }));
    return { ...record };
  }

  return {
    name: 'qollab',
    async request(path, body) {
      if (path === '/api/health') return health();
      if (path === '/api/verify') return call('verify', JSON.stringify(body));
      if (path === '/api/run') return call('simulate', JSON.stringify(body));
      if (path === '/api/qasm') return call('export', JSON.stringify(body));
      if (path === '/api/ionq/estimate') {
        const d = await describe();
        return { paid: d.paid, cost: null, note: d.paid ? 'Real IonQ hardware: Qollab charges credits for this run' : 'Free on Qollab' };
      }
      if (path === '/api/ionq/jobs') return body ? submit(body) : { jobs: [...jobs.values()].reverse().map(j => ({ ...j })) };
      const match = path.match(/^\/api\/ionq\/jobs\/([^/]+)(\/cancel)?$/);
      if (match) {
        const record = jobs.get(decodeURIComponent(match[1]));
        if (!record) throw fail('This Run did not submit that job.', 404);
        if (match[2]) throw fail('Use Qollab’s Stop button to end a run.', 400);
        return { ...record };
      }
      throw fail('Not available on Qollab: ' + path, 404);
    }
  };
}
