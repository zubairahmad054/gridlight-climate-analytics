# Controlled ML study (revamp step 3)

The local [Model Lab](http://127.0.0.1:3000/experiments) compares twelve choices:
three historical baselines and nine fitted candidates. The full five-step plan is
in [revamp-plan.md](revamp-plan.md).

## Predeclared comparison ladder

| Candidate | Change being tested |
|---|---|
| persistence / seasonal-daily / seasonal-weekly | No-ML reference and selection-eligible alternatives |
| ridge-calendar | Regularised linear model with cyclical UTC calendar features |
| ridge-lags | Add daily and weekly intensity lags to the same ridge model |
| ridge-full | Add central-point wind, solar and temperature |
| ours-v2 | Unchanged reference: 300 boosting trees, depth 4, learning rate 0.05 |
| boosting-shallow | Small tuning trial: 200 trees, depth 2; other defaults unchanged |
| boosting-london | Change only calendar feature timezone to Europe/London |
| boosting-weather-blend | Replace central weather with a three-point equal-weight mean |
| boosting-weather-locations | Retain central weather and add separate other-location features |
| boosting-direct | Pooled lead-aware boosting with issue-time lags, no recursive predictions; same tree settings as shallow trial |

Ridge uses alpha 10 and fits its StandardScaler on each fold's training data only.
The feature ablations use the same complete-case training rule as the full model,
so they do not gain extra observations from omitting weather or lag features.
The small tuning trial is deliberately predeclared, not an exhaustive search.

Weather points are central GB (53, −1.5), a Scotland proxy (56.5, −3), and a North
Sea proxy (55, 1.5). They are geographic hypotheses, not a wind-farm inventory.
Equal weights are **not capacity weights**. A validated capacity-weighted study,
holidays, demand and renewable forecasts remain follow-up hypotheses when suitable
data and issue-time histories exist; they are not required to claim this initial
comparison framework is implemented.

## Split, fitting and interpretation

Seven non-overlapping 48-hour development windows start July 27–August 8, 2026.
The final origin, September 5 at 03:30 UTC, was registered before candidate fitting.
It forecasts September 5 at 04:00 through September 7 at 03:30 UTC (96 targets).
Dates were chosen for complete targets and settled lag coverage after the known
August outage—not for favourable forecast errors. All models share target pairs.

The selector sees development rows only and chooses the smallest overall 48-hour
MAE, including baselines; a lexical model-ID tie-break makes selection deterministic.
The selected ID and input hashes are written before final evaluation. Only that
choice, ours-v2 and the predeclared baselines enter the final check. Horizon views
do not reselect a winner. A started-final marker prevents repeated holdout scoring.

September descriptive analytics were already viewed, so this is held out from
model selection, not an entirely unseen dataset. One final two-day window cannot
establish robustness or year-round superiority. New experiments must reserve a
new final period instead of tuning on these results. No automatic promotion,
production database writes or NESO comparison are performed.

All candidate fitting receives observations truncated at origin minus 60 minutes.
Recursive candidates use the shared production forecasting engine. The direct
model pools historical daily issue times at the same UTC clock time as the current
origin, with lead-hours, latest settled intensity, known daily seasonal analogues,
weekly lag, calendar and weather. Its training labels end at least seven days
before the evaluated origin. Targets may repeat across historical training origins;
these are origin-target training examples, not independent observations.

As in step 1, training weather is embargoed reanalysis, whereas evaluated forecasts
use archived GFS runs with an assumed eight-hour publication allowance. Historical
weather and intensity revisions are not reconstructed, and the training/forecast
weather distribution differs. The direct experiment changes the information
representation and training sample construction, not just a single hyperparameter.

## Reproduction

From the project root in PowerShell, for a **new** study directory and newly
reserved final dates:

```powershell
.venv\Scripts\python.exe scripts/model_study.py prepare --study artifacts/model-studies/<new-id> --intensity-csv artifacts/analytics/intensity.csv --source-backtest artifacts/backtests/aa721475-8381-4a68-8945-35102851902d --final-origin <timezone-aware-origin>
.venv\Scripts\python.exe scripts/model_study.py develop --study artifacts/model-studies/<new-id>
.venv\Scripts\python.exe scripts/model_study.py finalise --study artifacts/model-studies/<new-id>
```

Preparation reads public weather APIs and local observations, writes the plan
before fitting, and caches raw weather responses. Subsequent stages run offline.
Sources, plan, input hashes, fitted estimators, training rows, origin histories,
per-candidate predictions and per-horizon metrics are preserved in the study folder.
Do not load joblib files from untrusted sources. Artifacts are gitignored and are
not part of a production deployment.

If development is interrupted, `scripts/resume_model_study.py --study <directory>`
reuses only complete artifacts with matching hashes, candidate settings and targets,
then fits missing candidates. It records the recovery script and timestamp without
altering the registered plan/model source. Partial/corrupted run directories are
rejected, not overwritten. The initial run required this recovery after interruption.
There is no automatic retry of a started final evaluation: preserve the partial
artifacts and assess the failure without treating that holdout as unseen again.

`/api/experiments` serves only the saved `artifacts/model-studies/latest.json`.
Model Lab polls it every 30 seconds; its refresh button does not train models or
fetch new data. Startup and hot reload are covered in [analytics.md](analytics.md).

## Initial results: controlled-2026-09-09

Completed 63 development fits (nine fitted candidates × seven origins), then two
final fits, alongside the three baselines. Each development choice has 672
forecast-target pairs; each final choice has 96. No evaluation pairs were dropped
or duplicated. The resumed run verified and reused completed artifacts rather than
changing the candidate settings or the reserved dates.

| Choice | Development MAE | Final MAE |
|---|---:|---:|
| Equal-weight weather blend (locked winner) | 23.21 | 25.83 |
| Current reference, ours-v2 | 28.49 | 20.04 |
| Persistence | 52.45 | 24.82 |
| Daily seasonal | 38.22 | 22.80 |
| Weekly seasonal | 36.17 | 37.68 |

Other development MAEs: separate weather locations 24.97, direct forecasting 27.69,
London calendar 28.18, shallow boosting 29.14, ridge+lags 30.29, ridge+weather 31.44,
calendar-only ridge 36.63. Those unselected candidates were not scored on the final
window. The full report includes RMSE, signed bias and lead-time breakdowns.

**Decision: retain the existing model.** The development winner's final MAE is
28.92% higher than ours-v2. This is evidence against promoting this candidate now,
not proof that multi-point weather is generally worse. The result illustrates
development selection optimism and variation across time windows. Broader weather
coverage remains a hypothesis needing new periods and better geographic weighting.
Do not retune and rescore on this now-used final period.

All errors are gCO2/kWh. Local report: `artifacts/model-studies/controlled-2026-09-09/report.json`.
Verified 32 Python tests, 3 isolated PostgreSQL tests, TypeScript, identical target
counts and API responses. Existing production writers and model selection are unchanged.

## Technical references

- [scikit-learn Ridge](https://scikit-learn.org/stable/modules/generated/sklearn.linear_model.Ridge.html): L2-regularised regression used by the linear candidates.
- [Open-Meteo Single Runs API](https://open-meteo.com/en/docs/single-runs-api): archived forecast runs used at evaluated origins; availability is an explicit study assumption.
