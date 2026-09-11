# Local grid analytics

Open http://127.0.0.1:3000/analytics for the analytics page, or `/` for the existing
grid dashboard. This is a local development deployment, not a production rollout.

## Run and refresh

From `D:\claude\projects\carbon-intensity-forecasting` in PowerShell:

```powershell
# Start a hidden, loopback-only development server with hot reload.
.\scripts\start-local.ps1

# Refresh the analytics inputs from the configured database (read-only).
.venv\Scripts\python.exe scripts/analytics.py --refresh-db
```

The server requires installed Node dependencies and prints its process ID and log
location (`artifacts/local-server`). If port 3000 is occupied, use the existing
server or pass `-Port 3001`. To stop a server you started, use Windows Task Manager
or `taskkill /PID <the printed process ID> /T /F`. Restart it after a reboot.

Code changes hot-reload automatically. Analytics data is a **saved snapshot**:
the page polls the saved JSON every 30 seconds; **Refresh report** reloads it
immediately. Neither action queries the database or retrains a model. Run the
Python refresh command to generate new analytics. The main dashboard retains its
existing API-backed data behavior.

To reproduce analysis without network access:

```powershell
.venv\Scripts\python.exe scripts/analytics.py --intensity-csv artifacts/analytics/intensity.csv --prices-csv artifacts/analytics/matched-prices.csv
```

The generator selects the newest complete local backtest, or accepts
`--backtest-dir artifacts/backtests/<experiment-id>`. A completed backtest is
required for error diagnostics. Omitting a price CSV in offline mode produces an
explicitly unavailable price section. Open `notebooks/grid-analytics.ipynb` with
the project's Python environment for the reproducible exploratory workflow.
Copy the input CSVs and backtest directory before refreshing if you want to
preserve a particular analysis version; the default output directory is replaced.

## What's included

- Month/hour and weekday/hour intensity heatmaps, with sample counts.
- UTC half-hour completeness timeline and contiguous missing-data intervals.
- Forecast MAE and signed bias by lead time and London delivery hour.
- Error groups by forecast wind speed, temperature and solar radiation.
- Matched carbon/price hourly averages and retrospective two-hour load comparisons.
- JSON export, provenance, date ranges and explicit interpretation limits.

The API reads only `artifacts/analytics/latest.json`. Generation uses a read-only
database transaction and writes local files; this setup applies no database
migrations and publishes no forecasts. The existing accuracy route may report no
paired scores until the separately planned migration 006 and forecast-writer
rollout are completed. Analytics error charts use the saved backtest instead.

## Interpretation and first findings

The September 8 observation snapshot contains 21,205 settled half-hours through
21:00 UTC, with 823 missing slots (96.26% coverage). Missing periods are not filled
with zero. Pattern groups use Europe/London, retaining both occurrences of the
autumn clock-change hour; coverage uses UTC and respects partial boundary days.
Month groups pool matching months across available years, so sample sizes differ.

The seven-origin July 27–August 8 benchmark contains 672 candidate predictions.
Wind-group MAE is 16.0, 23.6 and 36.0 gCO2/kWh for ≤10, 10–25 and >25 km/h,
respectively. The highest-wind group has bias −25.8: predictions tend to be too low.
These small, seasonally limited groups are associations, not causal explanations
or evidence of year-round performance. Weather comes from each fold's archived
forecast inputs, not later observed weather. Signed bias is prediction minus actual.

For Agile region C, 3,362 matched half-hours produce 68 complete UTC days; 25
incomplete or wholly absent days are excluded. Cheapest and cleanest two-hour
windows differ on 55 eligible days. The mean cleanest-window premium is
0.73 p/kWh; the mean cheapest-window intensity penalty is 4.9 gCO2/kWh. Windows
must contain four consecutive half-hours within the same complete UTC day.
This is hindsight using settled average intensity, not deployable forecast savings
or causal/marginal emissions savings. Negative prices are retained.

## Verification and deployment boundary

```powershell
.venv\Scripts\python.exe -m unittest discover -s tests -p 'test_*.py'
node --test tests/forecast-history.test.mjs
node node_modules/typescript/bin/tsc --noEmit
```

Verified locally: 20 Python tests, 3 isolated PostgreSQL tests, TypeScript, all six
notebook code cells, analytics/API rendering and interactive controls. No tests
write to the production database. Local artifacts are gitignored: a future hosted
analytics deployment needs an explicit report-generation/storage workflow, not
just a frontend push.
