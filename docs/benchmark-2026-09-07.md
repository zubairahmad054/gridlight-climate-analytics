# First rolling-origin benchmark — 2026-09-07

This is a retrospective experiment on stored GB carbon-intensity observations,
not a claim of current live performance or an improvement over v1.

## Scope and provenance

- Seven forecast origins at 03:30 UTC: 27, 29, 31 July and 2, 4, 6, 8 August 2026.
- 96 half-hours per origin: 672 forecast-target pairs per model.
- Training rows per fold: 19,257 to 19,833. Expanding history; fixed model settings.
- Gradient boosting: 300 estimators, depth 4, learning rate 0.05, seed 42.
- Weather: archived GFS global runs through Open-Meteo Single Runs, with an assumed
  eight-hour publication delay. Training reanalysis is embargoed seven days.
- Actuals: latest-vintage database observations, assumed available after 60 minutes.
- All models use identical evaluation targets. No parameter search was performed.
- Experiment ID: `aa721475-8381-4a68-8945-35102851902d`.
- Local source, model and input snapshots plus full metrics:
  `artifacts/backtests/aa721475-8381-4a68-8945-35102851902d/`.

## Results

Errors are measured in gCO2/kWh. Negative bias means underprediction.

| Model | MAE, 0–48h | RMSE, 0–48h | Bias, 0–48h |
|---|---:|---:|---:|
| Our model v2 | 28.49 | 36.46 | -11.17 |
| Persistence | 52.45 | 64.64 | 14.10 |
| Daily seasonal | 38.22 | 47.23 | -9.24 |
| Weekly seasonal | 36.17 | 46.57 | 3.34 |

| Our model horizon | n | MAE | RMSE | Bias |
|---|---:|---:|---:|---:|
| 0–6h | 84 | 14.61 | 19.04 | 0.89 |
| 6–24h | 252 | 34.05 | 41.28 | -20.01 |
| 24–48h | 336 | 27.79 | 35.92 | -7.55 |

The model outperforms these three baselines in this window. The 6–24h interval
shows substantial underprediction and deserves investigation. Seven origins in
one summer window do not establish year-round performance or statistical
significance. Do not compare these numbers directly with the old v1 holdout.

## Data-quality finding

The stored input has 21,108 observations between 6 June 2025 23:30 UTC and
6 September 2026 20:30 UTC, with 823 missing half-hours. They span
11 August 2026 04:00 UTC through 28 August 2026 07:00 UTC inclusive.

The initial latest-window experiment failed the stale-input guard. The benchmark
was explicitly moved to the complete earlier interval above. The gap has not been
filled, and the production database was not changed. This selection limits how
representative the result is of current operation.

## NESO comparison

Not reported. Legacy forward forecasts were overwritten and cannot establish
what NESO predicted at each historical decision time. New timestamped capture and
paired live scoring are implemented, but require migration/deployment and then
new forecasts to settle. The upstream source issue time remains unknown; future
comparisons are explicitly based on captured information available at matched
operational decision times.

## Verification

Eleven Python tests cover data coverage, future-actual leakage, recursive prediction, lag alignment,
weather freshness, archive selection, identical baseline samples and artefact
reproducibility. Three isolated PostgreSQL tests cover additive migration,
preserved vintages, snapshot pairing and atomic rollback. TypeScript checks pass.

See [the experiment workflow](forecast-experiments.md) for commands and assumptions.
