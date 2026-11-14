# References, data sources and licences

Required by the NASA Space Apps Participant Terms: every source used is cited, including open-source and freely available
ones. This list is also pasted into the "Space Agency Partner Data and Other References" field of the project page.

Licence of this project's original code and content: **Apache License 2.0** (see `LICENSE`).

## NASA data used

| Data | Provider / product | How it was used | Where |
|---|---|---|---|
| Daily temperature, rainfall, root-zone soil wetness, grid elevation, 2005-2024 | NASA POWER (NASA Langley Research Center) | Drives every score. Fetched live in the browser. | https://power.larc.nasa.gov/ |
| NDVI, evapotranspiration, land-surface temperature, leaf area index, growing-season dates, land cover (MOD13Q1, MOD16A2, MOD11A2, MCD15A2H, MCD12Q2, MCD12Q1) | NASA MODIS, LP DAAC, served by the ORNL DAAC MODIS web service | Evidence for Kedah and Iowa (not scored); land cover used to choose cropland pixels. Bundled. | https://modis.ornl.gov/ , https://lpdaac.usgs.gov/ |
| Surface reflectance (NDVI), Landsat 7, 8, 9 Collection 2 Level-2 | USGS/NASA Landsat, read through Microsoft Planetary Computer | Evidence for Kedah and Iowa (not scored). Bundled. | https://planetarycomputer.microsoft.com/ |
| Elevation and slope, NASADEM_HGT v001 | NASA JPL, read through Microsoft Planetary Computer | Site context for the three demo locations (not scored). Bundled. | https://earthdata.nasa.gov/esds/competitive-programs/measures/nasadem |
| Soil moisture, SPL3SMP_E version 6 (SMAP Enhanced L3 radiometer, 9 km, daily), 2024 | NASA SMAP, NSIDC DAAC, trimmed with Harmony in Earthdata Search | Month-by-month soil-moisture evidence for Kedah (not scored). Bundled. | https://nsidc.org/data/spl3smp_e/versions/6 , https://search.earthdata.nasa.gov/ |
| Satellite rainfall, GPM IMERG, 2015-2024 | NASA GPM, GES DISC, downloaded through Giovanni | Cross-check of POWER rainfall for Kedah and Iowa only; not used in any score. | https://gpm.nasa.gov/data/imerg , https://giovanni.gsfc.nasa.gov/giovanni/ |
| Map imagery (Blue Marble, MODIS true colour, MODIS NDVI) | NASA GIBS (ESDIS) | Background of the map picker. | https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api |
| "Measuring Vegetation" (text on NDVI) | NASA Earth Observatory | Used to interpret NDVI values. | https://earthobservatory.nasa.gov/features/MeasuringVegetation |

## Other data and documents (not NASA)

| Source | Used for |
|---|---|
| FAO Irrigation Water Management Training Manual No. 3, ch. 2, Tables 4-5 | Growing periods and seasonal water needs. https://www.fao.org/4/s2022e/s2022e02.htm |
| FAO Irrigation and Drainage Paper 56 (Allen et al. 1998): crop coefficients (Tables 11-12), evapotranspiration equations, soil water (Table 19) | Water-need model and soil water-holding values. https://www.fao.org/4/x0490e/x0490e00.htm |
| FAO agro-ecological land resources assessment, Technical Annex 4 and thermal zones | Temperature bands. https://www.fao.org/4/t0742e/T0742E11.htm , https://www.fao.org/4/t0741e/T0741E06.htm |
| ISRIC SoilGrids v2.0 (CC BY 4.0), optional soil fill | https://www.isric.org/explore/soilgrids |
| ESA WorldCover (CC BY 4.0), used only to choose a cropland pixel | https://esa-worldcover.org/ |
| Wikipedia, "Tanah Rata" (elevation about 1,440 m) | https://en.wikipedia.org/wiki/Tanah_Rata |
| REACH Malaysia, Cameron Highlands weather summary (about 17.9 C) | https://reach.org.my/?p=5627 |
| Department of Agriculture Malaysia (link only, for local advice) | https://www.doa.gov.my/ |

## Software

| Package | Licence | Used for |
|---|---|---|
| React, React DOM 19 | MIT | Interface |
| Leaflet 1.9 | BSD-2-Clause | Map picker |
| Vite 8, @vitejs/plugin-react, @cloudflare/vite-plugin | MIT | Build |
| Vitest 3 | MIT | Tests |
| TypeScript | Apache-2.0 | Language and type checking |
| oxlint | MIT | Linting |
| Wrangler 4 (Cloudflare Workers static hosting) | MIT or Apache-2.0 | Deployment |
| h5wasm 0.10 (NIST), used only by `scripts/extract-smap.mjs`, not part of the app | see its LICENSE.txt | Reading the SMAP NetCDF-4 files once, offline |

Versions are in `package.json` and `package-lock.json`. No web fonts, photos, logos or music are used in the app. The icons are drawn
for this app. The app uses no NASA logos, flags or mission identifiers.

## Use of AI (SI) tools

Claude (Anthropic), through Claude Code, was used to write and revise: the application code, the data-processing scripts in `scripts/`,
the automated tests, the plain-language wording in the app, this documentation, and drafts of the submission text and video scripts.
The team reviewed the results and checked numbers against the NASA data and the FAO tables listed above. The app contains no AI model
at run time and makes no AI calls. AI-written code and text can contain mistakes. Values that could not be sourced are labelled
"unverified" in the code and the app. Code and data files that were produced with the help of AI are acknowledged here and in the
`ai-assistance` meta tag of `index.html`.
