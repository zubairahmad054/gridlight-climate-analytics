"use client"

import { useState, useCallback } from "react"
import Link from "next/link"
import useSWR from "swr"
import { RefreshCw, Info, ArrowUpRight, Clock3 } from "lucide-react"
import { PageHeading, useTechnicalDetail } from "@/components/app-shell"
import { ForecastChart } from "@/components/forecast-chart"
import { HistoryChart } from "@/components/history-chart"
import { SchedulerCard } from "@/components/scheduler-card"
import { CurrentIntensityCard } from "@/components/current-intensity-card"
import { GenerationMixPanel } from "@/components/generation-mix-panel"
import { AccuracyCard } from "@/components/accuracy-card"
import { ModelMetricsCard } from "@/components/model-metrics-card"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { londonTime } from "@/lib/display"
import type { CurrentIntensityResponse, ForecastResponse, HistoryResponse, ModelMetricsResponse, GenerationMixResponse, AccuracyResponse } from "@/lib/types"

const fetcher = async (url: string) => {
  const response = await fetch(url)
  if (!response.ok) throw new Error("This information could not be refreshed. Please try again.")
  return response.json()
}

export default function Dashboard() {
  const technical = useTechnicalDetail()
  const current = useSWR<CurrentIntensityResponse>("/api/intensity/current", fetcher, { refreshInterval: 30000 })
  const forecast = useSWR<ForecastResponse>("/api/forecasts", fetcher, { refreshInterval: 60000 })
  const history = useSWR<HistoryResponse>("/api/intensity/history", fetcher, { refreshInterval: 60000 })
  const generation = useSWR<GenerationMixResponse>("/api/generation/current", fetcher, { refreshInterval: 60000 })
  const metrics = useSWR<ModelMetricsResponse>(technical ? "/api/metrics" : null, fetcher)
  const accuracy = useSWR<AccuracyResponse>(technical ? "/api/accuracy" : null, fetcher)
  const [scheduledWindow, setScheduledWindow] = useState<{ start: string; end: string } | null>(null)
  const handleWindowChange = useCallback((window: { start: string; end: string } | null) => setScheduledWindow(window), [])
  const points = forecast.data?.data ?? []
  const demo = forecast.data?.model_version === "demo"
  const refreshing = current.isValidating || forecast.isValidating
  const refresh = () => { [current, forecast, history, generation, metrics, accuracy].forEach(resource => resource.mutate()) }

  return <main className="page-wrap space-y-6">
    <PageHeading eyebrow="Your energy overview" title="Make sense of your electricity." description="See how carbon levels change, then find a better time to use energy." actions={<Button variant="outline" onClick={refresh} disabled={refreshing}><RefreshCw size={16} className={refreshing ? "animate-spin" : ""} /> Refresh data</Button>} />
    <nav className="section-jumps" aria-label="On this page"><a href="#outlook">Electricity outlook</a><a href="#planner">Plan an appliance</a><a href="#sources">Where power comes from</a><a href="#recent">Recent readings</a></nav>
    {(forecast.error || history.error || generation.error) && <p className="soft-note warning" role="alert">Some information could not be refreshed. Any previously loaded values remain visible; check their dates and try Refresh data again.</p>}

    {demo && <div className="soft-note warning" role="status"><Info size={18} className="shrink-0 mt-0.5" /><div><strong>Example forecast, not a live prediction.</strong> A current forecast is unavailable, so the chart and planner show demonstration data. Don’t use these examples to make energy decisions. Latest recorded readings below are separate.</div></div>}
    <section id="outlook" className="grid xl:grid-cols-[minmax(260px,0.85fr)_minmax(0,1.8fr)] gap-5">
      <CurrentIntensityCard data={current.data?.data} isLoading={current.isLoading} error={current.error} />
      <div className="min-w-0">
        {points.length ? <ForecastChart data={points} highlight={scheduledWindow} /> : <Card className="h-full"><CardHeader><CardTitle>The electricity outlook</CardTitle></CardHeader><CardContent className="min-h-64 flex items-center text-muted-foreground" role="status">{forecast.isLoading ? "Finding the latest forecast…" : "The forecast is unavailable. Please refresh or check back shortly."}</CardContent></Card>}
        {!!points.length && <p className="text-xs text-muted-foreground mt-3 flex gap-2 items-start"><Clock3 size={14} className="shrink-0 mt-0.5" /> {demo ? "Illustration only" : forecast.data?.model_version?.startsWith("neso") ? "Grid operator forecast" : "Project forecast"} · {londonTime(points[0].target_time)} – {londonTime(points.at(-1)!.target_time)} · London time. Predictions can change.</p>}
      </div>
    </section>

    <section id="planner"><SchedulerCard forecasts={points} onWindowChange={handleWindowChange} demo={demo} /></section>

    <div className="grid xl:grid-cols-2 gap-5">
      <section id="sources" className="min-w-0"><GenerationMixPanel data={generation.data?.data ?? null} /></section>
      <section id="recent" className="min-w-0">{history.data?.data.length ? <HistoryChart data={history.data.data} /> : <Card><CardHeader><CardTitle>Recent carbon levels</CardTitle></CardHeader><CardContent className="py-12 text-muted-foreground">{history.isLoading ? "Loading recent readings…" : "Recent readings are not available at the moment."}</CardContent></Card>}</section>
    </div>

    <section className="grid md:grid-cols-2 gap-5">
      <Link href="/analytics" className="rounded-2xl border bg-[#edf3fa] p-6 block hover:border-slate-400 transition-colors"><p className="eyebrow">The bigger picture</p><h2 className="section-heading flex justify-between">When is electricity cleaner? <ArrowUpRight size={22} /></h2><p className="section-lead">Explore daily and seasonal patterns, with missing data made visible.</p></Link>
      <Link href="/experiments" className="rounded-2xl border bg-[#edf3ee] p-6 block hover:border-emerald-500 transition-colors"><p className="eyebrow">Trust & transparency</p><h2 className="section-heading flex justify-between">How good are the predictions? <ArrowUpRight size={22} /></h2><p className="section-lead">See which approaches worked, which didn’t, and what we can reasonably claim.</p></Link>
    </section>
    {technical && <section className="space-y-5" aria-label="Technical forecast information"><div className="soft-note"><Info size={18} className="shrink-0" /> Recorded training metrics and comparable forecast scores are different measures. A historical test is not a guarantee of future accuracy.</div><ModelMetricsCard metrics={metrics.data?.data ?? null} /><AccuracyCard data={accuracy.data ?? null} /></section>}
    <details className="technical-panel"><summary>What do the numbers mean?</summary><div className="grid md:grid-cols-3 gap-6 text-sm leading-relaxed text-muted-foreground"><p><strong className="text-foreground">Carbon level.</strong> Grams of CO₂ associated with one unit of electricity (a kilowatt-hour, or kWh). Smaller numbers mean lower grid-average emissions.</p><p><strong className="text-foreground">Electricity price.</strong> Pence per kWh on the available Octopus Agile tariff, including VAT. This may not match your own household tariff.</p><p><strong className="text-foreground">A forecast is an estimate.</strong> Weather and electricity demand can change. Plan flexibly; never delay essential use or run appliances against their safety guidance.</p></div></details>
  </main>
}
