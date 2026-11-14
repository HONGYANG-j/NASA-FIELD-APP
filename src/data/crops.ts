// Crop characteristics used by the rotation scorer.
//
// SOURCES (checked 14 Nov 2026)
//  [W] FAO, Irrigation Water Management: Training Manual No. 3, "Irrigation Water Needs",
//      Chapter 2, Table 4 (total growing period, days) and Table 5 (crop water need, mm per
//      total growing period): https://www.fao.org/4/s2022e/s2022e02.htm
//      We use the MIDPOINT of each published range. These are evapotranspiration needs;
//      they exclude percolation/puddling losses for paddy rice (we use the top of the range).
//  [T] FAO, Agro-ecological land resources assessment for agricultural development planning,
//      Technical Annex 4, Tables A4.1-A4.2 (crop thermal regimes and suitability ratings by
//      "thermal zone" of 24-hour mean temperature): https://www.fao.org/4/t0742e/T0742E11.htm
//      Zone definitions: https://www.fao.org/4/t0741e/T0741E06.htm
//      Zones: 1 >25 C (printed "<25.0", an apparent typo), 2 22.5-25, 3 20-22.5, 4 17.5-20,
//      5 15-17.5, 6 12.5-15, 7 10-12.5. tOptMin/tOptMax are the band rated S1 (highly suitable).
//
//  [K] FAO Irrigation and Drainage Paper 56 (Allen et al. 1998), Chapter 6, Table 11 (stage lengths, days) and
//      Table 12 (single crop coefficients Kc ini / mid / end): https://www.fao.org/4/x0490e/x0490e0b.htm
//      Used with Hargreaves ET0 (Chapter 3, Eq. 52) to compute each crop's seasonal water need from LOCAL
//      temperature (see lib/water.ts). Choices made where the tables give a range or several rows:
//       - Kc end given as a range (maize 0.60-0.35, rice 0.90-0.60, wheat 0.25-0.40, green gram and cowpeas
//         0.60-0.35): midpoint. Kc mid given as a range (sorghum grain 1.00-1.10, sunflower 1.0-1.15): midpoint.
//       - Kc ini blank for a crop: the value of its crop-group row (cereals 0.3, legumes 0.4, roots and tubers
//         0.5, oil crops 0.35, small vegetables 0.7). Rice has its own (1.05).
//       - Table 11 lists several rows per crop (region and planting date). We use the row whose length is
//         closest to a 4-month season: maize 125 d (Nigeria, humid), sorghum 130 d, rice 150 d (tropics),
//         wheat 120 d (Central India), soybean 140 d (Central USA), groundnut 130 d (West Africa), potato 130 d
//         (continental), cabbage 165 d (California), sunflower 130 d, sweet potato 125 d (tropics), cassava
//         year 1 210 d, green gram/cowpeas 100 d as printed (the table prints a total of 110).
//       - Where a cycle is longer than the 4-month window, only the first part of the cycle is counted.
//       - Not covered: clover and the cover-crop mix (no usable FAO-56 row); they keep the fixed table need.
//
// NOT SOURCED (general agronomy knowledge; the FAO EcoCrop database was retired):
//  - coldLimit and heatLimit for every crop
//  - drought/waterlog tolerance, erosion cover, organic matter, rooting, market value
//  - any tOptMax where FAO gives only a lower bound (">20 C"), and crops absent from [W]/[T]
// Each crop's `check` field says exactly which parts are backed. The app shows this.
import type { Crop } from '../types'

