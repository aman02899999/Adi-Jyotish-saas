import { GRAHA_LABELS, GRAHA_SHORT, NAKSHATRAS, RASHIS, formatDegree } from "@/lib/astro-engine";
import type { DetailedKundli } from "@/lib/kundli-engine";
import { KundliChartDiagram } from "@/components/kundli-chart-diagram";
import { formatYearsMonthsDays } from "@/lib/vedic/vimshottari";

/**
 * The full janma-patrika view: everything buildDetailedKundli() computes, laid out the way a
 * printed Kundli presents it. Deliberately a server component with no client JS — all the data is
 * computed server-side and none of it is interactive, so shipping a hydration bundle for it would
 * be pure cost.
 */

function fmtDate(date: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: timezone }).format(date);
}

function fmtTime(date: Date | null, timezone: string) {
  return date ? new Intl.DateTimeFormat("en-IN", { timeStyle: "short", timeZone: timezone }).format(date) : "—";
}

/** SAV bindus render as a bar against the 28-per-house average, so strength reads at a glance. */
function BinduBar({ bindus }: { bindus: number }) {
  const percent = Math.min(100, (bindus / 56) * 100);
  const tone = bindus >= 30 ? "strong" : bindus >= 25 ? "mid" : "weak";
  return (
    <span className={`bindu-bar bindu-bar--${tone}`} aria-hidden="true">
      <span style={{ width: `${percent}%` }} />
    </span>
  );
}

