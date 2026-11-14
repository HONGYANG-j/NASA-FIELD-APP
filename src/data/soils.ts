// Soil classes and the written-down rules that turn them into score adjustments.
//
// The farmer picks three things by hand (or fills them from ISRIC SoilGrids, see lib/soilgrids.ts):
//   texture      sandy | loam | clay
//   drainage     poor | moderate | good
//   organicMatter low | medium | high
// Each can also be 'unknown' (the default). 'unknown' means NO EFFECT. The baseline engine already
// behaves like a moderately drained, medium-organic-matter soil, so 'moderate' and 'medium' are also
// neutral (factor 1.0). Loam is neutral for the WATER rules only; the erosion rule treats loam as
// more erodible than 'unknown' (factor 1.15), so choosing loam does change the soil-health score.
//
// EVERY rule below has an evidence status:
//   'fao'        the numbers are copied from a published FAO table and used as published
//   'partial'    the input numbers are published, but HOW the engine uses them is our own modelling
//                assumption (the published source does not say "scale the stored-moisture term")
//   'unverified' no published source: a judgement call, shown as such in the UI
// The UI prints this status next to every soil effect. Do not upgrade a status without a source.
//
// SOURCES (checked 14 Nov 2026)
//  [A] FAO Irrigation and Drainage Paper 56 (Allen et al. 1998), Chapter 7, Table 19
//      "Typical soil water characteristics for different soil types" (USA texture classes):
//      water the soil holds between field capacity and wilting point, m3/m3:
//        sand 0.05-0.11, loam 0.13-0.18, clay 0.12-0.20 (also sandy loam 0.11-0.15, silt loam 0.13-0.19, ...)
//      https://www.fao.org/4/x0490e/x0490e0c.htm  (FAO notes the page is OCR-scanned and may contain
//      transcription errors; the silty-clay field-capacity cell is visibly garbled, we do not use it)
//  [B] USDA soil texture triangle (Soil Survey Manual, ch. 3) for the sand/silt/clay class limits used when
//      SoilGrids percentages are converted to our three classes. The collapse to three classes is ours.
//  [C] NRCS: soil erodibility (K factor) is driven mainly by texture, plus organic matter, structure and
//      permeability. This supports "texture matters for erosion", NOT the factor sizes below.
//
// NOT FOUND / NOT USED
//  - FAO Training Manual 3 chapter 2 says nothing about percolation for paddy rice, so there is no rule
//    that raises rice water need on sandy soil.
//  - No verified texture -> erodibility table was retrieved, so the erosion factors are unverified.
//  - No source for organic-matter classes: the thresholds used to read SoilGrids carbon are unverified.

export type Texture = 'unknown' | 'sandy' | 'loam' | 'clay'
export type Drainage = 'unknown' | 'poor' | 'moderate' | 'good'
export type OrganicMatter = 'unknown' | 'low' | 'medium' | 'high'

export interface SoilProfile {
  texture: Texture
  drainage: Drainage
  organicMatter: OrganicMatter
}

export const UNKNOWN_SOIL: SoilProfile = { texture: 'unknown', drainage: 'unknown', organicMatter: 'unknown' }

export const TEXTURE_LABEL: Record<Texture, string> = {
  unknown: 'unknown',
  sandy: 'sandy',
  loam: 'loam (loamy)',
  clay: 'clay (heavy)',
}
export const DRAINAGE_LABEL: Record<Drainage, string> = {
  unknown: 'unknown',
  poor: 'poorly drained',
  moderate: 'moderately drained',
  good: 'well drained',
}
export const OM_LABEL: Record<OrganicMatter, string> = {
  unknown: 'unknown',
  low: 'low organic matter',
  medium: 'medium organic matter',
  high: 'high organic matter',
}

export type Evidence = 'fao' | 'partial' | 'unverified'

export const EVIDENCE_LABEL: Record<Evidence, string> = {
  fao: 'FAO-sourced',
  partial: 'inputs sourced, use is our assumption',
  unverified: 'UNVERIFIED',
}

// ---------------------------------------------------------------------------------------------
// Rule parameters. All factors are multipliers where 1.0 = the baseline engine (no change).
// ---------------------------------------------------------------------------------------------

/** Rule 1. Water the soil holds between field capacity and wilting point, m3/m3: midpoint of FAO-56 Table 19. */
export const AWC_RANGE: Record<Exclude<Texture, 'unknown'>, [number, number]> = {
  sandy: [0.05, 0.11], // "Sand"
  loam: [0.13, 0.18], // "Loam"
  clay: [0.12, 0.2], // "Clay"
}
export const AWC_MID: Record<Exclude<Texture, 'unknown'>, number> = {
  sandy: (0.05 + 0.11) / 2, // 0.08
  loam: (0.13 + 0.18) / 2, // 0.155
  clay: (0.12 + 0.2) / 2, // 0.16
}

/** Rule 2. Drainage changes how much of the soil-moisture buffer is kept (poor holds on, good drains away). */
export const DRAINAGE_STORE: Record<Drainage, number> = { unknown: 1, poor: 1.1, moderate: 1, good: 0.9 }

/** Rule 3. Heavy-rain waterlogging: rain/need ratio above which the penalty starts, and the penalty steepness multiplier. */
export const WATERLOG_START: Record<Drainage, number> = { unknown: 2, poor: 1.5, moderate: 2, good: 2.5 }
export const WATERLOG_DRAINAGE_SLOPE: Record<Drainage, number> = { unknown: 1, poor: 1.5, moderate: 1, good: 0.7 }
export const WATERLOG_TEXTURE_SLOPE: Record<Texture, number> = { unknown: 1, sandy: 0.8, loam: 1, clay: 1.2 }

