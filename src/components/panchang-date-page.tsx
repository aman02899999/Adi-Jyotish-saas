import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { GlossaryStrip } from "@/components/glossary-strip";
import { PanchangDayPanel, PanchangMonthPanel, cityLabel } from "@/components/panchang-views";
import {
  DEFAULT_PANCHANG_CITY, getPanchangCity, getPanchangForDate, getPanchangForMonth, parsePanchangDate, parsePanchangMonth, type PanchangCity,
} from "@/lib/panchang-archive";
import { formatLongDate, formatMonthLabel, isIndexablePanchangPage, panchangPath } from "@/lib/panchang-format";

/**
 * The page behind /panchang/2026-11-16, /panchang/2026-11 and the same two with a city on the end.
 * One implementation serves all four so a day and a month can never disagree about a date.
 */
type Target = { kind: "day"; date: string; city: PanchangCity } | { kind: "month"; year: number; month: number; key: string; city: PanchangCity };

function resolve(dateParam: string, citySlug?: string): Target | null {
  const city = citySlug === undefined ? DEFAULT_PANCHANG_CITY : getPanchangCity(citySlug);
  if (!city) return null;
  const date = parsePanchangDate(dateParam);
  if (date) return { kind: "day", date, city };
  const month = parsePanchangMonth(dateParam);
  if (month) return { kind: "month", ...month, key: dateParam, city };
  return null;
}

export async function panchangDateMetadata(locale: string, dateParam: string, citySlug?: string): Promise<Metadata> {
  const target = resolve(dateParam, citySlug);
  if (!target) return {};
  const t = await getTranslations({ locale, namespace: "Panchang" });
  const city = cityLabel(target.city, locale);
  const path = panchangPath(target.kind === "day" ? target.date : target.key, target.city);
  const year = target.kind === "day" ? Number(target.date.slice(0, 4)) : target.year;
  const title = target.kind === "day"
    ? t("metaTitleDay", { date: formatLongDate(target.date), city })
    : t("metaTitleMonth", { month: formatMonthLabel(target.year, target.month), city });
  const description = target.kind === "day"
    ? t("metaDescriptionDay", { date: formatLongDate(target.date), city })
    : t("metaDescriptionMonth", { month: formatMonthLabel(target.year, target.month), city });
  return {
    title,
    description,
    alternates: { canonical: path, languages: { en: path, hi: `/hi${path}` } },
    robots: isIndexablePanchangPage(year, target.city, new Date().getUTCFullYear()) ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: { title, description, url: path },
  };
}

export async function PanchangDatePage({ locale, dateParam, citySlug }: { locale: string; dateParam: string; citySlug?: string }) {
  setRequestLocale(locale);
  const target = resolve(dateParam, citySlug);
  if (!target) notFound();
  const t = await getTranslations({ locale, namespace: "Panchang" });
  const city = cityLabel(target.city, locale);
  const em = (chunks: React.ReactNode) => <em>{chunks}</em>;

  return (
    <main className="marketing-page">
      <SiteHeader />
      <section className="zodiac-hero shell">
        <p className="eyebrow"><span /> {t(target.kind === "day" ? "eyebrowDay" : "eyebrowMonth")}</p>
        {target.kind === "day"
          ? <h1>{t.rich("headingDay", { date: formatLongDate(target.date), em })}</h1>
          : <h1>{t.rich("headingMonth", { month: formatMonthLabel(target.year, target.month), em })}</h1>}
        <p className="zodiac-hero__lead">
          {target.kind === "day" ? t("lead", { city }) : t("leadMonth", { city, month: formatMonthLabel(target.year, target.month) })}
        </p>
        <GlossaryStrip terms={["panchang", "tithi", "nakshatra", "muhurat"]} />
      </section>
      {target.kind === "day"
        ? <PanchangDayPanel locale={locale} day={getPanchangForDate(target.date, target.city)} city={target.city} showDayLinks />
        : <PanchangMonthPanel locale={locale} year={target.year} month={target.month} days={getPanchangForMonth(target.year, target.month, target.city)} city={target.city} />}
      <SiteFooter />
    </main>
  );
}
