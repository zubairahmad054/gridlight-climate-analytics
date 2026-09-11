/**
 * Carbon-/cost-optimal scheduling core — the "best time to run" decision layer.
 *
 * Pure functions over the forward signal (the half-hourly forecast + marginal +
 * price). Shared by the interactive scheduler card (client-side, instant) and the
 * GET /api/schedule route (server-side), so the two can never diverge.
 *
 * The scheduler never models or fetches anything: it slides a fixed-length window
 * across the signal and ranks the candidates by the chosen objective. Add a channel
 * to the signal and the scheduler can optimise it for free.
 */

const SLOT_MINUTES = 30
const SLOT_HOURS = SLOT_MINUTES / 60

export interface SignalPoint {
  target_time: string // ISO 8601, UTC — start of the half hour
  intensity: number // predicted average gCO2/kWh
  marginal: number | null // predicted marginal gCO2/kWh (null until computed)
  price: number | null // predicted unit price p/kWh inc. VAT (null outside priced horizon)
}

export type ScheduleObjective = "carbon" | "cost" | "balanced"

export interface ScheduleWindow {
  start: string // ISO — first slot of the window
  end: string // ISO — exclusive end (last slot start + 30 min)
  slots: number
  avgIntensity: number
  avgMarginal: number | null
  avgPrice: number | null
}

export interface ScheduleParams {
  durationHalfHours: number // window length in half-hour slots (>= 1)
  deadline?: string | null // window must finish at/before this ISO time
  objective?: ScheduleObjective
}

export interface RankedWindow extends ScheduleWindow {
  /** Lower is better. Comparable only within one ranking call. */
  score: number
}

function addMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString()
}

function avg(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

function summarise(slice: SignalPoint[]): ScheduleWindow {
  const hasMarginal = slice.every((p) => p.marginal != null)
  const hasPrice = slice.every((p) => p.price != null)
  return {
    start: slice[0].target_time,
    end: addMinutes(slice[slice.length - 1].target_time, SLOT_MINUTES),
    slots: slice.length,
    avgIntensity: avg(slice.map((p) => p.intensity)),
    avgMarginal: hasMarginal ? avg(slice.map((p) => p.marginal as number)) : null,
    avgPrice: hasPrice ? avg(slice.map((p) => p.price as number)) : null,
  }
}

function isCompleteWindow(slice: SignalPoint[]): boolean {
  return slice.every((point, index) => {
    const time = Date.parse(point.target_time)
    return Number.isFinite(time) && Number.isFinite(point.intensity) && point.intensity >= 0 &&
      (point.price == null || Number.isFinite(point.price)) &&
      (point.marginal == null || Number.isFinite(point.marginal)) &&
      (index === 0 || time - Date.parse(slice[index - 1].target_time) === SLOT_MINUTES * 60_000)
  })
}

/**
 * Rank every contiguous window of `durationHalfHours` slots that finishes by the
 * deadline, best (lowest score) first. The objective decides the score:
 *   - carbon:   average predicted intensity
 *   - cost:     average price; requires complete prices
 *   - balanced: equal blend of intensity and price, each min-max normalised across
 *               the fully priced candidate set
 *
 * An invalid `deadline` (unparseable → NaN) is treated as no deadline.
 */
export function rankWindows(points: SignalPoint[], params: ScheduleParams): RankedWindow[] {
  const n = Math.max(1, Math.floor(params.durationHalfHours))
  const objective = params.objective ?? "carbon"
  const parsedDeadline = params.deadline ? new Date(params.deadline).getTime() : NaN
  const deadlineMs = Number.isFinite(parsedDeadline) ? parsedDeadline : Infinity

  // Build raw candidate windows (contiguous, finishing by the deadline).
  const candidates: ScheduleWindow[] = []
  for (let i = 0; i + n <= points.length; i++) {
    const slice = points.slice(i, i + n)
    if (!isCompleteWindow(slice)) continue
    const endMs = new Date(slice[slice.length - 1].target_time).getTime() + SLOT_MINUTES * 60_000
    if (endMs > deadlineMs) continue
    candidates.push(summarise(slice))
  }
  if (candidates.length === 0) return []

  const priced = candidates.filter((w) => w.avgPrice != null)
  // Never describe a carbon-only ranking as the cheapest or balanced choice.
  const useCost = objective === "cost" || objective === "balanced"
  if (useCost && priced.length === 0) return []
  // A cost/carbon tradeoff requires known prices for the entire candidate.
  const pool = useCost ? priced : candidates

  // Min-max bounds so intensity and price are comparable on one [0,1] scale.
  const iVals = pool.map((w) => w.avgIntensity)
  const pVals = priced.map((w) => w.avgPrice as number)
  const norm = (v: number, lo: number, hi: number) => (hi > lo ? (v - lo) / (hi - lo) : 0)
  const iLo = Math.min(...iVals)
  const iHi = Math.max(...iVals)
  const pLo = pVals.length ? Math.min(...pVals) : 0
  const pHi = pVals.length ? Math.max(...pVals) : 0

  const scored = pool.map((w): RankedWindow => {
    let score: number
    if (objective === "cost" && useCost) {
      score = w.avgPrice as number
    } else if (objective === "balanced" && useCost) {
      // Every candidate in this pool has a complete price series.
      score = 0.5 * norm(w.avgIntensity, iLo, iHi) + 0.5 * norm(w.avgPrice as number, pLo, pHi)
    } else {
      score = w.avgIntensity
    }
    return { ...w, score }
  })

  return scored.sort((a, b) => a.score - b.score)
}

/**
 * The "run now" baseline: the earliest possible window of the same length.
 * First-class here so the API route and the dashboard card share one definition
 * and can never disagree on the savings denominator.
 */
export function baselineWindow(
  points: SignalPoint[],
  durationHalfHours: number,
): ScheduleWindow | null {
  const n = Math.max(1, Math.floor(durationHalfHours))
  for (let i = 0; i + n <= points.length; i++) {
    const slice = points.slice(i, i + n)
    if (isCompleteWindow(slice)) return summarise(slice)
  }
  return null
}

export interface WindowSavings {
  /** Attributional basis: cleaner grid average at the window (how footprints are usually counted). */
  co2KgAverage: number
  /** Rule-based marginal estimate, not a measured causal emissions reduction. */
  co2KgMarginal: number | null
  /** Money saved vs running now (uses price); null when unpriced. */
  costGbp: number | null
}

/**
 * Estimated differences against the earliest complete window, at fixed power.
 * Average carbon uses a grid-average footprint; marginal carbon uses the supplied
 * rule-based estimate. Neither is a measured causal reduction or guaranteed saving.
 */
export function windowSavings(
  powerKw: number,
  window: ScheduleWindow,
  baseline: ScheduleWindow,
): WindowSavings {
  const energyKwh = powerKw * window.slots * SLOT_HOURS
  const co2KgAverage = (energyKwh * (baseline.avgIntensity - window.avgIntensity)) / 1000
  const co2KgMarginal =
    window.avgMarginal != null && baseline.avgMarginal != null
      ? (energyKwh * (baseline.avgMarginal - window.avgMarginal)) / 1000
      : null
  const costGbp =
    window.avgPrice != null && baseline.avgPrice != null
      ? (energyKwh * (baseline.avgPrice - window.avgPrice)) / 100 // pence → £
      : null
  return { co2KgAverage, co2KgMarginal, costGbp }
}
