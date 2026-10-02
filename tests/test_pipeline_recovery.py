import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch

import httpx
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import check_observations as C
import weather as W


class PipelineRecoveryTests(unittest.TestCase):
    def check_sequence(self, timestamps):
        conn = MagicMock()
        conn.__enter__.return_value = conn
        conn.execute.return_value.fetchone.side_effect = [(t,) for t in timestamps]
        return conn

    @patch("check_observations.connect")
    def test_delayed_actuals_reingested_then_accepted(self, connect):
        now = datetime.now(timezone.utc)
        connect.return_value = self.check_sequence([now - timedelta(hours=4), now - timedelta(hours=1)])
        sleep, ingest = MagicMock(), MagicMock()
        C.check_observations(sleep=sleep, ingest=ingest)
        sleep.assert_called_once_with(30)
        ingest.assert_called_once()
        self.assertTrue(ingest.call_args.kwargs["check"])

    @patch("check_observations.connect")
    def test_persistent_missing_actuals_fail_after_bounded_retries(self, connect):
        connect.return_value = self.check_sequence([None] * 3)
        sleep, ingest = MagicMock(), MagicMock()
        with self.assertRaisesRegex(RuntimeError, "retaining the last good"):
            C.check_observations(sleep=sleep, ingest=ingest)
        self.assertEqual(sleep.call_count, 2)
        self.assertEqual(ingest.call_count, 2)

    @patch("check_observations.connect")
    def test_fresh_actuals_need_no_reingestion(self, connect):
        connect.return_value = self.check_sequence([datetime.now(timezone.utc) - timedelta(hours=1)])
        ingest = MagicMock()
        C.check_observations(ingest=ingest)
        ingest.assert_not_called()

    @patch("weather._get_json")
    def test_missing_weather_run_uses_prior_vintage_and_records_it(self, fetch):
        error = httpx.HTTPStatusError("missing run", request=httpx.Request("GET", "https://example.test"),
                                      response=httpx.Response(400))
        raw = {"hourly": {"time": ["2026-07-20T00:00"], "wind_speed_100m": [20],
                          "shortwave_radiation": [0], "temperature_2m": [12]}}
        fetch.side_effect = [error, raw]
        origin = pd.Timestamp("2026-07-20T10:00Z")
        with tempfile.TemporaryDirectory() as directory:
            _, metadata = W.archived_forecast(origin, Path(directory), previous_runs=2)
        self.assertEqual(metadata["previous_runs_used"], 1)
        self.assertEqual(metadata["initialised_at"], "2026-07-19T18:00:00+00:00")
        self.assertLessEqual(pd.Timestamp(metadata["assumed_available_at"]), origin)

    @patch("weather._get_json")
    def test_research_requires_the_exact_run_by_default(self, fetch):
        fetch.side_effect = httpx.HTTPStatusError("missing run",
            request=httpx.Request("GET", "https://example.test"), response=httpx.Response(400))
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(httpx.HTTPStatusError):
                W.archived_forecast(pd.Timestamp("2026-07-20T10:00Z"), Path(directory))
        self.assertEqual(fetch.call_count, 1)

    @patch("weather._get_json")
    def test_all_missing_vintages_fail_after_three_candidates(self, fetch):
        fetch.side_effect = httpx.HTTPStatusError("missing run",
            request=httpx.Request("GET", "https://example.test"), response=httpx.Response(404))
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(httpx.HTTPStatusError):
                W.archived_forecast(pd.Timestamp("2026-07-20T10:00Z"), Path(directory), previous_runs=2)
        self.assertEqual(fetch.call_count, 3)

    @patch("weather.httpx.Client")
    @patch("weather.time.sleep")
    def test_missing_run_is_not_retried_as_a_network_error(self, sleep, client):
        client.return_value.__enter__.return_value.get.return_value = httpx.Response(
            400, request=httpx.Request("GET", "https://example.test"))
        with self.assertRaises(httpx.HTTPStatusError):
            W._get_json("https://example.test")
        sleep.assert_not_called()


if __name__ == "__main__":
    unittest.main()