export function KundliDetail({ data }: { data: DetailedKundli }) {
  const { chart, panchang, dignities, vimshottari, currentDasha, ashtakavarga, yogas, houseLords, doshas, vargas } = data;
  const timezone = chart.timezone;
  const navamsa = vargas.find((varga) => varga.varga === "D9");
  const dignityOf = (graha: string) => dignities.find((entry) => entry.graha === graha);

  return (
    <div className="kundli-detail">
      <header className="kundli-detail__header">
        <div>
          <p className="kundli-detail__eyebrow">Janma Patrika · Lahiri Ayanamsa</p>
          <h1>{chart.name}</h1>
          <p className="kundli-detail__birth">
            {chart.birthDate} at {chart.birthTime} · {chart.matchedPlace}
          </p>
        </div>
        <dl className="kundli-detail__meta">
          <div><dt>Lagna</dt><dd>{RASHIS[chart.ascendantRashiIndex].name} {formatDegree(chart.ascendantDegree)}</dd></div>
          <div><dt>Chandra Rashi</dt><dd>{panchang.moonRashiName}</dd></div>
          <div><dt>Nakshatra</dt><dd>{panchang.nakshatraName} · pada {panchang.nakshatraPada}</dd></div>
          <div><dt>Ayanamsa</dt><dd>{data.ayanamsaDegrees.toFixed(4)}°</dd></div>
        </dl>
      </header>

      <section className="kundli-detail__section">
        <h2>Birth Panchang</h2>
        <div className="kundli-panchang">
          <div><small>Tithi</small><strong>{panchang.tithiName}</strong><span>{panchang.paksha}</span></div>
          <div><small>Vara</small><strong>{panchang.varaName}</strong><span>Weekday at birth</span></div>
          <div><small>Nakshatra</small><strong>{panchang.nakshatraName}</strong><span>Pada {panchang.nakshatraPada} · lord {GRAHA_LABELS[panchang.nakshatraLord]}</span></div>
          <div><small>Yoga</small><strong>{panchang.yogaName}</strong><span>Sun–Moon combination</span></div>
          <div><small>Karana</small><strong>{panchang.karanaName}</strong><span>Half-tithi</span></div>
          <div><small>Gana · Yoni · Nadi</small><strong>{panchang.gana}</strong><span>{panchang.yoni} · {panchang.nadi}</span></div>
          <div><small>Nama-akshara</small><strong>{data.namaAkshara}</strong><span>Traditional naming syllable</span></div>
          <div><small>Sunrise / Sunset</small><strong>{fmtTime(data.sunrise, timezone)}</strong><span>{fmtTime(data.sunset, timezone)}</span></div>
        </div>
      </section>

      <section className="kundli-detail__section kundli-detail__charts">
        <div>
          <h2>Rashi Chart (D1)</h2>
          <div className="kundli-art"><KundliChartDiagram houses={data.houses} /></div>
          <p className="kundli-detail__caption">Your birth chart — the physical body and the shape of the whole life.</p>
        </div>
        {navamsa && (
          <div>
            <h2>Navamsa (D9)</h2>
            <div className="kundli-art">
              <KundliChartDiagram houses={navamsa.houses.map((house) => ({ house: house.house, rashiIndex: house.rashiIndex, occupants: house.occupants.map((occupant) => ({ graha: occupant.graha, isRetrograde: occupant.isRetrograde })) }))} />
            </div>
            <p className="kundli-detail__caption">Marriage, dharma, and the strength each planet really carries. Navamsa Lagna: {RASHIS[navamsa.ascendantRashiIndex].name}.</p>
          </div>
        )}
      </section>

      <section className="kundli-detail__section">
        <h2>Planetary Positions</h2>
        <div className="kundli-table-scroll">
          <table className="kundli-table">
            <thead>
              <tr><th>Graha</th><th>Rashi</th><th>Degree</th><th>House</th><th>Nakshatra</th><th>Pada</th><th>Dignity</th><th>State</th></tr>
            </thead>
            <tbody>
              {chart.positions.map((position) => {
                const dignity = dignityOf(position.graha);
                const house = ((position.rashiIndex - chart.ascendantRashiIndex + 12) % 12) + 1;
                return (
                  <tr key={position.graha}>
                    <th scope="row">{GRAHA_LABELS[position.graha]}</th>
                    <td>{RASHIS[position.rashiIndex].name}</td>
                    <td className="kundli-table__num">{formatDegree(position.longitude)}</td>
                    <td className="kundli-table__num">{house}</td>
                    <td>{NAKSHATRAS[position.nakshatraIndex]}</td>
                    <td className="kundli-table__num">{position.pada}</td>
                    <td>{dignity ? <span className={`dignity-chip dignity-chip--${dignity.dignity}`}>{dignity.dignityLabel}</span> : "—"}</td>
                    <td className="kundli-table__flags">
                      {position.isRetrograde && <span className="kundli-flag" title="Retrograde">℞</span>}
                      {dignity?.combust && <span className="kundli-flag kundli-flag--warn" title="Combust (Asta)">Combust</span>}
                      {dignity?.inPlanetaryWar && <span className="kundli-flag" title="Graha Yuddha">{dignity.wonPlanetaryWar ? "War ✓" : "War ✗"}</span>}
                      {dignity && <span className="kundli-flag kundli-flag--muted">{dignity.avasthaLabel.split(" ")[0]}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="kundli-detail__section">
        <h2>Vimshottari Dasha</h2>
        <p className="kundli-detail__lede">
          Your dasha sequence starts from {panchang.nakshatraName}, ruled by {GRAHA_LABELS[vimshottari.birthNakshatraLord]}.
          At birth, {vimshottari.balanceLabel} of that mahadasha remained.
        </p>
        {currentDasha && (
          <div className="dasha-current">
            <span>Running now</span>
            <strong>
              {GRAHA_LABELS[currentDasha.maha.lord]}
              {currentDasha.antar && <> → {GRAHA_LABELS[currentDasha.antar.lord]}</>}
              {currentDasha.pratyantar && <> → {GRAHA_LABELS[currentDasha.pratyantar.lord]}</>}
            </strong>
            {currentDasha.antar && <small>Antardasha until {fmtDate(currentDasha.antar.end, timezone)}</small>}
          </div>
        )}
        <ol className="dasha-timeline">
          {vimshottari.mahadashas.slice(0, 9).map((period) => {
            const isCurrent = currentDasha?.maha.start.getTime() === period.start.getTime();
            return (
              <li key={period.start.toISOString()} className={isCurrent ? "is-current" : undefined}>
                <strong>{GRAHA_LABELS[period.lord]}</strong>
                <span>{fmtDate(period.start, timezone)} – {fmtDate(period.end, timezone)}</span>
                <small>{formatYearsMonthsDays(period.years)}</small>
                {isCurrent && (
                  <ul className="dasha-antar">
                    {period.children.filter((child) => child.end > period.start).map((child) => (
                      <li key={child.start.toISOString()} className={currentDasha?.antar?.start.getTime() === child.start.getTime() ? "is-current" : undefined}>
                        <span>{GRAHA_LABELS[child.lord]}</span>
                        <small>{fmtDate(child.start, timezone)} – {fmtDate(child.end, timezone)}</small>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      <section className="kundli-detail__section">
        <h2>Yogas {yogas.length > 0 && <span className="mini-tag">{yogas.length}</span>}</h2>
        {yogas.length ? (
          <div className="yoga-grid">
            {yogas.map((yoga) => (
              <article key={yoga.key} className={`yoga-card yoga-card--${yoga.category}`}>
                <header><h3>{yoga.name}</h3><span className={`yoga-strength yoga-strength--${yoga.strength}`}>{yoga.strength}</span></header>
                <p>{yoga.summary}</p>
                <p className="yoga-card__evidence">{yoga.evidence}</p>
              </article>
            ))}
          </div>
        ) : (
          <p className="kundli-detail__lede">No major classical yoga is formed in this chart. That is common and not a negative — most charts are read through house lords and dashas rather than named yogas.</p>
        )}
      </section>

      <section className="kundli-detail__section">
        <h2>Ashtakavarga</h2>
        <p className="kundli-detail__lede">
          Benefic points (bindus) per house. The average is 28 — above 30 reads as supportive, below 25 as needing care.
          Total across the chart: {ashtakavarga.sarvaTotal}.
        </p>
        <div className="kundli-table-scroll">
          <table className="kundli-table">
            <thead><tr><th>House</th><th>Rashi</th><th>SAV bindus</th><th /></tr></thead>
            <tbody>
              {ashtakavarga.sarvaByHouse.map((entry) => (
                <tr key={entry.house}>
                  <th scope="row">{entry.house}</th>
                  <td>{entry.rashiName}</td>
                  <td className="kundli-table__num">{entry.bindus}</td>
                  <td className="kundli-table__bar"><BinduBar bindus={entry.bindus} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="kundli-detail__section">
        <h2>House Lords (Bhava)</h2>
        <div className="kundli-table-scroll">
          <table className="kundli-table">
            <thead><tr><th>House</th><th>Rashi</th><th>Signifies</th><th>Lord</th><th>Lord placed in</th><th>Occupants</th></tr></thead>
            <tbody>
              {houseLords.map((entry) => (
                <tr key={entry.house}>
                  <th scope="row">{entry.house}</th>
                  <td>{entry.rashiName}</td>
                  <td className="kundli-table__sig">{entry.signification}</td>
                  <td>{GRAHA_LABELS[entry.lord]}</td>
                  <td className="kundli-table__num">House {entry.lordHouse}</td>
                  <td>{entry.occupants.length ? entry.occupants.map((graha) => GRAHA_SHORT[graha]).join(" ") : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="kundli-detail__section">
        <h2>Doshas</h2>
        <div className="dosha-grid">
          <article className={doshas.mangal.present && !doshas.mangal.cancelled ? "dosha-card dosha-card--present" : "dosha-card"}>
            <h3>Mangal Dosha</h3>
            <p>{doshas.mangal.present ? (doshas.mangal.cancelled ? `Present but classically cancelled — ${doshas.mangal.cancellationReason}` : `Present — Mars is in house ${doshas.mangal.houseFromLagna} from the Lagna. Traditionally weighed in marriage matching.`) : "Not present — Mars does not occupy a Mangal Dosha house from the Lagna or Moon."}</p>
          </article>
          <article className={doshas.kaalSarp.present ? "dosha-card dosha-card--present" : "dosha-card"}>
            <h3>Kaal Sarp Dosha</h3>
            <p>{doshas.kaalSarp.present ? `Present (${doshas.kaalSarp.name}) — all seven classical planets fall on one side of the Rahu–Ketu axis.` : "Not present — the seven classical planets are not fully hemmed between Rahu and Ketu."}</p>
          </article>
          <article className={doshas.sadeSati.active ? "dosha-card dosha-card--present" : "dosha-card"}>
            <h3>Sade Sati</h3>
            <p>{doshas.sadeSati.active ? `Currently active — ${doshas.sadeSati.phase} phase. Transiting Saturn is in ${doshas.sadeSati.currentSaturnRashi}, relative to your natal Moon in ${doshas.sadeSati.natalMoonRashi}.` : `Not currently active — transiting Saturn (${doshas.sadeSati.currentSaturnRashi}) is not in the 12th, 1st, or 2nd from your natal Moon (${doshas.sadeSati.natalMoonRashi}).`}</p>
          </article>
        </div>
      </section>

      <section className="kundli-detail__section">
        <h2>Divisional Charts (Shodashavarga)</h2>
        <p className="kundli-detail__lede">Each varga subdivides the zodiac to read one area of life in isolation. Your ascendant and planetary signs in all sixteen:</p>
        <div className="kundli-table-scroll">
          <table className="kundli-table kundli-table--varga">
            <thead>
              <tr>
                <th>Varga</th><th>Signifies</th><th>Lagna</th>
                {chart.positions.map((position) => <th key={position.graha}>{GRAHA_SHORT[position.graha]}</th>)}
              </tr>
            </thead>
            <tbody>
              {vargas.map((varga) => (
                <tr key={varga.varga}>
                  <th scope="row">{varga.varga} <small>{varga.name}</small></th>
                  <td className="kundli-table__sig">{varga.signifies}</td>
                  <td>{RASHIS[varga.ascendantRashiIndex].name}</td>
                  {varga.placements.map((placement) => <td key={placement.graha}>{RASHIS[placement.rashiIndex].name}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="kundli-detail__disclaimer">
        Every value on this page is computed from your exact birth moment using a real astronomical ephemeris
        (arcsecond-accurate planetary positions) and the Lahiri (Chitrapaksha) ayanamsa — none of it is generated text.
        It is traditional Parashari guidance, not a scientific or guaranteed prediction; for major life decisions,
        always cross-check with a qualified practitioner.
      </p>
    </div>
  );
}
