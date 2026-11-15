import { NOT_COVERED, RATING_WORD, ZONE_LABEL } from '../lib/permanent'
import type { PermanentResult, Rating } from '../lib/permanent'

interface Props {
  result: PermanentResult
  /** The user's own "warmer by" what-if, to mark its column. */
  userDTemp: number
}

const CLASS: Record<Rating, string> = { S1: 'r-best', S2: 'r-good', S3: 'r-fair', S4: 'r-poor', N: 'r-none' }

const NOT_COVERED_TEXT = (() => {
  const w = [...NOT_COVERED]
  const text = `${w.slice(0, -1).join(', ')} and ${w[w.length - 1]}`
  return text.charAt(0).toUpperCase() + text.slice(1)
})()

/** Temperature check for crops that stay in the ground for years. Separate from the rotation scores and from any forecast. */
export function PermanentCard({ result, userDTemp }: Props) {
  const { meanC, zone, steps, rows, seasonal, seasonRangeC } = result
  return (
    <section className="card permanent" id="permanent" aria-label="Long-lived crops: will the temperature stay suitable?">
      <h2>Long-lived crops: will the temperature stay suitable?</h2>
      <p className="muted">
        Tea, coffee, oil palm and banana stay in the ground for years, so they are not rotated and are not in the rotation scores. This check asks
        one question: does this place’s <strong>average temperature</strong> suit them, today and if it warms? Average temperature here is{' '}
        <strong>{meanC.toFixed(1)} °C</strong> (FAO thermal zone {zone}: {ZONE_LABEL[zone - 1]} °C).
      </p>
      <div className="table-wrap">
        <table className="perm-table">
          <caption className="visually-hidden">FAO temperature suitability rating of each long-lived crop, today and with warming</caption>
          <thead>
            <tr>
              <th scope="col">Crop</th>
              {steps.map((d) => (
                <th scope="col" key={d}>
                  {d === 0 ? 'Today' : `+${d} °C`}
                  {d === userDTemp && d > 0 ? <span className="mine"> (your what-if)</span> : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.crop.id}>
                <th scope="row">{r.crop.name}</th>
                {r.ratings.map((rt, i) => (
                  <td key={steps[i]} className={CLASS[rt]}>
                    <strong>{RATING_WORD[rt]}</strong> <span className="code">({rt})</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="plain-list">
        {rows.map((r) => (
          <li key={r.crop.id}>{r.sentence}</li>
        ))}
      </ul>
      {seasonal && (
        <p className="banner" role="status">
          This place has a strong seasonal swing ({seasonRangeC.toFixed(0)} °C between its warmest and coldest month). FAO’s table was made for Kenya, near the
          equator, so an annual average can hide winter cold that kills tree crops. Treat this result as indicative only.
        </p>
      )}
      <p className="muted">
        What this does not cover: rainfall, soil, frost, heat waves, drought years, pests and disease. A crop whose average temperature is right can still
        die in one extreme year, so this is a first filter, not a forecast of survival. {NOT_COVERED_TEXT} are not included because the FAO table has no
        row for them. Source: FAO Kenya agro-ecological assessment, thermal-zone suitability ratings (S1 best to N not suitable). “+n °C” adds to the
        average of the past 20 years.
      </p>
    </section>
  )
}
