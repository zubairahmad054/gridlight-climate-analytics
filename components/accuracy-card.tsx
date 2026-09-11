"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Target, Info, ArrowLeft } from "lucide-react"
import type { AccuracyResponse } from "@/lib/types"

const LABELS: Record<string, string> = {
  "neso-fw48h": "NESO (paired snapshot)",
  "ours-v1": "Our model",
  "ours-v2": "Our model v2",
}

function fmt(v: number | null): string {
  return v == null ? "—" : v.toFixed(1)
}

const EXPLAIN = [
  {
    term: "MAE — Mean Absolute Error",
    body: "The average size of the forecast's miss versus what actually happened, in gCO₂/kWh. Lower is better. This is the headline “how good is it” number.",
  },
  {
    term: "RMSE — Root Mean Square Error",
    body: "Like MAE but it weights big misses more heavily. When RMSE sits well above MAE, the forecast is usually close but occasionally lands far off (e.g. an unexpected wind drop).",
  },
  {
    term: "Bias — average direction of error",
    body: "Positive means the forecast runs high (over-predicts intensity); negative means it runs low; near zero means it's even-handed. A large bias is a systematic error a better model can correct.",
  },
  {
    term: "n — sample size",
    body: "How many settled half-hours the numbers are based on. Small n is noisy — treat early figures as provisional until more periods settle.",
  },
]

export function AccuracyCard({ data }: { data: AccuracyResponse | null }) {
  const [showInfo, setShowInfo] = useState(false)

  const nowcast = data?.nowcast ?? null
  const models = data?.models ?? []
  const hasAny = nowcast !== null || models.length > 0

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              Forecast Accuracy
            </CardTitle>
            <CardDescription className="mt-1">
              {showInfo
                ? "How to read this table"
                : `Paired forecasts ${data?.horizon ?? "24-48"}h before delivery; settled targets in the last ${data?.windowDays ?? 7} days.`}
            </CardDescription>
          </div>
          <button
            type="button"
            onClick={() => setShowInfo((v) => !v)}
            aria-label={showInfo ? "Back to table" : "What do these numbers mean?"}
            className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            {showInfo ? <ArrowLeft className="h-4 w-4" /> : <Info className="h-4 w-4" />}
          </button>
        </div>
      </CardHeader>

      <CardContent>
        {showInfo ? (
          <div className="space-y-4">
            {EXPLAIN.map((e) => (
              <div key={e.term} className="space-y-1">
                <div className="text-sm font-medium">{e.term}</div>
                <p className="text-sm text-muted-foreground">{e.body}</p>
              </div>
            ))}
            <div className="border-t pt-3 space-y-1">
              <div className="text-sm font-medium">Reading “our model vs NESO”</div>
              <p className="text-sm text-muted-foreground">
                Our model and the paired NESO snapshot use identical targets and decision times.
                NESO must have been captured before our forecast was available, at most 60 minutes
                earlier. Its original issue time is unknown. The near-term row is a separate
                descriptive statistic, not part of this comparison. Legacy overwritten forecasts
                are excluded. Repeated forecast-target pairs are correlated, not independent samples.
              </p>
            </div>
          </div>
        ) : !hasAny ? (
          <p className="text-sm text-muted-foreground">
            Accumulating settled data — accuracy appears once forecasts can be compared against
            metered actuals.
          </p>
        ) : (
          <div
            role="button"
            tabIndex={0}
            onClick={() => setShowInfo(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") setShowInfo(true)
            }}
            className="cursor-pointer rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-2 pr-4 font-medium">Forecast</th>
                    <th className="py-2 px-2 font-medium text-right">MAE</th>
                    <th className="py-2 px-2 font-medium text-right">RMSE</th>
                    <th className="py-2 px-2 font-medium text-right">Bias</th>
                    <th className="py-2 pl-2 font-medium text-right">n</th>
                  </tr>
                </thead>
                <tbody>
                  {nowcast && (
                    <tr className="border-b last:border-0">
                      <td className="py-2 pr-4">{nowcast.label}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{fmt(nowcast.mae)}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{fmt(nowcast.rmse)}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{fmt(nowcast.bias)}</td>
                      <td className="py-2 pl-2 text-right tabular-nums text-muted-foreground">
                        {nowcast.n}
                      </td>
                    </tr>
                  )}
                  {models.map((r) => (
                    <tr key={r.label} className="border-b last:border-0">
                      <td className="py-2 pr-4">{LABELS[r.label] ?? r.label}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{fmt(r.mae)}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{fmt(r.rmse)}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{fmt(r.bias)}</td>
                      <td className="py-2 pl-2 text-right tabular-nums text-muted-foreground">
                        {r.n}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
                <Info className="h-3 w-3" />
                Tap to learn how to read this
              </p>
              {models.length === 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Collecting timestamped forecast pairs. Legacy forecasts cannot be compared at a known lead time.
                </p>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
