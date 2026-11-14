// Climate-based crop water need.
//
//   crop water need (mm) = sum over the crop's days of  Kc(day) x ET0(day)
//
// ET0  - reference evapotranspiration, estimated with the Hargreaves equation (FAO-56 Eq. 52)
//        from daily temperature and the extraterrestrial radiation Ra (FAO-56 Eq. 21-25, 20).
//        Source: FAO Irrigation and Drainage Paper 56, https://www.fao.org/4/x0490e/x0490e07.htm
//        FAO says Eq. 52 should be verified in each region against Penman-Monteith; see README
//        for our cross-check against MODIS potential evapotranspiration.
// Kc   - FAO-56 single crop coefficient curve (Tables 11 and 12, Eq. 66), see data/crops.ts.
//        https://www.fao.org/4/x0490e/x0490e0b.htm
//
// The crop is assumed to be planted on the first day of its season window and to grow for its
// stage lengths (or until the window ends). Only rain that falls on those days counts.
import type { Crop, CropKc, SlotYear } from '../types'

/** Solar constant, MJ m-2 min-1 (FAO-56). */
const GSC = 0.082
/** MJ m-2 day-1 to mm day-1 of equivalent evaporation (FAO-56 Eq. 20). */
const MJ_TO_MM = 0.408
/** Day of the year for the 15th of each month (non-leap year), used as each month's representative day. */
export const MID_MONTH_DOY = [15, 46, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349]

/** Extraterrestrial radiation Ra, in mm/day of equivalent evaporation. FAO-56 Eq. 21-25 and 20. */
export function extraterrestrialRadiationMm(latitudeDeg: number, dayOfYear: number): number {
  const phi = (Math.PI / 180) * latitudeDeg
  const dr = 1 + 0.033 * Math.cos((2 * Math.PI * dayOfYear) / 365)
  const delta = 0.409 * Math.sin((2 * Math.PI * dayOfYear) / 365 - 1.39)
  // Sunset hour angle; clamp for polar day/night.
  const ws = Math.acos(Math.min(1, Math.max(-1, -Math.tan(phi) * Math.tan(delta))))
  const raMj =
    ((24 * 60) / Math.PI) *
    GSC *
    dr *
    (ws * Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta) * Math.sin(ws))
  return Math.max(0, MJ_TO_MM * raMj)
}

/** Hargreaves reference evapotranspiration (mm/day). FAO-56 Eq. 52. NaN inputs give NaN. */
export function hargreavesEt0(tmean: number, tmax: number, tmin: number, raMm: number): number {
  const range = tmax - tmin
  if (Number.isNaN(tmean) || Number.isNaN(range)) return NaN
  return Math.max(0, 0.0023 * (tmean + 17.8) * Math.sqrt(Math.max(0, range)) * raMm)
}

/** Monthly Ra table (mm/day) for a latitude, index 0 = January. */
export function monthlyRa(latitudeDeg: number): number[] {
  return MID_MONTH_DOY.map((j) => extraterrestrialRadiationMm(latitudeDeg, j))
}

/** Total length of a crop's cycle in days. */
export function cycleLength(kc: CropKc): number {
  return kc.stages[0] + kc.stages[1] + kc.stages[2] + kc.stages[3]
}

/**
 * Crop coefficient on day `day` (0 = first day of the cycle), FAO-56 Eq. 66:
 * constant `ini`, linear to `mid`, constant `mid`, linear to `end`. Null after the cycle ends.
 */
export function kcAtDay(kc: CropKc, day: number): number | null {
  const [li, ld, lm, ll] = kc.stages
  const i = day + 1 // FAO-56 counts days from 1
  if (day < 0 || i > li + ld + lm + ll) return null
  if (i <= li) return kc.ini
  if (i <= li + ld) return kc.ini + ((i - li) / ld) * (kc.mid - kc.ini)
  if (i <= li + ld + lm) return kc.mid
  return kc.mid + ((i - li - ld - lm) / ll) * (kc.end - kc.mid)
}

export interface CropWater {
  /** Water the crop needs over its days in the window (mm). */
  needMm: number
  /** Rain that falls on those days (mm). */
  rainMm: number
  /** 'climate': FAO-56 Kc x Hargreaves ET0. 'table': fixed reference value (no Kc or no latitude). */
  method: 'climate' | 'table'
  /** Days of the window the crop occupies. */
  days: number
}

/** Water need and usable rain for one crop in one season-year. */
export function cropWater(crop: Crop, sy: SlotYear): CropWater {
  if (crop.kc && sy.et0 && sy.precip) {
    const n = Math.min(cycleLength(crop.kc), sy.et0.length)
    let need = 0
    let rain = 0
    for (let d = 0; d < n; d++) {
      const kc = kcAtDay(crop.kc, d)
      const e = sy.et0[d]
      const p = sy.precip[d]
      if (kc !== null && Number.isFinite(e)) need += kc * e
      if (Number.isFinite(p)) rain += p
    }
    return { needMm: need, rainMm: rain, method: 'climate', days: n }
  }
  return { needMm: crop.waterNeedMm, rainMm: sy.precipMm, method: 'table', days: sy.days }
}
