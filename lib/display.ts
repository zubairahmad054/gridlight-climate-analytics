export function londonTime(value: string | number, withDate = true) {
  return new Date(value).toLocaleString("en-GB", {
    timeZone: "Europe/London", ...(withDate ? { day: "numeric", month: "short" } as const : {}),
    hour: "2-digit", minute: "2-digit",
  })
}

export function readingIsOld(timestamp: string, now = Date.now()) {
  const time = new Date(timestamp).getTime()
  return !Number.isFinite(time) || now - time > 90 * 60_000 || time > now + 30 * 60_000
}

// A missing half-hour breaks the plotted line instead of implying an observation.
export function breakChartGaps<T extends { t: number }>(rows: T[]): (T | { t: number })[] {
  return rows.flatMap((row, index): (T | { t: number })[] => index > 0 && row.t - rows[index - 1].t > 30 * 60_000
    ? [{ t: rows[index - 1].t + 30 * 60_000 }, row] : [row])
}

export const modelNames: Record<string, string> = {
  "ours-v2": "Existing forecast method", "persistence": "Keep the latest reading",
  "seasonal-daily": "Repeat yesterday", "seasonal-weekly": "Repeat last week",
  "ridge-calendar": "Calendar patterns", "ridge-lags": "Calendar + recent readings",
  "ridge-full": "Calendar + readings + weather", "boosting-shallow": "Simpler prediction model",
  "boosting-london": "Use local time", "boosting-weather-blend": "Blend weather from three areas",
  "boosting-weather-locations": "Compare weather areas separately", "boosting-direct": "Predict each time ahead directly",
}
