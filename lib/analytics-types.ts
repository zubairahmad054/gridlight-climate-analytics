export interface ErrorGroup { label: string; n: number; mae: number; rmse: number; bias: number }
export interface PatternCell { hour: number; month?: number; weekday?: number; mean: number; n: number }
export interface AnalyticsReport {
  schema_version: number
  generated_at: string
  source: string
  delivery?: "database" | "bundled"
  update_warning?: string | null
  benchmark_generated_at?: string
  timezone: string
  patterns: {
    quality: { rows: number; start: string; end: string; expected_rows: number; missing_half_hours: number }
    mean: number
    hourly: PatternCell[]
    monthly_hourly: PatternCell[]
    weekday_hourly: PatternCell[]
    gaps: { start: string; end: string; slots: number }[]
    daily: { date: string; observed: number; expected: number; mean: number | null; missing: number }[]
  }
  errors: {
    experiment_id: string; model: string; n: number; first_origin: string; last_origin: string; folds: number
    horizons: ErrorGroup[]; hours: ErrorGroup[]; models: (ErrorGroup & { model: string; horizon: string })[]
    weather: Record<"wind" | "temp" | "solar", ErrorGroup[]>; weather_matched: number; assumptions: string[]
  }
  prices: {
    available: boolean; reason?: string; region?: string; n?: number; start?: string; end?: string
    correlation?: number | null; hourly?: { hour: number; price: number; intensity: number; n: number }[]
    complete_days?: number; excluded_days?: number; different_days?: number
    mean_clean_premium?: number | null; mean_carbon_difference?: number | null
  }
}
