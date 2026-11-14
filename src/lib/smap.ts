import type { MonthNdvi } from './satellite'

/** One day of the bundled SMAP file: [date, usable 9 km cells (morning and evening pooled), their mean cm3/cm3 or null, cells above the valid range]. */
export type SmapDay = [string, number, number | null, number]

export interface SmapFile {
  id: string
  source: string
  collection: string
  box: [number, number, number, number]
  year: number
  fetched: string
  units: string
  validRange: [number, number]
  rule: string
  cellsPerPass: number
  days: SmapDay[]
}

const smapFiles = import.meta.glob<SmapFile>('../data/smap/*.json', { import: 'default' })

/** Bundled SMAP soil moisture for a preset id (one year only), or null when none was ordered. */
export async function loadBundledSmap(id: string): Promise<SmapFile | null> {
  const load = smapFiles[`../data/smap/${id}.json`]
  return load ? await load() : null
}

/** A month needs at least this many days with a usable value, or it is left blank. */
export const MIN_SMAP_DAYS = 3

/** Mean of the daily box means for each calendar month; min and max are the lowest and highest daily mean. n = days used. */
export function monthlySmap(f: SmapFile, minDays = MIN_SMAP_DAYS): MonthNdvi[] {
  return Array.from({ length: 12 }, (_, i) => {
    const vs = f.days
      .filter((d) => Number(d[0].slice(5, 7)) === i + 1 && d[2] !== null)
      .map((d) => d[2] as number)
    const enough = vs.length >= minDays && vs.length > 0
    return {
      month: i + 1,
      mean: enough ? vs.reduce((a, b) => a + b, 0) / vs.length : NaN,
      min: enough ? Math.min(...vs) : NaN,
      max: enough ? Math.max(...vs) : NaN,
      n: vs.length,
    }
  })
}

export interface SmapTotals {
  days: number
  usableDays: number
  /** Cells above the valid range, excluded from every mean, summed over all days and both passes. */
  cellsOverRange: number
  /** Months (1-12) where more than a fifth of the cells that returned a value were above the valid range. */
  wetMonths: number[]
}

export function smapTotals(f: SmapFile): SmapTotals {
  const wetMonths: number[] = []
  for (let m = 1; m <= 12; m++) {
    const rows = f.days.filter((d) => Number(d[0].slice(5, 7)) === m)
    const usable = rows.reduce((a, d) => a + d[1], 0)
    const over = rows.reduce((a, d) => a + d[3], 0)
    if (usable + over > 0 && over / (usable + over) > 0.2) wetMonths.push(m)
  }
  return {
    days: f.days.length,
    usableDays: f.days.filter((d) => d[2] !== null).length,
    cellsOverRange: f.days.reduce((a, d) => a + d[3], 0),
    wetMonths,
  }
}
