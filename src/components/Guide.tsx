/** Hero banner, the three-step how-to, how to read a score, and a short glossary. */
const GLOSSARY: { term: string; meaning: string }[] = [
  { term: 'NDVI', meaning: 'Normalised Difference Vegetation Index: how green the land looks from space. About 0 is bare ground, higher values mean more leaves; 0.3 is the line this app uses for "sparse or bare".' },
  { term: 'Evapotranspiration', meaning: 'Water that leaves the ground and the crop together, by evaporation and by the plant breathing out water. It is a rough measure of how much water a growing crop needs.' },
  { term: 'Leaf area index', meaning: 'Square metres of leaf for each square metre of ground. About 0 is bare soil; larger means a thicker leaf canopy.' },
  { term: 'Land-surface temperature', meaning: 'How hot the ground and plant surface is, seen from space. It is not the air temperature, so the two differ. There is no value under cloud.' },
  { term: 'SMAP soil moisture', meaning: 'How wet the top few centimetres of soil are (cm³ of water per cm³ of soil), measured by a NASA satellite on 9 km cells. It describes an area far larger than a field.' },
  { term: 'Climate fit', meaning: 'How well a crop’s temperature, cold, heat and water needs match this location in each of the past 20 years. 100% means every year suited the crop.' },
  { term: 'NASA POWER', meaning: 'NASA’s gridded daily weather record (about 50 km cells). The climate numbers in this app come from it.' },
]

const ICON = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', viewBox: '0 0 24 24', 'aria-hidden': true } as const

export function Hero() {
  return (
    <header className="hero">
      <p className="eyebrow">NASA Space Apps Challenge 2026 · Field Shift</p>
      <h1>Plant vs Climate</h1>
      <p className="hero-lede">
        Compare crop rotations for your farm using 20 years of NASA climate data, with satellite evidence behind every score.
      </p>
      <ul className="hero-facts">
        <li><strong>20 years</strong> of NASA POWER climate</li>
        <li><strong>Up to 4</strong> rotations compared</li>
        <li><strong>No</strong> login, ads or tracking</li>
      </ul>
      <p className="hero-note">
        It highlights patterns and options; it does not replace your own judgment or local agricultural advice. Independent entry, not
        affiliated with or endorsed by NASA.
      </p>
    </header>
  )
}

export function Guide() {
  return (
    <section className="guide" aria-label="How to use this tool">
      <ol className="steps">
        <li className="step">
          <span className="step-icon">
            <svg {...ICON}><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11Z" /><circle cx="12" cy="10" r="2.5" /></svg>
          </span>
          <span><strong>1. Pick a place</strong><span>Choose a demo site, type coordinates, or tap the satellite map.</span></span>
        </li>
        <li className="step">
          <span className="step-icon">
            <svg {...ICON}><path d="M12 21v-9" /><path d="M12 14c-4 0-6-2-6-6 4 0 6 2 6 6Z" /><path d="M12 12c0-4 2-6 6-6 0 4-2 6-6 6Z" /></svg>
          </span>
          <span><strong>2. Say what you grow</strong><span>Enter your current rotation and tick the crops you could grow.</span></span>
        </li>
        <li className="step">
          <span className="step-icon">
            <svg {...ICON}><path d="M12 4v16" /><path d="M5 8h14" /><path d="M5 8l-3 7a3.5 3.5 0 0 0 6 0L5 8Z" /><path d="M19 8l-3 7a3.5 3.5 0 0 0 6 0l-3-7Z" /></svg>
          </span>
          <span><strong>3. Compare the options</strong><span>Read the four scores and the evidence, then share or print.</span></span>
        </li>
      </ol>
      <div className="guide-more">
        <details>
          <summary>How to read the scores</summary>
          <ul className="plain-list">
            <li>
              Each rotation gets a score from 0 to 100. Higher is a better match for the priorities you set. The score ranks
              the options for <em>your inputs and the last 20 years of weather</em>. It is not a forecast of yield or profit,
              and there is no pass mark.
            </li>
            <li>
              Each season box has a coloured edge for how often that crop suited the climate in the past 20 years: green is
              80% or more, amber 60–79%, red below 60%.
            </li>
            <li>The bars show where an option is strong or weak: climate fit, reliability, water use, soil health and income (a rough relative value).</li>
          </ul>
        </details>
        <details>
          <summary>What the technical terms mean</summary>
          <dl className="glossary">
            {GLOSSARY.map((g) => (
              <div key={g.term}>
                <dt>{g.term}</dt>
                <dd>{g.meaning}</dd>
              </div>
            ))}
          </dl>
        </details>
      </div>
    </section>
  )
}
