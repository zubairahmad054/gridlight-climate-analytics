# Dashboard redesign — 10 September 2026

The existing Next.js application now has a shared, soft-colour interface branded
Gridlight. Routes, stored analytics and research reports remain intact.

## Information structure

- Overview (`/`): latest recorded carbon level, electricity outlook, appliance
  planner, power sources and recent readings. In-page links jump to each section.
- Energy patterns (`/analytics`): historical cleaner hours, missing data,
  prediction mistakes and price/carbon comparisons. Data download is retained.
- Forecast checks (`/experiments`): the separate final check is shown first;
  earlier tests and hours-ahead filters remain available.
- A shared technical-detail switch reveals identifiers, advanced error metrics,
  marginal estimates and methodology. Ordinary-language explanations are default.
- Every page credits Zubair Ahmad and links to github.com/zubairahmad054.

## Accuracy and accessibility

Existing model weights, training scripts, saved study inputs/results and database
contents were not changed or regenerated for the redesign. The unsuccessful final
candidate check remains explicit: 25.83 versus 20.04 average error, 28.92% higher,
not an accuracy percentage or grounds for promotion.

Demo forecasts and planner results are explicitly marked as examples. Current
readings older than 90 minutes are labelled old; timestamps use London time and
include dates. Forecast response time is not described as a model issue time.
Missing half-hours break chart lines. Forecast/history tables provide a non-chart
view. Keyboard focus, a skip link, active-page and pressed-control states,
fieldset labels, reduced-motion support and mobile navigation are included.

Planner fixes reject gaps/duplicate times and invalid readings. Cost/balanced
comparisons require fully priced runs; they never silently fall back to carbon.
Savings comparisons use the earliest complete run, not necessarily immediate use,
and show increases as well as decreases. Marginal figures are rule-based estimates,
not measured causal reductions. The UI's fixed-power and tariff assumptions remain
visible. These fixes do not complete the planned scheduler replay evaluation.

## Verification and local use

- TypeScript is checked separately (the existing Next build skips type checking).
- Six scheduler regression tests supplement six authorship and three database tests.
- Production build uses the existing Next.js webpack build. The Sites wrapper's
  package-manager shim failed on this Windows installation; direct invocation works.
- HTTP checks cover all three pages. No browser visual inspection was performed
  in this turn; responsive layout was implemented at the source level.
- Local development: `powershell -ExecutionPolicy Bypass -File scripts/start-local.ps1`.
  Open http://127.0.0.1:3000/. The hidden loopback-only development process supports
  hot reload; it is not an installed Windows service.

No commit, GitHub push, hosted deployment, migration or production data write was
performed. Revamp plan steps 4 (uncertainty/explanations) and 5 (scheduler replay)
remain separate work.
