# Crop Rotation Explorer (NASA Space Apps 2026, Kuala Lumpur, virtual)

Challenge: **Field Shift: Adapting Farms with NASA Data**.
A decision-support web app: pick a farm location, say what you grow and what matters to you,
and compare **four rotation strategies** (your current one plus three alternatives) using
20 years of NASA POWER daily climate data. Every score comes with evidence, benefits, risks
and information gaps. It supports farmers; it does not replace local expertise.

Licence: **Apache License 2.0** (`LICENSE`), an OSI-approved open-source licence. Every source, dataset and package used is listed in
[`REFERENCES.md`](REFERENCES.md). Independent entry: not affiliated with, endorsed by or sponsored by NASA; no NASA logos are used.

## Judges: start here (60 seconds)

1. Open **https://crop-rotation-explorer.pahang-risk-nav.workers.dev**. No login, no install. (To skip straight to results: add `?p=kedah` to the address.)
2. **Your farm:** pick a place (Kedah, Cameron Highlands, Iowa, or your own coordinates), then either chat with the optional AI assistant or fill in the form, then press "See my results".
3. **Summary:** four crop rotations ranked on a 0-100 scale, with a "how stable is this ranking?" check. **Rotations:** the evidence, benefits, risks and information gaps behind every score.
4. **Satellite:** NASA MODIS, Landsat, SMAP and NASADEM evidence for the demo sites (shown beside the scores, not used in them). **Data & share:** which NASA data does what, "How we checked it", and "Intended use and limits".
5. **What is NASA's here:** NASA POWER daily climate (2005-2024) drives every score; the satellite layers and GPM IMERG rainfall check are evidence. Full list with licences: [`REFERENCES.md`](REFERENCES.md).
6. **What it is not:** not a yield, loss or price forecast; not validated against farm outcomes; not tested with farmers yet. Those limits are on the page and in "Production readiness" below.

Reproduce it: `npm install`, `npm run verify` (build, 230+ tests, lint) and `npm run smoke` (checks a deployed copy: headers, assets, assistant route). The headline scores quoted in the
submission are pinned by `src/lib/golden.test.ts`.

**How the app is organised.** *First page, "Your farm":* choose the place (required), then describe the farm either by chatting with the optional AI
assistant or by filling in the form. *Second page, the results:* Summary, Climate, Satellite, Rotations, and Data & share. The results stay locked until a
place has been chosen, and "Your farm" in the menu goes back to change anything.

## Run it

```bash
npm install
cp .env.example .env.local   # optional
npm run dev                  # http://localhost:5173
npm test                     # engine tests (use real NASA POWER data as a fixture)
npm run build && npm run lint
```

NASA POWER needs no API key. Data is cached in the browser (`localStorage`) per location.

## How it works

