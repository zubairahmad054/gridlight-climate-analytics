-- Atomic, versioned-in-time publication of descriptive reports by GitHub Actions.
CREATE TABLE IF NOT EXISTS dashboard_reports (
    report_id TEXT PRIMARY KEY,
    generated_at TIMESTAMPTZ NOT NULL,
    payload JSONB NOT NULL,
    CHECK (jsonb_typeof(payload) = 'object'),
    CHECK (payload->>'schema_version' IS NOT NULL AND payload->>'schema_version' = '1')
);
