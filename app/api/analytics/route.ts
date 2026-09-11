import { readFile } from "node:fs/promises"
import path from "node:path"
import { NextResponse } from "next/server"
import type { AnalyticsReport } from "@/lib/analytics-types"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET() {
  try {
    const report: AnalyticsReport = JSON.parse(await readFile(
      path.join(process.cwd(), "data", "reports", "analytics.json"), "utf8",
    ))
    if (report.schema_version !== 1) throw new Error("Unsupported analytics schema")
    return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } })
  } catch {
    return NextResponse.json({ error: "Analytics report unavailable. Generate it with python scripts/analytics.py --refresh-db." },
      { status: 503, headers: { "Cache-Control": "no-store" } })
  }
}
