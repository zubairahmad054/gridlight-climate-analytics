"use client"

import { useState } from "react"
import useSWR from "swr"
import { RefreshCw, Info, LockKeyhole } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { PageHeading, useTechnicalDetail } from "@/components/app-shell"
import { modelNames } from "@/lib/display"
import type { ModelStudy } from "@/lib/model-study-types"

const fetcher = async (url: string): Promise<ModelStudy> => {
  const response = await fetch(url, { cache: "no-store" })
  const body = await response.json()
  if (!response.ok) throw new Error(body.error || "Unable to load the study")
  return body
}
const fmt = (n: number) => n.toLocaleString("en-GB", { maximumFractionDigits: 2 })
const date = (value: string) => value ? new Date(value).toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" }) : "Pending"

export default function ExperimentsPage() {
  const technical = useTechnicalDetail()
  const { data, error, isValidating, mutate } = useSWR("/api/experiments", fetcher, { refreshInterval: 30000 })
  const [partition, setPartition] = useState<"development" | "final">("final")
  const [horizon, setHorizon] = useState("0-48h")
  const rows = (data?.[partition] ?? []).filter(r => r.horizon === horizon).sort((a, b) => a.mae - b.mae)
  const reference = rows.find(r => r.model === "ours-v2")
  const finalReference = data?.final.find(r => r.model === "ours-v2" && r.horizon === "0-48h")
  const finalChoice = data?.final.find(r => r.model === data.winner && r.horizon === "0-48h")
  const improvement = data?.final_improvement_pct
  const origins = data?.[partition === "final" ? "final_origins" : "development_origins"] ?? []

  return <main className="page-wrap space-y-6">
    <PageHeading eyebrow="Forecast checks" title="See how the predictions measure up." description="We compare predictions with recorded carbon levels. A smaller error means a closer match—not a guarantee about tomorrow." actions={<Button variant="outline" onClick={() => mutate()} disabled={isValidating}><RefreshCw size={16} className={isValidating ? "animate-spin" : ""} /> Refresh</Button>} />
    {error && <div className="soft-note warning" role="alert">{technical ? error.message : "The saved forecast checks could not be refreshed. Please try again."}{data && " The last loaded report is shown below."}</div>}
    {!data && !error && <Card><CardContent className="py-8" role="status">Loading forecast checks…</CardContent></Card>}
    {data && <>
      <div className="soft-note warning"><Info size={20} className="shrink-0 mt-0.5" /><div>
        <p className="font-semibold">{improvement == null ? "The separate final check is still pending." : improvement < 0 ? "The new approach did not improve the final result." : "The new approach scored better in this limited final check."}</p>
        <p className="mt-1">{improvement != null && <>Its average prediction error was {fmt(Math.abs(improvement))}% {improvement < 0 ? "higher" : "lower"} than the existing method. </>}This is a historical research comparison. No live forecast method has been changed.</p>
      </div></div>
      <section className="grid sm:grid-cols-3 gap-4" aria-label="Final check summary">
        <Card><CardHeader><CardDescription>Existing method · final check</CardDescription><CardTitle className="text-3xl tabular-nums">{finalReference ? fmt(finalReference.mae) : "—"}</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">Average error, in grams of CO₂ per kWh.</CardContent></Card>
        <Card><CardHeader><CardDescription>New approach · final check</CardDescription><CardTitle className="text-3xl tabular-nums">{finalChoice ? fmt(finalChoice.mae) : "—"}</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">{modelNames[data.winner] ?? data.winner} · same error units.</CardContent></Card>
        <Card><CardHeader><CardDescription>How much was checked?</CardDescription><CardTitle className="text-3xl tabular-nums">{finalReference ? finalReference.n : "—"} <span className="text-base font-normal">predictions</span></CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">{data.final_origins.length} final test run(s). A short check cannot establish year-round reliability.</CardContent></Card>
      </section>
      <Card><CardHeader><CardTitle>Compare the approaches</CardTitle><CardDescription>The earlier tests chose a promising approach. A separate, later check tested that choice on data not used to select it.</CardDescription></CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Choose test results">
              <Button variant={partition === "final" ? "default" : "outline"} aria-pressed={partition === "final"} onClick={() => setPartition("final")}>Separate final check</Button>
              <Button variant={partition === "development" ? "default" : "outline"} aria-pressed={partition === "development"} onClick={() => setPartition("development")}>Earlier tests</Button>
            </div>
            <label className="text-sm flex flex-wrap items-center gap-2">Predicting how far ahead?
              <select className="analytics-select" value={horizon} onChange={e => setHorizon(e.target.value)}>
                <option value="0-48h">All 48 hours</option><option value="0-6h">First 6 hours</option><option value="6-24h">6–24 hours</option><option value="24-48h">24–48 hours</option>
              </select>
            </label>
          </div>
          <p className="text-sm text-muted-foreground mb-4">{origins.length} test run(s){origins.length > 0 && <> · Starting {date(origins[0])}{origins.length > 1 && <> to {date(origins.at(-1)!)}</>}</>}. {partition === "final" ? "Only the previously chosen approach, existing method and basic comparisons are checked here." : "These results were used to choose the approach; they are not an independent final score."}</p>
          {!rows.length ? <p className="py-6 text-muted-foreground">No results available for this selection yet.</p> : <div className="overflow-x-auto">
            <table className={`w-full text-sm text-left ${technical ? "min-w-[760px]" : "min-w-[430px]"}`}>
              <caption className="text-left text-sm text-muted-foreground pb-4">Average error is the typical size of a prediction mistake. For example, 20 means 20 grams of CO₂ per kWh away from the recorded value on average. Lower is better.</caption>
              <thead className="text-muted-foreground border-b"><tr><th scope="col" className="py-3 pr-4">Approach</th><th scope="col" className="px-3">Average error</th><th scope="col" className="px-3">Predictions checked</th>{technical && <><th scope="col" className="px-3">RMSE</th><th scope="col" className="px-3">Bias</th><th scope="col" className="px-3">Δ MAE vs reference</th></>}</tr></thead>
              <tbody>{rows.map(row => <tr key={row.model} className={`border-b last:border-0 ${row.model === data.winner ? "bg-primary/5" : ""}`}>
                <th scope="row" className="py-4 pr-4 font-medium">{modelNames[row.model] ?? row.model}{row.model === data.winner && <span className="flex gap-1 items-center text-xs text-muted-foreground font-normal mt-1"><LockKeyhole size={13} /> Chosen in earlier tests</span>}{technical && <code className="block text-xs text-muted-foreground mt-1">{row.model}</code>}</th>
                <td className="px-3 tabular-nums font-semibold">{fmt(row.mae)}</td><td className="px-3 tabular-nums">{row.n}</td>
                {technical && <><td className="px-3 tabular-nums">{fmt(row.rmse)}</td><td className="px-3 tabular-nums">{fmt(row.bias)}</td><td className="px-3 tabular-nums">{reference ? `${row.mae-reference.mae > 0 ? "+" : ""}${fmt(row.mae-reference.mae)}` : "—"}</td></>}
              </tr>)}</tbody>
            </table>
          </div>}
          <p className="text-sm text-muted-foreground mt-4">All error values are gCO₂/kWh. Changing the view does not select a new winning approach.</p>
          {technical && <p className="text-sm text-muted-foreground mt-3">MAE is mean absolute error; RMSE gives larger mistakes more weight. Negative bias means predictions tend to be too low. A positive Δ MAE is worse than the reference.</p>}
        </CardContent>
      </Card>
      <Card><CardHeader><CardTitle>What should I take away?</CardTitle></CardHeader><CardContent className="space-y-3 text-muted-foreground">
        <p>Forecasts are estimates, not promises. Use them to compare possible times, and check again closer to when you need electricity.</p>
        <p>The new approach looked promising in the earlier tests. The separate final check matters because an improvement on familiar data may not hold on a later day.</p>
        <p>We need checks across more dates and seasons before making a broader reliability claim. This comparison does not measure the accuracy of the grid operator’s forecast.</p>
      </CardContent></Card>
      <details className="technical-panel" open={technical ? true : undefined}><summary className="cursor-pointer font-medium">Study method and limitations · technical details</summary><div className="mt-4 text-sm text-muted-foreground space-y-3"><ul className="list-disc pl-5 space-y-2">{data.assumptions.map(item => <li key={item}>{item}</li>)}</ul><p>{data.promotion}</p><p>Study {data.study_id} · Report saved {date(data.generated_at)}. Refresh reloads saved results; it does not train a model.</p></div></details>
    </>}
  </main>
}
