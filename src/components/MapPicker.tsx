import { useEffect, useId, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './MapPicker.css'

/**
 * Click-to-pick map using NASA GIBS (Global Imagery Browse Services) tiles.
 * Loaded lazily from Controls so Leaflet is not part of the first page load.
 *
 * Every layer below was requested with plain `curl` on 14 Nov 2026: HTTP 200, no login, and
 * `Access-Control-Allow-Origin: *`. For the time-based layers, different dates returned different
 * images (different MD5 of the tile), so the time parameter really is honoured. Details in README.md.
 *
 * GIBS only has tiles up to the matrix set's last zoom (Level N => zoom N); asking for the next zoom
 * returns HTTP 400. So `maxNativeZoom` is set per layer and Leaflet enlarges the last level beyond it.
 */
const GIBS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best'

type BaseId = 'bluemarble' | 'modis'

const BLUE_MARBLE_URL = `${GIBS}/BlueMarble_NextGeneration/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg`
const modisUrl = (date: string) =>
  `${GIBS}/MODIS_Terra_CorrectedReflectance_TrueColor/default/${date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`
const ndviUrl = (month: string) =>
  `${GIBS}/MODIS_Terra_L3_NDVI_Monthly/default/${month}/GoogleMapsCompatible_Level7/{z}/{y}/{x}.png`
const FEATURES_URL = `${GIBS}/Reference_Features/default/GoogleMapsCompatible_Level9/{z}/{y}/{x}.png`
const LABELS_URL = `${GIBS}/Reference_Labels/default/GoogleMapsCompatible_Level9/{z}/{y}/{x}.png`

const ATTRIBUTION =
  'Imagery: NASA <a href="https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api" target="_blank" rel="noreferrer">GIBS</a>/ESDIS'

/** First MODIS Terra true-colour date in GIBS (from GetCapabilities). */
const MODIS_FIRST_DATE = '2000-02-24'

const dayString = (d: Date) => d.toISOString().slice(0, 10)

/** Two days back: GIBS had a tile for "today" when checked, but near-real-time days can lag. */
function defaultModisDate(): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - 2)
  return dayString(d)
}

/**
 * First day of the month two months ago. GIBS listed MODIS_Terra_L3_NDVI_Monthly up to 2026-10-01 on
 * 14 Nov 2026, so the previous month may not be published yet; two months back is safely available.
 */
function ndviMonth(): string {
  const d = new Date()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() - 2)
  return dayString(d)
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** The map cannot show the poles (Web Mercator), and typed fields may be empty or out of range. */
const validPoint = (lat: number, lon: number) =>
  Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 85 && Math.abs(lon) <= 180

export interface MapPickerProps {
  /** Location whose climate is currently loaded (shown as the marker). */
  lat: number
  lon: number
  /** Called with a clicked point, already rounded to 0.01 degrees and wrapped to [-180, 180]. */
  onPick: (lat: number, lon: number) => void
}

