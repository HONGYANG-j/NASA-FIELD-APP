// Rotation scoring engine.
//
// A rotation is a sequence of crops, one per season ("slot"). By default there are
// three 4-month slots covering the year. Every score is traceable to NASA POWER
// daily data for the chosen location (see lib/power.ts) plus the crop table.
//
// This is a decision-SUPPORT heuristic, not an agronomic model: it ranks options
// and shows its evidence. It does not predict yields.
import type {
  Crop,
  DailySeries,
  RotationResult,
  Scenario,
  SlotEvidence,
  SlotYear,
  Weights,
} from '../types'
import { CROPS } from '../data/crops'
import { applyScenario, mean, slotYears } from './climate'
import { erosionFactor, omWeight, storedMoistureFactor, UNKNOWN_SOIL, waterlogParams } from './soil'
import type { SoilProfile } from './soil'
import { cropWater } from './water'

export const SLOT_MONTHS = 4
export const SLOTS = 3
/** A crop-year counts as "reliable" when its climate-fit score is at least this. */
export const RELIABLE_FIT = 0.6

const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x))

/** 1 inside [lo, hi], falling linearly to 0 at `span` degrees outside. */
function rangeFit(t: number, lo: number, hi: number, span = 8): number {
  if (Number.isNaN(t)) return 0
  if (t >= lo && t <= hi) return 1
  const d = t < lo ? lo - t : t - hi
  return clamp(1 - d / span)
}

export interface YearFit {
  fit: number
  tempFit: number
  waterFit: number
  heatDays: number
  coldDays: number
  needMet: boolean
}

/** Climate-fit of one crop in one season-year, 0-1. `irrigated` assumes water need is met. */
export function fitInSlotYear(
  crop: Crop,
  sy: SlotYear,
  irrigated = false,
  soil: SoilProfile = UNKNOWN_SOIL,
): YearFit {
  if (crop.group === 'fallow') {
    return { fit: 1, tempFit: 1, waterFit: 1, heatDays: 0, coldDays: 0, needMet: true }
  }
  // Temperature: share of days near the optimum, minus cold/heat stress days.
  const tempFit = mean(sy.tmean.map((t) => rangeFit(t, crop.tOptMin, crop.tOptMax)))
  const coldDays = sy.tmin.filter((t) => t < crop.coldLimit).length
  const heatDays = sy.tmax.filter((t) => t > crop.heatLimit).length
  const coldPen = Math.min(0.6, (coldDays / sy.days) * 3)
  const heatPen = Math.min(0.5, (heatDays / sy.days) * 2)
  const thermal = clamp(tempFit * (1 - coldPen) * (1 - heatPen))

  // Water: rainfall plus a share of stored root-zone moisture vs the crop's need. The need comes
  // from local temperature (FAO-56 Kc x Hargreaves ET0, see lib/water.ts) where the crop has a Kc
  // curve, otherwise from the fixed reference value. Only rain on the crop's own days counts.
  let waterFit = 1
  let needMet = true
  const wat = cropWater(crop, sy)
  if (wat.needMm > 0 && !irrigated) {
    // Soil rules 1+2 (data/soils.ts): texture and drainage scale the stored-moisture allowance.
    const stored =
      wat.needMm * 0.25 * clamp((sy.rootWet - 0.4) / 0.4) * storedMoistureFactor(soil)
    const ratio = (wat.rainMm + stored) / wat.needMm
    needMet = ratio >= 1
    // Soil rule 3: drainage and texture move where waterlogging starts and how steep it is.
    const wl = waterlogParams(soil)
    if (ratio < 1) {
      waterFit = clamp(1 - (1 - ratio) * (1.2 - 0.2 * crop.droughtTol))
    } else if (ratio > wl.start && crop.waterlogTol < 3) {
      waterFit = clamp(1 - (ratio - wl.start) * 0.15 * (3 - crop.waterlogTol) * wl.slope, 0.3, 1)
    }
  }
  return {
    fit: clamp(thermal * waterFit),
    tempFit: thermal,
    waterFit,
    heatDays,
    coldDays,
    needMet,
  }
}

/** Summarise a crop across all years of one slot. */
export function evidenceForSlot(
  crop: Crop,
  years: SlotYear[],
  irrigated = false,
  soil: SoilProfile = UNKNOWN_SOIL,
): SlotEvidence {
  const fits = years.map((y) => fitInSlotYear(crop, y, irrigated, soil))
  const waters = years.map((y) => cropWater(crop, y))
  const n = fits.length || 1
  return {
    fit: mean(fits.map((f) => f.fit)),
    reliability: fits.filter((f) => f.fit >= RELIABLE_FIT).length / n,
    worst: fits.length ? Math.min(...fits.map((f) => f.fit)) : 0,
    years: fits.length,
    meanT: mean(years.map((y) => mean(y.tmean))),
    rainMm: mean(waters.map((w) => w.rainMm)),
    needMm: mean(waters.map((w) => w.needMm)),
    needMethod: waters[0]?.method ?? 'table',
    needMetYears: fits.filter((f) => f.needMet).length,
    heatDays: mean(fits.map((f) => f.heatDays)),
    coldDays: mean(fits.map((f) => f.coldDays)),
    tempFit: mean(fits.map((f) => f.tempFit)),
    waterFit: mean(fits.map((f) => f.waterFit)),
  }
}

