// Climate statistics derived from a daily series.
import type { DailySeries, Scenario, SlotYear } from '../types'
import { hargreavesEt0, monthlyRa } from './water'

export const NO_SCENARIO: Scenario = { dTemp: 0, rainPct: 0 }

/** Mean ignoring NaN. Returns NaN for an empty input. */
export function mean(xs: number[]): number {
  let s = 0
  let n = 0
  for (const x of xs) {
    if (!Number.isNaN(x)) {
      s += x
      n++
    }
  }
  return n ? s / n : NaN
}

export function sum(xs: number[]): number {
  let s = 0
  for (const x of xs) if (!Number.isNaN(x)) s += x
  return s
}

/** Apply a what-if scenario: warmer/cooler and wetter/drier. */
export function applyScenario(s: DailySeries, sc: Scenario): DailySeries {
  if (sc.dTemp === 0 && sc.rainPct === 0) return s
  const f = 1 + sc.rainPct / 100
  return {
    ...s,
    tmean: s.tmean.map((x) => x + sc.dTemp),
    tmax: s.tmax.map((x) => x + sc.dTemp),
    tmin: s.tmin.map((x) => x + sc.dTemp),
    precip: s.precip.map((x) => x * f),
  }
}

/** Standard environmental lapse rate: air cools about 6.5 °C per 1000 m of height. */
export const LAPSE_C_PER_M = 0.0065

/** Temperature offset (°C) for moving from the model grid cell's elevation to the field's. */
export function elevationOffset(gridElevM: number | null, fieldElevM: number | null): number {
  if (gridElevM === null || fieldElevM === null) return 0
  return -LAPSE_C_PER_M * (fieldElevM - gridElevM)
}

/** Correct temperatures for the field being higher/lower than the model grid cell. Rain is unchanged. */
export function applyElevation(
  s: DailySeries,
  gridElevM: number | null,
  fieldElevM: number | null,
): DailySeries {
  const d = elevationOffset(gridElevM, fieldElevM)
  if (d === 0) return s
  return {
    ...s,
    tmean: s.tmean.map((x) => x + d),
    tmax: s.tmax.map((x) => x + d),
    tmin: s.tmin.map((x) => x + d),
  }
}

export interface MonthClimate {
  month: number
  tmean: number
  tmax: number
  tmin: number
  rainMm: number // mean monthly total
  etMm: number // mean monthly total
  rootWet: number
}

/** Average year: one entry per calendar month. */
export function monthlyClimatology(s: DailySeries): MonthClimate[] {
  const out: MonthClimate[] = []
  for (let m = 1; m <= 12; m++) {
    const idx: number[] = []
    for (let i = 0; i < s.month.length; i++) if (s.month[i] === m) idx.push(i)
    const pick = (a: number[]) => idx.map((i) => a[i])
    const years = new Set(idx.map((i) => s.year[i])).size || 1
    out.push({
      month: m,
      tmean: mean(pick(s.tmean)),
      tmax: mean(pick(s.tmax)),
      tmin: mean(pick(s.tmin)),
      rainMm: sum(pick(s.precip)) / years,
      etMm: sum(pick(s.etMm)) / years,
      rootWet: mean(pick(s.rootWet)),
    })
  }
  return out
}

export interface AnnualStat {
  year: number
  tmean: number
  rainMm: number
}

/** Yearly means/totals, only for years with (almost) complete data. */
export function annualStats(s: DailySeries): AnnualStat[] {
  const years = [...new Set(s.year)].sort((a, b) => a - b)
  const out: AnnualStat[] = []
  for (const y of years) {
    const idx: number[] = []
    for (let i = 0; i < s.year.length; i++) if (s.year[i] === y) idx.push(i)
    if (idx.length < 360) continue
    out.push({
      year: y,
      tmean: mean(idx.map((i) => s.tmean[i])),
      rainMm: sum(idx.map((i) => s.precip[i])),
    })
  }
  return out
}

export interface Trend {
  slope: number // units per year
  se: number
  t: number
  /** |t| > ~2.1 (95% for ~18 degrees of freedom): unlikely to be pure noise. */
  significant: boolean
  n: number
}

/** Ordinary least squares slope with standard error. */
export function linearTrend(xs: number[], ys: number[]): Trend {
  const n = xs.length
  if (n < 4) return { slope: NaN, se: NaN, t: NaN, significant: false, n }
  const mx = mean(xs)
  const my = mean(ys)
  let sxx = 0
  let sxy = 0
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - mx) ** 2
    sxy += (xs[i] - mx) * (ys[i] - my)
  }
  const slope = sxy / sxx
  const intercept = my - slope * mx
  let sse = 0
  for (let i = 0; i < n; i++) sse += (ys[i] - (intercept + slope * xs[i])) ** 2
  const se = Math.sqrt(sse / (n - 2) / sxx)
  const t = se > 0 ? slope / se : 0
  // Critical t for 95% two-sided, approximated for df = n-2.
  const df = n - 2
  const crit = df >= 30 ? 2.04 : df >= 18 ? 2.1 : df >= 10 ? 2.23 : 2.78
  return { slope, se, t, significant: Math.abs(t) > crit, n }
}

/**
 * The climate of a window of `lengthMonths` months beginning at `startMonth`, per year.
 * Windows that wrap past December belong to the year they started in.
 * Years with too little data in the window are dropped.
 */
export function slotYears(
  s: DailySeries,
  startMonth: number,
  lengthMonths: number,
): SlotYear[] {
  const groups = new Map<number, number[]>()
  for (let i = 0; i < s.month.length; i++) {
    const offset = (s.month[i] - startMonth + 12) % 12
    if (offset >= lengthMonths) continue
    const seasonYear = s.month[i] < startMonth ? s.year[i] - 1 : s.year[i]
    let g = groups.get(seasonYear)
    if (!g) groups.set(seasonYear, (g = []))
    g.push(i)
  }
  const expected = lengthMonths * 30.4
  // Reference evapotranspiration needs the latitude (for Ra); without it crops fall back to table needs.
  const ra = s.latitude !== undefined && Number.isFinite(s.latitude) ? monthlyRa(s.latitude) : null
  const out: SlotYear[] = []
  for (const [seasonYear, idx] of [...groups.entries()].sort(
    (a, b) => a[0] - b[0],
  )) {
    if (idx.length < expected * 0.9) continue
    out.push({
      seasonYear,
      days: idx.length,
      tmean: idx.map((i) => s.tmean[i]),
      tmax: idx.map((i) => s.tmax[i]),
      tmin: idx.map((i) => s.tmin[i]),
      precipMm: sum(idx.map((i) => s.precip[i])),
      etMm: sum(idx.map((i) => s.etMm[i])),
      rootWet: mean(idx.map((i) => s.rootWet[i])),
      precip: idx.map((i) => s.precip[i]),
      et0: ra
        ? idx.map((i) => hargreavesEt0(s.tmean[i], s.tmax[i], s.tmin[i], ra[s.month[i] - 1]))
        : undefined,
    })
  }
  return out
}
