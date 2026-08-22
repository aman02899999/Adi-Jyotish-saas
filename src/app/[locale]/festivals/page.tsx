import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { ArrowUpRight, PartyPopper } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { FESTIVALS, getFeaturedFestival } from "@/lib/festivals";

// FESTIVALS is a static in-code constant, and SiteHeader/SiteFooter no longer touch Firestore
// during server render (both fetch their DB-driven bits client-side) — nothing left in this
// page's render tree needs a live request, so it's safe to cache instead of rendering fresh.
export const revalidate = 3600;
export const metadata: Metadata = {
  title: "Festival Muhurat Calendar",
  description: "Real, live-computed puja timing for Navratri, Karva Chauth, and Diwali — Abhijit muhurat and Rahu Kaal for each festival day, not a generic date list.",
  openGraph: { title: "Festival Muhurat Calendar", description: "Real puja timing for the season's major festivals.", url: "/festivals" },
};

function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export default function FestivalsPage() {
  const featured = getFeaturedFestival();

  return (
    <main className="marketing-page">
      <SiteHeader />

      <section className="zodiac-hero shell">
        <p className="eyebrow"><span /> Festival season</p>
        <h1>Puja timing,<br /><em>computed — not guessed.</em></h1>
        <p className="zodiac-hero__lead">Every festival below gets the same live Panchang engine as our daily muhurat tool — real tithi, nakshatra, and Abhijit/Rahu Kaal windows for that specific day.</p>
      </section>

      <section className="festival-grid shell">
        {FESTIVALS.map((festival) => (
          <Link key={festival.slug} href={`/festivals/${festival.slug}`} className={festival.slug === featured.slug ? "festival-card festival-card--featured" : "festival-card"}>
            {festival.slug === featured.slug && <span className="mini-tag mini-tag--copper"><PartyPopper size={12} /> Coming up next</span>}
            <h2>{festival.name}</h2>
            <p className="festival-card__tagline">{festival.tagline}</p>
            <p className="festival-card__date">{formatDate(festival.date)}</p>
            <span className="festival-card__cta">See puja timing <ArrowUpRight size={14} /></span>
          </Link>
        ))}
      </section>

      <SiteFooter />
    </main>
  );
}
