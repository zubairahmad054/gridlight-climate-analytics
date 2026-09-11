# Live deployment and scheduled updates

## What updates automatically

| Component | Producer | Cadence |
|---|---|---|
| Observations, official forecasts, generation and Agile prices | GitHub Actions calls authenticated /api/ingest | Hourly at :05 UTC |
| Project forecast and rule-based marginal estimates | GitHub Actions Python pipeline | Daily at 03:30 UTC |
| Historical patterns, completeness and price comparisons | Actions refresh_dashboard.py writes Neon | After hourly ingestion and daily training |
| Browser display | SWR polls API routes | 30–60 seconds while active |
| Controlled research study and historical error diagnostics | Reviewed, dated research artifacts | Deliberately not retrained on the same test window |

No code commits or Vercel rebuilds are needed for normal data updates.
The daily model predicts 48 hours at training time; its remaining horizon shrinks
between daily runs. Research comparisons are not promises of live model accuracy.

## Required settings

Vercel: Next.js preset, repository root, pnpm install --frozen-lockfile, pnpm build,
default output directory. Build uses webpack and fails on TypeScript errors.
Set DATABASE_URL to the intended original Neon pooled connection and set a long
random INGEST_TOKEN. The ingestion endpoint fails closed if that token is absent.
Never use NEXT_PUBLIC_ for credentials.

GitHub Actions secrets:
- DATABASE_URL: same intended Neon database.
- APP_URL: new production HTTPS origin, no path, trailing path, query or credentials.
- INGEST_TOKEN: matches Vercel.
- VERCEL_AUTOMATION_BYPASS_SECRET: only if deployment protection blocks Actions;
  configure through Vercel's supported automation bypass, not by removing protection.

Repository variable ENABLE_PRODUCTION_WRITES must equal true to run either scheduled
or manually dispatched pipeline. Leave it unset until the deployment and schema
are ready. The two workflows serialize their writes using one concurrency group.
This only coordinates this repository, not the legacy repository.

## Database and cutover

Migrations 006 and 007 add forecast vintages, paired-error scoring and report storage.
They were applied with owner approval to the original database on 11 September 2026.
Existing observations and forecasts were preserved. For a different database, review
all migrations before applying them; never make schema mutation part of a Vercel build.
Both workflows run a read-only schema preflight before ingestion.

1. Commit/push the validated deployment changes to the new repository.
2. Deploy the new Vercel project with its server-side secrets.
3. Check all pages and APIs; initially /api/health may be degraded because ours-v2
   and the scheduled report have not yet been published. Bundled analytics fallback
   must be explicitly labelled, not interpreted as a current report.
4. Arrange the legacy-workflow handover with the owner. Do not leave two daily
   training jobs updating the shared database. Keep the old deployment as a fallback,
   but disable its scheduled writers at the agreed cutover.
5. Add GitHub secrets, set ENABLE_PRODUCTION_WRITES=true and manually run Daily retrain.
   This first captures current official forecasts, repairs recent observation gaps,
   trains/publishes ours-v2, updates marginal estimates and refreshes analytics.
6. Run Hourly ingest and analytics and verify /api/health is healthy.
7. Confirm subsequent scheduled runs, then share the public dashboard URL.

The model needs enough historical data and current lag/weather coverage. A fresh,
empty database is not ready simply because its tables exist. Failed training leaves
the previous forecasts intact; forecasts older than 30 hours are no longer served.

## Health and failure handling

/api/health checks observations, official forecasts, generation, prices and analytics
against a three-hour allowance and the reference model/history against 30 hours.
Missing schema/connection returns 503 without exposing credentials. Both pipelines
check this endpoint after publishing. During bootstrap, missing model history is
expected until the first successful daily run.

Ingestion validates all four data channels. Partial ingestion fails the hourly job,
rather than silently claiming success. Daily training can continue past a tariff-feed
failure, but the final health check still surfaces stale data. Requests have timeouts.
No automatic model promotion, repeated final-study testing or fabricated live results.

Enable GitHub Actions failure notifications for the owner. Scheduled runs can be
delayed, run only from the default branch, and public-repository schedules can be
disabled after 60 days of repository inactivity. This is not a guaranteed exact-time
scheduler; periodically verify Actions and health status. Check your Actions minutes
and storage allowance before leaving automation running.

The control-study page and benchmark error charts retain their explicit source dates.
The bundled analytics JSON is a labelled fallback if the report table is unavailable.
Automatic descriptive refresh updates the database, not committed JSON files.

## Validation commands

- node --test tests/forecast-history.test.mjs tests/schedule-ui-safety.test.mjs tests/author-policy.test.mjs tests/pipeline.test.mjs
- python -m unittest discover -s tests -p "test_*.py"
- pnpm build
- python scripts/check_pipeline.py (read-only, requires database access)
- python scripts/refresh_dashboard.py (read-only calculation; --publish writes the report)
- python scripts/train.py (local artifacts only; --publish writes live forecasts)
