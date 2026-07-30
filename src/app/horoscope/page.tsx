import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ZODIAC_SIGNS, getDailyHoroscope, isZodiacSign, todayCivilDate, type ZodiacSignKey } from "@/lib/horoscopes";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Today's Horoscope · AI Daily Reading",
  description: "A fresh, AI-generated Vedic horoscope for every zodiac sign, updated daily by our Jyotish guide Shree Santram Shashtri.",
  openGraph: { title: "Today's Horoscope · AI Daily Reading", description: "A fresh Vedic horoscope for every sign, generated daily.", url: "/horoscope" },
};

export default async function HoroscopePage({ searchParams }: { searchParams: Promise<{ sign?: string }> }) {
  const query = await searchParams;
  const sign: ZodiacSignKey = query.sign && isZodiacSign(query.sign) ? query.sign : "aries";
  const definition = ZODIAC_SIGNS.find((entry) => entry.key === sign)!;
  const date = await todayCivilDate();
  const horoscope = await getDailyHoroscope(sign).catch(() => null);

  return (
    <main className="marketing-page">
      <SiteHeader />

      <section className="zodiac-hero shell">
        <p className="eyebrow"><span /> AI daily horoscope</p>
        <h1>Today&rsquo;s sky,<br /><em>sign by sign.</em></h1>
        <p className="zodiac-hero__lead">Shree Santram Shashtri reads the day&rsquo;s planetary transits for every sign — choose yours below.</p>
      </section>

      <section className="zodiac-grid shell">
        {ZODIAC_SIGNS.map((entry) => (
          <Link key={entry.key} href={`/horoscope?sign=${entry.key}`} className={`zodiac-card${entry.key === sign ? " active" : ""}`}>
            <span className="zodiac-card__symbol">{entry.symbol}</span>
            <strong>{entry.name}</strong>
            <small>{entry.dates}</small>
          </Link>
        ))}
      </section>

      <section className="horoscope-panel shell">
        <div className="horoscope-panel__head">
          <span className="horoscope-panel__symbol">{definition.symbol}</span>
          <div>
            <p className="eyebrow"><span /> {new Date(`${date}T00:00:00`).toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric" })}</p>
            <h2>{definition.name}</h2>
          </div>
        </div>
        {horoscope ? (
          <div className="horoscope-panel__body">
            {horoscope.content.split(/\n{2,}/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
          </div>
        ) : (
          <div className="horoscope-panel__body horoscope-panel__body--empty">
            <p>Today&rsquo;s reading for {definition.name} is not available right now. Please check back shortly.</p>
          </div>
        )}
        <div className="horoscope-panel__cta">
          <Sparkles size={15} />
          <span>Want guidance on your own chart?</span>
          <Link href="/ask" className="button button--small">Ask a personal question <ArrowRight size={14} /></Link>
        </div>
        <p className="legal-note">This horoscope offers guidance and reflection, not a guarantee of any outcome.</p>
      </section>
    <SiteFooter />
    </main>
  );
}
