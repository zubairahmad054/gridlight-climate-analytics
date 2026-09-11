export interface StudyMetric {
  model: string
  horizon: string
  n: number
  mae: number
  rmse: number
  bias: number
}

export interface ModelStudy {
  schema_version: number
  study_id: string
  generated_at: string
  status: "development_complete" | "complete"
  winner: string
  selection: string
  development_origins: string[]
  final_origins: string[]
  candidates: { id: string; estimator?: string; strategy?: string; weather_mode?: string }[]
  assumptions: string[]
  development: StudyMetric[]
  final: StudyMetric[]
  final_improvement_pct?: number | null
  promotion: string
}
