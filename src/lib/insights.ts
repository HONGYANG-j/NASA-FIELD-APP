// Read-only views of the scores the engine has already produced: a plain-language reason, a year-by-year table, a comparison
// and a CSV export. Nothing here changes a score.
import type { Crop } from '../types'
import { fitInSlotYear } from './rotation'
import type { SlotTable, Strategy } from './rotation'

type DimKey = keyof Strategy['result']['dims']

export const DIM_LABEL: Record<DimKey, string> = {
  climate: 'climate fit',
  resilience: 'reliability',
  water: 'water use',
  soil: 'soil health',
  income: 'income (rough)',
}
const DIM_ORDER: DimKey[] = ['climate', 'resilience', 'water', 'soil', 'income']

const pts = (x: number) => Math.round(x * 100)

/** Gains and losses of one rotation against another, in rounded points, largest first. Differences under 3 points are left out. */
export function dimChanges(a: Strategy, b: Strategy): { gains: { key: DimKey; pts: number }[]; losses: { key: DimKey; pts: number }[] } {
  const d = DIM_ORDER.map((key) => ({ key, pts: pts(a.result.dims[key]) - pts(b.result.dims[key]) }))
  return {
    gains: d.filter((x) => x.pts >= 3).sort((x, y) => y.pts - x.pts),
    losses: d.filter((x) => x.pts <= -3).sort((x, y) => x.pts - y.pts),
  }
}

const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)

/** One or two plain sentences on why `best` scores above `current`. Built only from the engine's own sub-scores. */
export function whyFirst(best: Strategy, current: Strategy): string[] {
  const lead = Math.round(best.result.overall) - Math.round(current.result.overall)
  const { gains, losses } = dimChanges(best, current)
  const out: string[] = []
  if (lead <= 0) {
    out.push('No alternative scores higher than your current rotation for the priorities you set.')
    return out
  }
  if (gains.length) {
    out.push(`It comes first mainly because of ${list(gains.slice(0, 2).map((g) => `${DIM_LABEL[g.key]} (+${g.pts})`))}.`)
  } else {
    out.push('It comes first by a small margin spread across the sub-scores.')
  }
  const fallow = current.result.crops.some((c) => c.group === 'fallow')
  const covers = best.result.crops.filter((c) => c.group === 'cover' || c.group === 'forage' || c.group === 'legume').map((c) => c.name)
  if (fallow && gains.some((g) => g.key === 'soil') && covers.length) {
    out.push(`Your current rotation leaves the soil bare for a season; this one keeps it covered and adds ${list(Array.from(new Set(covers)))}.`)
  }
  if (losses.length) out.push(`The trade-off: it scores lower on ${list(losses.slice(0, 2).map((l) => `${DIM_LABEL[l.key]} (${l.pts})`))}.`)
  return out
}

export interface YearRow {
  slot: number
  crop: Crop
  /** Climate fit 0-1 for each year in `years`, or null when that year has no data for this slot. */
  fits: (number | null)[]
}

/** For each crop of a rotation, its climate fit in every past year (the same per-year fit the scores are averaged from). */
export function yearMatrix(crops: Crop[], table: SlotTable): { years: number[]; rows: YearRow[] } {
  const years = Array.from(new Set(table.slots.flatMap((s) => s.map((y) => y.seasonYear)))).sort((a, b) => a - b)
  const rows = crops.map((crop, slot) => {
    const byYear = new Map(table.slots[slot].map((sy) => [sy.seasonYear, fitInSlotYear(crop, sy, table.irrigated, table.soil).fit]))
    return { slot, crop, fits: years.map((y) => byYear.get(y) ?? null) }
  })
  return { years, rows }
}

/** A CSV cell: quoted, and never starting with a character a spreadsheet would run as a formula. */
export function csvCell(v: string | number): string {
  let s = String(v)
  if (/^[=+\-@\t\r]/.test(s) && typeof v !== 'number') s = `'${s}`
  return `"${s.replace(/"/g, '""')}"`
}

export interface CsvContext {
  appName: string
  place: string
  lat: number
  lon: number
  mode: string
  irrigated: boolean
  startMonth: number
  whatIf: { dTemp: number; rainPct: number }
  url: string
  date: string
}

/** The results as a spreadsheet: a short header describing the setup, then one row per rotation and season. */
export function resultsCsv(strategies: Strategy[], ctx: CsvContext): string {
  const rows: (string | number)[][] = []
  rows.push([`${ctx.appName}: rotation comparison`])
  rows.push(['Place', ctx.place, 'Latitude', ctx.lat, 'Longitude', ctx.lon])
  rows.push(['Rotation style', ctx.mode, 'Irrigation', ctx.irrigated ? 'available' : 'rainfed', 'First month', ctx.startMonth])
  rows.push(['What-if climate', `${ctx.whatIf.dTemp > 0 ? '+' : ''}${ctx.whatIf.dTemp} C`, `${ctx.whatIf.rainPct > 0 ? '+' : ''}${ctx.whatIf.rainPct}% rainfall`])
  rows.push(['Exported', ctx.date, 'From', ctx.url])
  rows.push(['Note', 'Scores rank options for these inputs and 20 years of NASA POWER weather. They are not yield, loss or price forecasts.'])
  rows.push([])
  rows.push(['Rank', 'Rotation', 'Overall score (0-100)', 'Climate fit', 'Reliability', 'Light on water', 'Soil health', 'Income (rough)', 'Season or year', 'Crop', 'Climate fit %', 'Share of years suitable %', 'Worst year fit %', 'Mean temperature C', 'Rain on its days mm', 'Water need mm'])
  const ranked = [...strategies].sort((a, b) => b.result.overall - a.result.overall)
  ranked.forEach((s, i) => {
    s.result.crops.forEach((c, slot) => {
      const e = s.result.slotEvidence[slot]
      rows.push([
        i + 1, s.title, Math.round(s.result.overall),
        pts(s.result.dims.climate), pts(s.result.dims.resilience), pts(s.result.dims.water), pts(s.result.dims.soil), pts(s.result.dims.income),
        slot + 1, c.name, pts(e.fit), pts(e.reliability), pts(e.worst), Math.round(e.meanT * 10) / 10, Math.round(e.rainMm), Math.round(e.needMm),
      ])
    })
  })
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n'
}
