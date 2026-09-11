"use client"

import { Line, LineChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { IntensityRecord } from "@/lib/types"
import { londonTime, breakChartGaps } from "@/lib/display"

interface HistoryChartProps {
  data: IntensityRecord[]
  className?: string
}

const chartConfig = {
  actual: {
    label: "Recorded",
    color: "var(--chart-1)",
  },
  forecast: {
    label: "Grid operator forecast",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig

export function HistoryChart({ data, className }: HistoryChartProps) {
  const chartData = data.map((record) => ({
    t: Date.parse(record.timestamp),
    time: londonTime(record.timestamp, false),
    fullTime: londonTime(record.timestamp),
    actual: record.actual,
    forecast: record.forecast,
  }))

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Recent carbon levels</CardTitle>
        <CardDescription>
          Recorded levels alongside the grid operator’s forecast. Lower numbers mean cleaner electricity.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">Solid line: recorded · dashed line: grid operator forecast. Values are grams of CO₂ per kWh.</p>
        <ChartContainer config={chartConfig} className="h-64 w-full">
          <LineChart data={breakChartGaps(chartData)} margin={{ left: 0, right: 12, top: 12, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(value) => londonTime(value, false)}
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              interval="preserveStartEnd"
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={(value) => `${value}`}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(_, payload) => {
                    const item = payload?.[0]?.payload
                    return item?.fullTime ?? ""
                  }}
                />
              }
            />
            <Line
              type="linear"
              connectNulls={false}
              isAnimationActive={false}
              dataKey="actual"
              stroke="var(--chart-1)"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="linear"
              connectNulls={false}
              isAnimationActive={false}
              dataKey="forecast"
              stroke="var(--chart-2)"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={false}
            />
          </LineChart>
        </ChartContainer>
        {data.length > 0 && <p className="text-sm text-muted-foreground mt-3">{londonTime(data[0].timestamp)} – {londonTime(data[data.length - 1].timestamp)} · London time</p>}
        <details className="mt-4 text-sm"><summary className="cursor-pointer font-medium">Read the chart as a table</summary><div className="overflow-x-auto mt-3"><table className="w-full text-left"><caption className="sr-only">Carbon levels in gCO₂/kWh</caption><thead><tr><th scope="col">London time</th><th scope="col">Recorded</th><th scope="col">Grid forecast</th></tr></thead><tbody>{chartData.map(row => <tr key={row.fullTime} className="border-t"><th scope="row" className="py-2 font-normal">{row.fullTime}</th><td>{row.actual ?? "—"}</td><td>{row.forecast ?? "—"}</td></tr>)}</tbody></table></div></details>
      </CardContent>
    </Card>
  )
}
