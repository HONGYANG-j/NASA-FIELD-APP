/** Plain-language help shown above the controls: how to use the tool, how to read a score, and a short glossary. */
const GLOSSARY: { term: string; meaning: string }[] = [
  { term: 'NDVI', meaning: 'Normalised Difference Vegetation Index: how green the land looks from space. About 0 is bare ground, higher values mean more leaves; 0.3 is the line this app uses for "sparse or bare".' },
  { term: 'Evapotranspiration', meaning: 'Water that leaves the ground and the crop together, by evaporation and by the plant breathing out water. It is a rough measure of how much water a growing crop needs.' },
  { term: 'Leaf area index', meaning: 'Square metres of leaf for each square metre of ground. About 0 is bare soil; larger means a thicker leaf canopy.' },
  { term: 'Land-surface temperature', meaning: 'How hot the ground and plant surface is, seen from space. It is not the air temperature, so the two differ. There is no value under cloud.' },
  { term: 'SMAP soil moisture', meaning: 'How wet the top few centimetres of soil are (cm³ of water per cm³ of soil), measured by a NASA satellite on 9 km cells. It describes an area far larger than a field.' },
  { term: 'Climate fit', meaning: 'How well a crop’s temperature, cold, heat and water needs match this location in each of the past 20 years. 100% means every year suited the crop.' },
  { term: 'NASA POWER', meaning: 'NASA’s gridded daily weather record (about 50 km cells). The climate numbers in this app come from it.' },
]

export function Guide() {
  return (
    <section className="guide" aria-label="How to use this tool">
      <ol className="steps">
        <li><strong>Pick a place.</strong> Choose a demo site, type coordinates, or tap “Pick my farm on a satellite map”.</li>
        <li><strong>Say what you grow now</strong> and tick the crops you could grow.</li>
        <li><strong>Compare the four options</strong> in “Rotation strategies compared”, then use “Share or save” to send or print the result.</li>
      </ol>
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
    </section>
  )
}
