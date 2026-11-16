import type { Metadata } from "next";
import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { GlossaryStrip } from "@/components/glossary-strip";
import { PanchangDayPanel, cityLabel } from "@/components/panchang-views";
import { todayCivilDate } from "@/lib/horoscopes";
import { DEFAULT_PANCHANG_CITY, PANCHANG_MAX_YEAR, PANCHANG_MIN_YEAR, getPanchangForDate } from "@/lib/panchang-archive";

// Computed data (no Firestore, no auth), same for every visitor — revalidated hourly so the
// "today" values roll over promptly across the date boundary.
export const revalidate = 3600;

type Params = Promise<{ locale: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Panchang" });
  const description = t("metaDescriptionToday", { minYear: PANCHANG_MIN_YEAR, maxYear: PANCHANG_MAX_YEAR });
  return {
    title: t("metaTitleToday"),
    description,
    alternates: { canonical: "/panchang", languages: { en: "/panchang", hi: "/hi/panchang" } },
    openGraph: { title: t("metaTitleToday"), description, url: "/panchang" },
  };
}

export default async function PanchangPage({ params }: { params: Params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "Panchang" });
  const city = DEFAULT_PANCHANG_CITY;
  const day = getPanchangForDate(await todayCivilDate(), city);

  return (
    <main className="marketing-page">
      <SiteHeader />

      <section className="zodiac-hero shell">
        <p className="eyebrow"><span /> {t("eyebrowToday")}</p>
        <h1>{t.rich("headingToday", { em: (chunks) => <em>{chunks}</em> })}</h1>
        <p className="zodiac-hero__lead">{t("lead", { city: cityLabel(city, locale) })}</p>
        <GlossaryStrip terms={["panchang", "tithi", "nakshatra", "muhurat"]} />
      </section>

      <div className="page-hero-banner shell">
        <Image src="/images/panchang-hero.jpg" alt="A traditional Panchangam almanac book" fill sizes="(max-width: 800px) 100vw, 1200px" style={{ objectFit: "cover" }} />
      </div>

      <PanchangDayPanel locale={locale} day={day} city={city} showDayLinks />
      <SiteFooter />
    </main>
  );
}