/** Rule 4. Erosion exposure: scales how much ground cover counts and how much a bare-fallow season hurts. */
export const EROSION_FACTOR: Record<Texture, number> = { unknown: 1, sandy: 1, loam: 1.15, clay: 0.9 }

/** Rule 5. Weight of the crops' organic-matter contribution in the soil score (baseline 0.3). */
export const OM_WEIGHT_BASE = 0.3
export const OM_WEIGHT: Record<OrganicMatter, number> = { unknown: 0.3, low: 0.4, medium: 0.3, high: 0.2 }

/** Rule 6 (SoilGrids only). Soil organic carbon, g/kg, in the 0-30 cm layer -> our three OM classes. UNVERIFIED thresholds. */
export const SOC_LOW_BELOW = 10
export const SOC_HIGH_ABOVE = 20

export interface SoilRule {
  id: string
  /** Short name shown in the UI. */
  title: string
  /** What changes in the score, in plain words. */
  effect: string
  /** Why we think this is reasonable. */
  reasoning: string
  /** Where the numbers come from, or why there is none. */
  source: string
  status: Evidence
}

export const SOIL_RULES: SoilRule[] = [
  {
    id: 'texture-water-store',
    title: 'Texture sets how much rain-fed soil moisture the crop can draw on',
    effect:
      'The engine credits each crop with a stored-moisture allowance (up to 25% of its water need, scaled by how wet the root zone was). That allowance is multiplied by the soil’s available-water capacity relative to loam: sand 0.52×, loam 1.00×, clay 1.03×. Only applies when you are not irrigating.',
    reasoning:
      'Sandy soil holds roughly half as much plant-available water as loam, so a dry spell bites sooner (more drought risk). Clay and loam hold similar amounts.',
    source:
      'FAO-56 Table 19 water held between field capacity and wilting point: sand 0.05–0.11, loam 0.13–0.18, clay 0.12–0.20 m³/m³; we use the range midpoints (0.08, 0.155, 0.16). Applying the ratio to the engine’s 25% allowance is our own assumption.',
    status: 'partial',
  },
  {
    id: 'drainage-water-store',
    title: 'Drainage nudges the same moisture allowance',
    effect: 'Stored-moisture allowance × 1.10 on poorly drained soil, × 1.00 moderate, × 0.90 well drained (not irrigated only).',
    reasoning: 'Water lingers longer where drainage is poor and runs through faster where it is good. The sizes of 10% are a judgement call.',
    source: 'No published source for these multipliers.',
    status: 'unverified',
  },
  {
    id: 'waterlogging',
    title: 'Poor drainage and heavy clay make waterlogging start sooner and bite harder',
    effect:
      'Crops that tolerate waterlogging badly (tolerance 1–2 of 5) lose fit when seasonal rain is far above their need. The baseline starts at rain = 2× need. Poor drainage starts at 1.5× need with a 1.5× steeper penalty; good drainage starts at 2.5× with a 0.7× penalty. Clay multiplies the steepness by 1.2, sandy by 0.8. Rice (tolerance 5) is not affected.',
    reasoning:
      'Water that cannot drain, or drains slowly through fine pores, starves roots of oxygen. Crops differ in how long they survive it. Waterlogging tolerance of each crop is itself an unsourced value in the crop table.',
    source:
      'No published source for the thresholds and multipliers. FAO-56 Table 19 supports only that clay holds more water than sand.',
    status: 'unverified',
  },
  {
    id: 'erosion',
    title: 'Texture sets how exposed the soil is to erosion',
    effect:
      'In the soil-health score, the weight of ground cover and the penalty for each bare-fallow season are multiplied by 1.15 on loam, 1.00 on sandy, 0.90 on clay.',
    reasoning:
      'Texture is the main driver of how easily soil is detached (NRCS). Silty and loamy soils are generally the most erodible, heavy clay aggregates resist detachment, loose sand is easy to move but absorbs rain. The sizes of the factors are a judgement call and slope (not asked for) matters more than any of them.',
    source: 'NRCS (K factor is driven mainly by texture) supports the direction only; no texture-to-factor table was retrieved.',
    status: 'unverified',
  },
  {
    id: 'organic-matter',
    title: 'Low soil organic matter makes crop residues and cover crops count for more',
    effect:
      'In the soil-health score, the weight of each crop’s organic-matter contribution is 0.40 on low-OM soil, 0.30 on medium (baseline) and 0.20 on high-OM soil.',
    reasoning:
      'Where soil already holds plenty of organic matter, extra residue adds less; where it is depleted, rotations that return biomass help most.',
    source: 'No published source for the weights.',
    status: 'unverified',
  },
  {
    id: 'soilgrids-classes',
    title: 'Converting SoilGrids numbers to the three classes (optional button)',
    effect:
      'Texture: clay ≥ 40% → clay; sand ≥ 50% and clay < 20% → sandy; otherwise loam. Organic matter from soil organic carbon in the top 30 cm: below 10 g/kg → low, above 20 g/kg → high, else medium. Drainage is never filled in: SoilGrids does not provide it.',
    reasoning:
      'The USDA triangle puts clay-class soils at 40% clay or more and sandy loams and sands below 20% clay with high sand. Clay loam, silt loam and similar mixed soils are all treated as loam here, which is a simplification.',
    source:
      'Texture limits follow the USDA texture triangle (simplified to three classes). The carbon thresholds are UNVERIFIED.',
    status: 'partial',
  },
]
