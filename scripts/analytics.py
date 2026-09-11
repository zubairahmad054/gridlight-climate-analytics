"""Reproducible descriptive analytics. Optional DB reads; all output is local.

python scripts/analytics.py --refresh-db
python scripts/analytics.py --backtest-dir artifacts/backtests/<id>
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd

from _shared import connect
from artifacts import frame_hash
from backtest import read_frame, data_quality
from train import load_intensity

ROOT = Path(__file__).resolve().parents[1]
TZ = "Europe/London"


def records(frame: pd.DataFrame) -> list:
    # Pandas converts numpy scalars and missing values to strict JSON safely.
    return json.loads(frame.to_json(orient="records", date_format="iso"))


def latest_experiment(root: Path) -> Path:
    complete = []
    for report in root.glob("*/report.json"):
        data = json.loads(report.read_text(encoding="utf-8"))
        if data.get("status") == "complete" and (report.parent / "predictions.csv").exists():
            complete.append(report.parent)
    if not complete:
        raise ValueError("No complete backtest. Run scripts/backtest.py first.")
    return max(complete, key=lambda p: (p / "report.json").stat().st_mtime)


def patterns(intensity: pd.DataFrame) -> dict:
    if intensity.empty or not intensity.index.is_unique:
        raise ValueError("Intensity observations must be nonempty and unique")
    if not (intensity.index == intensity.index.floor("30min")).all():
        raise ValueError("Intensity observations must align to UTC half-hours")
    frame = intensity[["actual"]].copy().sort_index()
    if not np.isfinite(frame.actual).all() or (frame.actual < 0).any():
        raise ValueError("Intensity values must be finite and nonnegative")
    local = frame.index.tz_convert(TZ)
    frame["hour"], frame["weekday"], frame["month"] = local.hour, local.dayofweek, local.month
    quality = data_quality(frame)
    expected = pd.date_range(frame.index.min(), frame.index.max(), freq="30min")
    grid = frame.actual.reindex(expected)
    daily = grid.resample("D").agg(["count", "size", "mean"]).reset_index()
    daily.columns = ["date", "observed", "expected", "mean"]
    daily["missing"] = daily.expected - daily.observed
    missing = grid.index[grid.isna()]
    gaps = []
    if len(missing):
        start = previous = missing[0]
        n = 1
        for timestamp in missing[1:]:
            if timestamp - previous != pd.Timedelta(minutes=30):
                gaps.append(dict(start=start.isoformat(), end=previous.isoformat(), slots=n))
                start, n = timestamp, 0
            previous, n = timestamp, n + 1
        gaps.append(dict(start=start.isoformat(), end=previous.isoformat(), slots=n))
    def aggregate(keys):
        return records(frame.groupby(keys).actual.agg(mean="mean", n="size").reset_index())
    return {"quality": quality, "daily": records(daily), "gaps": gaps,
            "mean": float(frame.actual.mean()), "hourly": aggregate(["hour"]),
            "monthly_hourly": aggregate(["month", "hour"]),
            "weekday_hourly": aggregate(["weekday", "hour"]),
            "monthly": aggregate(["month"]), "weekday": aggregate(["weekday"])}


def error_stats(frame: pd.DataFrame, group: str) -> list:
    rows = []
    for label, data in frame.groupby(group, observed=True, sort=True):
        error = data.prediction - data.actual
        rows.append({"label": str(label), "n": len(data), "mae": float(error.abs().mean()),
                     "rmse": float(np.sqrt((error**2).mean())), "bias": float(error.mean())})
    return rows


def errors(experiment: Path) -> dict:
    report = json.loads((experiment / "report.json").read_text(encoding="utf-8"))
    prediction = pd.read_csv(experiment / "predictions.csv")
    models = sorted(m for m in prediction.model.unique() if m.startswith("ours"))
    if len(models) != 1:
        raise ValueError("Select a backtest containing exactly one candidate model")
    own = prediction[prediction.model == models[0]].copy()
    own["target_time"] = pd.to_datetime(own.target_time, utc=True)
    own["origin"] = pd.to_datetime(own.origin, utc=True)
    if own.duplicated(["origin", "target_time"]).any():
        raise ValueError("Duplicate forecast-target pairs")
    own["horizon"] = pd.cut(own.lead_hours, [0, 6, 24, 48], labels=["0–6h", "6–24h", "24–48h"])
    own["hour"] = own.target_time.dt.tz_convert(TZ).dt.hour
    chunks = []
    for fold in report["folds"]:
        part = own[own.origin == pd.Timestamp(fold["origin"])].copy()
        weather = read_frame(experiment / "folds" / fold["run_id"] / "forecast-weather.csv")
        wx = weather.reindex(pd.DatetimeIndex(part.target_time), method="ffill", tolerance=pd.Timedelta(minutes=30))
        for col in ["wind", "temp", "solar"]:
            part[col] = wx[col].to_numpy()
        chunks.append(part)
    enriched = pd.concat(chunks, ignore_index=True)
    enriched["wind_band"] = pd.cut(enriched.wind, [-np.inf, 10, 25, np.inf], labels=["≤10 km/h", "10–25 km/h", ">25 km/h"])
    enriched["temp_band"] = pd.cut(enriched.temp, [-np.inf, 10, 20, np.inf], labels=["≤10°C", "10–20°C", ">20°C"])
    enriched["solar_band"] = pd.cut(enriched.solar, [-np.inf, 50, 250, np.inf], labels=["≤50 W/m²", "50–250 W/m²", ">250 W/m²"])
    return {"experiment_id": experiment.name, "model": models[0], "n": len(own),
            "first_origin": own.origin.min().isoformat(), "last_origin": own.origin.max().isoformat(),
            "folds": len(report["folds"]), "horizons": error_stats(own, "horizon"),
            "hours": error_stats(own, "hour"), "models": report["metrics"],
            "weather": {key: error_stats(enriched, f"{key}_band") for key in ["wind", "temp", "solar"]},
            "weather_matched": int(enriched[["wind", "temp", "solar"]].notna().all(axis=1).sum()),
            "assumptions": report["assumptions"]}


def price_analysis(prices: pd.DataFrame) -> dict:
    if prices.empty:
        return {"available": False, "reason": "No matched historical Agile prices and settled intensity in this snapshot."}
    prices = prices.copy().sort_index()
    regions = prices.region.unique()
    if len(regions) != 1 or not prices.index.is_unique:
        raise ValueError("Prices must contain one region and unique timestamps")
    prices = prices.dropna(subset=["price", "actual"])
    if prices.empty or not np.isfinite(prices[["price", "actual"]].to_numpy()).all():
        raise ValueError("No finite matched price observations")
    prices["hour"] = prices.index.tz_convert(TZ).hour
    hourly = prices.groupby("hour").agg(price=("price", "mean"), intensity=("actual", "mean"), n=("price", "size")).reset_index()
    # Only complete UTC days enter the retrospective 2-hour-window comparison.
    # Gaps must never turn four nonconsecutive rows into a 2-hour load.
    windows, excluded = [], 0
    for date in pd.date_range(prices.index.min().floor("D"), prices.index.max().floor("D"), freq="D"):
        day = prices[(prices.index >= date) & (prices.index < date + pd.Timedelta(days=1))]
        if not day.index.equals(pd.date_range(date, periods=48, freq="30min")):
            excluded += 1
            continue
        candidates = []
        for i in range(45):
            window = day.iloc[i:i+4]
            candidates.append(dict(start=window.index[0].isoformat(), price=float(window.price.mean()), intensity=float(window.actual.mean())))
        clean = min(candidates, key=lambda w: (w["intensity"], w["price"]))
        cheap = min(candidates, key=lambda w: (w["price"], w["intensity"]))
        windows.append(dict(date=date.isoformat(), clean=clean, cheap=cheap,
                            different=clean["start"] != cheap["start"],
                            premium=clean["price"]-cheap["price"],
                            carbon_difference=cheap["intensity"]-clean["intensity"]))
    correlation = prices.price.corr(prices.actual) if prices.price.std() > 0 and prices.actual.std() > 0 else None
    return {"available": True, "region": str(regions[0]), "n": len(prices),
            "start": prices.index.min().isoformat(), "end": prices.index.max().isoformat(),
            "correlation": None if correlation is None else float(correlation), "hourly": records(hourly),
            "complete_days": len(windows), "excluded_days": excluded,
            "different_days": sum(w["different"] for w in windows),
            "mean_clean_premium": float(np.mean([w["premium"] for w in windows])) if windows else None,
            "mean_carbon_difference": float(np.mean([w["carbon_difference"] for w in windows])) if windows else None,
            "recent_windows": windows[-14:]}


def build_report(intensity, experiment, prices, source):
    return {"schema_version": 1, "generated_at": pd.Timestamp.now(tz="UTC").isoformat(),
            "source": source, "timezone": TZ, "intensity_hash": frame_hash(intensity),
            "patterns": patterns(intensity), "errors": errors(experiment), "prices": price_analysis(prices)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--backtest-dir", type=Path)
    parser.add_argument("--refresh-db", action="store_true", help="Read current observations/prices in a read-only DB transaction")
    parser.add_argument("--intensity-csv", type=Path, help="Use a preserved analysis observation snapshot")
    parser.add_argument("--prices-csv", type=Path, help="Use a preserved matched-price snapshot")
    parser.add_argument("--output", type=Path, default=ROOT / "artifacts/analytics")
    args = parser.parse_args()
    if args.refresh_db and (args.intensity_csv or args.prices_csv):
        parser.error("Choose database refresh or local snapshots, not both")
    experiment = args.backtest_dir or latest_experiment(ROOT / "artifacts/backtests")
    prices = pd.DataFrame()
    if args.refresh_db:
        with connect() as conn:
            conn.execute("SET TRANSACTION READ ONLY")
            intensity = load_intensity(conn)
            rows = conn.execute("""SELECT p.timestamp, p.price_p_kwh, p.region, o.actual
                FROM agile_prices p JOIN carbon_intensity o ON o.timestamp = p.timestamp
                WHERE o.actual IS NOT NULL AND p.timestamp < now() ORDER BY p.timestamp""").fetchall()
            if rows:
                prices = pd.DataFrame(rows, columns=["timestamp", "price", "region", "actual"])
                prices["timestamp"] = pd.to_datetime(prices.timestamp, utc=True)
                prices = prices.set_index("timestamp")
                prices[["price", "actual"]] = prices[["price", "actual"]].astype(float)
        source = "Read-only database snapshot"
    else:
        intensity = read_frame(args.intensity_csv or experiment / "intensity.csv")
        if args.prices_csv:
            prices = read_frame(args.prices_csv)
        source = "Local analysis input snapshots" if args.intensity_csv else "Saved backtest observation snapshot"
    report = build_report(intensity, experiment, prices, source)
    args.output.mkdir(parents=True, exist_ok=True)
    intensity.to_csv(args.output / "intensity.csv")
    if not prices.empty:
        prices.to_csv(args.output / "matched-prices.csv")
    # Atomic replacement so a browser refresh never sees a half-written payload.
    pending = args.output / "latest.tmp"
    pending.write_text(json.dumps(report, indent=2, allow_nan=False), encoding="utf-8")
    pending.replace(args.output / "latest.json")
    print(json.dumps({"report": str(args.output / "latest.json"), "observations": len(intensity),
                      "missing_half_hours": report["patterns"]["quality"]["missing_half_hours"],
                      "price_pairs": report["prices"].get("n", 0)}, indent=2))


if __name__ == "__main__":
    main()
