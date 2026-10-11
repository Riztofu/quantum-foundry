import unittest
from unittest.mock import patch

import httpx

from backend.main import app


class FakeJob:
    def __init__(self, state="queued", counts=None, job_id="test-job-1"):
        self.state = state
        self.counts = counts or {}
        self.job_id_value = job_id

    def status(self):
        return self.state

    def job_id(self):
        return self.job_id_value

    def result(self):
        return self

    def get_counts(self):
        return self.counts


class FakeBackend:
    name = "ionq_qpu.forte-1"

    def __init__(self):
        self.circuit = None
        self.shots = None

    def run(self, circuit, shots):
        self.circuit, self.shots = circuit, shots
        return FakeJob()

    def retrieve_job(self, job_id):
        return FakeJob("done", {"10": 83, "01": 45}, job_id)


class IonQApiTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.transport = httpx.ASGITransport(app=app)
        self.client = httpx.AsyncClient(transport=self.transport, base_url="http://127.0.0.1")

    async def asyncTearDown(self):
        await self.client.aclose()

    async def test_health_only_advertises_hardware_when_key_and_qpu_target_are_configured(self):
        with patch.dict("os.environ", {"IONQ_API_KEY": "local-test-key"}):
            response = await self.client.get("/api/health")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["hardware_ready"])
        self.assertIn("qpu", response.json()["backend"])

    async def test_local_server_also_serves_the_packaged_game(self):
        response = await self.client.get("/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("Quantum Foundry", response.text)

    async def test_submission_builds_measured_circuit_and_returns_job_reference(self):
        backend = FakeBackend()
        request = {"qubits": 2, "initial": {"basis": 1}, "operations": [], "shots": 512}
        with patch("backend.main._provider_backend", return_value=(backend, backend.name)), patch(
            "backend.main._compile_for_ionq_qis", side_effect=lambda circuit: circuit
        ):
            response = await self.client.post("/api/ionq/jobs", json=request)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json(), {"job_id": "test-job-1", "backend": backend.name, "status": "queued"})
        self.assertEqual(backend.shots, 512)
        self.assertEqual(backend.circuit.num_qubits, 2)
        self.assertEqual(sum(item.operation.name == "measure" for item in backend.circuit.data), 2)

    async def test_job_polling_returns_device_counts_in_game_bit_order(self):
        backend = FakeBackend()
        with patch("backend.main._provider_backend", return_value=(backend, backend.name)):
            response = await self.client.get("/api/ionq/jobs/test-job-1")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["counts"], {"10": 83, "01": 45})
        self.assertEqual(response.json()["status"], "done")

    async def test_invalid_circuit_and_cross_origin_request_are_rejected(self):
        invalid = await self.client.post("/api/ionq/jobs", json={"qubits": 9})
        self.assertEqual(invalid.status_code, 422)
        cross_origin = await self.client.get("/api/health", headers={"Origin": "http://attacker.example"})
        self.assertEqual(cross_origin.status_code, 403)


if __name__ == "__main__":
    unittest.main()
