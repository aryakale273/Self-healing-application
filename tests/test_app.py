
import os
import unittest
from unittest.mock import patch

from app import app, app_state


class TestApplication(unittest.TestCase):

    def setUp(self):
        app.config["TESTING"] = True
        self.client = app.test_client()
        app_state["healthy"] = True

    def tearDown(self):
        app_state["healthy"] = True

    def test_homepage(self):
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.get_json()["application"],
            "Self-Healing Platform"
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
            os.environ, {"ENABLE_FAILURE_SIMULATION": "true"}
        ):
            response = self.client.get("/simulate-failure")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            self.client.get("/health").status_code, 500
        )

    def test_failure_simulation_disabled(self):
        with patch.dict(
            os.environ, {"ENABLE_FAILURE_SIMULATION": "false"}
        ):
            response = self.client.get("/simulate-failure")

        self.assertEqual(response.status_code, 404)


if __name__ == "__main__":
    unittest.main()
