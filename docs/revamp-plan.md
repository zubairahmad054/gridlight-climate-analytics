# ML and analytics revamp

This records the original five-step sequence from the project review.

| Step | Scope | Local implementation status |
|---|---|---|
| 1 | Trustworthy forecasting experiments: preserved runs, time-aware backtests, reproducible inputs, valid comparisons | Complete; production migration/writer rollout pending |
| 2 | Substantial data analytics layer: patterns, gaps, error conditions, carbon/price comparisons | Complete; local dashboard and notebook verified |
| 3 | Controlled ML experiments: baselines, regularised linear model, boosting, feature comparisons, tuning and direct forecasting | Initial controlled study complete; 12 choices compared, final check recorded, no promotion |
| 4 | Prediction intervals, calibration and model explanations | Not started |
| 5 | Historical scheduler evaluation, realised outcomes, continuity and honest marginal-emissions interpretation | Not started |

At the start of step 3, **three steps remain**. Local deployment is an additional
delivery requirement, not a sixth research step. Production rollout remains a
separate approval boundary; no model is automatically promoted after an experiment.

After the initial step 3 study, **two steps remain: 4 and 5**. Research can continue
within step 3 without blocking those deliverables. The weather blend won development
but lost the final comparison, so the current model remains unchanged. Results:
[controlled study](model-study.md).

Step 3's initial study reserves the September 5, 2026 03:30 UTC forecast origin
(96 targets) before fitting any candidate. Development uses the seven earlier
July 27–August 8 origins. September descriptive analytics were already inspected,
so the test is held out from model selection, not an entirely unseen dataset.
One two-day test cannot establish season-wide reliability. Future iterations
need a new holdout and broader seasonal coverage, not repeated tuning on this one.
