
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import app as app_module

app = app_module.app
app_state = app_module.app_state


class TestApplication(unittest.TestCase):

    def setUp(self):
        app.config["TESTING"] = True
        self.client = app.test_client()
        app_state["healthy"] = True
        app_state["failure_count"] = 0

        # Use a temporary file for event history during tests.
        self.temp_dir = tempfile.TemporaryDirectory()
        self.event_file_patcher = patch.object(
            app_module,
            "EVENT_FILE",
            Path(self.temp_dir.name) / "events.jsonl",
        )
        self.event_file_patcher.start()

    def tearDown(self):
        app_state["healthy"] = True
        app_state["failure_count"] = 0
        app_module.APP_HEALTH.set(1)

        self.event_file_patcher.stop()
        self.temp_dir.cleanup()

    def test_homepage(self):
        response = self.client.get("/")

        self.assertEqual(response.status_code, 200)
        self.assertIn("text/html", response.content_type)

    def test_api_status(self):
        response = self.client.get("/api/status")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.get_json()["application"],
            "Self-Healing Platform",
        )

    def test_health_check(self):
        response = self.client.get("/health")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["status"], "healthy")

    def test_unhealthy_status(self):
        app_state["healthy"] = False

        response = self.client.get("/health")

        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.get_json()["status"], "unhealthy")

    def test_failure_simulation(self):
        with patch.dict(
            os.environ,
            {"ENABLE_FAILURE_SIMULATION": "true"},
        ):
            response = self.client.get("/simulate-failure")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            self.client.get("/health").status_code,
            500,
        )

    def test_failure_simulation_disabled(self):
        with patch.dict(
            os.environ,
            {"ENABLE_FAILURE_SIMULATION": "false"},
        ):
            response = self.client.get("/simulate-failure")

        self.assertEqual(response.status_code, 404)


if __name__ == "__main__":
    unittest.main()