/**
 * 'seasons': three back-to-back 4-month seasons within one year (typical of the tropics).
 * 'years':   one main growing season per year, rotated over a 3-year cycle (typical of
 *            temperate farms). All three slots then see the same 4-month window.
 */
export type RotationMode = 'seasons' | 'years'

export interface SlotTable {
  startMonth: number
  mode: RotationMode
  irrigated: boolean
  /** Soil the farmer entered ('unknown' parts have no effect). */
  soil: SoilProfile
  /** Per slot: climate of that window for each year. */
  slots: SlotYear[][]
  /** Per slot, per crop id: evidence. */
  evidence: Record<string, SlotEvidence>[]
}

export interface TableOptions {
  mode: RotationMode
  irrigated: boolean
  soil?: SoilProfile
}

/** Precompute every crop's evidence for every slot. Cheap enough to rerun on slider moves. */
export function buildSlotTable(
  series: DailySeries,
  scenario: Scenario,
  startMonth: number,
  opts: TableOptions = { mode: 'seasons', irrigated: false },
): SlotTable {
  const s = applyScenario(series, scenario)
  const soil = opts.soil ?? UNKNOWN_SOIL
  const slots: SlotYear[][] = []
  const evidence: Record<string, SlotEvidence>[] = []
  for (let i = 0; i < SLOTS; i++) {
    const offset = opts.mode === 'seasons' ? i * SLOT_MONTHS : 0
    const m = ((startMonth - 1 + offset) % 12) + 1
    const years = slotYears(s, m, SLOT_MONTHS)
    slots.push(years)
    const ev: Record<string, SlotEvidence> = {}
    for (const c of CROPS) ev[c.id] = evidenceForSlot(c, years, opts.irrigated, soil)
    evidence.push(ev)
  }
  return { startMonth, mode: opts.mode, irrigated: opts.irrigated, soil, slots, evidence }
}

/** Start month (1-12) that gives the farmer's current rotation its best climate fit. */
export function bestStartMonth(
  series: DailySeries,
  scenario: Scenario,
  current: Crop[],
  opts: TableOptions,
): number {
  let best = 1
  let bestFit = -1
  for (let m = 1; m <= 12; m++) {
    const t = buildSlotTable(series, scenario, m, opts)
    const fit = mean(current.map((c, i) => t.evidence[i][c.id].fit))
    if (fit > bestFit + 1e-9) {
      bestFit = fit
      best = m
    }
  }
  return best
}

const norm5 = (x: number) => (x - 1) / 4

/** Score one concrete rotation (a crop per slot). */
export function scoreRotation(
  crops: Crop[],
  table: SlotTable,
  weights: Weights,
): RotationResult {
  const ev = crops.map((c, i) => table.evidence[i][c.id])
  const notes: string[] = []

  // Climate fit and resilience (how many years work, and the worst year).
  const climate = mean(ev.map((e) => e.fit))
  const resilience = mean(ev.map((e) => 0.7 * e.reliability + 0.3 * e.worst))

  // Water: total crop need compared with rainfall in the same seasons.
  const need = ev.reduce((a, e) => a + e.needMm, 0)
  const rain = ev.reduce((a, e) => a + e.rainMm, 0)
  const ratio = rain > 0 ? need / rain : 2
  const water = clamp(1 - (ratio - 0.4) / 1.0)

  // Soil health: cover, organic matter, nitrogen fixing, and rotation rules.
  const cover = mean(crops.map((c) => norm5(c.erosionCover)))
  const om = mean(crops.map((c) => norm5(c.organicMatter)))
  // Soil rules 4+5 (data/soils.ts): erosion exposure scales cover and bare fallow; the soil's own
  // organic matter changes how much the crops' contribution counts. Unknown soil = 0.3 / 0.3 / 1.
  const erosion = erosionFactor(table.soil)
  // Small base so no real farming system scores an absolute zero; penalties still bite.
  let soil = 0.15 + 0.3 * erosion * cover + omWeight(table.soil) * om
  if (crops.some((c) => c.nFix)) {
    soil += 0.2
    notes.push('+ Includes a nitrogen-fixing crop')
  }
  const real = crops.filter((c) => c.group !== 'fallow')
  const families = new Set(real.map((c) => c.family)).size
  soil += 0.1 * clamp((families - 1) / 2)
  for (let i = 0; i < crops.length; i++) {
    const a = crops[i]
    const b = crops[(i + 1) % crops.length]
    if (a.family === b.family && a.family !== 'None' && a.family !== 'Mixed') {
      soil -= 0.12
      notes.push(`− ${a.name} then ${b.name}: same plant family keeps pest and disease cycles going`)
    }
    if (a.group === 'cereal' && b.nFix) {
      soil += 0.05
      notes.push(`+ ${b.name} follows ${a.name}: legume after cereal helps restore nitrogen`)
    }
    if (a.rooting !== b.rooting && a.group !== 'fallow' && b.group !== 'fallow') {
      soil += 0.03
    }
  }
  const bare = crops.filter((c) => c.group === 'fallow').length
  if (bare > 0) {
    soil -= 0.1 * erosion * bare
    notes.push(`− ${bare} bare-fallow season${bare > 1 ? 's' : ''}: soil is exposed to rain and wind`)
  }
  soil = clamp(soil)

  // Income: relative market value, weighted by how likely the crop is to succeed.
  const income = mean(crops.map((c, i) => (c.marketValue / 5) * ev[i].fit))

  const w = weights
  const wSum = w.water + w.soil + w.income + w.resilience + 1 // +1 = climate fit always counts
  const overall =
    (100 *
      (climate + w.water * water + w.soil * soil + w.income * income + w.resilience * resilience)) /
    wSum

  return {
    crops,
    slotEvidence: ev,
    dims: { climate, resilience, water, soil, income },
    overall,
    notes,
  }
}

