"use client"

import Link from "next/link"
import { useState } from "react"
import { PageHeading, useTechnicalDetail } from "@/components/app-shell"
import { modelNames } from "@/lib/display"
import useSWR from "swr"
import { RefreshCw, Download, ArrowUpRight, Info } from "lucide-react"
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, ScatterChart, Scatter, ZAxis } from "recharts"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import type { AnalyticsReport, ErrorGroup } from "@/lib/analytics-types"

const fetcher = async (url: string): Promise<AnalyticsReport> => {
  const response = await fetch(url, { cache: "no-store" })
  const body = await response.json()
  if (!response.ok) throw new Error(body.error || "Could not load analytics")
  return body
}
const date = (value: string) => new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
const number = (value: number | undefined | null, digits = 1) => value == null ? "—" : value.toLocaleString("en-GB", { maximumFractionDigits: digits })
const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

function ErrorChart({ rows, metric }: { rows: ErrorGroup[]; metric: "mae" | "bias" }) {
  return <div className="h-64 min-w-0 w-full" aria-label={`${metric === "mae" ? "Mean absolute error" : "Signed bias"} by segment`}>
    <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 400, height: 256 }}>
      <BarChart data={rows} margin={{ top: 15, right: 12, bottom: 5, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#dfe8e1" />
        <XAxis dataKey="label" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
        <YAxis width={42} tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
        <Tooltip formatter={(value) => [`${number(Number(value))} gCO₂/kWh`, metric === "mae" ? "Average error" : "Average over / underestimate"]} />
        <ReferenceLine y={0} stroke="#6b8274" />
        <Bar dataKey={metric} fill={metric === "mae" ? "#276449" : "#b16a35"} radius={[5, 5, 0, 0]} maxBarSize={64} />
      </BarChart>
    </ResponsiveContainer>
  </div>
}

export default function AnalyticsPage() {
  const technical = useTechnicalDetail()
  const { data, error, isValidating, mutate } = useSWR("/api/analytics", fetcher, { refreshInterval: 30000 })
  const [heatmap, setHeatmap] = useState<"month" | "weekday">("month")
  const [metric, setMetric] = useState<"mae" | "bias">("mae")
  const [segment, setSegment] = useState<"horizons" | "hours">("horizons")
  const [weather, setWeather] = useState<"wind" | "temp" | "solar">("wind")
  const [coverageDays, setCoverageDays] = useState("60")

  const download = () => {
    if (!data) return
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }))
    const anchor = document.createElement("a")
    anchor.href = url; anchor.download = "carbon-analytics.json"; anchor.click()
    URL.revokeObjectURL(url)
  }

  const stats = data?.patterns.quality
  const cells = data ? (heatmap === "month" ? data.patterns.monthly_hourly : data.patterns.weekday_hourly) : []
  const values = cells.map((cell) => cell.mean)
  const min = Math.min(...values), max = Math.max(...values)
  const coverage = data ? data.patterns.daily.slice(coverageDays === "all" ? 0 : -Number(coverageDays)) : []
  const model = data?.errors.models.find((row) => row.model === data.errors.model && row.horizon === "0-48h")
  const worst = data?.errors.horizons.reduce((a, b) => a.bias < b.bias ? a : b)
  const cleanHour = data?.patterns.hourly.reduce((a, b) => a.mean < b.mean ? a : b)

  return <main className="page-wrap space-y-6">
    <PageHeading eyebrow="Learn from the past" title="Find the patterns behind the numbers." description="Explore when electricity has been cleaner, what data is missing, and where predictions fall short." actions={<><Button variant="outline" onClick={download} disabled={!data}><Download size={16} /> Download data</Button><Button variant="outline" onClick={() => mutate()} disabled={isValidating}><RefreshCw size={16} /> Refresh</Button></>} />
    <div className="soft-note"><Info size={18} className="shrink-0 mt-0.5" /><p><strong>Past patterns, not today’s forecast.</strong> {data ? `Readings from ${date(data.patterns.quality.start)} to ${date(data.patterns.quality.end)}. Analysis refreshed ${date(data.generated_at)}.` : "Loading the saved analysis."} Use Overview to plan future use.</p></div>
    {data?.update_warning && <p className="soft-note warning" role="status">{data.update_warning}</p>}
    <nav className="section-jumps" aria-label="On this page"><a href="#patterns">Cleaner hours</a><a href="#coverage">Missing readings</a><a href="#errors">Prediction mistakes</a><a href="#prices">Price & carbon</a></nav>
      {error && <Card><CardContent className="pt-6" role="alert"><p className="font-medium">Analytics could not be refreshed</p><p className="text-sm text-muted-foreground mt-2">{technical ? error.message : "The saved analysis is unavailable. Please try Refresh again."}</p>{data && <p className="text-sm mt-2">The last successfully loaded report remains visible below.</p>}</CardContent></Card>}
      {!data && !error && <div className="p-14 text-center text-muted-foreground animate-pulse" role="status">Loading analysis…</div>}

      {data && stats && <>
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4" aria-label="Summary">
          {[
            ["Recorded readings", number(stats.rows, 0), `${date(stats.start)} onwards`],
            ["Available data", `${number(100 * stats.rows / stats.expected_rows, 2)}%`, `${number(stats.missing_half_hours, 0)} missing periods`],
            ["Average carbon level", number(data.patterns.mean), "g CO₂ per kWh · recorded values only"],
            ["Average prediction error", number(model?.mae), `${data.errors.n} historical predictions · gCO₂/kWh`],
          ].map(([label, value, detail]) => <Card key={label}><CardContent className="pt-5"><p className="text-sm font-medium text-muted-foreground">{label}</p><p className="text-2xl sm:text-3xl font-semibold mt-2 tabular-nums">{value}</p><p className="text-xs text-muted-foreground mt-2">{detail}</p></CardContent></Card>)}
        </section>

        <Card id="patterns">
          <CardHeader className="flex flex-wrap sm:flex-row justify-between gap-3">
            <div><CardTitle>When is the grid cleaner?</CardTitle><CardDescription className="mt-2">Average carbon levels at each hour. All times are for London; the same months across years are grouped together.</CardDescription></div>
            <label className="text-sm text-muted-foreground">Compare by<select aria-label="Heatmap grouping" value={heatmap} onChange={(e) => setHeatmap(e.target.value as typeof heatmap)} className="analytics-select ml-2"><option value="month">Month</option><option value="weekday">Weekday</option></select></label>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto pb-2">
              <table className="w-full min-w-[690px] text-xs border-separate border-spacing-1">
                <caption className="sr-only">Average carbon intensity in grams CO₂ per kWh. Hover or focus a cell for its mean and sample size.</caption>
                <thead><tr><th scope="col" className="text-left font-normal text-muted-foreground">{heatmap === "month" ? "Month" : "Day"}</th>{Array.from({ length: 24 }, (_, h) => <th scope="col" key={h} className="font-normal text-muted-foreground pb-2">{String(h).padStart(2, "0")}</th>)}</tr></thead>
                <tbody>{(heatmap === "month" ? months : weekdays).map((name, index) => <tr key={name}><th scope="row" className="font-normal text-left pr-2">{name}</th>{Array.from({ length: 24 }, (_, hour) => {
                  const cell = cells.find((c) => c.hour === hour && (heatmap === "month" ? c.month === index + 1 : c.weekday === index))
                  const label = cell ? `${name}, ${hour}:00 — ${number(cell.mean)} gCO₂/kWh, ${cell.n} observations` : `${name}, ${hour}:00 — no observations`
                  return <td key={hour} tabIndex={0} aria-label={label} title={label} className="h-6 rounded-sm focus:ring-2 focus:ring-primary outline-none" style={{ background: cell ? `hsl(150 32% ${88 - 61 * (cell.mean - min) / (max - min || 1)}%)` : "#e9ecea" }} />
                })}</tr>)}</tbody>
              </table>
            </div>
            <div className="mt-3 flex flex-wrap justify-between gap-3 text-xs text-muted-foreground"><span>Lighter = cleaner · darker = higher intensity · grey = no data</span><span>{number(min)} – {number(max)} gCO₂/kWh</span></div>
            {cleanHour && <p className="text-sm mt-5 border-t pt-4">The cleanest hour on average was around <strong>{String(cleanHour.hour).padStart(2, "0")}:00 London time</strong> ({number(cleanHour.mean)} gCO₂/kWh). Tomorrow could be different—check the forecast before planning.</p>}
          </CardContent>
        </Card>

        <Card id="coverage">
          <CardHeader className="flex flex-wrap sm:flex-row justify-between gap-3"><div><CardTitle>How complete is the picture?</CardTitle><CardDescription className="mt-2">Each block represents a day. Missing readings are kept visible, not filled with guesses.</CardDescription></div><select aria-label="Coverage time range" value={coverageDays} onChange={(e) => setCoverageDays(e.target.value)} className="analytics-select"><option value="60">Last 60 days in snapshot</option><option value="all">Full history</option></select></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1.5" aria-label="Daily coverage timeline">{coverage.map((day) => <div key={day.date} tabIndex={0} title={`${date(day.date)}: ${day.observed}/${day.expected} periods`} aria-label={`${date(day.date)}: ${day.observed} of ${day.expected} periods`} className="w-3.5 h-7 rounded-sm focus:ring-2 focus:ring-primary outline-none" style={{ background: day.missing === 0 ? "#397a58" : day.observed === 0 ? "#d28860" : "#e8c391" }} />)}</div>
            <p className="text-xs text-muted-foreground mt-3">Green: complete · amber: partial · terracotta: missing · {date(coverage[0].date)} – {date(coverage[coverage.length-1].date)}</p>
            {data.patterns.gaps.length ? <div className="mt-5 rounded-lg bg-orange-50 border border-orange-100 p-4 text-sm"><p className="font-medium text-orange-950">{number(stats.missing_half_hours, 0)} missing half-hours across {data.patterns.gaps.length} gap(s)</p>{data.patterns.gaps.slice(0, 5).map((gap) => <p key={gap.start} className="mt-1 text-orange-900">{date(gap.start)} – {date(gap.end)} · {gap.slots} periods</p>)}<p className="mt-2 text-orange-900/80">Averages use only the readings we have. Missing days can make seasonal comparisons less representative.</p></div> : <p className="mt-4 text-sm">No gaps within the observation snapshot.</p>}
          </CardContent>
        </Card>

        <section id="errors" className="grid lg:grid-cols-2 gap-6">
          <Card className="min-w-0"><CardHeader><CardTitle>Where does the forecast miss?</CardTitle><CardDescription className="mt-2">{technical ? data.errors.model : (modelNames[data.errors.model] ?? "Project forecast")} · {data.errors.folds} test runs, {date(data.errors.first_origin)} – {date(data.errors.last_origin)}</CardDescription><div className="flex flex-wrap gap-3 mt-3"><select aria-label="Error grouping" className="analytics-select" value={segment} onChange={(e) => setSegment(e.target.value as typeof segment)}><option value="horizons">Hours ahead</option><option value="hours">Time of day (London)</option></select><select aria-label="Error metric" className="analytics-select" value={metric} onChange={(e) => setMetric(e.target.value as typeof metric)}><option value="mae">Average error · lower is better</option><option value="bias">Too high or too low?</option></select></div></CardHeader>
            <CardContent><ErrorChart rows={data.errors[segment]} metric={metric} />
              {worst && <p className="text-sm border-t pt-4 mt-3">{worst.bias < 0 ? <>The biggest average underestimate is <strong>{worst.label}</strong>: {number(Math.abs(worst.bias))} below the recorded value, in gCO₂/kWh across {worst.n} predictions.</> : <>No lead-time group underpredicts on average in this experiment.</>}</p>}
              <p className="mt-2 text-xs text-muted-foreground">An error of 20 means the forecast missed by 20 grams per kWh on average. In the high/low view, a negative number means predictions tended to be too low.</p>
            </CardContent></Card>

          <Card className="min-w-0"><CardHeader><CardTitle>Weather and forecast error</CardTitle><CardDescription className="mt-2">Does the weather make a difference to prediction mistakes? These charts compare the forecasts used in each historical test.</CardDescription><select aria-label="Weather variable" className="analytics-select mt-3 w-fit" value={weather} onChange={(e) => setWeather(e.target.value as typeof weather)}><option value="wind">Wind speed</option><option value="temp">Temperature</option><option value="solar">Sunlight</option></select></CardHeader><CardContent><ErrorChart rows={data.errors.weather[weather]} metric={metric} /><div className="flex flex-wrap gap-4 text-xs text-muted-foreground mt-2">{data.errors.weather[weather].map((row) => <span key={row.label}>{row.label}: {row.n} predictions</span>)}</div><p className="text-xs text-muted-foreground mt-4 border-t pt-4">{data.errors.weather_matched}/{data.errors.n} weather matches. Weather, season and time of day overlap. These patterns do not prove why a prediction was wrong.</p></CardContent></Card>
        </section>

        <Card id="prices"><CardHeader><CardTitle>Is the cheapest time also the cleanest?</CardTitle><CardDescription className="mt-2">We compared recorded carbon levels with Agile tariff prices at the same times. Prices include VAT and may differ from your own tariff.</CardDescription></CardHeader><CardContent>
          {!data.prices.available ? <p className="py-8 text-center text-muted-foreground">{data.prices.reason}</p> : <div className="grid lg:grid-cols-2 gap-7">
            <div><p className="text-xs text-muted-foreground mb-3">Region {data.prices.region} · {number(data.prices.n, 0)} matched half-hours · {date(data.prices.start!)} – {date(data.prices.end!)}</p><div className="h-72 w-full min-w-0"><ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 400, height: 288 }}><ScatterChart margin={{ top: 15, right: 25, bottom: 25, left: 10 }}><CartesianGrid strokeDasharray="3 3" stroke="#dfe8e1" /><XAxis type="number" dataKey="intensity" name="Carbon level" tick={{ fontSize: 12 }} label={{ value: "Carbon level · gCO₂/kWh", position: "bottom", offset: 5 }} /><YAxis type="number" dataKey="price" name="Mean price" tick={{ fontSize: 12 }} label={{ value: "p/kWh", angle: -90, position: "insideLeft" }} /><ZAxis range={[70, 70]} /><Tooltip cursor={{ strokeDasharray: "3 3" }} formatter={(value, name) => [number(Number(value), 2), name]} /><Scatter data={data.prices.hourly} fill="#397a58" /></ScatterChart></ResponsiveContainer></div><p className="text-xs text-muted-foreground">Each dot is one London hour-of-day average over matched observations. {technical && <>Correlation across individual half-hours: {number(data.prices.correlation, 2)}.</>}</p></div>
            <div className="rounded-xl bg-muted/70 p-5 self-start"><p className="text-xs uppercase tracking-wider text-muted-foreground">Running an appliance for two hours · looking back</p>{data.prices.complete_days ? <><p className="text-3xl font-semibold mt-4">{data.prices.different_days}<span className="text-lg font-normal text-muted-foreground"> / {data.prices.complete_days} days</span></p><p className="text-sm mt-2">had different starting times for the cheapest and cleanest options.</p><div className="border-t mt-5 pt-4 space-y-3 text-sm"><p>The cleanest time cost an average of <strong>{number(data.prices.mean_clean_premium, 2)} p/kWh</strong> more than the cheapest time.</p><p>The cheapest time had an average of <strong>{number(data.prices.mean_carbon_difference)} gCO₂/kWh</strong> more grid-average carbon than the cleanest time.</p></div></> : <p className="mt-4">Not enough complete days to compare operating windows.</p>}<p className="text-xs text-muted-foreground mt-4">We included only days with all 48 half-hour readings (midnight to midnight UTC); {data.prices.excluded_days} incomplete days were left out. This looks back at recorded outcomes, not guaranteed future savings or emissions reductions caused by changing your routine.</p></div>
          </div>}
        </CardContent></Card>

        <details className="technical-panel" open={technical ? true : undefined}><summary className="cursor-pointer font-medium">How this analysis was calculated · technical details</summary><div className="mt-4 text-muted-foreground space-y-3"><p>Source: {data.source}. Generated {new Date(data.generated_at).toLocaleString("en-GB", { timeZone: "Europe/London" })} London time. The browser checks for reports every 30 seconds. Scheduled analysis refreshes recorded patterns and prices hourly. Error diagnostics retain the dated historical benchmark; they are not retrained results.</p><p>Seasonal patterns use all available observations in the stated snapshot, weighted equally by half-hour. Missing periods are excluded; calendar months are pooled across years. Weather and forecast errors come only from the stated historical experiment.</p><ul className="list-disc pl-5 space-y-1">{data.errors.assumptions.map((item) => <li key={item}>{item}</li>)}</ul><p>NESO comparisons are omitted because legacy forecasts do not preserve trustworthy issue times. Small weather groups and a short summer evaluation window do not establish year-round performance.</p><p>To regenerate from the latest stored data, run <code className="text-xs">python scripts/refresh_dashboard.py --publish</code> in the project. This publishes descriptive analytics to the database; run it only against the intended deployment database.</p></div></details>
        <footer className="flex items-start gap-2 text-xs text-muted-foreground pb-2"><Info size={15} className="shrink-0" /><p>Use the <Link href="/" className="underline">Overview <ArrowUpRight size={12} className="inline" /></Link> for current forecasts and scheduling. This page explains historical patterns and model behaviour.</p></footer>
      </>}
  </main>
}
