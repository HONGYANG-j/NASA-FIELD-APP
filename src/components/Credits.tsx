/** Credits, licences and AI-use statement shown in the footer (the same list is in REFERENCES.md). */
const SOFTWARE: [string, string][] = [
  ['React and React DOM 19', 'MIT'],
  ['Leaflet 1.9 (map)', 'BSD-2-Clause'],
  ['Vite, Vitest, @vitejs/plugin-react, @cloudflare/vite-plugin', 'MIT'],
  ['TypeScript', 'Apache-2.0'],
  ['oxlint', 'MIT'],
  ['Wrangler (Cloudflare Workers hosting)', 'MIT or Apache-2.0'],
]

export function Credits() {
  return (
    <details className="credits">
      <summary>Credits, licences and AI use</summary>
      <ul className="plain-list">
        <li>
          <strong>Licence.</strong> The original code and content of this entry are released under the Apache License 2.0, an
          open-source licence approved by the Open Source Initiative.
        </li>
        <li>
          <strong>Data.</strong> NASA POWER; NASA MODIS (LP DAAC, via the ORNL DAAC); Landsat and NASADEM (NASA/USGS, via Microsoft
          Planetary Computer); NASA SMAP SPL3SMP_E (NSIDC DAAC); NASA GPM IMERG (GES DISC, via Giovanni); NASA GIBS imagery. Also
          Open-Meteo geocoding (GeoNames data, CC BY 4.0) for the place-name search; FAO tables (Irrigation Water Management Training Manual 3; Irrigation and Drainage Paper 56; agro-ecological zones
          assessment), ISRIC SoilGrids (CC BY 4.0), Wikipedia (elevation of Tanah Rata) and a REACH Malaysia weather summary. The
          full list with links is in REFERENCES.md and on the project submission page.
        </li>
        <li>
          <strong>Software.</strong>{' '}
          {SOFTWARE.map(([n, l], i) => (
            <span key={n}>{n} ({l}){i < SOFTWARE.length - 1 ? '; ' : '.'}</span>
          ))}{' '}
          No web fonts, photos or logos from other sources are used: the type is the visitor’s own system font, the icons are drawn
          for this app, and the map uses Leaflet’s own controls.
        </li>
        <li>
          <strong>Use of AI.</strong> (1) Claude (Anthropic), through Claude Code, helped write the code, the data-processing scripts,
          the tests and the wording; the team reviewed and tested the results. (2) The optional “Ask AI” assistant runs an open-weight
          model (OpenAI gpt-oss-20b, Apache-2.0) hosted by Groq. It only proposes values for the same setup form a person can fill in
          by hand, every value is checked against a whitelist and confirmed by you, and it never calculates or changes a score: the
          scores come from NASA POWER data and FAO tables. AI can be wrong; values we could not source are labelled as unverified.
        </li>
        <li>
          <strong>Not NASA.</strong> This is an independent entry for the NASA Space Apps Challenge. It is not affiliated with,
          endorsed by or sponsored by NASA, and it uses no NASA logos.
        </li>
      </ul>
    </details>
  )
}
