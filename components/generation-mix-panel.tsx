"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Leaf } from "lucide-react"
import { londonTime, readingIsOld } from "@/lib/display"
import type { GenerationMixPoint } from "@/lib/types"

type FuelKey = keyof Omit<GenerationMixPoint, "timestamp">

// Display order roughly low-carbon → fossil → imports/other.
const FUELS: { key: FuelKey; label: string; color: string }[] = [
  { key: "wind", label: "Wind", color: "#89b8c7" },
  { key: "solar", label: "Solar", color: "#e4c780" },
  { key: "hydro", label: "Hydro", color: "#799fb9" },
  { key: "nuclear", label: "Nuclear", color: "#afa2c7" },
  { key: "biomass", label: "Biomass", color: "#a3b889" },
  { key: "gas", label: "Gas", color: "#6b7280" },
  { key: "coal", label: "Coal", color: "#1f2937" },
  { key: "imports", label: "Imports", color: "#94a3b8" },
  { key: "other", label: "Other", color: "#71717a" },
]

const LOW_CARBON: FuelKey[] = ["wind", "solar", "hydro", "nuclear", "biomass"]

export function GenerationMixPanel({ data }: { data: GenerationMixPoint | null }) {
  if (!data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Where does electricity come from?</CardTitle>
          <CardDescription>The latest available breakdown by source</CardDescription>
        </CardHeader>
        <CardContent className="h-32 flex items-center justify-center text-muted-foreground">
          No generation data available
        </CardContent>
      </Card>
    )
  }

  const segments = FUELS.map((f) => ({ ...f, perc: Number(data[f.key]) || 0 })).filter(
    (s) => s.perc > 0
  )
  const lowCarbon = LOW_CARBON.reduce((sum, k) => sum + (Number(data[k]) || 0), 0)
  const legend = [...segments].sort((a, b) => b.perc - a.perc)

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <CardTitle>Where does electricity come from?</CardTitle>
            <CardDescription>
              Recorded {londonTime(data.timestamp)} · London time
            </CardDescription>
          </div>
          <div className="text-right shrink-0">
            <div className="flex items-center justify-end gap-1.5 text-2xl font-bold text-primary">
              <Leaf className="h-5 w-5" />
              {lowCarbon.toFixed(0)}%
            </div>
            <div className="text-xs text-muted-foreground">low-carbon</div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {readingIsOld(data.timestamp) && <p className="soft-note warning">This is an older reading, not the current mix.</p>}
        {/* Stacked share bar */}
        <div className="flex h-4 w-full overflow-hidden rounded-full bg-muted">
          {segments.map((s) => (
            <div
              key={s.key}
              style={{ width: `${s.perc}%`, backgroundColor: s.color }}
              title={`${s.label}: ${s.perc.toFixed(1)}%`}
            />
          ))}
        </div>

        {/* Legend */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
          {legend.map((s) => (
            <div key={s.key} className="flex items-center gap-2 text-sm">
              <span
                className="h-3 w-3 rounded-full shrink-0"
                style={{ backgroundColor: s.color }}
              />
              <span className="text-muted-foreground">{s.label}</span>
              <span className="ml-auto font-medium tabular-nums">{s.perc.toFixed(1)}%</span>
            </div>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">Low-carbon here groups wind, solar, hydro, nuclear and biomass. It does not mean zero emissions; biomass is included in this grouping but still emits CO₂.</p>
      </CardContent>
    </Card>
  )
}
