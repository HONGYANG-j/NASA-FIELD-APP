import type { Scenario, Weights } from './types'
import type { RotationMode } from './lib/rotation'
import type { SoilProfile } from './lib/soil'

export interface Inputs {
  presetId: string
  lat: number
  lon: number
  mode: RotationMode
  irrigated: boolean
  /** Field elevation in metres (optional). Used to correct NASA POWER's grid-cell temperature. */
  elevationM: number | null
  /** Crop ids of the farmer's current rotation, one per slot. */
  current: [string, string, string]
  /** Crop ids the farmer can realistically grow and sell. */
  allowed: string[]
  weights: Weights
  /** Soil chosen by hand or filled from SoilGrids. 'unknown' parts have no effect on scores. */
  soil: SoilProfile
  /** Where texture/organic matter came from (drives the wording of the information gaps). */
  soilSource: 'manual' | 'soilgrids'
  scenario: Scenario
  /** 'auto' = pick the month that suits the current rotation best. */
  startMonth: 'auto' | number
}

export const DEFAULT_WEIGHTS: Weights = { water: 3, soil: 3, income: 3, resilience: 3 }
