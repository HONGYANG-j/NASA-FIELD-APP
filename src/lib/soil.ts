// Soil rules applied to the rotation engine. Every number lives in data/soils.ts with its source and
// evidence status; this file only combines them. 'unknown' soil returns exactly the baseline behaviour.
import {
  AWC_MID,
  DRAINAGE_LABEL,
  DRAINAGE_STORE,
  EROSION_FACTOR,
  OM_LABEL,
  OM_WEIGHT,
  TEXTURE_LABEL,
  WATERLOG_DRAINAGE_SLOPE,
  WATERLOG_START,
  WATERLOG_TEXTURE_SLOPE,
} from '../data/soils'
import type { SoilProfile } from '../data/soils'
import type { Crop } from '../types'

export type { SoilProfile } from '../data/soils'
export { UNKNOWN_SOIL } from '../data/soils'

export function isSoilKnown(s: SoilProfile): boolean {
  return s.texture !== 'unknown' || s.drainage !== 'unknown' || s.organicMatter !== 'unknown'
}

/**
 * Rules 1 + 2. Multiplier on the engine's stored-moisture allowance (rain-fed only).
 * Texture: available-water capacity relative to loam (FAO-56 Table 19 midpoints). Drainage: our judgement.
 */
export function storedMoistureFactor(s: SoilProfile): number {
  const tex = s.texture === 'unknown' ? 1 : AWC_MID[s.texture] / AWC_MID.loam
  return tex * DRAINAGE_STORE[s.drainage]
}

/** Rule 3. Where the waterlogging penalty starts (rain / need) and how steep it is, relative to baseline 1. */
export function waterlogParams(s: SoilProfile): { start: number; slope: number } {
  return {
    start: WATERLOG_START[s.drainage],
    slope: WATERLOG_DRAINAGE_SLOPE[s.drainage] * WATERLOG_TEXTURE_SLOPE[s.texture],
  }
}

/** Rule 4. Multiplier on the ground-cover weight and the bare-fallow penalty in the soil-health score. */
export function erosionFactor(s: SoilProfile): number {
  return EROSION_FACTOR[s.texture]
}

/** Rule 5. Weight of the crops' organic-matter contribution in the soil-health score. */
export function omWeight(s: SoilProfile): number {
  return OM_WEIGHT[s.organicMatter]
}

/** "sandy, poorly drained, low organic matter"; unknown parts are left out. */
export function describeSoil(s: SoilProfile): string {
  const parts: string[] = []
  if (s.texture !== 'unknown') parts.push(TEXTURE_LABEL[s.texture])
  if (s.drainage !== 'unknown') parts.push(DRAINAGE_LABEL[s.drainage])
  if (s.organicMatter !== 'unknown') parts.push(OM_LABEL[s.organicMatter])
  return parts.length ? parts.join(', ') : 'not specified'
}

const WATERLOG_SENSITIVE = 3 // crops with waterlogTol below this are penalised (same gate as the baseline engine)

/** Plain-language lines about what the soil inputs changed for this rotation (used in the "why" text). */
export function soilWhy(s: SoilProfile, crops: Crop[], irrigated: boolean): string[] {
  if (!isSoilKnown(s)) return []
  const out: string[] = []
  const real = crops.filter((c) => c.group !== 'fallow')
  const f = storedMoistureFactor(s)
  if (!irrigated && f !== 1)
    out.push(
      `Your soil (${describeSoil(s)}) changes how much stored soil moisture counts toward the crop's water need: ${f.toFixed(2)}× the standard allowance.${s.texture !== 'unknown' ? ' The texture part uses FAO-56 water-holding ranges; the drainage part is an unverified assumption.' : ' This is an unverified assumption.'}`,
    )
  const wl = waterlogParams(s)
  if (wl.start !== 2 || wl.slope !== 1) {
    const sensitive = real.filter((c) => c.waterlogTol < WATERLOG_SENSITIVE)
    if (sensitive.length)
      out.push(
        `Waterlogging is judged from ${wl.start}× rain-to-need (standard 2×), ${wl.slope.toFixed(2)}× steepness, for ${[...new Set(sensitive.map((c) => c.name))].join(', ')} (unverified thresholds).`,
      )
  }
  const ef = erosionFactor(s)
  if (ef !== 1)
    out.push(
      `Erosion exposure: ground cover and bare fallow are weighted ${ef.toFixed(2)}× because the soil is ${TEXTURE_LABEL[s.texture]} (unverified factor).`,
    )
  const ow = omWeight(s)
  if (ow !== OM_WEIGHT.medium)
    out.push(
      `Organic matter: crops' organic-matter contribution is weighted ${ow.toFixed(2)} instead of 0.30 because your soil has ${s.organicMatter} organic matter (unverified weight).`,
    )
  return out
}

