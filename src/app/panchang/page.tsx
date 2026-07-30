import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Moon, Sparkles, Sunrise, Sunset } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { getTodayPanchang, REFERENCE_LOCATION_LABEL } from "@/lib/panchang";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Today's Panchang · Tithi, Nakshatra & Muhurat",
  description: "Today's live Vedic almanac — real tithi, nakshatra, yoga, karana, and the day's muhurat windows, computed from actual planetary positions.",
  openGraph: { title: "Today's Panchang · Tithi, Nakshatra & Muhurat", description: "A real, live-computed Vedic almanac, updated every day.", url: "/panchang" },
};

function formatTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });
}

function formatWindow(window: { start: string; end: string } | null) {
  if (!window) return "—";
  return `${formatTime(window.start)} – ${formatTime(window.end)}`;
}

export default async function PanchangPage() {
  const panchang = await getTodayPanchang();
  const dateLabel = new Date(`${panchang.date}T00:00:00Z`).toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  const elements = [
    { label: "Vara (weekday)", value: panchang.vara.name },
    { label: "Tithi", value: `${panchang.tithi.name} (${panchang.tithi.paksha === "shukla" ? "Shukla" : "Krishna"} Paksha)` },
    { label: "Nakshatra", value: panchang.nakshatra.name },
    { label: "Yoga", value: panchang.yoga.name },
    { label: "Karana", value: panchang.karana.name },
    { label: "Lunar month", value: `${panchang.month.purnimanta} (Purnimanta)` },
  ];

  return (
    <main className="marketing-page">
      <SiteHeader />

      <section className="zodiac-hero shell">
        <p className="eyebrow"><span /> Today&rsquo;s Panchang</p>
        <h1>The day&rsquo;s<br /><em>almanac.</em></h1>
        <p className="zodiac-hero__lead">Real tithi, nakshatra, yoga, and muhurat — computed live from actual planetary positions for {REFERENCE_LOCATION_LABEL}.</p>
      </section>

      <section className="horoscope-panel shell">
        <div className="horoscope-panel__head">
          <span className="horoscope-panel__symbol"><Sunrise size={24} /></span>
          <div>
            <p className="eyebrow"><span /> {dateLabel}</p>
            <h2>Panchang</h2>
          </div>
        </div>

        <div className="panchang-times">
          <div><Sunrise size={16} /><span>Sunrise</span><strong>{formatTime(panchang.sunrise)}</strong></div>
          <div><Sunset size={16} /><span>Sunset</span><strong>{formatTime(panchang.sunset)}</strong></div>
          <div><Moon size={16} /><span>Moonrise</span><strong>{formatTime(panchang.moonrise)}</strong></div>
        </div>

        <div className="panchang-grid">
          {elements.map((element) => (
            <div key={element.label} className="panchang-grid__item">
              <span>{element.label}</span>
              <strong>{element.value}</strong>
            </div>
          ))}
        </div>

        <div className="panchang-muhurat">
          <div className="panchang-muhurat__item panchang-muhurat__item--bad">
            <span>Rahu Kaal (inauspicious)</span>
            <strong>{formatWindow(panchang.muhurta.rahuKala)}</strong>
          </div>
          <div className="panchang-muhurat__item panchang-muhurat__item--bad">
            <span>Yamaganda (inauspicious)</span>
            <strong>{formatWindow(panchang.muhurta.yamaganda)}</strong>
          </div>
          <div className="panchang-muhurat__item">
            <span>Gulika Kaal</span>
            <strong>{formatWindow(panchang.muhurta.gulika)}</strong>
          </div>
          <div className="panchang-muhurat__item panchang-muhurat__item--good">
            <span>Abhijit Muhurat (auspicious)</span>
            <strong>{formatWindow(panchang.muhurta.abhijit)}</strong>
          </div>
        </div>

        <div className="horoscope-panel__cta">
          <Sparkles size={15} />
          <span>Want guidance on your own chart?</span>
          <Link href="/kundli" className="button button--small">Get your full Kundli <ArrowRight size={14} /></Link>
        </div>
      </section>
    </main>
  );
}