1. `src/lib/power.ts`: loads NASA POWER daily point data (a bundled copy for the three demo sites, `src/data/power/*.json`, made by `scripts/fetch-power.mjs`; the live API for any other point; (T2M, T2M_MAX, T2M_MIN,
   PRECTOTCORR, GWETROOT, EVPTRNS) for 2005-2024, with retry (POWER resets connections when busy).
2. `src/lib/climate.ts`: monthly climatology, yearly stats, linear trends with significance,
   what-if scenario (temperature offset, rainfall %), and per-season windows.
3. `src/data/crops.ts`: 16 crops with temperature range, cold/heat limits, water need,
   drought/waterlog tolerance, nitrogen fixing, cover, organic matter, rooting, relative market value.
4. `src/lib/rotation.ts`: scores every crop in every season for every past year
   (temperature fit, cold/heat stress days, rain + stored soil moisture vs need), then scores
   3-crop rotations on climate fit, reliability, water demand, soil health (family repeats,
   legume after cereal, bare fallow), income. Builds the 4 strategies.
5. `src/lib/explain.ts`: plain-language why / evidence (real numbers) / benefits / risks / gaps.
6. `src/components`: controls, climate chart (SVG), strategy cards.

Modes: **3 seasons per year** (tropics) or **1 crop per year over 3 years** (temperate).
"I can irrigate" assumes crop water need is met; water demand is still scored against rainfall.

## Known limits (state these in the submission)

- Crop table: temperature bands and seasonal water needs are backed by FAO tables for most crops (see below);
  cold/heat-stress limits, drought and waterlog tolerance, soil-benefit ratings and market value are general
  agronomy knowledge, NOT sourced. Water need is now computed from local temperature for 13 crops (see "Water need" below); clover and the cover-crop mix keep an unverified fixed value. Temperature bands still not checked:
  cabbage, sunflower (temperature); clover, cover-crop mix (everything). The app lists these per rotation.
- Fixed 4-month seasons: some crops run longer (soybean, groundnut, cassava, long maize). The app flags this.
- Soil is a manual input (texture, drainage, organic matter; default "not specified" = no effect), optionally filled from ISRIC SoilGrids. Only the water-holding numbers come from a published table (FAO-56 Table 19); the sizes of every other soil rule are UNVERIFIED judgement (see "Soil inputs"). No soil survey, market prices, labour or equipment data. "Income" is only a rough relative value.
- NASA POWER is ~50 km gridded model data. Temperature is corrected for elevation only if you enter the field
  elevation (6.5 C per 1000 m); rainfall is never corrected. Satellite-era rainfall trends need care.
- Satellite vegetation (MODIS NDVI) is bundled only for Kedah and Iowa, where MODIS land cover confirms the pixel is cropland. It describes what is growing at one 250 m pixel, is not used to score rotations, and has no layer for Cameron Highlands (its farms are too fragmented for MODIS pixels).
- SMAP soil moisture is bundled for Kedah only, for 2024 only, as descriptive evidence (see "SMAP soil moisture"); it is not used to score rotations. ECOSTRESS is not integrated: it needs a free NASA Earthdata login and heavy processing, which a no-login browser app cannot do.
- Landsat 30 m NDVI is bundled only for Kedah and Iowa (one pixel each, 2022-2025, 12-44 clear dates a year after cloud masking, depending on site and year). Cameron Highlands has none: ESA WorldCover maps the preset as built-up and finds almost no cropland nearby (see "Landsat NDVI and NASADEM" below). The pixel is not your field, it is evidence only, and it is not used to score rotations. NASADEM elevation and slope are bundled for all three demo locations; they are not used for the temperature correction (that still uses the elevation you type in). Slope from 30 m radar data is noisy on flat ground.
- MODIS evapotranspiration, land-surface temperature, leaf area and growing-season dates are bundled only for Kedah and Iowa, are shown as descriptive evidence, and are not used to score rotations. The cloud-quality (QC) bands were not applied, land-surface temperature has no value under cloud (Kedah has valid daytime values for only 94 of 183 composites), and nothing was checked against ground data (see "MODIS evapotranspiration, surface temperature, leaf area and growing-season dates").
- Scores rank options; they do not predict yield.

## Water need (climate-based)

A crop's seasonal water need is no longer a fixed number. For the 13 crops with an FAO-56 crop coefficient it is
computed from local temperature:

    need (mm) = sum over the crop's days of  Kc(day) x ET0(day)

- **ET0** (reference evapotranspiration): Hargreaves equation, FAO-56 Eq. 52, from daily temperature and
  extraterrestrial radiation (FAO-56 Eq. 21-25), latitude taken from the NASA POWER response. `src/lib/water.ts`.
  Checked against FAO-56's own worked Example 8 (Ra = 32.2 MJ/m2/day at 20 S on 3 September).
- **Kc**: FAO-56 Tables 11 and 12 (stage lengths and coefficients), Eq. 66 linear interpolation. Choices where the
  tables give ranges or several rows are listed at the top of `src/data/crops.ts`. Pinned by tests.
- The crop is assumed planted on the first day of its season window; only rain on its own days counts; a cycle longer
  than the 4-month window is cut off at the window. A hotter scenario now raises the water a crop needs.
- Clover and the cover-crop mix have no usable FAO-56 row and keep the fixed table need (unverified).

**Cross-check (14 Nov 2026, scratch script, not in the repo).** FAO says Eq. 52 should be verified per region. We compared
our daily Hargreaves ET0 with MODIS MOD16A2 potential evapotranspiration (`PET_500m`, 8-day) for 2023:

| Site | Year total: ours / MODIS | Growing season | Correlation of 8-day values |
|---|---|---|---|
| Kedah (6.25 N, 100.35 E) | 1273 / 1751 mm (ratio 0.73) | Jan-Apr 0.70, May-Aug 0.71 | r = 0.94 |
| Iowa (41.95 N, 93.55 W) | 1083 / 1257 mm (ratio 0.86) | Jun-Sep 0.90 | r = 0.98 |

Our estimate follows the satellite's seasonal pattern closely but runs lower, about 25% in humid Kedah and 10% in Iowa's
growing season, so computed needs are probably somewhat low. MODIS PET is potential evapotranspiration of the local land
cover, not FAO's grass reference, so this is a plausibility check, not a calibration; we did not rescale.

**Iowa result (what this fixed and what it did not).** With the old fixed 650 mm, rainfed maize in Iowa scored 0.64 climate
fit and ranked below sorghum. With the climate-based need (maize 485 mm vs 403 mm of Jun-Sep rain) it scores 0.73;
sunflower rose from 0.73 to 0.82 because its fixed 800 mm was far too high for Iowa. Sorghum is still slightly ahead
(0.79 vs 0.73). Cause: the model still barely credits water stored in the soil from spring. FAO reports measured yield
response factors (Ky: maize 1.25, soybean 0.85, sunflower 0.95, groundnut 0.70, potato 1.10, wheat 1.00; FAO Water
Reports 22, Table 2) that make maize at least as water-sensitive as our subjective rating, so the gap is on the supply
side. A proper fix needs root depth and allowable depletion (FAO-56 Table 22) with soil water-holding capacity; not done.
Treat Iowa as a stress test, not a headline result.

## Rainfall cross-check (NASA POWER vs GPM IMERG)

The app's rainfall comes from NASA POWER (PRECTOTCORR, about 50 km cells). On 14 Nov 2026 we compared it with NASA GPM IMERG
Final daily precipitation (`GPM_3IMERGDF_07`, 0.1 degree, downloaded from Giovanni as area-averaged time series, 2015-2024,
3653 days, no missing values) for the same sites. Each IMERG file is an average over a 0.5 degree box around the preset point
(the file header's "User Bounding Box" line records it). This is a comparison of two satellite/model products, not of either
against rain gauges.

| Site | POWER / IMERG, mean annual | Ratio | Daily r | Monthly-total r | Annual-total r | Rain days per year (>= 1 mm) |
|---|---|---|---|---|---|---|
| Kedah (6.25 N, 100.35 E; box 100.10,6.00,100.60,6.50) | 2417 / 2464 mm | 0.98 | 0.66 | 0.85 | 0.87 | 255 / 236 |
| Iowa (41.95 N, 93.55 W; box -93.80,41.70,-93.30,42.20) | 821 / 990 mm | 0.83 | 0.74 | 0.96 | 0.99 | 103 / 96 |

- **Kedah:** the long-run totals agree (2%), but individual years differ by up to about 25% (2015: 1884 vs 2352 mm; 2020: 2850 vs 2466 mm)
  and the seasons differ: POWER is wetter in Nov-Dec (441 vs 322 mm in Nov, 275 vs 178 mm in Dec) and drier in Mar-May (e.g. Mar 61 vs 106 mm).
- **Iowa:** the two products follow each other very closely year to year (r = 0.99) but POWER is about 17% lower, in every year (2020: 664 vs 839 mm)
  and in almost every month. For Jun-Sep, the window the app uses for Iowa, the 2015-2024 means are about 384 mm (POWER) vs 453 mm (IMERG).
- **What this means for the app:** rainfall supply is uncertain by roughly +-15-20% depending on the product, and the rainfed Iowa scores (where
  rain is only just below the crop need) are sensitive to it. Which product is closer to the truth was not tested; that needs station data
  (for example NOAA records for Iowa).
- **In the app:** a one-line version appears in "Information gaps" for the Kedah and Iowa demo sites only (`src/data/rainfallCheck.ts`;
  a test keeps the wording and the numbers in step). Cameron Highlands and custom locations show no such note.
- **Limits:** a 0.5 degree box average is compared with one POWER grid cell, so some of the difference is the area. The IMERG file for Cameron
  Highlands was not provided, so there is no comparison there. IMERG was not used in any score.

## SMAP soil moisture (Kedah, 2024 only; evidence, not scored)

NASA's SMAP soil moisture is the first dataset named in the Field Shift resources. The app shows **one year (2024) for the Kedah demo site only**,
as a month-by-month chart under the MODIS panel. It is descriptive evidence: it is **not** used in any score. Iowa and Cameron Highlands show
"not bundled".

- **Route that works:** NASA Earthdata Search (free Earthdata login), collection SPL3SMP_E V006 (SMAP Enhanced L3 radiometer, daily, 9 km),
  using the Harmony "Customize" options: spatial box 100.10,6.00,100.60,6.50 (Kedah), variable groups Soil_Moisture_Retrieval_Data_AM and _PM
  (100 variables), output NetCDF-4, no reprojection, 1 Jan - 31 Dec 2024. The public ORNL MODIS service lists SMAP but returned "no data"
  at five test points, so it is not a route. The NSIDC page's "Download Script" would fetch the untrimmed global files (about 630 MB each,
  about 880 GB for 2022-2025) and must not be used.
- **Size:** 366 files (one per day, none missing, all valid HDF5), 244 MB trimmed; bundled as `src/data/smap/kedah.json` (about 10 KB, one row per day).
- **How it was turned into numbers:** `scripts/extract-smap.mjs` (needs `npm install --no-save h5wasm`, NIST's HDF5 reader, not an app dependency).
  Per file there is an AM and a PM group, each 8 x 6 cells of 9 km. A cell counts when `soil_moisture` is inside the product's documented valid
  range 0.02-0.5 cm3/cm3 (fill -9999) **and** bit 0 of `retrieval_qual_flag` ("retrieval recommended") is set. The set-bit-means-true reading
  comes from the file's flag description and from the data (99% of in-range cells have it set); it was not validated against anything else.
  AM and PM cells are pooled into one box mean per day; a month is the mean of its daily means and is drawn only with at least 3 such days.
- **What 2024 shows for the Kedah box:** a usable value on 137 of 366 days (about every second or third day, never all 48 cells). Monthly means run
  from 0.17 (March) and 0.19 (February) to 0.41-0.43 in May, June, October and November. 1,499 cells (4.3% of 35,136) were above 0.5, mostly in
  May, June, October and November, and are excluded, so those months are probably biased low. The monthly shape agrees with GPM IMERG rain over
  the same box: monthly SMAP against same-month rain r = 0.55, against the previous month's rain r = 0.75 (12 points, so only a sanity check).
- **Not done / not checked:** one year only (not a climate); not checked against ground sensors; very high values over flooded paddy may be
  unreliable; Cameron Highlands and Iowa not ordered; the bundled file does not feed the rotation scores.

## Verification log

- FAO Training Manual 3 (irrigation water needs), ch. 2, Tables 4-5: growing periods and seasonal water needs for
  rice, maize, sorghum, wheat, soybean, groundnut, potato, cabbage, sunflower. We use range midpoints (rice: top).
  https://www.fao.org/4/s2022e/s2022e02.htm
- FAO agro-ecological assessment (Kenya case study), Technical Annex 4, Tables A4.1-A4.2: temperature regimes and
  S1 (highly suitable) thermal-zone ratings; zone definitions in https://www.fao.org/4/t0741e/T0741E06.htm
  (zone 1 is printed "<25.0", an apparent typo for ">25"). https://www.fao.org/4/t0742e/T0742E11.htm
- FAO EcoCrop was retired (now inside GAEZ), so it could not be used.
- Elevation check: POWER grid cell for Cameron Highlands is 592.7 m; Tanah Rata is ~1,440 m
  (https://en.wikipedia.org/wiki/Tanah_Rata). Raw mean annual temperature 23.6 C; corrected 18.1 C vs ~17.9 C observed
  long-term in a Cameron Highlands weather summary (https://reach.org.my/?p=5627).
- src/data/crops.test.ts pins every sourced number to its published range.

## Satellite data (MODIS NDVI)

- Product: MOD13Q1 (MODIS/Terra Vegetation Indices, 16-day, 250 m), band `250m_16_days_NDVI`, from the public
  ORNL DAAC MODIS web service (no login): https://modis.ornl.gov/rst/api/v1
- The service allows 10 dates per request and takes 20-60 s per request (one 502 seen), so it is NOT called live.
  `node scripts/fetch-ndvi.mjs <id> <lat> <lon> <startYear> <endYear>` fetches it once (sequentially, with retries)
  into `src/data/ndvi/<id>.json`. Bundled: kedah and iowa, 2022-2025 (92 composites each, downloaded 14 Nov 2026).
- Pixels were chosen with MODIS land cover (MCD12Q1, IGBP class 12 = cropland). Rejected: 42.03N -93.60E (class 13, urban);
  eight points around Cameron Highlands (classes 2, 8, 9, 10: forest, savanna, grassland).
- NDVI interpretation (NASA Earth Observatory, Measuring Vegetation): about 0.1 or less barren, 0.2-0.3 shrub/grass,
  0.6-0.8 dense forest. The app treats below 0.3 as sparse/bare and 0.6 or more as dense: rough rules of thumb.
  https://earthobservatory.nasa.gov/features/MeasuringVegetation
- Observed: Kedah shows two greenness peaks (Jan-Feb, Jul-Aug) with sparse stretches (Apr-Jun, Oct-Nov), consistent with
  double-cropped paddy; Iowa shows one summer peak (Jun-Aug, NDVI 0.74-0.86) and bare ground Oct-Apr.

## MODIS evapotranspiration, surface temperature, leaf area and growing-season dates

Added 14 Nov 2026. Code: `scripts/fetch-modis.mjs` (download once), `src/data/modis/<id>.json` (kedah, iowa), loaders and
summaries in `src/lib/satellite.ts`, panel `src/components/ModisPanel.tsx` (+ `ModisMonthlyChart.tsx`, `PhenologyChart.tsx`),
tests `src/lib/modis.test.ts`. The panel is **descriptive evidence only; none of it feeds the rotation scores** (we could not
justify a scoring rule: modelled ET of a mixed 463 m pixel is not a crop's water need, and surface temperature is not air
temperature).

- Access: the same public ORNL DAAC MODIS web service as the NDVI (https://modis.ornl.gov/rst/api/v1, no login). 10 dates per
  request. Measured today: 3-5 s per request at first, then 11-60 s with some HTTP 502/503; the script retries with back-off.
  `node scripts/fetch-modis.mjs <id> <lat> <lon> 2021 2025 --cache <dir>` (`--cache` keeps raw responses so an interrupted run
  resumes; `--concurrency N` up to 4 and the opt-in `--pet` and `--qc` exist). Default is fully sequential. Our run used
  `--concurrency 3` for both sites, started in parallel (so up to 6 requests in flight), after a test showed 3 simultaneous requests
  finished in about the time of one. About 120 requests per site.
- Bands, scale factors, valid ranges and fill values were read from each product's `/bands` endpoint and are applied in the script:
  MOD16A2 `ET_500m` (kg/m2/8day, scale 0.1, valid up to 32700, fill 32767; values above 32700 are the documented non-vegetated codes),
  MOD11A2 `LST_Day_1km` and `LST_Night_1km` (Kelvin, scale 0.02, valid 7500-65535, fill 0; we convert to deg C), MCD15A2H `Lai_500m`
  (scale 0.1, valid 0-100, fill 255), MCD12Q2 dates (`days since 1-1-1970`, valid 11138-32766, fill 32767). MOD16A2 exists only from
  2021, so ET is 2021-2025 (230 composites) and land-surface temperature and leaf area are 2022-2025 (183 and 182 composites, matching
  the NDVI years). Yearly phenology layers 2018-2025 and MCD12Q1 land cover 2021-2025 (cropland, class 12, at both pixels every year).
- Units: ET is per 8-day composite; the app divides by the days the composite covers (8, or 5/6 for the last composite of a year) to get
  mm per day, and month = the month of the composite's middle day. The "about N mm over 4 months" lines are mean mm/day x 122 days.
- Pixel sizes reported by the service: 463 m for ET, leaf area and phenology, 927 m for land-surface temperature (so the temperature pixel is
  larger than the cropland pixel verified for NDVI; land cover was checked at 500 m only).
- What was observed (not validated):
  - Kedah, ET monthly mean 1.8-3.6 mm/day (lowest Mar, highest Jan); 2023 total 953 mm. Iowa, ET peaks in summer; Jun-Sep averages 3.2 mm/day, about
    394 mm (the climate-based maize need above is 485 mm; MODIS ET is a modelled value for the whole mixed pixel, so these two are not directly comparable).
  - Leaf area: Kedah monthly 0.1-1.9 with two peaks (Jan-Feb, Aug), Iowa one summer peak (up to 5.9 in single composites).
  - Growing seasons (MCD12Q2): Kedah has two cycles in 7 of 8 layers, median greenup 3 Dec to dormancy 1 Apr (110 days) and 23 Jun to 22 Oct
    (120 days), consistent with the two NDVI peaks above. Iowa has one cycle in all 8 layers, 19 May to 11 Oct (median 144 days). These are
    when the satellite sees green-up, not planting or harvest dates. Kedah's 2020 second cycle runs on to 22 Feb 2021 (a 275-day season, mid-greendown
    dated 7 Feb 2021); we show it as delivered and do not know whether it is real.
  - Land-surface temperature: Kedah valid daytime values in 94 of 183 composites and night in 73 (cloud), Iowa 169 and 177. Months with fewer than 4
    valid composites over all years are left blank in the chart (Kedah: 2 daytime months, 4 night months); the shown months are clear-sky days only. For the season lines a season-year
    counts with only 25% of its composites valid, and the number of composites used is printed.
- Not done / not verified: the QC bands were not downloaded for the shipped files (the script can, with `--qc`), so cloud-contaminated or
  back-up-algorithm values are not removed; the LAADS file specifications give the bit layouts for MOD16A2 `ET_QC_500m`, MOD11A2 `QC_Day`/`QC_Night`
  and MOD15A2H `FparLai_QC` (https://ladsweb.modaps.eosdis.nasa.gov/filespec/MODIS/61/MOD16A2_c61 , .../MOD11A2 , .../MOD15A2H; the MOD15A2H
  page was read for MCD15A2H, which is an inference), but the MCD12Q2 `QA_Overall` codes and the layer-year convention of MCD12Q2 were not found in a
  readable official source: the chart shows dates as delivered. The "days since 1-1-1970" unit comes from the service's `/bands` output, and
  the dates agree with the NDVI peaks. No ground data (flux towers, field phenology) was used. PET was not bundled (an earlier scratch cross-check
  used it). SMAP, ECOSTRESS and GEDI returned "no data" from this service at our points and are skipped here (SMAP was obtained through Earthdata Search instead, see "SMAP soil moisture").

## Landsat NDVI and NASADEM (Microsoft Planetary Computer)

Added 14 Nov 2026. Everything below was measured, not assumed.

- Access: Microsoft Planetary Computer public STAC API, https://planetarycomputer.microsoft.com/api/stac/v1 (collections
  `landsat-c2-l2`, `nasadem`, `esa-worldcover`). No account. The anonymous data API
  (`/api/data/v1/item/point/{lon},{lat}`) signs the file reads server-side, so no SAS token is needed in our code (the
  anonymous token endpoint also answers, but we do not use it). Measured: ~0.65 s per scene; Kedah 188 scenes in 33 s,
  Iowa 300 scenes in 45 s, Cameron elevation in 5 s. It rate-limited (HTTP 429) once when the script scanned hundreds of
  WorldCover points in a row, so the script honours Retry-After and backs off. Run once; the app reads bundled JSON only.
  `node scripts/fetch-landsat.mjs <id> <lat> <lon> 2022 2025` writes `src/data/landsat/<id>.json` and
  `src/data/elevation/<id>.json`. Options: `--radius <m>`, `--exact`, `--elevation-only`.
- Landsat: Collection 2 Level-2 surface reflectance, Landsat 7, 8 and 9, Tier 1 scenes, 2022-2025. NDVI = (NIR - Red) /
  (NIR + Red) with reflectance = DN x 0.0000275 - 0.2 (the scale and offset every scene declares; the script skips a scene
  that declares anything else). A scene is dropped at the pixel if QA_PIXEL flags fill, dilated cloud, cirrus, cloud, cloud
  shadow or snow, or high confidence of cloud, shadow or cirrus. Result: Kedah 72 clear dates of 188 scenes (3 no data,
  113 masked); Iowa 142 clear dates of 300 scenes (145 clear observations, 3 same-day pairs averaged; 9 no data, 145 masked,
  1 reflectance outside 0-1). Landsat 7 is included (13 of Kedah's and 14 of Iowa's clear observations); 3 of its Kedah scenes had no data at the pixel, which may be its known scan-line gaps (not checked).
- Pixel choice (ESA WorldCover 10 m v200/v100, CC BY 4.0, class 40 = cropland): a 30 m pixel can sit on a road or town, so the
  script picks the nearest point whose 5x5 neighbourhood (40 m square) is cropland in WorldCover 2021 and whose centre is
  cropland in 2020. Kedah: 28 m from the preset. Iowa: 102 m (the preset centre itself is "grassland" in 2021, "cropland"
  in 2020).
- Cross-check against the bundled MODIS NDVI at the same place (MODIS linearly interpolated to each Landsat date, only
  between composites at most 20 days apart): Kedah r = 0.88 (n = 72, Landsat mean 0.37, MODIS 0.47); Iowa r = 0.91
  (n = 142, 0.45 vs 0.49). Landsat shows lower values and deeper dips (NDVI below 0, down to -0.18 at Kedah, probably flooded or
  very wet fields; not verified) that the 250 m MODIS pixel probably averages away. This is agreement between two satellites, not validation against ground data.
  The app computes and shows this check live from the bundled files; `src/lib/landsat.test.ts` pins r > 0.8.
- Cameron Highlands: NO Landsat series. WorldCover 2021 and 2020 both map the preset centre as built-up. A 31 x 31 grid
  at 200 m spacing out to 3 km found 758 tree cover, 151 grassland, 46 built-up, 3 bare and 3 cropland samples; a 40 m
  scan out to 8 km found 231 cropland cells out of 160,000, and the two nearest patches seen at 10 m are a few to about ten pixels
  wide. The script found no cropland pixel with a cropland 5x5 neighbourhood within 2 km. A 30 m NDVI series there would
  describe town or forest. Tea and vegetable plots (and plastic greenhouses) are not resolved. If the team has a verified
  farm coordinate, run the script with `--exact` and add it.
- NASADEM (NASA JPL, SRTM-derived, 1 arc-second): elevation and Horn (1981) slope at the exact preset point, from the 3x3
  pixels around it (slope at 30 m, and at 90 m using pixels 3 apart). Elevation: Cameron 1,435 m (3x3 range 1,427-1,437;
  matches Tanah Rata at ~1,440 m in the elevation check above), Iowa 262 m, Kedah -2 m. Slope 30 m / 90 m: Cameron 5.6 /
  5.2 degrees, Iowa 1.2 / 0.8, Kedah 2.6 / 0.6. Kedah's elevation varies only -2 to 1 m across the 3x3 pixels, so its
  2.6 degree 30 m slope is most likely radar noise on flat ground (our interpretation, not verified). The vertical accuracy
  and datum were not checked here; the data is a radar surface height and can include trees and buildings.
- Not verified: no ground truth for any of this (no field NDVI or survey elevation); Landsat 7 vs 8/9 band-to-band
  differences are not harmonised; WorldCover accuracy at 10 m in small plots was not assessed. Nothing here feeds the
  rotation scores.
- Landsat DOIs, from the STAC items: Landsat 8 10.5066/P9OGBGM6, Landsat 7 10.5066/P9C7I13B (Landsat 9 not checked).

## Map picker (NASA GIBS)

- `src/components/MapPicker.tsx` (Leaflet, lazy-loaded when "Pick my farm on a satellite map" is opened). A click sets
  latitude/longitude (rounded to 0.01) and runs the same flow as "Enter my own coordinates" + "Load data". The numeric
  fields and presets still work and are the keyboard route; the marker follows them. Picking a new point clears the
  elevation field (it belonged to the previous location).
- Tiles come from GIBS WMTS, `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/` (no login, `Access-Control-Allow-Origin: *`).
  Checked with curl on 14 Nov 2026, same tile at different dates gave different images (different MD5), so the time
  parameter really is used: `MODIS_Terra_CorrectedReflectance_TrueColor` (daily, from 2000-02-24, matrix set
  `GoogleMapsCompatible_Level9`, max zoom 9) and `MODIS_Terra_L3_NDVI_Monthly` (Level7, max zoom 7; the app asks for the
  first day of the month two months back). Static, no time: `BlueMarble_NextGeneration` (Level8), `Reference_Features`
  and `Reference_Labels` (Level9). One zoom level beyond a layer's matrix set returns HTTP 400, so Leaflet enlarges the
  last level instead.
- Limits: imagery is at best ~250 m per pixel and daily tropical scenes are often cloudy; the NDVI overlay is a coarse
  monthly composite for looking at greenness only and is not used in scoring. Climate still comes from the ~50 km NASA POWER cell.
- Credit shown in the app: NASA Global Imagery Browse Services (GIBS), part of ESDIS.

## Soil inputs (manual, optional)

Code: `src/data/soils.ts` (every rule with effect, reasoning, source and evidence status; shown in the app under
"Your soil"), `src/lib/soil.ts` (rules applied), `src/lib/soilgrids.ts` (optional fill), tests in `src/lib/soil.test.ts`.
"Not specified" = no effect; moderate drainage and medium organic matter are also neutral.

| Rule | What it does | Status |
|---|---|---|
| Texture -> stored moisture | Rain-fed only: the engine's stored-moisture allowance x available water relative to loam (sand 0.52, loam 1, clay 1.03) | Inputs FAO-56 Table 19 (sand 0.05-0.11, loam 0.13-0.18, clay 0.12-0.20 m3/m3, midpoints); using the ratio is our assumption |
| Drainage -> stored moisture | x1.10 poor, x1.00 moderate, x0.90 good | UNVERIFIED |
| Waterlogging | Waterlog-sensitive crops: penalty starts at rain 1.5x need (poor), 2x (default), 2.5x (good); steepness x1.5 / 1 / 0.7, and x1.2 clay, x0.8 sandy | UNVERIFIED |
| Erosion | Weight of ground cover and bare-fallow penalty x1.15 loam, x1 sandy, x0.9 clay | UNVERIFIED (NRCS only supports "texture matters") |
| Organic matter | Weight of crops' OM contribution 0.4 low, 0.3 medium, 0.2 high | UNVERIFIED |

- FAO-56 = FAO Irrigation and Drainage Paper 56, ch. 7, Table 19: https://www.fao.org/4/x0490e/x0490e0c.htm (FAO notes the page is OCR-scanned).
- Looked for and NOT found: percolation losses of paddy rice by soil type in FAO Training Manual 3 ch. 2 (not discussed there), and a
  verified texture-to-erodibility table. So there is no rule that raises rice water need on sandy soil.
- ISRIC SoilGrids v2.0 (https://rest.isric.org/soilgrids/v2.0/docs) is NOT a NASA source and the REST service is beta. Optional "Fill from SoilGrids"
  button: clay/sand/silt and organic carbon averaged over 0-30 cm -> texture (clay >= 40% clay; sand >= 50% and clay < 20% sandy; else loam) and
  organic matter (carbon < 10 g/kg low, > 20 g/kg high; thresholds UNVERIFIED). It never fills drainage. 20 s timeout, one attempt, cached in `localStorage`.
- Reliability test, 14 Nov 2026 (`node scripts/probe-soilgrids.mjs 4`, plus a browser run): 15 of 15 script requests (5 rounds x 3 points) returned HTTP 200 with identical values each
  round, 2-11 s each, CORS open. One later request in the browser exceeded 20 s and timed out (the app shows a message and keeps manual input).
  The exact Cameron Highlands point (4.47, 101.38) returns null for every layer (no modelled value there; 4.50,101.40 and 4.47,101.45 have data), so the
  button reports "no modelled value" there. Kedah: clay 36%, sand 29%, silt 35%, carbon 33 g/kg -> loam, high. Iowa: clay 30%, sand 31%, carbon 18 g/kg -> loam, medium.
  Real responses are stored as test fixtures in `src/lib/__fixtures__/soilgrids-*.json`. SoilGrids is a 250 m model, not a measurement of the field.

## Data sources (for References)

The complete, current list (including SMAP, GPM IMERG, software and licences) is in [`REFERENCES.md`](REFERENCES.md). The list below is the detailed trail.

- NASA POWER, NASA Langley Research Center: https://power.larc.nasa.gov/
- MODIS MOD13Q1 NDVI and MCD12Q1 land cover (NASA LP DAAC products), served by the ORNL DAAC MODIS web service: https://modis.ornl.gov/
- MODIS MOD16A2 evapotranspiration, MOD11A2 land-surface temperature, MCD15A2H leaf area index and MCD12Q2 land-cover dynamics (growing-season dates) (NASA LP DAAC), same service, downloaded 14 Nov 2026: https://lpdaac.usgs.gov/ ; band lists https://modis.ornl.gov/rst/api/v1/MOD16A2/bands
- Landsat Collection 2 Level-2 surface reflectance (USGS/NASA Landsat 7, 8, 9) and NASADEM_HGT v001 (NASA JPL), read through the Microsoft Planetary Computer STAC API on 14 Nov 2026: https://planetarycomputer.microsoft.com/ ; USGS data policy https://www.usgs.gov/core-science-systems/hdds/data-policy ; NASADEM https://earthdata.nasa.gov/esds/competitive-programs/measures/nasadem
- ESA WorldCover 10 m 2020 v100 / 2021 v200 (CC BY 4.0, used only to choose a cropland pixel): https://esa-worldcover.org/
- FAO sources listed in the verification log above.
- ISRIC SoilGrids v2.0 (non-NASA, beta, optional soil fill): https://www.isric.org/explore/soilgrids  |  FAO-56 Table 19 (soil water): https://www.fao.org/4/x0490e/x0490e0c.htm
- NASA Global Imagery Browse Services (GIBS), ESDIS: https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api (map base imagery, see "Map picker").

## AI assistant (optional "Ask AI", Groq)

A chat that asks short questions and proposes values for the same setup form a person can fill in by hand. The location is chosen first on the
start screen and is never changed by the assistant. It does **not** score anything: the scores still come only from NASA POWER data and FAO tables.

- **Flow:** browser -> `POST /api/assist` (Cloudflare Worker, `worker/index.ts`) -> Groq's OpenAI-compatible chat endpoint. Model: `openai/gpt-oss-20b`
  (a Groq production model; open-weight, Apache-2.0), set by the `GROQ_MODEL` variable in `wrangler.jsonc`.
- **The key stays on the server.** It is a Worker secret, never in the repository or the browser:
  `npx wrangler secret put GROQ_API_KEY` (paste the key at the prompt). Until it is set the site shows "not switched on" and everything works by hand.
- **Safety:** same-site requests only; at most 8 requests a minute per visitor (rate-limit binding); body and message length caps; the system prompt is
  built on the server; the model's answer is parsed and checked against a whitelist (`src/lib/assistSchema.ts`) on the server **and** again in the
  browser, so only valid crops, ranges and options can reach the form; nothing is applied until the user presses Apply; message text is not logged.
- **Privacy:** the typed messages and a short summary of the form (never coordinates) go through the Worker to Groq. The page says so next to the chat and in the footer.
- **Tests:** `src/lib/assistSchema.test.ts` and `worker/index.test.ts` (38 tests) cover the whitelist, prompt-injection text, malformed model output,
  upstream errors, rate limiting, origin checks and key leakage, using a mocked model. The full chat flow was also run locally through the real Workers
  runtime against a fake model.
- **Checked live (15 Nov 2026):** three real conversations on the deployed site with `openai/gpt-oss-20b`. The model recorded the rotation, irrigation,
  elevation, soil and priorities, asked the next question, and set "ready"; applying the proposal changed the form and the scores. The system prompt was
  tuned after the first run (the model recorded facts a turn late and gave terse replies). Three conversations is a smoke test, not an evaluation.
- **Malay (checked live, 15 Nov 2026):** a farmer writing in Bahasa Malaysia got Malay replies and the correct values (rice, rice, bare fallow; irrigation; water and soil priorities).
  The first attempt answered in English until a Malay example was added to the instructions. Two short conversations only; the app interface itself is English.
- **Not verified:** how well it copes with other languages beyond that, unusual crops, or long or confused conversations; no farmer has used it; and behaviour under
  Groq's free-tier limits (limits are per organisation and per model; check the Groq console). If Groq is busy the page says so and the manual setup still works.

## Production readiness (an honest review)

What was added on 15 Nov 2026 to move a competition prototype toward a service that could be piloted, **without changing any score**:

- **Reliability:** the three demo sites load from a bundled copy of the NASA POWER record (`src/data/power/`, about 230 KB each), so they open instantly and do not
  depend on the live API (which sometimes resets connections). Custom points still use the live API with retries and a saved copy on the device. Tests check
  every snapshot (7,305 days, no gaps, correct grid elevation) and the app shows which source it used.
- **Uncertainty:** a sensitivity check re-runs the scoring 9 times with the weather record nudged by +/-1 C and +/-10% rain and reports whether the top alternative
  and its lead survive (`src/lib/sensitivity.ts`). It tests our model's sensitivity; it is not a forecast.
- **Transparency:** in-app "How we checked it" (real cross-check numbers and what each check does not show) and "Intended use and limits" (meant for, not meant for,
  known limits, version).
- **Safety nets:** an error boundary replaces a blank screen with a recovery page; the AI assistant has a validated, rate-limited, secret-keyed server route.
- **Security headers** (`public/_headers`): a Content-Security-Policy that allows only this site, NASA POWER, ISRIC SoilGrids and NASA GIBS tiles; no framing;
  `nosniff`; strict referrer policy; camera, microphone and location denied. Checked with the real policy enforced: zero violations while using the map, live data,
  SoilGrids and the assistant route.
- **Accessibility:** checked by script on every page in light and dark mode: every control has a name or label, headings and ids are valid, text contrast passes
  (the hero gradient was darkened to fix small text on phones). This is **not** a full WCAG audit and was not tested with a screen reader.

What is still missing before real production use (so please do not read the above as "production-ready"):

- No comparison with measured yields, field trials or ground-truth weather; no farmer or extension-officer testing; no independent agronomist review.
- Several crop parameters and most soil rules are unsourced judgement; stored soil water is barely modelled; seasons are fixed at four months.
- No local soil, price, labour or equipment data; POWER cells are about 50 km wide.
- No monitoring or alerting, no uptime commitment, no cost control beyond Groq's own limits, no data-retention policy beyond "nothing is stored".
- English only (the AI assistant answers in the user's language but the interface is not translated); no formal privacy policy or terms of service beyond the footer.
- Dependencies on third-party services (NASA POWER for custom points, Groq, ISRIC, GIBS) can change or disappear; model names on Groq are retired from time to time.

## Use of AI (SI) tools (required in the submission)

- Claude (Anthropic) via Claude Code wrote and revised the application code, the scripts in `scripts/`, the automated tests, the wording
  shown in the app, this documentation and drafts of the submission text. This is the acknowledgement of AI-generated **code and data
  processing** that the Space Apps Project Submission Guide asks for; it is repeated in `REFERENCES.md`, in the app footer ("Credits,
  licences and AI use") and in the `ai-assistance` meta tag of `index.html`.
- At run time the app has one optional AI feature, the "Ask AI" assistant (see "AI assistant" above). The numbers in the data files come from NASA
  and FAO sources, processed by the scripts in `scripts/`, not generated by a model, and no model ever calculates or changes a score.
- The Space Apps rules say AI should not be used to come up with the idea for solving the challenge. The team must state truthfully in the
  submission form who proposed the concept and which parts were AI-assisted; this file does not decide that.
- AI-written code and text can contain mistakes. Values that could not be sourced are labelled "unverified".

## Submission checklist (official 2026 Project Submission Guide and Judging & Awards Guide, 13 Nov 2026)

- [ ] Every teammate (at most 6) is registered for the **same** Local Event, not waitlisted, and appears on the Members tab of the team page
- [ ] All required fields on the Project page are filled, in English: name, summary, **demo link**, **final project link**, detailed description, Use of SI, NASA data, references
- [ ] **Demo link = a video of 30 seconds or less, or a slide deck of at most 7 slides** (publicly viewable, no login). Longer demos are not eligible for Global Judging. Do not put the 3-5 minute video in this field
- [ ] **Final project link = the live app** (`https://crop-rotation-explorer.pahang-risk-nav.workers.dev`); the longer video, PDFs and poster can go in a public folder linked in the description
- [ ] Video not in English has English subtitles
- [ ] NASA data is named in the NASA Data field (needed for Global Awards)
- [ ] References field lists every code library, text, image and dataset, including open-source ones (copy from REFERENCES.md)
- [ ] The Use of SI field is answered truthfully
- [ ] No copyrighted music, images or text without permission; no NASA logos or branding; no one under 18 recognisable in any video, image or audio
- [ ] Tick both boxes (Terms and Conditions; Confirm All Work is Original), then click **Submit for Judging** before **Sun 15 Nov 2026, 11:59 PM** (Malaysia time). Saving a draft is not submitting
- [ ] Re-open the submitted page in a private window and test every link
- [ ] Optional: request a FortiGuard web-filter classification for the live site so NASA judges' networks do not block it

## Deployment

`npm run build` outputs `dist/`. Any static host works (Vercel, Netlify, GitHub Pages, Cloudflare Pages).
A public, no-login link is the easiest thing for judges to open.
