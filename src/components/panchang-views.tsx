import { getTranslations } from "next-intl/server";
import { ArrowLeft, ArrowRight, CalendarDays, Moon, Sparkles, Sunrise, Sunset } from "lucide-react";
import type { DailyPanchanga } from "panchanga";
import { Link } from "@/i18n/navigation";
import { PanchangPicker } from "@/components/panchang-picker";
import {
  DEFAULT_PANCHANG_CITY, PANCHANG_CITIES, PANCHANG_MAX_DATE, PANCHANG_MAX_YEAR, PANCHANG_MIN_DATE, PANCHANG_MIN_YEAR,
  shiftPanchangDate, shiftPanchangMonth, type PanchangCity, type PanchangDay,
} from "@/lib/panchang-archive";
import { formatClock, formatClockOnDay, formatLongDate, formatMonthLabel, formatWindow, monthPathOf, panchangPath, weekdayIndex } from "@/lib/panchang-format";

export function cityLabel(city: PanchangCity, locale: string): string {
  return locale === "hi" ? city.nameHi : city.name;
}

export async function PanchangPickerPanel({ locale, date, city }: { locale: string; date: string; city: PanchangCity }) {
  return (
    <PanchangPicker
      cities={PANCHANG_CITIES.map((item) => ({ slug: item.slug, label: `${cityLabel(item, locale)}, ${item.state}` }))}
      defaultCity={DEFAULT_PANCHANG_CITY.slug}
      initialDate={date}
      initialCity={city.slug}
      minDate={PANCHANG_MIN_DATE}
      maxDate={PANCHANG_MAX_DATE}
      minYear={PANCHANG_MIN_YEAR}
      maxYear={PANCHANG_MAX_YEAR}
    />
  );
}

export async function PanchangMethodNote({ locale, city }: { locale: string; city: PanchangCity }) {
  const t = await getTranslations({ locale, namespace: "Panchang" });
  return (
    <aside className="panchang-method">
      <h3>{t("methodTitle")}</h3>
      <p>{t("method", { city: cityLabel(city, locale), minYear: PANCHANG_MIN_YEAR, maxYear: PANCHANG_MAX_YEAR })}</p>
      <p>{t("methodCaveat")}</p>
    </aside>
  );
}

/** One day's Panchang: times, the five limbs, the muhurat windows and any eclipse. */
export async function PanchangDayPanel({ locale, day, city, showDayLinks }: { locale: string; day: PanchangDay; city: PanchangCity; showDayLinks: boolean }) {
  const t = await getTranslations({ locale, namespace: "Panchang" });
  const zone = city.timeZone;
  const name = cityLabel(city, locale);
  const until = (iso: string) => t("until", { time: formatClockOnDay(iso, day.date, zone) });
  const paksha = day.tithi.paksha === "shukla" ? t("shukla") : t("krishna");
  const elements = [
    { label: t("vara"), value: `${t(`weekdays.${weekdayIndex(day.date)}`)} · ${day.vara.name}`, note: null },
    { label: t("tithi"), value: `${day.tithi.name} (${paksha})`, note: until(day.tithi.endsAt) },
    { label: t("nakshatra"), value: day.nakshatra.name, note: until(day.nakshatra.endsAt) },
    { label: t("yoga"), value: day.yoga.name, note: until(day.yoga.endsAt) },
    { label: t("karana"), value: day.karana.name, note: until(day.karana.endsAt) },
    { label: t("lunarMonth"), value: `${day.month.purnimanta} (${t("purnimanta")})`, note: `${day.month.amanta} (${t("amanta")})` },
  ];
  const previous = shiftPanchangDate(day.date, -1);
  const next = shiftPanchangDate(day.date, 1);
  const monthLabel = formatMonthLabel(Number(day.date.slice(0, 4)), Number(day.date.slice(5, 7)));

  return (
    <section className="horoscope-panel shell">
      <div className="horoscope-panel__head">
        <span className="horoscope-panel__symbol"><Sunrise size={24} /></span>
        <div>
          <p className="eyebrow"><span /> {t(`weekdays.${weekdayIndex(day.date)}`)}, {formatLongDate(day.date)} · {name}</p>
          <h2>{t("panelTitle")}</h2>
        </div>
      </div>

      <div className="panchang-times">
        <div><Sunrise size={16} /><span>{t("sunrise")}</span><strong>{formatClock(day.sunrise, zone)}</strong></div>
        <div><Sunset size={16} /><span>{t("sunset")}</span><strong>{formatClock(day.sunset, zone)}</strong></div>
        <div><Moon size={16} /><span>{t("moonrise")}</span><strong>{formatClockOnDay(day.moonrise, day.date, zone)}</strong></div>
      </div>

      <div className="panchang-grid">
        {elements.map((element) => (
          <div key={element.label} className="panchang-grid__item">
            <span>{element.label}</span>
            <strong>{element.value}</strong>
            {element.note && <small>{element.note}</small>}
          </div>
        ))}
      </div>

      {day.eclipses.map((eclipse) => (
        <p key={eclipse.peak} className="panchang-eclipse">
          {t(eclipse.body === "sun" ? "eclipseSun" : "eclipseMoon", { time: formatClock(eclipse.peak, zone) })}{" "}
          {t(eclipse.visible ? "eclipseVisible" : "eclipseNotVisible", { city: name })}
        </p>
      ))}

      <div className="panchang-muhurat">
        <div className="panchang-muhurat__item panchang-muhurat__item--bad"><span>{t("rahuKaal")}</span><strong>{formatWindow(day.muhurta.rahuKala, zone)}</strong></div>
        <div className="panchang-muhurat__item panchang-muhurat__item--bad"><span>{t("yamaganda")}</span><strong>{formatWindow(day.muhurta.yamaganda, zone)}</strong></div>
        <div className="panchang-muhurat__item"><span>{t("gulika")}</span><strong>{formatWindow(day.muhurta.gulika, zone)}</strong></div>
        <div className="panchang-muhurat__item panchang-muhurat__item--good"><span>{t("abhijit")}</span><strong>{formatWindow(day.muhurta.abhijit, zone)}</strong></div>
      </div>

      <nav className="panchang-nav" aria-label={t("panelTitle")}>
        {showDayLinks && previous ? <Link href={panchangPath(previous, city)}><ArrowLeft size={14} /> {t("previousDay")}</Link> : <span />}
        <Link href={monthPathOf(day.date, city)}><CalendarDays size={14} /> {t("wholeMonth", { month: monthLabel })}</Link>
        {showDayLinks && next ? <Link href={panchangPath(next, city)}>{t("nextDay")} <ArrowRight size={14} /></Link> : <span />}
      </nav>

      <PanchangPickerPanel locale={locale} date={day.date} city={city} />

      <div className="horoscope-panel__cta">
        <Sparkles size={15} />
        <span>{t("ctaKundli")}</span>
        <Link href="/kundli" className="button button--small">{t("ctaKundliButton")} <ArrowRight size={14} /></Link>
      </div>
      <div className="horoscope-panel__cta">
        <CalendarDays size={15} />
        <span>{t("ctaMuhurat")}</span>
        <Link href="/muhurat" className="button button--small button--ghost">{t("ctaMuhuratButton")} <ArrowRight size={14} /></Link>
      </div>

      <PanchangMethodNote locale={locale} city={city} />
    </section>
  );
}

