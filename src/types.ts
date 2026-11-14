// Shared types for the rotation advisor.

/** Daily climate series. All arrays are the same length; missing values are NaN. */
export interface DailySeries {
  year: number[]
  month: number[] // 1-12
  tmean: number[] // °C   (POWER T2M)
  tmax: number[] // °C   (POWER T2M_MAX)
  tmin: number[] // °C   (POWER T2M_MIN)
  precip: number[] // mm/day (POWER PRECTOTCORR)
  rootWet: number[] // 0-1  (POWER GWETROOT, root-zone soil wetness)
  etMm: number[] // mm/day, derived from POWER EVPTRNS (MJ/m²/day) / 2.45
  /** Latitude (degrees) of the point, from POWER's response; needed for the evapotranspiration estimate. */
  latitude?: number
}

export interface Scenario {
  /** Added to every daily temperature (°C). */
  dTemp: number
  /** Percent change applied to every daily rainfall amount (e.g. -20 = 20% drier). */
  rainPct: number
}

export type CropGroup =
  | 'cereal'
  | 'legume'
  | 'root'
  | 'vegetable'
  | 'oilseed'
  | 'forage'
  | 'cover'
  | 'fallow'

/**
 * FAO-56 single crop coefficient curve (Tables 11 and 12 of FAO Irrigation and Drainage Paper 56):
 * Kc is `ini` for the first stage, rises linearly to `mid` over the development stage, stays at
 * `mid`, then falls linearly to `end` over the late stage. `stages` are the four lengths in days.
 */
export interface CropKc {
  ini: number
  mid: number
  end: number
  stages: [number, number, number, number]
}

export interface Crop {
  id: string
  name: string
  group: CropGroup
  /** Botanical family; the same family back-to-back keeps pest/disease cycles going. */
  family: string
  /** Optimum daily mean temperature range (°C). */
  tOptMin: number
  tOptMax: number
  /** Daily minimum below this counts as a cold-stress day (°C). */
  coldLimit: number
  /** Daily maximum above this counts as a heat-stress day (°C). */
  heatLimit: number
  /**
   * Reference seasonal water need (mm), the midpoint of FAO Training Manual 3 Table 5 where sourced.
   * It is the fallback when `kc` is missing, and a cross-check for the computed need. 0 = none.
   */
  waterNeedMm: number
  /**
   * FAO-56 crop coefficient curve. When present (and the climate series has a latitude), the
   * seasonal water need is computed from local temperature: sum of Kc x reference
   * evapotranspiration. Absent for crops FAO-56 does not cover in a usable form.
   */
  kc?: CropKc
  /** 1 (sensitive) to 5 (very tolerant). */
  droughtTol: number
  /** 1 (sensitive) to 5 (very tolerant). */
  waterlogTol: number
  /** Fixes atmospheric nitrogen. */
  nFix: boolean
  /** Ground cover / erosion protection, 1 (poor) to 5 (excellent). */
  erosionCover: number
  /** Organic-matter contribution, 1 (low) to 5 (high). */
  organicMatter: number
  rooting: 'shallow' | 'medium' | 'deep'
  /** Rough relative market value, 0 (none) to 5 (high). Local prices not used. */
  marketValue: number
  /** Typical total growing period in days (FAO), or null when not sourced. */
  cycleDays: [number, number] | null
  /**
   * How well the main numbers are backed by a published source:
   *  temp  - 'fao' both optimum bounds from FAO AEZ thermal suitability, 'partial' only the
   *          lower bound, 'unverified' none. Cold/heat limits are never sourced (see crops.ts).
   *  water - 'fao' seasonal water need from FAO Training Manual 3, else 'unverified'.
   */
  check: { temp: 'fao' | 'partial' | 'unverified'; water: 'fao' | 'unverified' }
}

/** Climate of one crop slot (a window of months) in one calendar year. */
export interface SlotYear {
  seasonYear: number
  days: number
  tmean: number[]
  tmax: number[]
  tmin: number[]
  precipMm: number
  etMm: number
  rootWet: number
  /** Daily rainfall (mm) over the window; lets a crop count only the rain that falls while it grows. */
  precip?: number[]
  /** Daily reference evapotranspiration ET0 (mm), Hargreaves-Samani, FAO-56 Eq. 52. */
  et0?: number[]
}

export interface Weights {
  /** Importance of each farmer priority, 0-5. */
  water: number
  soil: number
  income: number
  resilience: number
}

export interface SlotEvidence {
  fit: number // 0-1 mean over years
  reliability: number // share of years with fit >= RELIABLE_FIT
  worst: number // lowest yearly fit
  years: number
  meanT: number
  rainMm: number
  needMm: number
  /** How `needMm` was obtained: from local climate (FAO-56 Kc x ET0) or the fixed table value. */
  needMethod?: 'climate' | 'table'
  needMetYears: number
  heatDays: number // mean per season
  coldDays: number // mean per season
  tempFit: number
  waterFit: number
}

export interface RotationResult {
  crops: Crop[]
  slotEvidence: SlotEvidence[]
  dims: {
    climate: number // 0-1
    resilience: number // 0-1
    water: number // 0-1 (higher = lighter water demand relative to rainfall)
    soil: number // 0-1
    income: number // 0-1
  }
  overall: number // 0-100
  notes: string[] // rotation rules that fired (+ and -)
}
