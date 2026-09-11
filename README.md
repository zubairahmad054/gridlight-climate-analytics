# Gridlight — UK Electricity Carbon Analytics

A climate-analytics portfolio project by **Zubair Ahmad**, combining a plain-language
electricity dashboard with reproducible forecasting research and explicit data-quality
limitations.

## Explore the project

- **Overview:** latest readings, the electricity outlook and an appliance planner.
- **Energy patterns:** historical cleaner hours, missing observations and price/carbon
  trade-offs; automatically refreshed descriptive analysis once the pipeline is enabled.
- **Forecast checks:** dated, controlled model comparisons, including unsuccessful results.
- **Technical details:** optional metrics, identifiers and methodology explanations.

The redesigned deployment is being configured. The legacy deployment is not evidence
that this version or its new scheduling pipeline is live.

## Evidence, not inflated claims

The saved research compared 12 approaches. Its selected weather blend improved the
development result but had 28.92% higher average error than the reference in the
separate final check (25.83 vs 20.04 gCO2/kWh). No candidate was promoted on that basis.
One short final window does not establish year-round reliability.

Missing observations remain visible. Forecasts are estimates. Planner carbon figures
use a grid-average footprint; marginal estimates are rule-based, not measured causal
emissions reductions. Agile tariff prices may not match a visitor's own tariff.

## Architecture

Next.js/TypeScript serves the dashboard and API on Vercel. Neon PostgreSQL holds data,
forecast vintages and scheduled analytics reports. GitHub Actions ingests hourly and
trains the reference model daily using Python and scikit-learn. The browser polls
fresh data without requiring a site rebuild. Controlled studies remain dated research.

The write workflows are deliberately gated until the database, deployment, secrets
and legacy-workflow handover are confirmed. See [live deployment guide](docs/publishing.md).

## Local development

Install from the committed pnpm lockfile, then run pnpm dev. Use a private .env.local
for database configuration; .env.example contains placeholders only. INGEST_TOKEN
is required for any call to the write endpoint, including local development.
Without database configuration the descriptive/research pages can show bundled,
labelled reports; forecasts may be clearly marked demonstration data.

## Methodology and verification

- [Controlled study](docs/model-study.md)
- [Forecast methodology](docs/forecast-experiments.md)
- [Analytics methodology](docs/analytics.md)
- [UI design and safeguards](docs/ui-redesign.md)
- [Remaining research roadmap](docs/revamp-plan.md)
- [Deployment, scheduling and monitoring](docs/publishing.md)

Tests cover forecasting, missing-data handling, reproducibility, database history,
scheduler continuity, operational job validation and repository authorship controls.
CI runs tests, TypeScript and a production build.

Sources: NESO Carbon Intensity API, Open-Meteo and Octopus Energy.
Code licence: [MIT](LICENSE). See source providers for their data licences.
[Explore more projects on my GitHub](https://github.com/zubairahmad054).
