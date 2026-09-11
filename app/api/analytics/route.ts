import { readFile } from "node:fs/promises"
import path from "node:path"
import { NextResponse } from "next/server"
import type { AnalyticsReport } from "@/lib/analytics-types"
import { sql } from "@/lib/db"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET() {
  if (process.env.DATABASE_URL) {
    try {
      const rows = await sql`SELECT payload FROM dashboard_reports WHERE report_id = 'analytics'`
      const report = rows[0]?.payload as AnalyticsReport | undefined
      if (report?.schema_version === 1) {
        const stale = Date.now() - Date.parse(report.generated_at) > 3 * 3600000
        return NextResponse.json({ ...report, delivery: "database", update_warning: stale ? "The scheduled analysis is overdue. Showing the last successful report." : null }, { headers: { "Cache-Control": "no-store" } })
      }
    } catch { console.warn("Scheduled analytics unavailable; using bundled historical report") }
  }
  try {
    const report: AnalyticsReport = JSON.parse(await readFile(
      path.join(process.cwd(), "data", "reports", "analytics.json"), "utf8",
    ))
    if (report.schema_version !== 1) throw new Error("Unsupported analytics schema")
    return NextResponse.json({ ...report, delivery: "bundled", update_warning: "Automatic analysis is not available yet. Showing the bundled historical snapshot." }, { headers: { "Cache-Control": "no-store" } })
  } catch {
    return NextResponse.json({ error: "Analytics report unavailable. Generate it with python scripts/analytics.py --refresh-db." },
      { status: 503, headers: { "Cache-Control": "no-store" } })
  }
}