/** Every distinct-enough rotation, scored. 16^3 = 4096 combinations: instant. */
export function scoreAll(
  table: SlotTable,
  weights: Weights,
  allowed?: ReadonlySet<string>,
): RotationResult[] {
  const out: RotationResult[] = []
  const pool = allowed ? CROPS.filter((c) => allowed.has(c.id)) : CROPS
  for (const a of pool)
    for (const b of pool)
      for (const c of pool) {
        const seq = [a, b, c]
        // A realistic rotation earns income: at least two cash crops (so at most one
        // cover-crop or fallow season), and never the same crop three times.
        if (a.id === b.id && b.id === c.id) continue
        const cash = seq.filter((x) => x.group !== 'cover' && x.group !== 'fallow')
        if (cash.length < 2) continue
        out.push(scoreRotation(seq, table, weights))
      }
  return out
}

export interface Strategy {
  id: 'current' | 'balanced' | 'water' | 'soil'
  title: string
  tagline: string
  result: RotationResult
}

/** Same crops in a different order count as the same strategy, so alternatives stay varied. */
const key = (r: RotationResult) =>
  r.crops
    .map((c) => c.id)
    .sort()
    .join('+')

/**
 * Build the strategies shown to the farmer: the current rotation plus three
 * alternatives, each the best option under a different emphasis.
 */
export function buildStrategies(
  current: Crop[],
  table: SlotTable,
  weights: Weights,
  allowed?: ReadonlySet<string>,
): Strategy[] {
  const currentResult = scoreRotation(current, table, weights)
  const taken = new Set<string>([key(currentResult)])
  const pick = (w: Weights, minClimate = 0.45): RotationResult | null => {
    const scored = scoreAll(table, w, allowed).filter((r) => !taken.has(key(r)))
    const ok = scored.filter((r) => r.dims.climate >= minClimate)
    // If nothing meets the climate bar (very harsh site), fall back to the best available.
    const best = (ok.length ? ok : scored).sort((a, b) => b.overall - a.overall)[0]
    if (!best) return null // too few crops selected to form another rotation
    taken.add(key(best))
    // Re-score under the farmer's own weights so cards are comparable.
    return scoreRotation(best.crops, table, weights)
  }
  const balanced = pick(weights)
  const water = pick({ ...weights, water: 5 })
  const soil = pick({ ...weights, soil: 5 })
  const out: Strategy[] = [
    {
      id: 'current',
      title: 'Your current rotation',
      tagline: 'The baseline everything else is compared to.',
      result: currentResult,
    },
  ]
  if (balanced)
    out.push({
      id: 'balanced',
      title: 'Best match for your priorities',
      tagline: 'Top-scoring rotation given the priorities you set.',
      result: balanced,
    })
  if (water)
    out.push({
      id: 'water',
      title: 'Water-wise option',
      tagline: 'Leans toward lighter water demand relative to rainfall.',
      result: water,
    })
  if (soil)
    out.push({
      id: 'soil',
      title: 'Soil-building option',
      tagline: 'Leans toward cover, organic matter and nitrogen.',
      result: soil,
    })
  return out
}
