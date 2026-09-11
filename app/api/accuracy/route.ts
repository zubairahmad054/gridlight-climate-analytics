import { NextResponse } from "next/server"
import { sql } from "@/lib/db"
import type { AccuracyResponse, AccuracyStat } from "@/lib/types"

export const dynamic = "force-dynamic"

const WINDOW_DAYS = 7

function toStat(label: string, row: Record<string, any> | undefined): AccuracyStat {
  return {
    label,
    n: Number(row?.n ?? 0),
    mae: row?.mae != null ? Number(row.mae) : null,
    rmse: row?.rmse != null ? Number(row.rmse) : null,
    bias: row?.bias != null ? Number(row.bias) : null,
  }
}

export async function GET(req: Request) {
  const horizon = new URL(req.url).searchParams.get("horizon") ?? "24-48"
  const ranges: Record<string, [number, number]> = { "0-6": [0, 6], "6-24": [6, 24], "24-48": [24, 48] }
  if (!Object.prototype.hasOwnProperty.call(ranges, horizon)) {
    return NextResponse.json({ error: "horizon must be 0-6, 6-24, or 24-48" }, { status: 400 })
  }
  const [minLead, maxLead] = ranges[horizon]
  try {
    let nowcast: AccuracyStat | null = null
    let models: AccuracyStat[] = []

    try {
      // NESO's near-term forecast accuracy: every settled period carries both the
      // metered `actual` and NESO's `forecast`, so this is available immediately.
      const nc = await sql`
        SELECT count(*) AS n,
               avg(abs(actual - forecast))            AS mae,
               sqrt(avg(power(actual - forecast, 2))) AS rmse,
               avg(forecast - actual)                 AS bias
        FROM carbon_intensity
        WHERE actual IS NOT NULL AND forecast IS NOT NULL
          AND timestamp >= now() - ${`${WINDOW_DAYS} days`}::interval
      `
      if (nc[0] && Number(nc[0].n) > 0) nowcast = toStat("NESO (near-term)", nc[0])

      // Only immutable, matched prediction pairs. Never infer vintage from the
      // overwritten legacy cache. Latest model version uses one common sample.
      const md = await sql`
        WITH matched AS (
          SELECT * FROM paired_forecast_errors
          WHERE target_time >= now() - ${`${WINDOW_DAYS} days`}::interval
            AND target_time < now()
            AND lead_hours > ${minLead} AND lead_hours <= ${maxLead}
            AND model_version = (
              SELECT model_version FROM forecast_runs WHERE model_version LIKE 'ours%'
              ORDER BY available_at DESC, run_id DESC LIMIT 1
            )
        )
        SELECT e.label, count(*) AS n, avg(abs(e.error)) AS mae,
               sqrt(avg(power(e.error, 2))) AS rmse, avg(e.error) AS bias
        FROM matched m
        CROSS JOIN LATERAL (VALUES
          (m.model_version, m.ours_error), ('neso-fw48h', m.neso_error)
        ) AS e(label, error)
        GROUP BY e.label ORDER BY e.label
      `
      models = md
        .filter((r: Record<string, any>) => Number(r.n) > 0)
        .map((r: Record<string, any>) => toStat(r.label, r))
    } catch (dbError) {
      console.warn("DB unavailable for accuracy:", (dbError as Error).message)
    }

    const response: AccuracyResponse = {
      nowcast, models, windowDays: WINDOW_DAYS, horizon,
      comparisonMethod: "Same targets and decision times; latest NESO snapshot captured beforehand, at most 60 minutes old. NESO source issue time is unknown.",
    }
    return NextResponse.json(response)
  } catch (error) {
    console.error("Error computing accuracy:", error)
    return NextResponse.json(
      { nowcast: null, models: [], windowDays: WINDOW_DAYS, error: "Failed to compute accuracy" },
      { status: 500 }
    )
  }
}
