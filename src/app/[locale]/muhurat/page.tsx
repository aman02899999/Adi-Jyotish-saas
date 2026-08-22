import type { Metadata } from "next";
import { CalendarClock, CheckCircle2, ScrollText, Sparkles } from "lucide-react";
import { MuhuratConciergeForm } from "@/components/muhurat-concierge-form";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { GlossaryStrip } from "@/components/glossary-strip";
import { REFERENCE_LOCATION_LABEL } from "@/lib/panchang";

// No server-side data fetching at all — the form below submits to an API route client-side.
export const metadata: Metadata = {
  title: "Muhurat Concierge · Find Your Best Days",
  description: "Tell us what you're planning — starting a business, signing a contract, traveling, moving house, marriage, a hard conversation — and get your best days ranked from real Panchang data.",
  openGraph: { title: "Muhurat Concierge · Find Your Best Days", description: "Decision-specific auspicious timing, ranked from real Panchang data.", url: "/muhurat" },
};

export default function MuhuratConciergePage() {
  return (
    <main className="marketing-page">
      <SiteHeader />

      <section className="ask-hero shell">
        <div className="ask-hero__copy reveal">
          <p className="eyebrow"><span /> Muhurat concierge</p>
          <h1>Not just a table —<br /><em>your best days.</em></h1>
          <p className="ask-hero__lead">Generic muhurat tables leave you to interpret tithi, nakshatra, and Rahu Kaal yourself. Tell us what you&rsquo;re actually planning and a date range, and we&rsquo;ll rank your best days using real Panchang data for {REFERENCE_LOCATION_LABEL}.</p>
          <ul className="ask-hero__points">
            <li><CalendarClock size={15} /> Ranked from real tithi, nakshatra &amp; weekday</li>
            <li><Sparkles size={15} /> Specific to your decision, not generic</li>
            <li><CheckCircle2 size={15} /> Free, no account required</li>
          </ul>
          <GlossaryStrip terms={["muhurat", "panchang", "tithi", "nakshatra"]} />
        </div>
        <div className="ask-hero__persona reveal reveal--delay">
          <div className="ask-persona-card">
            <div className="ask-persona-avatar"><ScrollText size={26} /></div>
            <strong>Muhurat Concierge</strong>
            <span>Real Panchang engine · Free tool</span>
            <ul>
              <li><CheckCircle2 size={13} /> Riktā tithi, nakshatra &amp; weekday rules applied</li>
              <li><CheckCircle2 size={13} /> Ranked, not just listed</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="ask-form-section shell">
        <MuhuratConciergeForm />
        <p className="legal-note">This ranking reflects classical muhurat principles applied to real computed Panchang data — it&rsquo;s guidance for reflection, not a guarantee, and for major life decisions many families also consult a priest.</p>
      </section>
    <SiteFooter />
    </main>
  );
}
