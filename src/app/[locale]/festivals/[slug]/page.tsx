import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { ArrowLeft, ArrowUpRight, Moon, Sparkles, Sunrise, Sunset } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { GlossaryStrip } from "@/components/glossary-strip";
import { FESTIVALS, getFestivalBySlug, getFestivalPanchang } from "@/lib/festivals";
import { REFERENCE_LOCATION_LABEL } from "@/lib/panchang";

// This page's own data is static, and SiteHeader/SiteFooter no longer touch Firestore during
// server render — nothing left in this page's render tree needs a live request.
export const revalidate = 3600;

export function generateStaticParams() {
  return FESTIVALS.map((festival) => ({ slug: festival.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const festival = getFestivalBySlug(slug);
  if (!festival) return {};
  const title = `${festival.name} ${new Date(festival.date).getUTCFullYear()} — Puja Timing & Muhurat`;
  return {
    title,
    description: `${festival.description} Real Abhijit muhurat and Rahu Kaal for ${festival.rangeLabel}.`,
    openGraph: { title, description: festival.description, url: `/festivals/${festival.slug}` },
  };
}

function formatTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });
}

function formatWindow(window: { start: string; end: string } | null) {
  if (!window) return "—";
  return `${formatTime(window.start)} – ${formatTime(window.end)}`;
}

export default async function FestivalDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const festival = getFestivalBySlug(slug);
  if (!festival) notFound();

  const panchang = getFestivalPanchang(festival);
  const dateLabel = new Date(`${festival.date}T00:00:00Z`).toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

  return (
    <main className="marketing-page">
      <SiteHeader />

      <section className="zodiac-hero shell">
        <Link className="profile-back" href="/festivals"><ArrowLeft size={14} /> All festivals</Link>
        <p className="eyebrow"><span /> {festival.rangeLabel}</p>
        <h1>{festival.name}</h1>
        <p className="zodiac-hero__lead">{festival.description}</p>
        <GlossaryStrip terms={["muhurat", "panchang", "tithi", "nakshatra"]} />
      </section>

      <section className="horoscope-panel shell">
        <div className="horoscope-panel__head">
          <span className="horoscope-panel__symbol"><Sunrise size={24} /></span>
          <div>
            <p className="eyebrow"><span /> {dateLabel}</p>
            <h2>Real Panchang for this day</h2>
          </div>
        </div>

        <div className="panchang-times">
          <div><Sunrise size={16} /><span>Sunrise</span><strong>{formatTime(panchang.sunrise)}</strong></div>
          <div><Sunset size={16} /><span>Sunset</span><strong>{formatTime(panchang.sunset)}</strong></div>
          <div><Moon size={16} /><span>Vara</span><strong>{panchang.vara}</strong></div>
        </div>

        <div className="panchang-grid">
          <div className="panchang-grid__item"><span>Tithi</span><strong>{panchang.tithi}</strong></div>
          <div className="panchang-grid__item"><span>Nakshatra</span><strong>{panchang.nakshatra}</strong></div>
        </div>

        <div className="panchang-muhurat">
          <div className="panchang-muhurat__item panchang-muhurat__item--bad">
            <span>Rahu Kaal (inauspicious)</span>
            <strong>{formatWindow(panchang.rahuKalaWindow)}</strong>
          </div>
          <div className="panchang-muhurat__item panchang-muhurat__item--good">
            <span>Abhijit Muhurat (auspicious)</span>
            <strong>{formatWindow(panchang.abhijitWindow)}</strong>
          </div>
        </div>

        <p className="festival-ritual-note"><Sparkles size={14} /> {festival.ritualNote}</p>
        <p className="legal-note">Computed for {REFERENCE_LOCATION_LABEL} — sunrise, sunset, and muhurat windows shift with your own city.</p>
      </section>

      <section className="cosmic-card-cta shell">
        <Sparkles size={22} />
        <h2>Want timing for your own decision?</h2>
        <p>The Muhurat Concierge ranks the best days for a specific plan — not just a fixed festival date.</p>
        <Link href="/muhurat" className="button">Open Muhurat Concierge <ArrowUpRight size={15} /></Link>
      </section>

      <SiteFooter />
    </main>
  );
}
