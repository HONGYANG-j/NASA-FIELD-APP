// One-line rainfall cross-check shown in the "Information gaps" of the demo sites.
//
// Source: NASA POWER (PRECTOTCORR) at the preset point vs NASA GPM IMERG Final daily (GPM_3IMERGDF_07, 0.1 degree)
// area-averaged over a 0.5 degree box around it, 2015-2024, 3653 days each. Computed 14 Nov 2026; full table, boxes
// and limits are in the README section "Rainfall cross-check". It compares two satellite/model products, not rain gauges.
// There is no entry for Cameron Highlands (no IMERG file yet) or for custom locations.

/** Annual means (mm) behind each note, so the wording and the numbers cannot drift apart. */
export const RAIN_CHECK_NUMBERS: Record<string, { power: number; imerg: number }> = {
  kedah: { power: 2417, imerg: 2464 },
  iowa: { power: 821, imerg: 990 },
}

export const RAIN_CHECK: Record<string, string> = {
  kedah:
    'Rainfall cross-check: NASA POWER rainfall at this site averaged 2,417 mm a year over 2015–2024, against 2,464 mm from NASA GPM IMERG satellite rainfall (about 2% apart). Single years differ by up to about 25%, and POWER is wetter in Nov–Dec and drier in Mar–May. Neither was compared with rain gauges.',
  iowa:
    'Rainfall cross-check: NASA POWER rainfall at this site averaged 821 mm a year over 2015–2024, against 990 mm from NASA GPM IMERG satellite rainfall: POWER is about 17% lower, in every year. Rainfed scores here are sensitive to which rainfall product is used, and which is closer to the truth was not tested (it needs rain-gauge data).',
}
