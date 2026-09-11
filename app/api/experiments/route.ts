import { readFile } from "node:fs/promises"
import path from "node:path"
import { NextResponse } from "next/server"
import type { ModelStudy } from "@/lib/model-study-types"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET() {
  try {
    const report: ModelStudy = JSON.parse(await readFile(
      path.join(process.cwd(), "data", "reports", "model-study.json"), "utf8",
    ))
    if (report.schema_version !== 1) throw new Error("Unsupported study schema")
    return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } })
  } catch {
    return NextResponse.json({ error: "No completed model-selection report yet. The page will check again in 30 seconds." },
      { status: 503, headers: { "Cache-Control": "no-store" } })
  }
}
