import type { RotationMode } from '../lib/rotation'

export interface Preset {
  id: string
  name: string
  lat: number
  lon: number
  mode: RotationMode
  irrigated: boolean
  /** Field elevation in metres, only where we could confirm it. */
  elevationM?: number
  /** Starting "current rotation" (crop ids, one per season). */
  current: [string, string, string]
  /** Crops a farmer here could plausibly grow and sell. */
  crops: string[]
}

export const PRESETS: Preset[] = [
  {
    id: 'kedah',
    name: 'Kedah rice bowl, Malaysia',
    // MODIS land cover (MCD12Q1, IGBP) at this pixel is class 12, cropland (checked 14 Nov 2026).
    lat: 6.25,
    lon: 100.35,
    mode: 'seasons',
    irrigated: true,
    current: ['rice', 'rice', 'fallow'],
    crops: ['rice', 'maize', 'sorghum', 'soybean', 'mungbean', 'cowpea', 'groundnut', 'sweetpotato', 'cassava', 'clover', 'covermix', 'fallow'],
  },
  {
    id: 'cameron',
    name: 'Cameron Highlands, Malaysia',
    lat: 4.47,
    lon: 101.38,
    mode: 'seasons',
    irrigated: false,
    // No satellite layer: 8 candidate points around here were MODIS forest, savanna or grassland,
    // never cropland (farms are too fragmented for a 500 m pixel), so NDVI would not describe a farm.
    // Tanah Rata is about 1,440 m (Wikipedia); POWER's grid cell here is only ~593 m.
    elevationM: 1440,
    current: ['cabbage', 'potato', 'fallow'],
    crops: ['cabbage', 'potato', 'maize', 'soybean', 'groundnut', 'sweetpotato', 'sunflower', 'clover', 'covermix', 'fallow'],
  },
  {
    id: 'iowa',
    name: 'Iowa corn belt, USA',
    // MODIS land cover (MCD12Q1, IGBP) at this pixel is class 12, cropland (checked 14 Nov 2026).
    // The nearby point 42.03N -93.60E came back as class 13 (urban), so it was not used.
    lat: 41.95,
    lon: -93.55,
    mode: 'years',
    irrigated: false,
    current: ['maize', 'soybean', 'fallow'],
    crops: ['maize', 'soybean', 'wheat', 'sorghum', 'sunflower', 'clover', 'covermix', 'fallow'],
  },
]

export const CUSTOM_PRESET_ID = 'custom'
