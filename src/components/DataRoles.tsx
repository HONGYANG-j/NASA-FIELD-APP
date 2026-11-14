/** Where each dataset goes: what changes the scores and what is shown as evidence only. */
interface Row {
  data: string
  source: string
  where: string
  role: 'scores' | 'evidence' | 'check' | 'aid'
  note: string
}

const ROWS: Row[] = [
  { data: 'Daily air temperature, rainfall and root-zone soil wetness, 2005–2024', source: 'NASA POWER', where: 'Anywhere you pick', role: 'scores', note: 'Every crop is scored against these, for every past year.' },
  { data: 'Grid-cell elevation', source: 'NASA POWER', where: 'Anywhere you pick', role: 'scores', note: 'Used to correct temperature when you enter your field’s height.' },
  { data: 'Vegetation index, evapotranspiration, surface temperature, leaf area, season dates', source: 'NASA MODIS', where: 'Kedah, Iowa', role: 'evidence', note: 'Shown beside the scores; does not change them.' },
  { data: '30 m greenness (NDVI)', source: 'NASA/USGS Landsat', where: 'Kedah, Iowa', role: 'evidence', note: 'Finer-detail view of the same pixel; does not change the scores.' },
  { data: 'Elevation and slope', source: 'NASADEM', where: 'Kedah, Cameron, Iowa', role: 'evidence', note: 'Context for the site; the temperature correction uses the height you type.' },
  { data: 'Soil moisture, one year (2024)', source: 'NASA SMAP', where: 'Kedah', role: 'evidence', note: 'A wetness picture at 9 km; does not change the scores.' },
  { data: 'Satellite rainfall, 2015–2024', source: 'NASA GPM IMERG', where: 'Kedah, Iowa', role: 'check', note: 'Used only to test the POWER rainfall; summarised in “Information gaps”.' },
  { data: 'Satellite map imagery', source: 'NASA GIBS', where: 'Map picker', role: 'aid', note: 'Helps you find and click your farm.' },
]

const LABEL: Record<Row['role'], string> = {
  scores: 'Drives the scores',
  evidence: 'Evidence only',
  check: 'Cross-check only',
  aid: 'Map aid',
}

export function DataRoles() {
  return (
    <section className="card data-roles" id="data" aria-labelledby="data-roles-title">
      <h2 id="data-roles-title">Where the NASA data goes</h2>
      <p className="muted">
        Scores come from NASA POWER climate data and FAO crop tables. The other NASA datasets are shown as evidence so you can see
        what the land is doing; they are labelled and do not change a score.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Data</th><th>From</th><th>Where</th><th>Role here</th></tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.data}>
                <td>{r.data}<small>{r.note}</small></td>
                <td>{r.source}</td>
                <td>{r.where}</td>
                <td><span className={`role role-${r.role}`}>{LABEL[r.role]}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted">
        Not from NASA: FAO tables give each crop’s temperature and water needs and drive the scores; ISRIC SoilGrids fills the soil
        boxes only if you press its button (beta data, not NASA).
      </p>
    </section>
  )
}
