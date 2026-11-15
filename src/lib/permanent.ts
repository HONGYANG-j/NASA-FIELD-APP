// "Long-lived crops" check: does this place's average temperature suit crops that stay in the ground for years?
//
// This is NOT part of the rotation scores. Tea, coffee, oil palm and banana are not rotated, so there is nothing to compare
// season to season; the question for them is whether the temperature stays suitable as the climate warms.
//
// SOURCE (checked 15 Nov 2026): FAO, "Agro-ecological land resources assessment for agricultural development planning:
// a case study of Kenya", Chapter 5 (Table 5.3 thermal zones, Table 5.7 thermal-zone suitability ratings) and Technical Annex 4
// (Table A4.1 thermal regimes, Table A4.2 ratings; temperatures are 24-hour means):
//   https://www.fao.org/4/t0741e/T0741E06.htm   https://www.fao.org/4/t0742e/T0742E11.htm
// Ratings: S1 best, then S2, S3, S4 (sub-optimal temperature), N not suitable. The same source already backs the temperature
// bands in data/crops.ts.
//
// LIMITS, stated in the app too:
//  - Temperature only. No rain, soil, frost, heat waves, pests or disease. A dry spell or heat wave can kill plants whose average
//    temperature is fine.
//  - The table comes from a Kenya case study (equator, little seasonality). For places with a strong seasonal swing the annual mean
//    hides winter cold, so the app marks the result as indicative only.
//  - Cocoa, rubber and olive have no row in this table, so they are not included. We did not invent values for them.
import { annualStats, monthlyClimatology } from './climate'
import type { DailySeries } from '../types'

export type Rating = 'S1' | 'S2' | 'S3' | 'S4' | 'N'

/** Lower edge (°C, inclusive) of each FAO thermal zone, warmest first. Zone 1 is "warmer than 25.0" (printed as "< 25.0" in Table 5.3, an apparent typo). */
export const ZONE_LOWER_C = [25, 22.5, 20, 17.5, 15, 12.5, 10, 5, -Infinity] as const

export const ZONE_LABEL = ['above 25', '22.5 to 25', '20 to 22.5', '17.5 to 20', '15 to 17.5', '12.5 to 15', '10 to 12.5', '5 to 10', 'below 5'] as const

/** FAO thermal zone (1 = warmest ... 9 = coldest) for a 24-hour mean temperature. A value on a boundary belongs to the warmer zone. */
export function thermalZone(meanC: number): number {
  for (let i = 0; i < ZONE_LOWER_C.length; i++) if (meanC >= ZONE_LOWER_C[i]) return i + 1
  return 9
}

export interface PermanentCrop {
  id: string
  name: string
  /** FAO ratings for thermal zones 1 to 9, in order (Table A4.2 columns T1..T9). */
  ratings: readonly [Rating, Rating, Rating, Rating, Rating, Rating, Rating, Rating, Rating]
  /** FAO table row it was read from. */
  row: string
}

export const PERMANENT_CROPS: readonly PermanentCrop[] = [
  { id: 'tea', name: 'Tea', ratings: ['N', 'N', 'S3', 'S1', 'S2', 'S4', 'N', 'N', 'N'], row: 'Table A4.2, code 561' },
  { id: 'coffee', name: 'Arabica coffee', ratings: ['N', 'N', 'S3', 'S1', 'S4', 'N', 'N', 'N', 'N'], row: 'Table A4.2, code 511' },
  { id: 'oilpalm', name: 'Oil palm', ratings: ['S1', 'S2', 'N', 'N', 'N', 'N', 'N', 'N', 'N'], row: 'Table A4.2, code 421' },
  { id: 'banana', name: 'Banana', ratings: ['S1', 'S1', 'S1', 'S3', 'N', 'N', 'N', 'N', 'N'], row: 'Table A4.2, code 411' },
]

/** Names of long-lived crops people ask about that this check deliberately leaves out, because the FAO table has no row for them. */
export const NOT_COVERED = ['cocoa', 'rubber', 'olive'] as const

export const RATING_WORD: Record<Rating, string> = {
  S1: 'Best',
  S2: 'Good',
  S3: 'Fair',
  S4: 'Poor',
  N: 'Not suitable',
}

const ORDER: Record<Rating, number> = { S1: 0, S2: 1, S3: 2, S4: 3, N: 4 }

export function ratingAt(crop: PermanentCrop, meanC: number): Rating {
  return crop.ratings[thermalZone(meanC) - 1]
}

/** Warming steps to show: whole degrees 0 to 4, plus the user's own what-if if it falls between them. */
export function warmingSteps(userDTemp: number): number[] {
  const set = new Set([0, 1, 2, 3, 4])
  if (userDTemp > 0 && userDTemp <= 4) set.add(userDTemp)
  return [...set].sort((a, b) => a - b)
}

export interface PermanentRow {
  crop: PermanentCrop
  /** One rating per warming step, same order as `steps`. */
  ratings: Rating[]
  /** Plain sentence about how this crop's rating moves as the place warms. */
  sentence: string
}

export interface PermanentResult {
  meanC: number
  zone: number
  /** Warmest month's mean minus coldest month's mean (°C). */
  seasonRangeC: number
  /** True when the swing between seasons is large enough that an annual mean hides winter cold. */
  seasonal: boolean
  steps: number[]
  rows: PermanentRow[]
}

/** Seasonal swing above which the Kenya-based table is flagged as indicative only. */
export const SEASONAL_RANGE_C = 6

function sentence(name: string, steps: number[], ratings: Rating[]): string {
  const now = ratings[0]
  let worse = -1
  let better = -1
  for (let i = 1; i < ratings.length; i++) {
    if (worse < 0 && ORDER[ratings[i]] > ORDER[now]) worse = i
    if (better < 0 && ORDER[ratings[i]] < ORDER[now]) better = i
  }
  const word = (r: Rating) => RATING_WORD[r].toLowerCase()
  if (now === 'N') {
    return better >= 0
      ? `${name}: not suitable at today's temperature; becomes ${word(ratings[better])} at +${steps[better]} °C.`
      : `${name}: not suitable at today's temperature, and warming does not change that.`
  }
  if (worse >= 0)
    return `${name}: ${word(now)} today; drops to ${word(ratings[worse])} at +${steps[worse]} °C.`
  if (better >= 0) return `${name}: ${word(now)} today; improves to ${word(ratings[better])} at +${steps[better]} °C.`
  return `${name}: ${word(now)} today, and the rating stays the same up to +${steps[steps.length - 1]} °C.`
}

/** Runs the check on a daily series (already corrected for elevation, and WITHOUT the what-if scenario applied). */
export function permanentCheck(series: DailySeries, userDTemp = 0): PermanentResult | null {
  const years = annualStats(series)
  if (years.length === 0) return null
  const meanC = years.reduce((a, y) => a + y.tmean, 0) / years.length
  if (!Number.isFinite(meanC)) return null
  const months = monthlyClimatology(series).map((m) => m.tmean).filter((x) => Number.isFinite(x))
  const seasonRangeC = months.length ? Math.max(...months) - Math.min(...months) : 0
  const steps = warmingSteps(userDTemp)
  const rows = PERMANENT_CROPS.map((crop) => {
    const ratings = steps.map((d) => ratingAt(crop, meanC + d))
    return { crop, ratings, sentence: sentence(crop.name, steps, ratings) }
  })
  return { meanC, zone: thermalZone(meanC), seasonRangeC, seasonal: seasonRangeC > SEASONAL_RANGE_C, steps, rows }
}
