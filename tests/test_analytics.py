import sys
import unittest
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from analytics import patterns, price_analysis, error_stats


class AnalyticsTests(unittest.TestCase):
    def test_boundary_days_do_not_become_false_gaps(self):
        idx = pd.date_range("2026-08-01T23:30Z", periods=4, freq="30min")
        result = patterns(pd.DataFrame({"actual": [10, 20, 30, 40]}, index=idx))
        self.assertEqual(result["quality"]["missing_half_hours"], 0)
        self.assertEqual([d["expected"] for d in result["daily"]], [1, 3])

    def test_gaps_are_grouped_and_means_exclude_missing_periods(self):
        idx = pd.date_range("2026-08-01", periods=12, freq="30min", tz="UTC")
        data = pd.DataFrame({"actual": 100.0}, index=idx).drop(idx[3:7])
        result = patterns(data)
        self.assertEqual(len(result["gaps"]), 1)
        self.assertEqual(result["gaps"][0]["slots"], 4)
        self.assertEqual(result["mean"], 100)

    def test_dst_uses_london_hour_but_preserves_both_observations(self):
        idx = pd.to_datetime(["2026-10-25T00:00Z", "2026-10-25T01:00Z"])
        result = patterns(pd.DataFrame({"actual": [50, 150]}, index=idx))
        self.assertEqual(result["hourly"], [{"hour": 1, "mean": 100.0, "n": 2}])

    def test_duplicates_rejected(self):
        idx = pd.to_datetime(["2026-08-01T00:00Z", "2026-08-01T00:00Z"])
        with self.assertRaisesRegex(ValueError, "unique"):
            patterns(pd.DataFrame({"actual": [10, 20]}, index=idx))

    def test_signed_error_is_prediction_minus_actual(self):
        frame = pd.DataFrame({"group": ["A", "A"], "prediction": [80, 90], "actual": [100, 100]})
        result = error_stats(frame, "group")[0]
        self.assertEqual(result["bias"], -15)
        self.assertEqual(result["mae"], 15)

    def test_missing_price_period_cannot_be_a_complete_operating_day(self):
        idx = pd.date_range("2026-08-01", periods=48, freq="30min", tz="UTC")
        frame = pd.DataFrame({"price": 10.0, "actual": 100.0, "region": "C"}, index=idx).drop(idx[20])
        result = price_analysis(frame)
        self.assertEqual(result["complete_days"], 0)
        self.assertEqual(result["excluded_days"], 1)
        self.assertIsNone(result["correlation"])

    def test_clean_and_cheap_window_tradeoffs_and_negative_prices(self):
        idx = pd.date_range("2026-08-01", periods=48, freq="30min", tz="UTC")
        frame = pd.DataFrame({"price": 20.0, "actual": 200.0, "region": "C"}, index=idx)
        frame.loc[idx[:4], "actual"] = 10
        frame.loc[idx[10:14], "price"] = -5
        result = price_analysis(frame)
        self.assertEqual(result["different_days"], 1)
        self.assertEqual(result["mean_clean_premium"], 25)
        self.assertEqual(result["mean_carbon_difference"], 190)

    def test_regions_cannot_be_pooled(self):
        idx = pd.date_range("2026-08-01", periods=2, freq="30min", tz="UTC")
        frame = pd.DataFrame({"price": [1, 2], "actual": [100, 200], "region": ["C", "A"]}, index=idx)
        with self.assertRaisesRegex(ValueError, "one region"):
            price_analysis(frame)

    def test_fully_missing_price_day_is_counted_as_excluded(self):
        idx = pd.date_range("2026-08-01", periods=3*48, freq="30min", tz="UTC")
        frame = pd.DataFrame({"price": 10.0, "actual": 100.0, "region": "C"}, index=idx).drop(idx[48:96])
        result = price_analysis(frame)
        self.assertEqual(result["complete_days"], 2)
        self.assertEqual(result["excluded_days"], 1)


if __name__ == "__main__":
    unittest.main()
