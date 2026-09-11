# Publishing this clean portfolio repository

This repository starts with fresh owner-authored history; the research workspace
remains separate. No private environment files, full datasets, model binaries,
local caches or old Git history are included.

Two dated research summaries in `data/reports/` are bundled into the Next.js API
functions. They do not refresh themselves or train models on Vercel. Run fresh
research in the original workspace, review the results, and explicitly replace
these summaries when publishing a new snapshot.

## Vercel

Import this repository as a Next.js project with its root directory at the repository
root. Install from `pnpm-lock.yaml`; build with `pnpm build`. Type errors fail the build.
Set DATABASE_URL and INGEST_TOKEN using Vercel's environment settings, never Git.
Without a database, historical report pages still work, while overview endpoints
may fall back to upstream data or explicitly labelled demonstration forecasts.

Before enabling production database writes, review/apply migration 006 and verify
the forecast writer against the intended database. Scheduled ingestion and training
are gated by repository variable ENABLE_PRODUCTION_WRITES=true; leave it unset
until rollout is approved. Then configure the required GitHub Actions secrets.
The variable gate also applies to manual workflow dispatch.

Verify /, /analytics and /experiments and their API responses in a Vercel preview
before making the repository public or sharing its live URL with recruiters.
Never describe the separate legacy deployment as containing this new version.
