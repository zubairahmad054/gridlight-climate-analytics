"""Read-only rollout preflight. Never applies migrations or prints credentials."""
from _shared import connect


def main():
    with connect() as conn:
        conn.execute("SET TRANSACTION READ ONLY")
        for relation in ["carbon_intensity", "forecasts", "model_metrics", "generation_mix",
                         "marginal_intensity", "agile_prices", "forecast_runs",
                         "forecast_predictions", "paired_forecast_errors", "dashboard_reports"]:
            if conn.execute("SELECT to_regclass(%s)", (relation,)).fetchone()[0] is None:
                raise RuntimeError(f"Missing relation {relation}: review and apply migrations through 007 first")
    print("Required database relations are present")


if __name__ == "__main__":
    main()
