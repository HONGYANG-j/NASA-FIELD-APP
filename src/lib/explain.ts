// Turns scores into plain-language reasons, evidence, benefits, information gaps and risks.
import type { Crop, RotationResult, SlotEvidence } from '../types'
import type { RotationMode, SlotTable, Strategy } from './rotation'
import { SLOT_MONTHS } from './rotation'
import type { SlotNdvi } from './satellite'
import { greenness, SPARSE_NDVI } from './satellite'
import { describeSoil, isSoilKnown, soilGaps, soilRisks, soilWhy } from './soil'

/** One sentence describing what the MODIS satellite sees in a season's months. */
export function satelliteLine(sat: SlotNdvi): string {
  const range = `${sat.min.toFixed(2)}–${sat.max.toFixed(2)}`
  const dips = sat.lowYears
    ? `; ${sat.lowYears} of ${sat.years} seasons ${sat.lowYears === 1 ? 'was' : 'were'} noticeably less green than usual`
    : ''
  return `MODIS sees average greenness (NDVI) ${sat.mean.toFixed(2)} (${greenness(sat.mean)}) at this location in these months, ranging ${range} over ${sat.years} seasons${dips}.`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function monthName(m: number): string {
  return MONTHS[(((m - 1) % 12) + 12) % 12]
}

/** Calendar month (1-12) at which season i begins. */
export function slotStartMonth(startMonth: number, i: number, mode: RotationMode): number {
  const offset = mode === 'seasons' ? i * SLOT_MONTHS : 0
  return ((startMonth - 1 + offset) % 12) + 1
}

/** e.g. "Jan–Apr" for the window that season i occupies. */
export function slotLabel(startMonth: number, i: number, mode: RotationMode): string {
  const s = slotStartMonth(startMonth, i, mode)
  return `${monthName(s)}–${monthName(s + SLOT_MONTHS - 1)}`
}

export function slotName(i: number, mode: RotationMode): string {
  return mode === 'seasons' ? `Season ${i + 1}` : `Year ${i + 1}`
}

export interface Explanation {
  why: string[]
  evidence: string[]
  benefits: string[]
  gaps: string[]
  risks: string[]
}

const pct = (x: number) => `${Math.round(x * 100)}%`

/** Which crop numbers in this rotation are NOT backed by a published source. */
export function sourceGap(crops: Crop[]): string {
  const parts: string[] = []
  const seen = new Set<string>()
  for (const c of crops) {
    if (c.group === 'fallow' || seen.has(c.id)) continue
    seen.add(c.id)
    const what: string[] = []
    if (c.check.temp === 'partial') what.push('upper temperature bound')
    if (c.check.temp === 'unverified') what.push('temperature range')
    // Crops with an FAO-56 Kc curve get their water need from local temperature, which is sourced.
    if (!c.kc && c.check.water === 'unverified') what.push('water need')
    if (what.length) parts.push(`${c.name} (${what.join(', ')})`)
  }
  const base =
    'Crop values are reference numbers, not local variety data. Temperature bands and seasonal water needs come from FAO tables where available; cold/heat-stress limits are general-knowledge values.'
  return parts.length
    ? `${base} Not yet checked against a published source: ${parts.join('; ')}. Confirm with a local agronomist or extension officer.`
    : `${base} Confirm with a local agronomist or extension officer.`
}

function cropEvidence(c: Crop, e: SlotEvidence, irrigated: boolean): string {
  if (c.group === 'fallow') return 'Bare fallow: no crop, soil left uncovered.'
  // Where the need comes from: FAO-56 crop coefficients x temperature-based evapotranspiration, or a fixed table value.
  const how = e.needMethod === 'climate' ? ' (FAO-56 crop coefficients x temperature-based evapotranspiration)' : ' (fixed reference value)'
  const water = irrigated
    ? `needs ~${Math.round(e.needMm)} mm${how}; irrigation assumed, ${Math.round(e.rainMm)} mm of rain falls on its days`
    : `${Math.round(e.rainMm)} mm of rain on its days vs ~${Math.round(e.needMm)} mm needed${how}, met in ${e.needMetYears} of ${e.years} years`
  const stress: string[] = []
  if (e.heatDays >= 1) stress.push(`~${Math.round(e.heatDays)} days hotter than ${c.heatLimit} °C`)
  if (e.coldDays >= 1) stress.push(`~${Math.round(e.coldDays)} days colder than ${c.coldLimit} °C`)
  return `${c.name}: average ${e.meanT.toFixed(1)} °C, ${water}${stress.length ? '; ' + stress.join(', ') : ''}. Works well (fit ≥ 60%) in ${pct(e.reliability)} of years.`
}

export function explain(
  s: Strategy,
  current: RotationResult,
  table: SlotTable,
  satellite: (SlotNdvi | null)[] | null = null,
  /** True when this location has a satellite layer, even if it is not attributed to seasons. */
  hasLayer = satellite !== null,
  /** True when the soil texture/organic matter came from ISRIC SoilGrids (non-NASA, beta). */
  soilFromGrids = false,
  /** One-line rainfall cross-check for the demo sites (data/rainfallCheck.ts), or null. */
  rainNote: string | null = null,
): Explanation {
  const r = s.result
  const why: string[] = []
  const benefits: string[] = []
  const risks: string[] = []

  // Why it was suggested: compare against the current rotation, dimension by dimension.
  if (s.id === 'current') {
    why.push('This is the rotation you entered. It is the baseline for every comparison below.')
  } else {
    const names: Record<keyof RotationResult['dims'], string> = {
      climate: 'climate fit',
      resilience: 'reliability across years',
      water: 'water demand relative to rainfall',
      soil: 'soil health',
      income: 'expected income',
    }
    const diffs = (Object.keys(names) as (keyof RotationResult['dims'])[])
      .map((k) => ({ k, d: r.dims[k] - current.dims[k] }))
      .sort((a, b) => Math.abs(b.d) - Math.abs(a.d))
    const better = diffs.filter((x) => x.d > 0.05).slice(0, 3)
    const worse = diffs.filter((x) => x.d < -0.05).slice(0, 2)
    if (better.length)
      why.push(`Scores better than your current rotation on ${better.map((x) => `${names[x.k]} (${x.d > 0 ? '+' : ''}${Math.round(x.d * 100)} pts)`).join(', ')}.`)
    if (worse.length)
      why.push(`Trade-off: scores lower on ${worse.map((x) => `${names[x.k]} (${Math.round(x.d * 100)} pts)`).join(', ')}.`)
    if (!better.length && !worse.length)
      why.push('Scores similar to your current rotation overall; the differences are small.')
  }

  why.push(...soilWhy(table.soil, r.crops, table.irrigated))

  // Evidence: the NASA POWER numbers behind each season.
  const soilLine = isSoilKnown(table.soil)
    ? [`Soil you entered: ${describeSoil(table.soil)}${soilFromGrids ? ' (partly from ISRIC SoilGrids, not NASA, beta)' : ''}. Soil rules are listed under "Your soil", each marked sourced or unverified.`]
    : []
  const evidence = soilLine.concat(r.crops.flatMap((c, i) => {
    const label = `${slotName(i, table.mode)} (${slotLabel(table.startMonth, i, table.mode)})`
    const lines = [`${label}: ${cropEvidence(c, r.slotEvidence[i], table.irrigated)}`]
    const sat = satellite?.[i]
    if (sat) lines.push(`${label} satellite check: ${satelliteLine(sat)}`)
    return lines
  }))

  // Benefits.
  if (r.crops.some((c) => c.nFix))
    benefits.push(`Nitrogen-fixing: ${r.crops.filter((c) => c.nFix).map((c) => c.name).join(', ')} can add nitrogen to the soil, which may reduce fertiliser needs.`)
  const cover = r.crops.filter((c) => c.group === 'cover' || c.group === 'forage')
  if (cover.length)
    benefits.push(`Ground cover and organic matter: ${cover.map((c) => c.name).join(', ')} protect soil from erosion and add organic matter.`)
  const deep = r.crops.filter((c) => c.rooting === 'deep')
  if (deep.length)
    benefits.push(`Deep roots (${deep.map((c) => c.name).join(', ')}) can open soil and improve infiltration.`)
  if (new Set(r.crops.map((c) => c.family)).size >= 3)
    benefits.push('Three different plant families: helps break pest and disease cycles.')
  if (r.dims.water >= 0.7)
    benefits.push('Light water demand compared with the rain that falls in these seasons.')
  if (table.soil.organicMatter === 'low') {
    const builders = r.crops.filter((c) => c.organicMatter >= 4)
    if (builders.length)
      benefits.push(`Your soil has low organic matter: ${builders.map((c) => c.name).join(', ')} return the most biomass (crop table rating 4–5 of 5, unsourced), which helps rebuild it.`)
  }
  if (!benefits.length) benefits.push('No standout benefit beyond growing a crop that suits the local climate.')

  // Risks that need local review.
  r.crops.forEach((c, i) => {
    const e = r.slotEvidence[i]
    const where = `${slotName(i, table.mode)} (${c.name})`
    const sat = satellite?.[i]
    if (c.group === 'fallow') {
      if (sat && sat.mean < SPARSE_NDVI)
        risks.push(`${where}: the satellite already sees sparse greenness here (NDVI ${sat.mean.toFixed(2)}), so bare ground is exposed to rain and wind; a cover crop would protect the soil.`)
      return
    }
    if (sat && sat.years >= 3 && sat.lowYears >= 1)
      risks.push(`${where}: the satellite saw clearly lower greenness in ${sat.lowYears} of ${sat.years} recent seasons (possible stress, pests or poor conditions; check locally).`)
    if (e.reliability < 0.7)
      risks.push(`${where}: climate was only suitable in ${pct(e.reliability)} of the last ${e.years} years.`)
    if (!table.irrigated && e.needMetYears < e.years * 0.7 && e.needMm > 0)
      risks.push(`${where}: rainfall met the crop's water need in just ${e.needMetYears} of ${e.years} years; irrigation or a drought-tolerant crop may be needed.`)
    if (c.cycleDays && c.cycleDays[0] > 125)
      risks.push(`${where}: typical growing period is ${c.cycleDays[0]}–${c.cycleDays[1]} days (FAO), longer than this ${SLOT_MONTHS}-month season; planting dates may overlap the next crop.`)
    if (e.heatDays >= 5) risks.push(`${where}: about ${Math.round(e.heatDays)} heat-stress days per season.`)
    if (e.coldDays >= 3) risks.push(`${where}: about ${Math.round(e.coldDays)} cold-stress days per season.`)
  })
  risks.push(
    ...soilRisks(
      table.soil,
      r.crops.map((c, i) => {
        const e = r.slotEvidence[i]
        return {
          crop: c,
          name: `${slotName(i, table.mode)} (${c.name})`,
          needMetYears: e.needMetYears,
          years: e.years,
          ratio: e.needMm > 0 ? e.rainMm / e.needMm : 0,
        }
      }),
      table.irrigated,
    ),
  )
  for (const n of r.notes) if (n.startsWith('−')) risks.push(n.slice(1).trim())
  if (!risks.length) risks.push('No major climate risk flagged by the data. Pests, disease, markets and labour are not modelled.')

  // Information gaps: always shown, because this tool must not overclaim.
  const gaps = [
    ...soilGaps(table.soil, soilFromGrids),
    sourceGap(r.crops),
    'Market prices, seed availability, labour and equipment are not modelled; "income" is only a rough relative value.',
    'NASA POWER is gridded model/satellite data (about 50 km cells): it will not capture your exact field. Temperature is corrected for height only if you enter your field elevation; rainfall is never corrected. Satellite vegetation, evapotranspiration and temperature layers (MODIS, Landsat) are bundled only for the demo sites and are shown as evidence, not used in the scores; SMAP soil moisture is not included.',
    'Water supply counts rain plus a share of root-zone moisture. It ignores water stored from earlier seasons, so dry-climate or rainfed scores can look pessimistic; tick "I can irrigate" if you have water access. Crop water need is estimated from temperature (FAO-56); against MODIS satellite potential evapotranspiration it ran about 10% lower in Iowa and about 25% lower in Kedah, so needs may be somewhat underestimated.',
    'Scores rank options; they do not predict yield. Final decisions belong to the farmer and local experts.',
  ]
  gaps.push(
    satellite
      ? 'Satellite greenness (MODIS NDVI) is one MODIS pixel (250 m product, about 232 m wide) at this point. It shows what is growing there, not necessarily your field or the crop being proposed, and it is not used to score rotations.'
      : hasLayer
        ? 'Satellite greenness for this location is shown in the "What the satellite sees" panel. In one-crop-per-year mode it cannot be attributed to a single rotation year, and it is not used to score rotations.'
        : 'No satellite vegetation layer for this location: it is bundled only for demo locations whose MODIS pixel is verified farmland, because the live MODIS service is too slow to call in the app.',
  )
  if (rainNote) gaps.push(rainNote)
  return { why, evidence, benefits, gaps, risks }
}
