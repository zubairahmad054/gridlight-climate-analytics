"""Refresh descriptive analytics in Neon; retain the explicitly dated research benchmark.

No backtest artifacts or retraining required. Database writes require --publish.
"""
import argparse
import json
from pathlib import Path

import pandas as pd
from psycopg.types.json import Jsonb
from _shared import connect
from analytics import patterns, price_analysis
from artifacts import frame_hash
from train import load_intensity

ROOT = Path(__file__).resolve().parents[1]


def make_report(intensity, prices, baseline):
    if intensity.empty or intensity.index.max() < pd.Timestamp.now(tz="UTC") - pd.Timedelta(hours=3):
        raise ValueError("Observations are missing or more than three hours stale; report not replaced")
    return {
        "schema_version": 1, "generated_at": pd.Timestamp.now(tz="UTC").isoformat(),
        "source": "Scheduled database analysis", "timezone": "Europe/London",
        "intensity_hash": frame_hash(intensity), "patterns": patterns(intensity),
        "prices": price_analysis(prices), "errors": baseline["errors"],
        "benchmark_generated_at": baseline["generated_at"],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--publish", action="store_true")
    args = parser.parse_args()
    baseline = json.loads((ROOT / "data/reports/analytics.json").read_text(encoding="utf-8"))
    with connect() as conn:
        conn.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
        intensity = load_intensity(conn)
        rows = conn.execute("""SELECT p.timestamp, p.price_p_kwh, p.region, o.actual
            FROM agile_prices p JOIN carbon_intensity o ON o.timestamp = p.timestamp
            WHERE o.actual IS NOT NULL AND p.timestamp < now() ORDER BY p.timestamp""").fetchall()
    prices = pd.DataFrame()
    if rows:
        prices = pd.DataFrame(rows, columns=["timestamp", "price", "region", "actual"])
        prices["timestamp"] = pd.to_datetime(prices.timestamp, utc=True)
        prices = prices.set_index("timestamp")
        prices[["price", "actual"]] = prices[["price", "actual"]].astype(float)
    report = make_report(intensity, prices, baseline)
    json.dumps(report, allow_nan=False)  # Fail closed before publishing invalid numeric output.
    if args.publish:
        with connect() as conn:
            conn.execute("""INSERT INTO dashboard_reports (report_id, generated_at, payload)
                VALUES ('analytics', %s, %s) ON CONFLICT (report_id) DO UPDATE
                SET generated_at = EXCLUDED.generated_at, payload = EXCLUDED.payload
                WHERE dashboard_reports.generated_at < EXCLUDED.generated_at""",
                (report["generated_at"], Jsonb(report)))
    print(json.dumps({"published": args.publish, "observations": len(intensity),
                      "generated_at": report["generated_at"]}))


if __name__ == "__main__":
    main()
