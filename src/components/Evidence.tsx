import { RAIN_CHECK_NUMBERS } from '../data/rainfallCheck'

const fmt = (n: number) => n.toLocaleString('en-US')

/** Every figure below was measured on 14 Nov 2026 (see the README sections named in each row) and is not recomputed live. */
export function EvidencePanel() {
  const k = RAIN_CHECK_NUMBERS.kedah
  const i = RAIN_CHECK_NUMBERS.iowa
  return (
    <section className="card evidence" id="evidence" aria-labelledby="evidence-title">
      <h2 id="evidence-title">How we checked it</h2>
      <p className="muted">
        What was compared with independent NASA data, with the real numbers. Where a check shows a gap, the gap is stated, not hidden.
      </p>
      <div className="table-wrap">
        <table className="checks">
          <thead>
            <tr><th>Check</th><th>Result</th><th>What it does not show</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>Rainfall: NASA POWER against NASA GPM IMERG satellite rainfall, 2015–2024</td>
              <td>
                Kedah {fmt(k.power)} against {fmt(k.imerg)} mm a year (about 2% apart, monthly correlation 0.85). Iowa {fmt(i.power)} against{' '}
                {fmt(i.imerg)} mm: POWER is about 17% lower (correlation 0.96).
              </td>
              <td>Neither product was compared with rain gauges, so which is closer to the truth in Iowa is unknown.</td>
            </tr>
            <tr>
              <td>Crop water need: our FAO-56 model against MODIS potential evapotranspiration</td>
              <td>Our estimate is 0.73 times MODIS in Kedah and 0.86–0.90 times in Iowa, and the month-by-month pattern agrees (correlation 0.94–0.98).</td>
              <td>The size is probably low, mostly in the tropics. The model does not count water stored from earlier seasons.</td>
            </tr>
            <tr>
              <td>Elevation correction for temperature</td>
              <td>Cameron Highlands: 23.6 °C raw becomes 18.1 °C at 1,440 m, against about 17.9 °C in a published local weather summary.</td>
              <td>One site, one long-term mean. Rainfall is not corrected for height.</td>
            </tr>
            <tr>
              <td>Satellite pixels are really farmland</td>
              <td>MODIS land cover says cropland at the Kedah and Iowa pixels. No pixel near Cameron Highlands was cropland, so none is shown.</td>
              <td>One pixel is not a whole field.</td>
            </tr>
            <tr>
              <td>Crop requirements</td>
              <td>Growing periods, water needs and temperature bands come from FAO tables; automated tests pin each number to its published range.</td>
              <td>Cold and heat limits, tolerance ratings, market values, and the clover and cover-crop entries are not sourced. The app labels them.</td>
            </tr>
            <tr>
              <td>Software</td>
              <td>More than 200 automated tests cover the scoring engine on real NASA data, data parsing, and the safety checks of the AI assistant.</td>
              <td>Tests show the code does what we wrote, not that the agronomy is right.</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="muted">
        <strong>Not done:</strong> comparison with measured yields or field trials; testing with farmers or extension officers; review by an
        independent agronomist. Until then, treat the scores as a structured way to start a conversation with local experts.
      </p>
    </section>
  )
}

const BUILD = typeof __BUILD_DATE__ === 'string' ? __BUILD_DATE__ : 'development build'

/** Intended use, limits and version, in the form a reviewer expects before relying on a model. */
export function ModelCard() {
  return (
    <section className="card model-card" id="intended-use" aria-labelledby="model-card-title">
      <h2 id="model-card-title">Intended use and limits</h2>
      <div className="two-col">
        <div>
          <h3>Meant for</h3>
          <ul className="plain-list">
            <li>A first, structured comparison of crop rotations before talking to a local agronomist or extension officer.</li>
            <li>Seeing how 20 years of NASA climate data and satellite evidence bear on planting choices.</li>
            <li>Teaching and discussion.</li>
          </ul>
        </div>
        <div>
          <h3>Not meant for</h3>
          <ul className="plain-list">
            <li>Predicting yield, price or profit.</li>
            <li>Insurance, credit, subsidy or legal decisions.</li>
            <li>Replacing local advice or field knowledge.</li>
            <li>Anywhere outside the three demo sites without local checking: a custom point runs the same model but has no satellite evidence and no checks.</li>
          </ul>
        </div>
      </div>
      <h3>Known limits</h3>
      <ul className="plain-list">
        <li>NASA POWER cells are about 50 km wide, so a single farm can differ a lot, especially in hills.</li>
        <li>Seasons are fixed at four months, and some crops run longer.</li>
        <li>Several crop values and most soil rules are judgement, not sourced, and are labelled in each card.</li>
        <li>Stored soil water and market conditions are barely modelled. Prices, labour and equipment are not modelled at all.</li>
        <li>Satellite layers and SMAP soil moisture are evidence only; SMAP is one year for one site.</li>
        <li>The AI assistant can misunderstand; every value it proposes is checked by software and by you before it is used.</li>
      </ul>
      <p className="muted">
        Version 1.0 release candidate, built {BUILD}. Data: NASA POWER 2005–2024 (bundled copy for the demo sites, live for other points); satellite
        layers downloaded 14–15 Nov 2026. Released under the Apache License 2.0. No warranty of any kind.
      </p>
    </section>
  )
}
