"""Pure, shared train/predict implementation for live runs and rolling backtests."""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.linear_model import Ridge
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

import features as F

MODEL_VERSION = "ours-v2"
MODEL_PARAMS = dict(n_estimators=300, max_depth=4, learning_rate=0.05, random_state=42)
HORIZON = 96


@dataclass
class ForecastResult:
    predictions: pd.Series
    model: object
    training_frame: pd.DataFrame
    history: pd.DataFrame


def forecast_at(
    intensity: pd.DataFrame,
    training_weather: pd.DataFrame,
    forecast_weather: pd.DataFrame,
    origin: pd.Timestamp,
    *,
    settlement_minutes: int = 60,
    training_weather_delay_days: int = 7,
    min_training_rows: int = 400,
    model_params: dict | None = None,
    estimator: str = "boosting",
    feature_columns: list[str] | None = None,
    calendar_timezone: str = "UTC",
) -> ForecastResult:
    """Predict the next 96 half-hours after origin, without reading future actuals.

    Reanalysis-based training is embargoed 7 days to allow publication. This is
    a conservative assumption, not an archive of historical observation revisions.
    The caller must supply a weather forecast available at origin.
    """
    origin = pd.Timestamp(origin)
    if origin.tzinfo is None:
        raise ValueError("origin must be timezone-aware")
    origin = origin.tz_convert("UTC")
    if settlement_minutes < 30 or training_weather_delay_days < 1:
        raise ValueError("Require at least 30m settlement lag and 1d weather embargo")
    cutoff = origin - pd.Timedelta(minutes=settlement_minutes)
    history = intensity.loc[intensity.index <= cutoff, ["actual"]].copy().sort_index()
    history = history.dropna(subset=["actual"])
    if history.empty or history.index.max() < origin - pd.Timedelta(hours=3):
        raise ValueError("Settled intensity is empty or more than three hours stale")
    if not history.index.is_unique:
        raise ValueError("Duplicate intensity timestamps")
    train_cutoff = origin - pd.Timedelta(days=training_weather_delay_days)
    frame = F.build_training_frame(history.loc[:train_cutoff], training_weather, calendar_timezone)
    if len(frame) < min_training_rows:
        raise ValueError(f"Only {len(frame)} valid training rows; need {min_training_rows}")
    if not np.isfinite(frame.to_numpy(dtype=float)).all():
        raise ValueError("Non-finite training inputs")
    columns = F.FEATURE_COLUMNS if feature_columns is None else feature_columns
    if not columns or any(c == "actual" or c not in frame.columns for c in columns):
        raise ValueError("Invalid predictor columns")
    if estimator == "boosting":
        model = GradientBoostingRegressor(**(MODEL_PARAMS | (model_params or {})))
    elif estimator == "ridge":
        model = make_pipeline(StandardScaler(), Ridge(**({"alpha": 10.0} | (model_params or {}))))
    else:
        raise ValueError(f"Unknown estimator: {estimator}")
    model.fit(frame[columns], frame["actual"])

    future = pd.date_range(origin.floor("30min") + pd.Timedelta(minutes=30),
                           periods=HORIZON, freq="30min")
    base = F.build_inference_base(future, history["actual"], forecast_weather, calendar_timezone)
    # Do not fabricate future weather or silently replace missing lags.
    if not np.isfinite(base.to_numpy(dtype=float)).all():
        raise ValueError("Incomplete forecast weather or weekly lag coverage")
    known = history["actual"].astype(float).copy()
    predictions = []
    for t in future:
        lag_time = t - pd.Timedelta(hours=24)
        lag = known.get(lag_time, np.nan)
        # Bridge settlement delay only with a known weekly seasonal estimate.
        # This same rule runs in production and every backtest fold.
        if pd.isna(lag) and lag_time > history.index.max():
            lag = known.get(lag_time - pd.Timedelta(days=7), np.nan)
        if not np.isfinite(lag):
            raise ValueError(f"Missing daily lag for {t}")
        row = base.loc[[t]].copy()
        row["lag_48"] = lag
        prediction = max(0.0, float(model.predict(row[columns])[0]))
        known.loc[t] = prediction
        predictions.append(prediction)
    return ForecastResult(pd.Series(predictions, index=future, name="prediction"),
                          model, frame, history)
