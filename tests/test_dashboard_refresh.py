import json
import sys
import unittest
from pathlib import Path
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from refresh_dashboard import make_report


class DashboardRefreshTests(unittest.TestCase):
    def test_live_patterns_preserve_dated_benchmark(self):
        baseline = json.loads((ROOT / "data/reports/analytics.json").read_text())
        index = pd.date_range(end=pd.Timestamp.now(tz="UTC").floor("30min") - pd.Timedelta(minutes=30), periods=48, freq="30min")
        report = make_report(pd.DataFrame({"actual": 100.0}, index=index), pd.DataFrame(), baseline)
        self.assertEqual(report["patterns"]["quality"]["rows"], 48)
        self.assertEqual(report["errors"], baseline["errors"])
        self.assertEqual(report["benchmark_generated_at"], baseline["generated_at"])
        self.assertFalse(report["prices"]["available"])
        json.dumps(report, allow_nan=False)

    def test_stale_inputs_cannot_replace_last_good_report(self):
        baseline = {"errors": {}, "generated_at": "2026-01-01"}
        index = pd.date_range("2020-01-01", periods=48, freq="30min", tz="UTC")
        with self.assertRaisesRegex(ValueError, "stale"):
            make_report(pd.DataFrame({"actual": 100.0}, index=index), pd.DataFrame(), baseline)

    def test_empty_inputs_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "missing"):
            make_report(pd.DataFrame(), pd.DataFrame(), {})
