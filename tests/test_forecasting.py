import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import features as F
import weather as W
from artifacts import save_run
from backtest import data_quality, rolling_backtest, summarise
from forecasting import forecast_at


def fixture():
    index = pd.date_range("2026-06-01", periods=60*48, freq="30min", tz="UTC")
    x = np.arange(len(index))
    intensity = pd.DataFrame({"actual": 150 + 30*np.sin(x/48*2*np.pi) + x/1000}, index=index)
    hours = pd.date_range(index.min(), index.max().ceil("h"), freq="h")
    weather = pd.DataFrame({"wind": 20.0, "solar": 100.0, "temp": 15.0}, index=hours)
    return intensity, weather, pd.Timestamp("2026-07-20T03:30Z")


class LagModel:
    def __init__(self, **kwargs):
        pass

    def fit(self, x, y):
        return self

    def predict(self, x):
        return x["lag_48"].to_numpy() + 1


class ForecastTests(unittest.TestCase):
    def test_future_actuals_cannot_change_any_prediction(self):
        intensity, weather, origin = fixture()
        original = forecast_at(intensity, weather, weather, origin, model_params={"n_estimators": 5})
        poisoned = intensity.copy()
        poisoned.loc[poisoned.index > origin-pd.Timedelta(minutes=60), "actual"] = 999999.0
        repeated = forecast_at(poisoned, weather, weather, origin, model_params={"n_estimators": 5})
        pd.testing.assert_series_equal(original.predictions, repeated.predictions)
        self.assertLessEqual(original.training_frame.index.max(), origin-pd.Timedelta(days=7))

    @patch("forecasting.GradientBoostingRegressor", LagModel)
    def test_second_day_uses_our_first_day_predictions(self):
        intensity, weather, origin = fixture()
        result = forecast_at(intensity, weather, weather, origin)
        self.assertEqual(len(result.predictions), 96)
        np.testing.assert_allclose(result.predictions.iloc[48:].values,
                                   result.predictions.iloc[:48].values + 1)

    def test_missing_rows_do_not_shift_daily_lag(self):
        intensity, weather, _ = fixture()
        missing = intensity.index[800]
        frame = F.build_training_frame(intensity.drop(missing), weather)
        target = intensity.index[900]
        self.assertAlmostEqual(frame.loc[target, "lag_48"], intensity.loc[target-pd.Timedelta(days=1), "actual"])
        self.assertNotIn(missing+pd.Timedelta(days=1), frame.index)

    def test_weather_does_not_forward_fill_across_outage(self):
        _, weather, origin = fixture()
        joined = F._join_weather(pd.DataFrame(index=pd.date_range(origin, periods=4, freq="30min")), weather.loc[:origin.floor("h")])
        self.assertTrue(pd.notna(joined.iloc[0].wind))
        self.assertTrue(joined.iloc[1:].wind.isna().all())

    def test_missing_forward_weather_rejects_forecast(self):
        intensity, weather, origin = fixture()
        with self.assertRaisesRegex(ValueError, "Incomplete forecast weather"):
            forecast_at(intensity, weather, weather.loc[:origin], origin, model_params={"n_estimators": 2})

    def test_stale_actuals_rejected(self):
        intensity, weather, origin = fixture()
        with self.assertRaisesRegex(ValueError, "stale"):
            forecast_at(intensity.loc[:origin-pd.Timedelta(days=1)], weather, weather, origin)

    def test_empty_and_complete_data_quality(self):
        intensity, _, _ = fixture()
        self.assertEqual(data_quality(intensity)["missing_half_hours"], 0)
        self.assertEqual(data_quality(intensity.iloc[:0]), {"rows": 0})
        missing = intensity.drop(intensity.index[800:804])
        self.assertEqual(data_quality(missing)["missing_half_hours"], 4)

    def test_unknown_weather_vintage_is_not_accepted(self):
        intensity, weather, origin = fixture()
        with self.assertRaisesRegex(ValueError, "unavailable"):
            rolling_backtest(intensity, weather, [origin], lambda _: (weather, {
                "assumed_available_at": (origin+pd.Timedelta(hours=1)).isoformat()}))

    @patch("forecasting.GradientBoostingRegressor", LagModel)
    def test_rolling_folds_have_equal_baseline_samples_and_horizons(self):
        intensity, weather, origin = fixture()
        predictions, folds = rolling_backtest(intensity, weather, [origin, origin+pd.Timedelta(days=2)],
            lambda t: (weather, {"assumed_available_at": t.isoformat()}))
        self.assertEqual(len(folds), 2)
        self.assertEqual(predictions.groupby("model").size().tolist(), [192]*4)
        summary = summarise(predictions)
        self.assertEqual(len(summary), 16)
        self.assertEqual({r["n"] for r in summary if r["horizon"] == "24-48h"}, {96})

    def test_artifacts_include_inputs_model_and_hashes(self):
        intensity, weather, origin = fixture()
        result = forecast_at(intensity, weather, weather, origin, model_params={"n_estimators": 2})
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "run"
            version = save_run(path, result, weather, {"origin": origin.isoformat()})
            manifest = json.loads((path / "manifest.json").read_text())
            self.assertEqual(version, manifest["input_data_version"])
            self.assertTrue((path / "model.joblib").exists())
            self.assertEqual(len(manifest["files"]), 5)
            self.assertTrue((path / "source" / "forecasting.py").exists())

    @patch("weather._get_json")
    def test_archived_run_is_selected_before_origin_and_cached(self, fetch):
        fetch.return_value = {"hourly": {"time": ["2026-07-20T00:00"],
            "wind_speed_100m": [20], "shortwave_radiation": [0], "temperature_2m": [12]}}
        with tempfile.TemporaryDirectory() as directory:
            origin = pd.Timestamp("2026-07-20T03:30Z")
            _, metadata = W.archived_forecast(origin, Path(directory))
            W.archived_forecast(origin, Path(directory))
            self.assertEqual(fetch.call_count, 1)
            self.assertLessEqual(pd.Timestamp(metadata["assumed_available_at"]), origin)
            self.assertIn("run=2026-07-19T18:00", fetch.call_args.args[0])


if __name__ == "__main__":
    unittest.main()
