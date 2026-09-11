import { NextResponse } from "next/server"
import { sql } from "@/lib/db"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET() {
  try {
    const rows = await sql`SELECT
      (SELECT max(timestamp) FROM carbon_intensity WHERE actual IS NOT NULL) AS observations,
      (SELECT max(created_at) FROM forecasts WHERE model_version = 'ours-v2' AND target_time > now()) AS model,
      (SELECT max(created_at) FROM forecasts WHERE model_version = 'neso-fw48h' AND target_time > now()) AS official,
      (SELECT max(timestamp) FROM generation_mix) AS generation,
      (SELECT max(created_at) FROM agile_prices WHERE timestamp > now()) AS prices,
      (SELECT generated_at FROM dashboard_reports WHERE report_id = 'analytics') AS analytics,
      (SELECT max(available_at) FROM forecast_runs WHERE model_version = 'ours-v2') AS training_history`
    const limits: Record<string, number> = { observations: 3, model: 30, official: 3, generation: 3, prices: 3, analytics: 3, training_history: 30 }
    const checks = Object.fromEntries(Object.entries(limits).map(([key, hours]) => {
      const timestamp = rows[0]?.[key]
      const age = timestamp ? (Date.now() - Date.parse(String(timestamp))) / 3600000 : NaN
      return [key, { timestamp: timestamp ?? null, fresh: Number.isFinite(age) && age >= -0.5 && age <= hours, maximum_age_hours: hours }]
    }))
    const healthy = Object.values(checks).every(check => check.fresh)
    return NextResponse.json({ status: healthy ? "healthy" : "degraded", checks }, { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } })
  } catch {
    return NextResponse.json({ status: "unavailable", message: "Database connection or required schema unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } })
  }
}
