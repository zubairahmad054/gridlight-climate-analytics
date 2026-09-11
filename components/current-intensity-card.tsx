"use client"

import { useEffect, useState } from "react"
import { Leaf, Clock3 } from "lucide-react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { getIntensityIndex, type CurrentIntensityResponse } from "@/lib/types"
import { londonTime, readingIsOld } from "@/lib/display"
import { useTechnicalDetail } from "@/components/app-shell"

export function CurrentIntensityCard({ data, isLoading, error }: { data: CurrentIntensityResponse["data"] | undefined; isLoading?: boolean; error?: unknown }) {
  const technical = useTechnicalDetail()
  const [now, setNow] = useState(Date.now)
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(timer) }, [])
  const value = data?.actual ?? data?.forecast ?? null
  const old = data ? readingIsOld(data.timestamp, now) : false
  const band = value == null ? null : getIntensityIndex(value)
  const low = band === "low" || band === "very low"
  return <Card className="h-full bg-[#eaf2ec] border-[#d8e5dc]">
    <CardHeader><p className="flex items-center gap-2 text-sm font-medium text-[#416454]"><Leaf size={18} /> {old ? "Last recorded carbon level" : "Latest carbon level"}</p></CardHeader>
    <CardContent>
      {isLoading ? <p className="py-12" role="status">Getting the latest reading…</p> : error || value == null ? <p className="py-12 text-muted-foreground" role="status">The latest reading isn’t available. Try refreshing shortly.</p> : <>
        <p className="text-[64px] font-semibold tracking-[-3px] leading-none">{Math.round(value)}<span className="text-2xl tracking-normal text-[#577265] ml-2">g</span></p>
        <p className="text-sm text-muted-foreground mt-3">CO₂ per unit of electricity (kWh)</p>
        <div className="flex items-center gap-2 mt-5"><span className="rounded-full bg-white/80 px-3 py-1.5 text-sm font-medium capitalize">{band} carbon</span><span className="text-xs text-muted-foreground">{data?.actual == null ? "Estimated, not observed" : "Recorded reading"}</span></div>
        <p className="mt-5 text-sm leading-relaxed">{old ? "This reading is older than 90 minutes. It describes the past, not conditions right now." : low ? "Electricity has a relatively low carbon level in this reading. Compare the outlook if your appliance can wait." : "There may be cleaner times ahead. Check the outlook before moving any flexible electricity use."}</p>
        <div className="mt-5 flex items-center gap-1.5 text-xs text-muted-foreground border-t border-[#ceded3] pt-4"><Clock3 size={14} /> {data && londonTime(data.timestamp)} · London time</div>
        {technical && <p className="mt-4 text-xs text-muted-foreground">gCO₂/kWh; project bands: ≤50 very low, ≤100 low, ≤200 moderate, ≤300 high, above 300 very high. Extra-demand estimate (marginal): {data?.marginal == null ? "unavailable" : Math.round(data.marginal) + " gCO₂/kWh"}. This is a rule-based estimate, not a measured causal effect.</p>}
      </>}
    </CardContent>
  </Card>
}
