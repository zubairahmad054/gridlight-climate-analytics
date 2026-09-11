# Trustworthy forecasting experiments

Step 1 replaces the optimistic static holdout with a reproducible rolling-origin
simulation and starts preserving live forecast vintages. It does not claim a
measured accuracy improvement.

## Commands

Install `scripts/requirements.txt` in a virtual environment, then:

```powershell
# Read observations from the configured DB, fetch archived weather, write locally.
python scripts/backtest.py --days 14 --step-days 2

# Reuse saved input snapshots; archived weather responses are cached locally.
python scripts/backtest.py --intensity-csv artifacts/backtests/<id>/intensity.csv --training-weather-csv artifacts/backtests/<id>/training-weather.csv --end 2026-09-03T03:30:00Z --days 14 --step-days 2

# Train a current forecast and save artefacts WITHOUT publishing.
python scripts/train.py

# Production operation, after migration 006 is applied to the intended DB.
python scripts/train.py --publish

python -m unittest discover -s tests -p "test_*.py" -v
pnpm exec tsc --noEmit
```

Backtesting uses read-only DB transactions and never publishes models or metrics.
CSV timestamps must be UTC half-hour period starts, with `actual` as the target.
Training-weather CSVs use hourly UTC timestamps and `wind`, `solar`, `temp`.
Every requested fold must have complete evaluation targets and forecast weather;
missing folds are errors, not silently excluded from the denominator.

## Evaluation contract

- `forecasting.forecast_at` performs both production and backtest fitting and
  recursive 96-step prediction. The next period starts strictly after the origin.
- Observations newer than origin minus 60 minutes cannot enter training or lags.
  This is an assumed publication delay for retrospective actuals, not a record of
  their historical availability or later revisions.
- Reanalysis used in training is embargoed seven days. Forecast-period weather
  comes from one archived GFS run selected at least eight hours after its
  initialisation. Publication timing is explicitly assumed; it is not measured.
- The historical experiment is labelled a retrospective simulation. It uses
  latest-vintage actuals/reanalysis and archived GFS forecast weather. Production
  uses the same GFS run-selection policy. This is not a reconstruction of the
  old v1 model or evidence of live v2 performance.
- Never substitute today's forecast or realised weather if an archive run fails.
  The default archive window begins April 2026. See the provider's
  [Single Runs documentation](https://open-meteo.com/en/docs/single-runs-api).
- Actuals are placed on a regular half-hour grid before lags are calculated.
  Missing historical daily/weekly lag inputs reject inference. A settlement-delay
  gap is bridged using the previous week's value; the same rule runs in backtests.
  Hourly weather can cover at most the next half-hour; it cannot bridge outages.
- Persistence, recursive daily seasonality, weekly seasonality and our model use
  identical forecast-target pairs. MAE, RMSE and signed bias are broken down into
  0–6h, 6–24h and 24–48h leads. Overlapping folds are correlated.

## Forecast history and rollout

Migration `006_forecast_runs.sql` only adds tables, indexes and a comparison view.
`forecast_runs` records a unique run ID, model, issue/availability times, training
cutoff, input hash and metadata. `forecast_predictions` stores each run's targets.
Application writers only INSERT history; overlapping runs cannot replace it.

Existing `forecasts` remains the mutable serving cache. Live writers update the
cache and append history in one transaction. Existing rows are not deleted or
backfilled into history because their original issue times cannot be recovered.

Apply migration 006 before deploying the new ingestion route or publishing v2.
Keep rollout explicit: local and production may share the configured Neon DB.
No migration is automatically applied by training or backtesting.

`ours-v2` identifies the changed lag, training-embargo and validation semantics.
The shared serving loader and marginal mapper prefer v2 when available.
The former static holdout metrics are not reused for v2: the model card shows no
holdout scores until a separately designed report-import workflow exists.

## Paired live accuracy

`/api/accuracy?horizon=24-48` (also `0-6`, `6-24`) uses only new timestamped
forecast history. For each latest-model run and target, choose the latest NESO
snapshot captured at or before our availability time, at most 60 minutes earlier.
Then score both predictions against the exact same settled target, in the last
seven days. No matching NESO snapshot means neither forecast enters that pair.

NESO's upstream issue time is unavailable. Its stored `issued_at` is explicitly
labelled as capture time. These are matched operational decision times, not a
claim of identical underlying weather-model or NESO source lead times. The
near-term statistic remains separate and is labelled accordingly.

## Reproducibility and retention

`artifacts/backtests/<id>/` contains source CSVs, a JSON and Markdown report,
per-fold input CSVs, prediction CSVs, model artefacts and manifests. Production
uses `artifacts/runs/<run-id>/`. Manifests record SHA-256 hashes, estimator
parameters, dependency versions and Git revision. Inputs contain no credentials.
The exact Python source is copied into each run, with source hashes, so uncommitted
changes are reproducible too. A failed experiment writes a diagnostic JSON report
and no headline metrics. Every report includes observation coverage and gaps.

GitHub Actions uploads production run artefacts for 90 days. Long-term model/input
replay requires exporting those artefacts before expiry. DB predictions persist
independently. Local artefacts are gitignored; only load trusted joblib models.
