import { useEffect, useMemo, useState } from 'react'
import {
  landsatPerYear,
  landsatVsModis,
  loadBundledElevation,
  loadBundledLandsat,
  loadBundledNdvi,
} from '../lib/satellite'
import type { ElevationFile, LandsatFile, NdviFile } from '../lib/satellite'
import { LandsatChart } from './LandsatChart'

interface Loaded {
  id: string
  landsat: LandsatFile | null
  modis: NdviFile | null
  elevation: ElevationFile | null
}

/**
 * Landsat 30 m NDVI and NASADEM elevation/slope for a demo location. Loads its own bundled files, so the
 * parent only passes the preset id. Renders nothing for locations with neither dataset.
 */
export function LandsatPanel({ presetId }: { presetId: string | undefined }) {
  const [state, setState] = useState<Loaded | null>(null)

  useEffect(() => {
    if (!presetId) return
    let cancelled = false
    Promise.all([loadBundledLandsat(presetId), loadBundledNdvi(presetId), loadBundledElevation(presetId)]).then(
      ([landsat, modis, elevation]) => {
        if (!cancelled) setState({ id: presetId, landsat, modis, elevation })
      },
    )
    return () => {
      cancelled = true
    }
  }, [presetId])

  const data = state && state.id === presetId ? state : null
  const agreement = useMemo(
    () => (data?.landsat && data.modis ? landsatVsModis(data.landsat, data.modis) : null),
    [data],
  )
  if (!data || (!data.landsat && !data.elevation)) return null
  const { landsat, modis, elevation } = data

  return (
    <div className="landsat-panel">
      <h3>Sharper view: Landsat (30 m) and terrain</h3>
      {landsat ? (
        <>
          <LandsatChart landsat={landsat} modis={modis} />
          <p className="legend">
            <span className="key bar-key" style={{ background: 'var(--accent)' }} /> Landsat NDVI, one dot per clear
            date (30 m pixel) &nbsp;
            {modis && (
              <>
                <span className="key line-key" style={{ background: 'var(--muted)', opacity: 0.55 }} /> MODIS 250 m
                composites &nbsp;
              </>
            )}
            dashed line = 0.3 (sparse or bare)
          </p>
          <ul className="plain-list">
            <li>
              {landsat.points.length} clear dates from {landsat.years[0]} to {landsat.years[1]} (
              {Object.entries(landsatPerYear(landsat))
                .map(([y, n]) => `${y}: ${n}`)
                .join(', ')}
              ), out of {landsat.observations.scenesSearched} Landsat scenes over this pixel; the rest were cloudy,
              in cloud shadow or had no data. Cloud and shadow are masked with each scene’s own QA band, so there are
              gaps between clear dates.
            </li>
            {agreement && (
              <li>
                Check against the MODIS series above: on the {agreement.n} dates that fall between two MODIS composites
                the two NDVI series correlate at r = {agreement.r.toFixed(2)}. Landsat averages{' '}
                {agreement.meanLandsat.toFixed(2)} and MODIS {agreement.meanModis.toFixed(2)} on those dates (MODIS
                averages a 250 m pixel; this is a sanity check against another satellite, not against ground data).
              </li>
            )}
            <li>
              Data: {landsat.source}, downloaded {landsat.fetched}. One 30 m pixel at {landsat.latitude.toFixed(5)},{' '}
              {landsat.longitude.toFixed(5)}, {landsat.requested.offsetMetres} m from the location centre. ESA WorldCover
              (10 m, 2021) is cropland in the 40 m square around the pixel; at the exact centre it says “
              {landsat.landCover.atRequestedPoint.wc2021 ?? 'unknown'}”. Evidence only: not used to score rotations.
            </li>
          </ul>
        </>
      ) : (
        <p className="muted">
          No Landsat NDVI for this location: ESA WorldCover 10 m maps the centre point as “
          {elevation?.landCoverAtPoint.wc2021 ?? 'not cropland'}” and no verified cropland pixel was found nearby, so a
          30 m NDVI series would describe town or forest, not a farm.
        </p>
      )}
      {elevation && (
        <ul className="plain-list">
          <li>
            Terrain at the location centre ({elevation.latitude}, {elevation.longitude}):
            elevation <strong>{elevation.elevationM} m</strong> (surrounding 3×3 pixels{' '}
            {elevation.min3x3M}–{elevation.max3x3M} m), slope <strong>{elevation.slope30mDeg.toFixed(1)}°</strong> over
            30 m or <strong>{elevation.slope90mDeg.toFixed(1)}°</strong> over 90 m.
            {elevation.slope30mDeg > 2 * elevation.slope90mDeg &&
              ' The 30 m slope is much larger than the 90 m slope, which on flat ground is probably radar noise (not verified), so trust the 90 m figure more.'}{' '}
            Source: {elevation.source}, downloaded {elevation.fetched}. Radar surface height, so it can include
            trees and buildings; accuracy was not checked against a ground survey (unverified).
          </li>
        </ul>
      )}
    </div>
  )
}