/** A month as a table, one row per day, each row opening that day's page. */
export async function PanchangMonthPanel({ locale, year, month, days, city }: { locale: string; year: number; month: number; days: DailyPanchanga[]; city: PanchangCity }) {
  const t = await getTranslations({ locale, namespace: "Panchang" });
  const zone = city.timeZone;
  const label = formatMonthLabel(year, month);
  const previous = shiftPanchangMonth(year, month, -1);
  const next = shiftPanchangMonth(year, month, 1);
  const badgeOf = (tithi: number) => (tithi === 15 ? t("badgePurnima") : tithi === 30 ? t("badgeAmavasya") : tithi === 11 || tithi === 26 ? t("badgeEkadashi") : null);

  return (
    <section className="horoscope-panel horoscope-panel--wide shell">
      <div className="horoscope-panel__head">
        <span className="horoscope-panel__symbol"><CalendarDays size={24} /></span>
        <div>
          <p className="eyebrow"><span /> {cityLabel(city, locale)}</p>
          <h2>{label}</h2>
        </div>
      </div>

      <div className="panchang-month" role="region" aria-label={label} tabIndex={0}>
        <table>
          <thead>
            <tr>
              <th scope="col">{t("colDate")}</th>
              <th scope="col">{t("colDay")}</th>
              <th scope="col">{t("colTithi")}</th>
              <th scope="col">{t("colNakshatra")}</th>
              <th scope="col">{t("colSunrise")}</th>
              <th scope="col">{t("colSunset")}</th>
            </tr>
          </thead>
          <tbody>
            {days.map((day) => {
              const badge = badgeOf(day.tithi.number);
              return (
                <tr key={day.date}>
                  <th scope="row"><Link href={panchangPath(day.date, city)}>{Number(day.date.slice(8))}</Link></th>
                  <td>{t(`weekdays.${weekdayIndex(day.date)}`).slice(0, 3)}</td>
                  <td>{day.tithi.name} <small>{day.tithi.paksha === "shukla" ? t("shukla") : t("krishna")}</small>{badge && <em>{badge}</em>}</td>
                  <td>{day.nakshatra.name}</td>
                  <td>{formatClock(day.sunrise, zone)}</td>
                  <td>{formatClock(day.sunset, zone)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <nav className="panchang-nav" aria-label={label}>
        {previous ? <Link href={panchangPath(previous, city)}><ArrowLeft size={14} /> {t("previousMonth")}</Link> : <span />}
        <Link href="/panchang">{t("today")}</Link>
        {next ? <Link href={panchangPath(next, city)}>{t("nextMonth")} <ArrowRight size={14} /></Link> : <span />}
      </nav>

      <PanchangPickerPanel locale={locale} date={days[0].date} city={city} />

      <div className="horoscope-panel__cta">
        <CalendarDays size={15} />
        <span>{t("ctaMuhurat")}</span>
        <Link href="/muhurat" className="button button--small">{t("ctaMuhuratButton")} <ArrowRight size={14} /></Link>
      </div>

      <PanchangMethodNote locale={locale} city={city} />
    </section>
  );
}
