"""Train and archive inputs locally. Add --publish to write a live forecast.

Evaluation is separate: scripts/backtest.py uses the same forecast_at function.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from uuid import uuid4

import pandas as pd
from psycopg.types.json import Jsonb

import weather as W
from _shared import connect
from artifacts import save_run
from forecasting import MODEL_VERSION, MODEL_PARAMS, forecast_at


def load_intensity(conn) -> pd.DataFrame:
    rows = conn.execute(
        "SELECT timestamp, actual FROM carbon_intensity WHERE actual IS NOT NULL ORDER BY timestamp"
    ).fetchall()
    df = pd.DataFrame(rows, columns=["timestamp", "actual"])
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True)
    df["actual"] = pd.to_numeric(df["actual"])
    return df.set_index("timestamp")


def read_intensity() -> pd.DataFrame:
    with connect() as conn:
        conn.execute("SET TRANSACTION READ ONLY")
        return load_intensity(conn)


def publish(result, run_id: str, metadata: dict, origin: pd.Timestamp) -> None:
    # One transaction: history and backwards-compatible serving cache move together.
    with connect() as conn:
        available = pd.Timestamp.now(tz="UTC")
        predictions = result.predictions.loc[result.predictions.index > available]
        if len(predictions) < 94:
            raise ValueError("Training took too long: rerun before publishing a shortened horizon")
        conn.execute(
            """INSERT INTO forecast_runs
               (run_id, model_version, issued_at, available_at, training_cutoff, input_data_version, metadata)
               VALUES (%s, %s, %s, %s, %s, %s, %s)""",
            (run_id, MODEL_VERSION, origin.to_pydatetime(), available.to_pydatetime(),
             result.training_frame.index.max().to_pydatetime(), metadata["input_data_version"], Jsonb(metadata)),
        )
        conn.cursor().executemany(
            "INSERT INTO forecast_predictions (run_id, target_time, predicted_intensity) VALUES (%s, %s, %s)",
            [(run_id, t.to_pydatetime(), float(p)) for t, p in predictions.items()],
        )
        conn.cursor().executemany(
            """INSERT INTO forecasts (target_time, predicted_intensity, model_version)
               VALUES (%s, %s, %s) ON CONFLICT (target_time, model_version)
               DO UPDATE SET predicted_intensity = EXCLUDED.predicted_intensity, created_at = now()""",
            [(t.to_pydatetime(), round(float(p)), MODEL_VERSION) for t, p in predictions.items()],
        )
        conn.execute(
            """INSERT INTO model_metrics (model_version, training_samples)
               VALUES (%s, %s) ON CONFLICT (model_version) DO UPDATE
               SET trained_at = now(), training_samples = EXCLUDED.training_samples,
                   mae = NULL, rmse = NULL, r2_score = NULL""",
            (MODEL_VERSION, len(result.training_frame)),
        )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--publish", action="store_true", help="Write live DB (migration 006 required)")
    parser.add_argument("--output", type=Path, default=Path("artifacts/runs"))
    args = parser.parse_args()
    intensity = read_intensity()
    if intensity.empty:
        raise ValueError("No observations available")
    now = pd.Timestamp.now(tz="UTC")
    history_weather = W.fetch_archive(intensity.index.min().strftime("%Y-%m-%d"),
                                     (now - pd.Timedelta(days=7)).strftime("%Y-%m-%d"))
    forecast_weather, provenance = W.archived_forecast(now, Path("artifacts/weather-cache"), previous_runs=2)
    # Weather requests can take minutes; use observations available after retrieval.
    intensity = read_intensity()
    origin = pd.Timestamp.now(tz="UTC")
    result = forecast_at(intensity, history_weather, forecast_weather, origin)
    run_id = str(uuid4())
    metadata = {
        "run_id": run_id, "model_version": MODEL_VERSION, "issued_at": origin.isoformat(),
        "training_cutoff": result.training_frame.index.max().isoformat(),
        "parameters": MODEL_PARAMS, "settlement_minutes": 60, "training_weather_delay_days": 7,
        "weather": provenance, "weather_captured_at": origin.isoformat(), "forecast_horizon_slots": 96,
        "evaluation": "Not evaluated here; use rolling-origin backtest report",
    }
    save_run(args.output / run_id, result, forecast_weather, metadata)
    if args.publish:
        publish(result, run_id, metadata, origin)
    print(json.dumps({"run_id": run_id, "training_rows": len(result.training_frame),
                      "predictions": len(result.predictions), "published": args.publish,
                      "artifacts": str(args.output / run_id)}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
