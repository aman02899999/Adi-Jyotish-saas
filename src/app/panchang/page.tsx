import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Sparkles, Sunrise } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { getTodayPanchang } from "@/lib/panchang";
import { todayCivilDate } from "@/lib/horoscopes";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Today's Panchang · Tithi, Nakshatra & Muhurat",
  description: "Today's Vedic almanac — tithi, nakshatra, and the day's most auspicious muhurat — from our Jyotish guide, Shree Santram Shashtri.",
  openGraph: { title: "Today's Panchang · Tithi, Nakshatra & Muhurat", description: "A fresh Vedic almanac, updated daily.", url: "/panchang" },
};

export default async function PanchangPage() {
  const date = await todayCivilDate();
  const panchang = await getTodayPanchang().catch(() => null);

  return (
    <main className="marketing-page">
      <SiteHeader />

      <section className="zodiac-hero shell">
        <p className="eyebrow"><span /> Today&rsquo;s Panchang</p>
        <h1>The day&rsquo;s<br /><em>almanac.</em></h1>
        <p className="zodiac-hero__lead">Tithi, nakshatra, and the day&rsquo;s most auspicious muhurat — read by Shree Santram Shashtri.</p>
      </section>

      <section className="horoscope-panel shell">
        <div className="horoscope-panel__head">
          <span className="horoscope-panel__symbol"><Sunrise size={24} /></span>
          <div>
            <p className="eyebrow"><span /> {new Date(`${date}T00:00:00`).toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric" })}</p>
            <h2>Panchang</h2>
          </div>
        </div>
        {panchang ? (
          <div className="horoscope-panel__body">
            {panchang.content.split(/\n{2,}/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
          </div>
        ) : (
          <div className="horoscope-panel__body horoscope-panel__body--empty">
            <p>Today&rsquo;s Panchang is not available right now. Please check back shortly.</p>
          </div>
        )}
        <div className="horoscope-panel__cta">
          <Sparkles size={15} />
          <span>Want guidance on your own chart?</span>
          <Link href="/ask" className="button button--small">Ask a personal question <ArrowRight size={14} /></Link>
        </div>
      </section>
    </main>
  );
}
