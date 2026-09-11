"use client"
import { useState } from "react"
import { Area, Line, ComposedChart, CartesianGrid, XAxis, YAxis, ReferenceArea, ResponsiveContainer, Tooltip } from "recharts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useTechnicalDetail } from "@/components/app-shell"
import { londonTime, breakChartGaps } from "@/lib/display"
import type { ForecastPoint } from "@/lib/types"

export function ForecastChart({ data, highlight, className }: { data: ForecastPoint[]; highlight?: { start: string; end: string } | null; className?: string }) {
  const technical = useTechnicalDetail()
  const [view, setView] = useState<"carbon" | "price">("carbon")
  const hasPrice = data.some(p => p.price != null)
  const priceView = view === "price" && hasPrice
  const chartData = data.map(p => ({ t: new Date(p.target_time).getTime(), carbon: p.predicted_intensity, price: p.price, marginal: p.marginal }))
  const color = priceView ? "#6985ab" : "#548875"
  return <Card className={className}>
    <CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><CardTitle>The electricity outlook</CardTitle><div className="flex gap-1 rounded-lg bg-muted p-1" role="group" aria-label="Outlook measure"><button className={`px-3 py-2 rounded-md text-sm ${!priceView ? "bg-white shadow-sm" : ""}`} aria-pressed={!priceView} onClick={() => setView("carbon")}>Carbon level</button><button className={`px-3 py-2 rounded-md text-sm ${priceView ? "bg-white shadow-sm" : ""}`} aria-pressed={priceView} disabled={!hasPrice} onClick={() => setView("price")} title={!hasPrice ? "Current tariff prices are unavailable" : undefined}>Price</button></div></div><CardDescription>{priceView ? "Lower points mean cheaper electricity on the available Agile tariff." : "Lower points mean less carbon per unit of electricity. Look for the dips."} Times are shown for London.</CardDescription></CardHeader>
    <CardContent><p className="text-xs text-muted-foreground mb-3">{priceView ? "Pence per kWh · includes VAT" : "Grams CO₂ per kWh · lower is cleaner"}{highlight ? " · shaded area: your selected plan" : ""}</p>
      <div className="h-64 w-full min-w-0" role="img" aria-label={priceView ? "Electricity price forecast; lower is cheaper" : "Carbon forecast; lower is cleaner"}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{width:500,height:256}}><ComposedChart data={breakChartGaps(chartData)} margin={{left:0,right:10,top:10,bottom:10}}>
          <defs><linearGradient id="outlook-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.22}/><stop offset="100%" stopColor={color} stopOpacity={0.01}/></linearGradient></defs>
          <CartesianGrid strokeDasharray="3 5" vertical={false} stroke="#e1e8e5" />
          <XAxis dataKey="t" type="number" scale="time" domain={["dataMin","dataMax"]} tickLine={false} axisLine={false} minTickGap={70} tick={{fontSize:12}} tickFormatter={v => londonTime(v,false)} />
          <YAxis width={45} tickLine={false} axisLine={false} tick={{fontSize:12}} />
          {highlight && <ReferenceArea x1={new Date(highlight.start).getTime()} x2={new Date(highlight.end).getTime()} fill="#bdd9cb" fillOpacity={0.4} />}
          <Tooltip labelFormatter={v => londonTime(Number(v)) + " · London"} formatter={(v, name) => [v == null ? "Unavailable" : Number(v).toFixed(1) + (priceView ? " p/kWh" : " gCO₂/kWh"), name === "marginal" ? "Extra-demand estimate" : priceView ? "Price" : "Carbon level"]} />
          <Area type="linear" dataKey={priceView ? "price" : "carbon"} stroke={color} strokeWidth={2.5} fill="url(#outlook-fill)" connectNulls={false} isAnimationActive={false} />
          {technical && !priceView && <Line dataKey="marginal" stroke="#8a82ad" strokeDasharray="5 5" dot={false} connectNulls={false} isAnimationActive={false} />}
        </ComposedChart></ResponsiveContainer>
      </div>
      {!hasPrice && <p className="text-xs text-muted-foreground mt-2">Price comparison is unavailable until current tariff data returns.</p>}
      {technical && <p className="text-xs text-muted-foreground mt-3">Dashed purple line, when available: rule-based marginal estimate. Not a measured causal effect. Chart lines join supplied half-hour values; no uncertainty interval is available yet.</p>}
      <details className="mt-4 text-sm"><summary className="text-muted-foreground">Read the forecast as a table</summary><div className="max-h-64 overflow-auto mt-3"><table className="w-full text-sm"><thead><tr className="text-left"><th className="py-2">London time</th><th>CO₂ (g/kWh)</th><th>Price (p/kWh)</th></tr></thead><tbody>{data.map(p => <tr key={p.target_time} className="border-t"><td className="py-2">{londonTime(p.target_time)}</td><td>{p.predicted_intensity.toFixed(1)}</td><td>{p.price?.toFixed(2) ?? "Unavailable"}</td></tr>)}</tbody></table></div></details>
    </CardContent>
  </Card>
}