export const CROPS: Crop[] = [
  { id: 'rice', name: 'Rice (paddy)', group: 'cereal', family: 'Poaceae',
    tOptMin: 22.5, tOptMax: 32, coldLimit: 12, heatLimit: 36, waterNeedMm: 700,
    droughtTol: 1, waterlogTol: 5, nFix: false, erosionCover: 3, organicMatter: 3,
    rooting: 'shallow', marketValue: 3, cycleDays: [90, 150],
    kc: { ini: 1.05, mid: 1.2, end: 0.75, stages: [30, 30, 60, 30] },
    check: { temp: 'partial', water: 'fao' } },
  { id: 'maize', name: 'Maize', group: 'cereal', family: 'Poaceae',
    tOptMin: 18, tOptMax: 32, coldLimit: 4, heatLimit: 36, waterNeedMm: 650,
    droughtTol: 2, waterlogTol: 1, nFix: false, erosionCover: 3, organicMatter: 3,
    rooting: 'medium', marketValue: 3, cycleDays: [125, 180],
    kc: { ini: 0.3, mid: 1.2, end: 0.475, stages: [20, 35, 40, 30] },
    check: { temp: 'partial', water: 'fao' } },
  { id: 'sorghum', name: 'Sorghum', group: 'cereal', family: 'Poaceae',
    tOptMin: 20, tOptMax: 34, coldLimit: 8, heatLimit: 40, waterNeedMm: 550,
    droughtTol: 5, waterlogTol: 2, nFix: false, erosionCover: 3, organicMatter: 3,
    rooting: 'deep', marketValue: 2, cycleDays: [120, 130],
    kc: { ini: 0.3, mid: 1.05, end: 0.55, stages: [20, 35, 40, 30] },
    check: { temp: 'partial', water: 'fao' } },
  { id: 'wheat', name: 'Wheat', group: 'cereal', family: 'Poaceae',
    tOptMin: 15, tOptMax: 20, coldLimit: -10, heatLimit: 30, waterNeedMm: 550,
    droughtTol: 3, waterlogTol: 1, nFix: false, erosionCover: 3, organicMatter: 3,
    rooting: 'medium', marketValue: 3, cycleDays: [120, 150],
    kc: { ini: 0.3, mid: 1.15, end: 0.325, stages: [15, 25, 50, 30] },
    check: { temp: 'fao', water: 'fao' } },
  { id: 'soybean', name: 'Soybean', group: 'legume', family: 'Fabaceae',
    tOptMin: 20, tOptMax: 25, coldLimit: 4, heatLimit: 35, waterNeedMm: 575,
    droughtTol: 2, waterlogTol: 2, nFix: true, erosionCover: 3, organicMatter: 3,
    rooting: 'medium', marketValue: 4, cycleDays: [135, 150],
    kc: { ini: 0.4, mid: 1.15, end: 0.5, stages: [20, 35, 60, 25] },
    check: { temp: 'fao', water: 'fao' } },
  { id: 'mungbean', name: 'Mung bean (green gram)', group: 'legume', family: 'Fabaceae',
    tOptMin: 25, tOptMax: 33, coldLimit: 10, heatLimit: 38, waterNeedMm: 400,
    droughtTol: 3, waterlogTol: 1, nFix: true, erosionCover: 3, organicMatter: 3,
    rooting: 'medium', marketValue: 3, cycleDays: [60, 100],
    kc: { ini: 0.4, mid: 1.05, end: 0.475, stages: [20, 30, 30, 20] },
    check: { temp: 'partial', water: 'unverified' } },
  { id: 'cowpea', name: 'Cowpea', group: 'legume', family: 'Fabaceae',
    tOptMin: 22.5, tOptMax: 35, coldLimit: 8, heatLimit: 40, waterNeedMm: 450,
    droughtTol: 4, waterlogTol: 2, nFix: true, erosionCover: 4, organicMatter: 3,
    rooting: 'medium', marketValue: 2, cycleDays: [80, 140],
    kc: { ini: 0.4, mid: 1.05, end: 0.475, stages: [20, 30, 30, 20] },
    check: { temp: 'partial', water: 'unverified' } },
  { id: 'groundnut', name: 'Groundnut', group: 'legume', family: 'Fabaceae',
    tOptMin: 22.5, tOptMax: 30, coldLimit: 8, heatLimit: 36, waterNeedMm: 600,
    droughtTol: 3, waterlogTol: 1, nFix: true, erosionCover: 3, organicMatter: 3,
    rooting: 'medium', marketValue: 4, cycleDays: [130, 140],
    kc: { ini: 0.4, mid: 1.15, end: 0.6, stages: [25, 35, 45, 25] },
    check: { temp: 'partial', water: 'fao' } },
  { id: 'sweetpotato', name: 'Sweet potato', group: 'root', family: 'Convolvulaceae',
    tOptMin: 22.5, tOptMax: 30, coldLimit: 10, heatLimit: 36, waterNeedMm: 600,
    droughtTol: 3, waterlogTol: 1, nFix: false, erosionCover: 4, organicMatter: 3,
    rooting: 'medium', marketValue: 3, cycleDays: [115, 155],
    kc: { ini: 0.5, mid: 1.15, end: 0.65, stages: [15, 30, 50, 30] },
    check: { temp: 'partial', water: 'unverified' } },
  { id: 'cassava', name: 'Cassava', group: 'root', family: 'Euphorbiaceae',
    tOptMin: 22.5, tOptMax: 32, coldLimit: 12, heatLimit: 38, waterNeedMm: 700,
    droughtTol: 4, waterlogTol: 1, nFix: false, erosionCover: 3, organicMatter: 2,
    rooting: 'deep', marketValue: 2, cycleDays: [150, 330],
    kc: { ini: 0.3, mid: 0.8, end: 0.3, stages: [20, 40, 90, 60] },
    check: { temp: 'partial', water: 'unverified' } },
  { id: 'potato', name: 'Potato', group: 'root', family: 'Solanaceae',
    tOptMin: 17.5, tOptMax: 20, coldLimit: 0, heatLimit: 30, waterNeedMm: 600,
    droughtTol: 2, waterlogTol: 1, nFix: false, erosionCover: 3, organicMatter: 2,
    rooting: 'shallow', marketValue: 4, cycleDays: [105, 145],
    kc: { ini: 0.5, mid: 1.15, end: 0.75, stages: [25, 30, 45, 30] },
    check: { temp: 'fao', water: 'fao' } },
  { id: 'cabbage', name: 'Cabbage', group: 'vegetable', family: 'Brassicaceae',
    tOptMin: 13, tOptMax: 23, coldLimit: -5, heatLimit: 30, waterNeedMm: 425,
    droughtTol: 2, waterlogTol: 1, nFix: false, erosionCover: 3, organicMatter: 2,
    rooting: 'shallow', marketValue: 4, cycleDays: [120, 140],
    kc: { ini: 0.7, mid: 1.05, end: 0.95, stages: [40, 60, 50, 15] },
    check: { temp: 'unverified', water: 'fao' } },
  { id: 'sunflower', name: 'Sunflower', group: 'oilseed', family: 'Asteraceae',
    tOptMin: 18, tOptMax: 28, coldLimit: 0, heatLimit: 36, waterNeedMm: 800,
    droughtTol: 4, waterlogTol: 1, nFix: false, erosionCover: 3, organicMatter: 3,
    rooting: 'deep', marketValue: 3, cycleDays: [125, 130],
    kc: { ini: 0.35, mid: 1.075, end: 0.35, stages: [25, 35, 45, 25] },
    check: { temp: 'unverified', water: 'fao' } },
  { id: 'clover', name: 'Clover / forage legume', group: 'forage', family: 'Fabaceae',
    tOptMin: 12, tOptMax: 26, coldLimit: -15, heatLimit: 34, waterNeedMm: 500,
    droughtTol: 3, waterlogTol: 2, nFix: true, erosionCover: 5, organicMatter: 5,
    rooting: 'medium', marketValue: 2, cycleDays: null,
    check: { temp: 'unverified', water: 'unverified' } },
  { id: 'covermix', name: 'Cover crop mix (legume + grass)', group: 'cover', family: 'Mixed',
    tOptMin: 10, tOptMax: 30, coldLimit: -8, heatLimit: 38, waterNeedMm: 300,
    droughtTol: 3, waterlogTol: 3, nFix: true, erosionCover: 5, organicMatter: 5,
    rooting: 'deep', marketValue: 1, cycleDays: null,
    check: { temp: 'unverified', water: 'unverified' } },
  { id: 'fallow', name: 'Bare fallow', group: 'fallow', family: 'None',
    tOptMin: -50, tOptMax: 60, coldLimit: -99, heatLimit: 99, waterNeedMm: 0,
    droughtTol: 5, waterlogTol: 5, nFix: false, erosionCover: 1, organicMatter: 1,
    rooting: 'shallow', marketValue: 0, cycleDays: null,
    check: { temp: 'fao', water: 'fao' } },
]

export const CROP_BY_ID: Record<string, Crop> = Object.fromEntries(
  CROPS.map((c) => [c.id, c]),
)
