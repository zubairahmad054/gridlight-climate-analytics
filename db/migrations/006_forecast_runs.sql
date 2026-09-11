-- Additive migration. Legacy forecasts remain a mutable serving cache only.
-- No legacy row is promoted into history: its original issue time is unknown.
CREATE TABLE IF NOT EXISTS forecast_runs (
    run_id UUID PRIMARY KEY,
    model_version TEXT NOT NULL,
    issued_at TIMESTAMPTZ NOT NULL,
    available_at TIMESTAMPTZ NOT NULL,
    training_cutoff TIMESTAMPTZ,
    input_data_version TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    CHECK (issued_at <= available_at),
    CHECK (training_cutoff IS NULL OR training_cutoff <= issued_at)
);

CREATE INDEX IF NOT EXISTS idx_forecast_runs_model_available
    ON forecast_runs (model_version, available_at DESC);

CREATE TABLE IF NOT EXISTS forecast_predictions (
    run_id UUID NOT NULL REFERENCES forecast_runs(run_id),
    target_time TIMESTAMPTZ NOT NULL,
    predicted_intensity DOUBLE PRECISION NOT NULL,
    PRIMARY KEY (run_id, target_time),
    CHECK (predicted_intensity >= 0 AND predicted_intensity < 'Infinity'::float8)
);

CREATE INDEX IF NOT EXISTS idx_forecast_predictions_target
    ON forecast_predictions (target_time, run_id);

-- A pair uses the most recently captured NESO snapshot available BEFORE our
-- decision time, at most 60 minutes old. Both values predict the SAME target.
-- This compares operational information sets, not NESO's unknown source issue time.
CREATE OR REPLACE VIEW paired_forecast_errors AS
SELECT r.run_id, r.model_version, r.available_at AS decision_time,
       p.target_time,
       extract(epoch FROM (p.target_time - r.available_at)) / 3600.0 AS lead_hours,
       p.predicted_intensity AS ours, n.predicted_intensity AS neso,
       n.available_at AS neso_available_at, o.actual,
       p.predicted_intensity - o.actual AS ours_error,
       n.predicted_intensity - o.actual AS neso_error
FROM forecast_runs r
JOIN forecast_predictions p ON p.run_id = r.run_id
JOIN carbon_intensity o ON o.timestamp = p.target_time AND o.actual IS NOT NULL
JOIN LATERAL (
    SELECT np.predicted_intensity, nr.available_at
    FROM forecast_runs nr
    JOIN forecast_predictions np ON np.run_id = nr.run_id
    WHERE nr.model_version = 'neso-fw48h'
      AND np.target_time = p.target_time
      AND nr.available_at <= r.available_at
      AND nr.available_at >= r.available_at - interval '60 minutes'
    ORDER BY nr.available_at DESC, nr.run_id DESC
    LIMIT 1
) n ON true
WHERE r.model_version LIKE 'ours%'
  AND p.target_time > r.available_at
  AND p.target_time <= r.available_at + interval '48 hours';