/** Soil-related risks for one rotation. `rainMetYears`/`years` come from the climate evidence of each slot. */
export function soilRisks(
  s: SoilProfile,
  slots: { crop: Crop; name: string; needMetYears: number; years: number; ratio: number }[],
  irrigated: boolean,
): string[] {
  const out: string[] = []
  if (!isSoilKnown(s)) return out
  const wl = waterlogParams(s)
  for (const { crop, name, needMetYears, years, ratio } of slots) {
    if (crop.group === 'fallow') {
      if (s.organicMatter === 'low' || s.texture === 'loam')
        out.push(`${name}: bare fallow on ${describeSoil(s)} soil leaves it exposed (erosion and organic-matter loss; soil rules are unverified).`)
      continue
    }
    if (!irrigated && s.texture === 'sandy' && crop.droughtTol <= 2 && needMetYears < years)
      out.push(
        `${name}: sandy soil holds little water (FAO-56: 0.05–0.11 m³/m³ vs 0.13–0.18 for loam) and ${crop.name} tolerates drought poorly; rain fell short of its need in ${years - needMetYears} of ${years} years.`,
      )
    if (crop.waterlogTol < WATERLOG_SENSITIVE && (s.drainage === 'poor' || s.texture === 'clay') && ratio > wl.start)
      out.push(
        `${name}: ${crop.name} tolerates waterlogging poorly and this soil (${describeSoil(s)}) drains slowly; rainfall averages ${ratio.toFixed(1)}× its water need. Check drainage (unverified threshold).`,
      )
  }
  return out
}

/** Information gaps about soil: what was used, and which parts are not backed by a published source. */
export function soilGaps(s: SoilProfile, usedSoilGrids = false): string[] {
  if (!isSoilKnown(s))
    return [
      'Soil is not specified, so no soil rule is applied (the engine assumes an average loamy, moderately drained soil). Pick texture, drainage and organic matter in "Your soil", ideally from a local soil test or national soil survey.',
    ]
  return [
    `Soil used: ${describeSoil(s)}${usedSoilGrids ? ' (filled from ISRIC SoilGrids, a non-NASA beta service, modelled at 250 m, not a measurement of your field)' : ' (your manual choice)'}. Soil changes the scores only through the rules listed under "Your soil"; it does not model infiltration, slope, salinity, pH or compaction.`,
    'Only the water-holding part of the soil rules comes from a published table (FAO-56 Table 19). These soil rules have NO published source for their sizes and are flagged unverified: drainage effect on stored moisture; waterlogging thresholds; erosion factors by texture; organic-matter weights. Treat them as rough judgement and confirm locally.',
  ]
}

// ---------------------------------------------------------------------------------------------
// SoilGrids conversion (pure functions; the network part is in lib/soilgrids.ts)
// ---------------------------------------------------------------------------------------------

export interface SoilGridsReading {
  clayPct: number
  sandPct: number
  siltPct: number
  /** Soil organic carbon, g/kg, thickness-weighted over 0-30 cm. */
  socGperKg: number
}

/** USDA triangle collapsed to three classes (see data/soils.ts [B]). */
export function textureFromPercents(clayPct: number, sandPct: number): 'sandy' | 'loam' | 'clay' {
  if (clayPct >= 40) return 'clay'
  if (sandPct >= 50 && clayPct < 20) return 'sandy'
  return 'loam'
}

/** UNVERIFIED thresholds, see data/soils.ts. */
export function omFromSoc(socGperKg: number): 'low' | 'medium' | 'high' {
  if (socGperKg < 10) return 'low'
  if (socGperKg > 20) return 'high'
  return 'medium'
}

/** Drainage is left alone (SoilGrids has no drainage layer): the farmer's own choice is kept. */
export function profileFromSoilGrids(r: SoilGridsReading, keepDrainage: SoilProfile['drainage'] = 'unknown'): SoilProfile {
  return {
    texture: textureFromPercents(r.clayPct, r.sandPct),
    drainage: keepDrainage,
    organicMatter: omFromSoc(r.socGperKg),
  }
}