export default function MapPicker({ lat, lon, onPick }: MapPickerProps) {
  const uid = useId()
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markerRef = useRef<L.CircleMarker | null>(null)
  const baseRef = useRef<L.TileLayer | null>(null)
  const ndviRef = useRef<L.TileLayer | null>(null)
  const refsRef = useRef<L.LayerGroup | null>(null)
  const onPickRef = useRef(onPick)
  const [base, setBase] = useState<BaseId>('bluemarble')
  const [modisDate, setModisDate] = useState(defaultModisDate)
  const [labels, setLabels] = useState(true)
  const [ndvi, setNdvi] = useState(false)
  const [tileProblem, setTileProblem] = useState(false)
  // Dates are fixed when the map opens (Date is impure, so not read during render).
  const [month] = useState(ndviMonth)
  const [maxDate] = useState(() => dayString(new Date()))
  const initialPoint = useRef({ lat, lon })

  useEffect(() => {
    onPickRef.current = onPick
  }, [onPick])

  // Create the map once.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const start = initialPoint.current
    const map = L.map(el, {
      center: validPoint(start.lat, start.lon) ? [start.lat, start.lon] : [0, 0],
      zoom: 7,
      minZoom: 2,
      maxZoom: 12,
      maxBounds: [[-85, -180], [85, 180]],
      maxBoundsViscosity: 1,
      // The mouse wheel must keep scrolling the sidebar/page; zoom with the +/- buttons, double click or pinch.
      scrollWheelZoom: false,
    })
    map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noreferrer">Leaflet</a>')
    map.on('click', (e: L.LeafletMouseEvent) => {
      const p = e.latlng.wrap()
      onPickRef.current(round2(p.lat), round2(p.lng))
    })
    markerRef.current = L.circleMarker(validPoint(start.lat, start.lon) ? [start.lat, start.lon] : [0, 0], {
      radius: 8,
      weight: 3,
      color: '#ffffff',
      fillColor: '#c2410c',
      fillOpacity: 1,
      interactive: false,
    }).addTo(map)
    refsRef.current = L.layerGroup().addTo(map)
    mapRef.current = map

    // The sidebar becomes full width on narrow screens, so the map must follow its box.
    const ro = new ResizeObserver(() => map.invalidateSize())
    ro.observe(el)
    return () => {
      ro.disconnect()
      map.remove()
      mapRef.current = null
      markerRef.current = null
      baseRef.current = null
      ndviRef.current = null
      refsRef.current = null
    }
  }, [])

  // Keep the marker on the selected point, and bring it into view if it is off screen.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !validPoint(lat, lon)) return
    markerRef.current?.setLatLng([lat, lon])
    if (!map.getBounds().contains([lat, lon])) map.setView([lat, lon], Math.max(map.getZoom(), 6))
  }, [lat, lon])

  // Base imagery.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    baseRef.current?.remove()
    setTileProblem(false)
    const layer =
      base === 'bluemarble'
        ? L.tileLayer(BLUE_MARBLE_URL, { maxNativeZoom: 8, maxZoom: 12, noWrap: true, attribution: ATTRIBUTION + ', Blue Marble' })
        : L.tileLayer(modisUrl(modisDate), { maxNativeZoom: 9, maxZoom: 12, noWrap: true, attribution: `${ATTRIBUTION}, MODIS Terra true colour ${modisDate}` })
    let failed = 0
    layer.on('tileerror', () => {
      failed += 1
      if (failed >= 3) setTileProblem(true)
    })
    layer.on('tileload', () => {
      failed = 0
      setTileProblem(false)
    })
    layer.addTo(map).bringToBack()
    baseRef.current = layer
  }, [base, modisDate])

  // Vegetation overlay (monthly MODIS NDVI).
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    ndviRef.current?.remove()
    ndviRef.current = null
    if (!ndvi) return
    const layer = L.tileLayer(ndviUrl(month), {
      maxNativeZoom: 7,
      maxZoom: 12,
      noWrap: true,
      opacity: 0.7,
      zIndex: 2, // above the base imagery, below borders and names
      attribution: `MODIS Terra NDVI, month starting ${month}`,
    }).addTo(map)
    ndviRef.current = layer
  }, [ndvi, month])

  // Borders, coastlines and place names so people can find their farm.
  useEffect(() => {
    const group = refsRef.current
    if (!group) return
    group.clearLayers()
    if (!labels) return
    group.addLayer(L.tileLayer(FEATURES_URL, { maxNativeZoom: 9, maxZoom: 12, noWrap: true, opacity: 0.8, zIndex: 3 }))
    group.addLayer(L.tileLayer(LABELS_URL, { maxNativeZoom: 9, maxZoom: 12, noWrap: true, zIndex: 4 }))
  }, [labels])

  const hemi = (v: number, pos: string, neg: string) => `${Math.abs(v).toFixed(2)}° ${v >= 0 ? pos : neg}`

  return (
    <div className="map-picker">
      <div
        ref={containerRef}
        className="map-box"
        role="region"
        aria-label="Satellite map. Click or tap to choose your farm. Keyboard users can type latitude and longitude in the fields above instead."
      />
      <p className="map-status" role="status" aria-live="polite">
        {validPoint(lat, lon)
          ? `Selected point: ${hemi(lat, 'N', 'S')}, ${hemi(lon, 'E', 'W')}`
          : 'Selected point is outside the map (the map covers latitudes -85 to 85).'}
      </p>
      {tileProblem && (
        <p className="map-warn" role="status">
          No image tiles came back for this view. For the daily layer this can be a date with no data
          (try another date) or a connection problem; the static Blue Marble layer is always available.
        </p>
      )}

      <fieldset className="map-layers">
        <legend>Map layers</legend>
        <label className="check">
          <input type="radio" name={`${uid}-base`} checked={base === 'bluemarble'} onChange={() => setBase('bluemarble')} />
          Blue Marble (static, cloud free)
        </label>
        <label className="check">
          <input type="radio" name={`${uid}-base`} checked={base === 'modis'} onChange={() => setBase('modis')} />
          Daily true colour (MODIS Terra)
        </label>
        {base === 'modis' && (
          <label>
            Date
            <input
              type="date"
              value={modisDate}
              min={MODIS_FIRST_DATE}
              max={maxDate}
              onChange={(e) => {
                if (e.target.value) setModisDate(e.target.value)
              }}
            />
            <small className="muted">Clouds hide the ground on many days, especially in the tropics. Try a few dates.</small>
          </label>
        )}
        <label className="check">
          <input type="checkbox" checked={labels} onChange={(e) => setLabels(e.target.checked)} />
          Borders and place names
        </label>
        <label className="check">
          <input type="checkbox" checked={ndvi} onChange={(e) => setNdvi(e.target.checked)} />
          Vegetation greenness (NDVI, month of {month.slice(0, 7)})
        </label>
      </fieldset>

      <p className="map-credit muted">
        We acknowledge the use of imagery provided by services from NASA’s Global Imagery Browse Services
        (GIBS), part of NASA’s Earth Science Data and Information System (ESDIS). The map only picks a point:
        climate numbers come from NASA POWER, whose grid cells are about 50 km wide, and imagery is at best
        about 250 m per pixel, too coarse to see single fields.
      </p>
    </div>
  )
}
