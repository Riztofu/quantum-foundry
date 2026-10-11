"""HTTP API: Qiskit endpoints, trust boundaries, and the IonQ job lifecycle with a fake provider.

No test contacts IonQ or spends credits; ``ionq.get_backend`` is replaced by a
fake that behaves like a qiskit-ionq backend (run / retrieve_job / cancel_job /
client.estimate_job).
"""
import math
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import httpx
from qiskit.quantum_info import Statevector
from qiskit_ionq.helpers import qiskit_circ_to_ionq_circ

from backend import ionq
from backend.circuit import validate_circuit
from backend.main import app

R2 = 1 / math.sqrt(2)
BELL_OPS = [{"type": "H", "target": 0}, {"type": "CX", "control": 0, "target": 1}]


class FakeStatus:
    def __init__(self, name):
        self.name = name


class FakeResult:
    def __init__(self, counts):
        self.counts = counts

    def get_counts(self, index):
        return self.counts[index]


class FakeJob:
    def __init__(self, job_id, state="QUEUED", counts=None, failure=None):
        self.job_id_value, self.state, self.counts, self.failure = job_id, state, counts or [], failure

    def job_id(self):
        return self.job_id_value

    def status(self):
        if self.failure:
            from qiskit_ionq.exceptions import IonQJobFailureError
            raise IonQJobFailureError(self.failure)
        return FakeStatus(self.state)

    def result(self):
        return FakeResult(self.counts)


class FakeEstimate:
    cost, cost_unit, exec_time, queue_time = 1.25, "USD", 3.0, 900.0


class FakeClient:
    def __init__(self):
        self.estimates = []

    def estimate_job(self, **kwargs):
        self.estimates.append(kwargs)
        return FakeEstimate()


class FakeBackend:
    def __init__(self, name="ionq_simulator"):
        self.name, self.client, self.runs, self.cancelled = name, FakeClient(), [], []
        self.jobs = {}

    def run(self, circuits, **options):
        self.runs.append((circuits, options))
        job = FakeJob("job-{}".format(len(self.runs)), "INITIALIZING")
        self.jobs[job.job_id()] = job
        return job

    def retrieve_job(self, job_id):
        return self.jobs[job_id]

    def cancel_job(self, job_id):
        self.cancelled.append(job_id)
        self.jobs[job_id].state = "CANCELLED"


class ApiTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.patches = [
            patch.object(ionq, "JOBS_FILE", Path(self.tmp.name) / "jobs.json"),
            patch.dict(os.environ, {"IONQ_API_KEY": "test-key"}, clear=False),
        ]
        for p in self.patches:
            p.start()
        os.environ.pop("IONQ_ENABLE_QPU", None)
        os.environ.pop("IONQ_TARGETS", None)
        self.backend = FakeBackend()
        self.get_backend = patch.object(ionq, "get_backend", return_value=self.backend)
        self.get_backend.start()
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://127.0.0.1:8000")

    async def asyncTearDown(self):
        await self.client.aclose()
        self.get_backend.stop()
        for p in reversed(self.patches):
            p.stop()
        self.tmp.cleanup()

    def job_request(self, target="simulator", circuits=None, **extra):
        circuits = circuits or [{"label": "|00⟩", "qubits": 2, "initial": {"basis": 0}, "operations": BELL_OPS}]
        return {"target": target, "shots": 512, "name": "Quantum Foundry · A Shared Pair", "circuits": circuits, **extra}

    # ── Qiskit endpoints and trust boundaries ──

    async def test_health_reports_qiskit_and_free_targets_only_by_default(self):
        data = (await self.client.get("/api/health")).json()
        self.assertEqual(data["service"], "quantum-foundry")
        self.assertTrue(data["ionq"]["configured"])
        self.assertEqual([t["id"] for t in data["ionq"]["targets"]], ["simulator", "simulator@aria-1", "simulator@forte-1"])
        self.assertFalse(any(t["paid"] for t in data["ionq"]["targets"]))

    async def test_qpu_targets_require_explicit_opt_in(self):
        with patch.dict(os.environ, {"IONQ_ENABLE_QPU": "1", "IONQ_TARGETS": "simulator,qpu.forte-1,bogus target"}):
            data = (await self.client.get("/api/health")).json()
        self.assertEqual([t["id"] for t in data["ionq"]["targets"]], ["simulator", "qpu.forte-1"])
        self.assertTrue(data["ionq"]["targets"][1]["paid"])

    async def test_qiskit_endpoints_answer_file_pages_with_cors(self):
        response = await self.client.post("/api/verify", headers={"Origin": "null"}, json={
            "qubits": 2, "cases": [{"label": "|00⟩", "initial": {"basis": 0}, "operations": BELL_OPS, "expected": [[R2, 0], [0, 0], [0, 0], [R2, 0]]}]})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertTrue(response.json()["passed"])
        self.assertEqual(response.headers["access-control-allow-origin"], "*")
        preflight = await self.client.options("/api/run", headers={"Origin": "null", "Access-Control-Request-Method": "POST"})
        self.assertEqual(preflight.status_code, 204)
        self.assertEqual(preflight.headers["access-control-allow-private-network"], "true")

    async def test_ionq_rejects_other_origins_and_file_pages(self):
        for origin in ("null", "http://attacker.example"):
            response = await self.client.post("/api/ionq/jobs", headers={"Origin": origin}, json=self.job_request())
            self.assertEqual(response.status_code, 403)
        self.assertEqual(self.backend.runs, [])

    async def test_non_local_hosts_are_rejected(self):
        response = await self.client.get("/api/health", headers={"Host": "evil.example:8000"})
        self.assertEqual(response.status_code, 403)

    async def test_service_also_serves_the_packaged_game(self):
        response = await self.client.get("/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("Quantum Foundry", response.text)

    async def test_invalid_requests_get_player_readable_422s(self):
        response = await self.client.post("/api/run", json={"qubits": 9})
        self.assertEqual(response.status_code, 422)
        self.assertIn("one to six qubits", response.json()["detail"])

    # ── IonQ lifecycle ──

    async def test_simulator_batch_submits_measured_circuits_in_one_job(self):
        circuits = [{"label": "|0{}⟩".format(b), "qubits": 2, "initial": {"basis": b}, "operations": BELL_OPS} for b in (0, 1)]
        response = await self.client.post("/api/ionq/jobs", json=self.job_request(circuits=circuits))
        self.assertEqual(response.status_code, 200, response.text)
        job = response.json()
        self.assertEqual((job["job_id"], job["status"], job["target"], job["paid"]), ("job-1", "submitted", "simulator", False))
        submitted, options = self.backend.runs[0]
        self.assertEqual(len(submitted), 2)
        self.assertEqual(options, {"shots": 512, "name": "Quantum Foundry · A Shared Pair"})
        for circuit in submitted:
            self.assertEqual(circuit.num_qubits, 2)  # never padded to the device size
            self.assertEqual(sum(item.operation.name == "measure" for item in circuit.data), 2)
            qiskit_circ_to_ionq_circ(circuit)  # serializes in IonQ's QIS gate set

    async def test_paid_qpu_needs_confirmation_and_passes_error_mitigation(self):
        with patch.dict(os.environ, {"IONQ_ENABLE_QPU": "1"}):
            refused = await self.client.post("/api/ionq/jobs", json=self.job_request("qpu.forte-1", error_mitigation=True))
            self.assertEqual(refused.status_code, 428)
            self.assertEqual(self.backend.runs, [])
            accepted = await self.client.post("/api/ionq/jobs", json=self.job_request("qpu.forte-1", error_mitigation=True, confirm_paid=True))
        self.assertEqual(accepted.status_code, 200, accepted.text)
        from qiskit_ionq import ErrorMitigation
        self.assertIs(self.backend.runs[0][1]["error_mitigation"], ErrorMitigation.DEBIASING)
        self.assertTrue(accepted.json()["paid"])

    async def test_disabled_targets_are_refused(self):
        response = await self.client.post("/api/ionq/jobs", json=self.job_request("qpu.forte-1", confirm_paid=True))
        self.assertEqual(response.status_code, 400)

    async def test_estimate_uses_ionq_pricing_for_qpus_and_is_free_for_simulators(self):
        free = (await self.client.post("/api/ionq/estimate", json=self.job_request())).json()
        self.assertEqual((free["paid"], free["cost"]), (False, 0.0))
        with patch.dict(os.environ, {"IONQ_ENABLE_QPU": "1"}):
            paid = (await self.client.post("/api/ionq/estimate", json=self.job_request("qpu.forte-1"))).json()
        self.assertEqual((paid["cost"], paid["cost_unit"], paid["queue_seconds"]), (1.25, "USD", 900.0))
        call = self.backend.client.estimates[0]
        self.assertEqual((call["backend"], call["qubits"], call["shots"], call["twoq_gates"]), ("qpu.forte-1", 2, 512, 1))

    async def test_polling_returns_per_circuit_counts_in_game_bit_order(self):
        circuits = [{"label": label, "qubits": 2, "initial": {"basis": 0}, "operations": BELL_OPS} for label in ("a", "b")]
        job_id = (await self.client.post("/api/ionq/jobs", json=self.job_request(circuits=circuits))).json()["job_id"]
        queued = (await self.client.get("/api/ionq/jobs/" + job_id)).json()
        self.assertEqual(queued["status"], "submitted")
        self.backend.jobs[job_id].state = "DONE"
        self.backend.jobs[job_id].counts = [{"00": 250, "11": 262}, {"0x0": 10, "0x3": 502}]
        done = (await self.client.get("/api/ionq/jobs/" + job_id)).json()
        self.assertEqual(done["status"], "done")
        self.assertEqual(done["counts"], [{"00": 250, "11": 262}, {"00": 10, "11": 502}])
        self.assertEqual(done["labels"], ["a", "b"])

    async def test_failed_jobs_report_ionq_reason(self):
        job_id = (await self.client.post("/api/ionq/jobs", json=self.job_request())).json()["job_id"]
        self.backend.jobs[job_id].failure = 'Failure from IonQ API "QuotaExhausted: no credits"'
        data = (await self.client.get("/api/ionq/jobs/" + job_id)).json()
        self.assertEqual(data["status"], "failed")
        self.assertIn("no credits", data["error"])

    async def test_cancel_and_job_history(self):
        job_id = (await self.client.post("/api/ionq/jobs", json=self.job_request())).json()["job_id"]
        cancelled = (await self.client.post("/api/ionq/jobs/{}/cancel".format(job_id))).json()
        self.assertEqual(cancelled["status"], "cancelled")
        self.assertEqual(self.backend.cancelled, [job_id])
        history = (await self.client.get("/api/ionq/jobs")).json()["jobs"]
        self.assertEqual([j["job_id"] for j in history], [job_id])

    async def test_unknown_and_malformed_job_ids(self):
        self.assertEqual((await self.client.get("/api/ionq/jobs/never-submitted")).status_code, 404)
        self.assertEqual((await self.client.get("/api/ionq/jobs/bad%20id")).status_code, 400)

    async def test_missing_key_is_explained(self):
        self.get_backend.stop()
        try:
            with patch.dict(os.environ, {"IONQ_API_KEY": "", "QISKIT_IONQ_API_TOKEN": "", "IONQ_API_TOKEN": ""}):
                ionq._backends.clear()
                response = await self.client.post("/api/ionq/jobs", json=self.job_request())
        finally:
            self.get_backend.start()
        self.assertEqual(response.status_code, 503)
        self.assertIn("IONQ_API_KEY", response.json()["detail"])

    async def test_ionq_api_errors_become_actionable_messages(self):
        from qiskit_ionq.exceptions import IonQAPIError

        self.backend.run = lambda *a, **k: (_ for _ in ()).throw(IonQAPIError("Invalid API key", 401, {}, "", "auth"))
        response = await self.client.post("/api/ionq/jobs", json=self.job_request())
        self.assertEqual(response.status_code, 502)
        self.assertIn("rejected the API key", response.json()["detail"])


class IonQCircuitTests(unittest.TestCase):
    def compiled_state(self, request):
        compiled = ionq.compile_for_ionq(validate_circuit(request))
        self.assertEqual(compiled.num_qubits, request["qubits"])
        for item in compiled.data:
            self.assertIn(item.operation.name, ionq.QIS_BASIS + ["measure", "barrier"])
        return Statevector.from_instruction(compiled.remove_final_measurements(inplace=False))

    def test_basis_input_and_bell_circuit(self):
        state = self.compiled_state({"qubits": 2, "initial": {"basis": 0}, "operations": BELL_OPS})
        self.assertTrue(state.equiv(Statevector([R2, 0, 0, R2])))

    def test_arbitrary_amplitude_input_is_prepared_then_evolved(self):
        amps = [[math.sqrt(0.1), 0], [0, math.sqrt(0.2)], [math.sqrt(0.3), 0], [0, math.sqrt(0.4)]]
        request = {"qubits": 2, "initial": {"state": amps}, "operations": [{"type": "SWAP", "control": 0, "target": 1}, {"type": "Z", "target": 1}]}
        state = self.compiled_state(request)
        expected = Statevector([complex(*a) for a in amps]).evolve(
            __import__("backend.quantum", fromlist=["operations_circuit"]).operations_circuit(2, validate_circuit(request)["operations"]))
        self.assertTrue(state.equiv(expected))
        serialized, measured, _ = qiskit_circ_to_ionq_circ(ionq.compile_for_ionq(validate_circuit(request)))
        self.assertGreater(len(serialized), 0)
        self.assertEqual(measured, 2)


if __name__ == "__main__":
    unittest.main()
