"""Read-only rolling-origin experiment. Writes local reports, never production DB."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from uuid import uuid4

import numpy as np
import pandas as pd

from artifacts import frame_hash, save_run
from forecasting import MODEL_VERSION, MODEL_PARAMS, forecast_at
from train import read_intensity
import weather as W


def read_frame(path: Path) -> pd.DataFrame:
    frame = pd.read_csv(path, index_col=0)
    frame.index = pd.to_datetime(frame.index, utc=True)
    return frame.sort_index()


def rolling_backtest(intensity, training_weather, origins, weather_provider,
                     *, output: Path | None = None, **forecast_options):
    records, folds = [], []
    for origin in origins:
        origin = pd.Timestamp(origin)
        weather, provenance = weather_provider(origin)
        if pd.Timestamp(provenance["assumed_available_at"]) > origin:
            raise ValueError("Weather run was unavailable at forecast origin")
        result = forecast_at(intensity, training_weather, weather, origin, **forecast_options)
        actuals = intensity["actual"].reindex(result.predictions.index)
        if not np.isfinite(actuals.to_numpy(dtype=float)).all():
            raise ValueError(f"Incomplete settled evaluation targets at {origin}; no silent fold dropping")
        run_id = str(uuid4())
        metadata = {"run_id": run_id, "origin": origin.isoformat(), "weather": provenance,
                    "model_version": MODEL_VERSION, "parameters": MODEL_PARAMS | forecast_options.get("model_params", {}),
                    "training_cutoff": result.training_frame.index.max().isoformat(),
                    "training_rows": len(result.training_frame), "options": forecast_options}
        if output:
            save_run(output / "folds" / run_id, result, weather, metadata)
        folds.append(metadata)
        known = result.history["actual"].copy()
        daily = known.copy()
        for target, prediction in result.predictions.items():
            weekly = known.get(target - pd.Timedelta(days=7), np.nan)
            daily_prediction = daily.get(target - pd.Timedelta(days=1), np.nan)
            if pd.isna(daily_prediction):
                daily_prediction = weekly
            daily.loc[target] = daily_prediction
            forecasts = {MODEL_VERSION: prediction, "persistence": float(known.iloc[-1]),
                         "seasonal-daily": daily_prediction, "seasonal-weekly": weekly}
            if not all(np.isfinite(value) for value in forecasts.values()):
                raise ValueError("Missing baseline inputs; cannot compare identical samples")
            for model, value in forecasts.items():
                records.append(dict(origin=origin.isoformat(), target_time=target.isoformat(),
                                    model=model, lead_hours=(target-origin).total_seconds()/3600,
                                    prediction=float(value), actual=float(actuals.loc[target])))
        print(f"evaluated {origin.isoformat()}: {len(result.training_frame)} training rows, 96 targets", flush=True)
    return pd.DataFrame(records), folds


def summarise(predictions: pd.DataFrame) -> list[dict]:
    rows = []
    for model, data in predictions.groupby("model"):
        for lower, upper in [(0, 6), (6, 24), (24, 48), (0, 48)]:
            part = data[(data.lead_hours > lower) & (data.lead_hours <= upper)]
            if part.empty:
                continue
            errors = part.prediction - part.actual
            rows.append(dict(model=model, horizon=f"{lower}-{upper}h", n=len(part),
                             mae=float(errors.abs().mean()), rmse=float(np.sqrt((errors**2).mean())),
                             bias=float(errors.mean())))
    return rows


def data_quality(intensity: pd.DataFrame) -> dict:
    if intensity.empty:
        return {"rows": 0}
    expected = pd.date_range(intensity.index.min(), intensity.index.max(), freq="30min")
    gaps = expected.difference(intensity.dropna(subset=["actual"]).index)
    return {"rows": len(intensity), "start": intensity.index.min().isoformat(),
            "end": intensity.index.max().isoformat(), "expected_rows": len(expected),
            "missing_half_hours": len(gaps), "duplicate_timestamps": int(intensity.index.duplicated().sum()),
            "missing_by_day": {str(day.date()): int(n) for day, n in pd.Series(1, index=gaps).resample("D").sum().items() if n}}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--intensity-csv", type=Path)
    parser.add_argument("--training-weather-csv", type=Path)
    parser.add_argument("--days", type=int, default=14)
    parser.add_argument("--step-days", type=int, default=2)
    parser.add_argument("--end", help="Upper bound for forecast origins, timezone-aware ISO timestamp")
    parser.add_argument("--output", type=Path, default=Path("artifacts/backtests"))
    parser.add_argument("--weather-cache", type=Path, default=Path("artifacts/weather-cache"))
    parser.add_argument("--weather-model", default="gfs_global")
    args = parser.parse_args()
    if args.days < 1 or args.step_days < 1:
        parser.error("days and step-days must be positive")
    intensity = read_frame(args.intensity_csv) if args.intensity_csv else read_intensity()
    if intensity.empty:
        raise ValueError("No intensity history")
    end = pd.Timestamp(args.end) if args.end else (intensity.index.max() - pd.Timedelta(hours=48)).floor("D") + pd.Timedelta(hours=3, minutes=30)
    if end.tzinfo is None:
        parser.error("--end must include a timezone")
    if end + pd.Timedelta(hours=48) > intensity.index.max():
        if args.end:
            raise ValueError("Requested origin has incomplete future actuals")
        end -= pd.Timedelta(days=1)
    origins = pd.date_range(end - pd.Timedelta(days=args.days-1), end, freq=f"{args.step_days}D")
    training_weather = read_frame(args.training_weather_csv) if args.training_weather_csv else W.fetch_archive(
        intensity.index.min().strftime("%Y-%m-%d"), (end-pd.Timedelta(days=7)).strftime("%Y-%m-%d"))
    directory = args.output / str(uuid4())
    directory.mkdir(parents=True, exist_ok=False)
    intensity.to_csv(directory / "intensity.csv")
    training_weather.to_csv(directory / "training-weather.csv")
    quality = data_quality(intensity)
    (directory / "data-quality.json").write_text(json.dumps(quality, indent=2), encoding="utf-8")
    try:
        predictions, folds = rolling_backtest(
            intensity, training_weather, origins,
            lambda origin: W.archived_forecast(origin, args.weather_cache, args.weather_model), output=directory)
    except Exception as error:
        failure = {"status": "failed", "reason": str(error), "data_quality": quality,
                   "requested_origins": [t.isoformat() for t in origins], "metrics": []}
        (directory / "report.json").write_text(json.dumps(failure, indent=2), encoding="utf-8")
        print(f"Experiment failed; diagnostic report: {directory / 'report.json'}", flush=True)
        raise
    predictions.to_csv(directory / "predictions.csv", index=False)
    metrics = summarise(predictions)
    report = {
        "evaluation": "Retrospective rolling-origin simulation; not a live performance claim",
        "status": "complete", "data_quality": quality,
        "assumptions": ["Latest-vintage actuals assumed available after 60 minutes",
                        "Training reanalysis embargoed seven days; revisions not reconstructed",
                        "Archived global weather run assumed available eight hours after initialisation",
                        "Overlapping folds are correlated; sample counts are forecast-target pairs"],
        "neso": "Excluded: overwritten legacy forecasts have no trustworthy issue times. New paired live scoring starts with migration 006.",
        "inputs": {"intensity_sha256": frame_hash(intensity), "training_weather_sha256": frame_hash(training_weather)},
        "folds": folds, "metrics": metrics,
    }
    (directory / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    lines = ["# Rolling-origin benchmark", "", report["evaluation"], "",
             f"Forecast origins: {origins[0].isoformat()} to {origins[-1].isoformat()} ({len(origins)} folds).",
             f"Input coverage: {quality['rows']} observations; {quality['missing_half_hours']} missing half-hours in the full input timeline.",
             "The evaluated folds passed coverage checks; this is not a claim that the full input timeline is complete.",
             "", *[f"- {s}" for s in report["assumptions"]],
             "", report["neso"], "", "| Model | Horizon | n | MAE | RMSE | Bias |",
             "|---|---|---:|---:|---:|---:|"]
    lines += [f"| {r['model']} | {r['horizon']} | {r['n']} | {r['mae']:.2f} | {r['rmse']:.2f} | {r['bias']:.2f} |" for r in metrics]
    (directory / "report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Report: {directory / 'report.md'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
