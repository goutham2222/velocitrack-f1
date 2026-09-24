import sys
import unittest
from fastapi.testclient import TestClient
from app.main import app


class TestVelociTrackAPI(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_health_check(self):
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "healthy"})

    def test_root_endpoint(self):
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["service"], "VelociTrack F1 Telemetry Engine")
        self.assertEqual(data["status"], "online")

    def test_available_years(self):
        response = self.client.get("/api/sessions/years")
        self.assertEqual(response.status_code, 200)
        years = response.json()
        self.assertIn(2024, years)
        self.assertIn(2023, years)

    def test_events_for_year(self):
        response = self.client.get("/api/sessions/events?year=2024")
        self.assertEqual(response.status_code, 200)
        events = response.json()
        self.assertGreater(len(events), 0)
        # Check event structure
        first = events[0]
        self.assertIn("round_number", first)
        self.assertIn("event_name", first)
        self.assertIn("country", first)

    def test_event_details(self):
        response = self.client.get("/api/sessions/details?year=2024&event=Monaco%20Grand%20Prix")
        self.assertEqual(response.status_code, 200)
        details = response.json()
        self.assertEqual(details["year"], 2024)
        self.assertIn("sessions", details)
        self.assertGreater(len(details["sessions"]), 0)

    def test_demo_replay(self):
        response = self.client.get("/api/telemetry/demo?sampling_rate=10&laps=1")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertIn("metadata", payload)
        self.assertIn("circuit", payload)
        self.assertIn("drivers", payload)
        self.assertIn("timestamps", payload)
        self.assertIn("weather", payload)

        # Check circuit structure
        circuit = payload["circuit"]
        self.assertGreater(len(circuit["centerline"]), 10)
        self.assertGreater(circuit["track_length_m"], 1000)

        # Check drivers
        drivers = payload["drivers"]
        self.assertIn("VER", drivers)
        ver = drivers["VER"]
        self.assertEqual(len(ver["x"]), payload["metadata"]["total_frames"])
        self.assertEqual(len(ver["speed"]), payload["metadata"]["total_frames"])
        self.assertEqual(len(ver["rpm"]), payload["metadata"]["total_frames"])


if __name__ == "__main__":
    unittest.main()

