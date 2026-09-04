import type { Metadata } from "next";
import Image from "next/image";
import { CheckCircle2, Clock3, ScrollText, ShieldCheck } from "lucide-react";
import { KundliReportForm } from "@/components/kundli-report-form";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { GlossaryStrip } from "@/components/glossary-strip";
import { AI_KUNDLI_PRICE, AI_READING_CURRENCY } from "@/lib/ai-readings";
import { getCurrentMember } from "@/lib/member-auth";
import { isRazorpayConfigured } from "@/lib/razorpay";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Full Kundli Report · Real Birth Chart Analysis",
  description: "A complete Vedic Kundli report computed from your real planetary positions — career, relationships, health, and wealth, house by house.",
  openGraph: { title: "Full Kundli Report · Real Birth Chart Analysis", description: "One payment, your complete real birth chart analysis across every life area.", url: "/kundli" },
};

export default async function KundliPage() {
  // Public page: don't let a valid-looking but stale session cookie (or a degraded
  // Firebase dependency) prevent the landing page from rendering.
  const member = await getCurrentMember().catch(() => null);

  return (
    <main className="marketing-page">
      <SiteHeader />

      <section className="ask-hero shell">
        <div className="ask-hero__copy reveal">
          <p className="eyebrow"><span /> Full Kundli report</p>
          <h1>Your whole chart,<br /><em>in one reading.</em></h1>
          <p className="ask-hero__lead">Share your birth details once. Our chart engine computes your real planetary positions — Lagna, all 9 grahas, their rashi and nakshatra — and lays out a complete house-by-house report: career, relationships, health, and wealth.</p>
          <ul className="ask-hero__points">
            <li><ScrollText size={15} /> Five sections plus your full planetary table</li>
            <li><Clock3 size={15} /> Ready instantly after payment</li>
            <li><ShieldCheck size={15} /> Your birth details are kept private</li>
          </ul>
          <GlossaryStrip terms={["kundli", "lagna", "rashi", "bhava"]} />
        </div>
        <div className="ask-hero__persona reveal reveal--delay">
          <div className="ask-persona-card">
            <div className="ask-persona-avatar"><ScrollText size={26} /></div>
            <strong>Real Chart Engine</strong>
            <span>Real planetary positions · Available instantly</span>
            <div className="ask-persona-price">{AI_READING_CURRENCY} {AI_KUNDLI_PRICE}<small>full report</small></div>
            <ul>
              <li><CheckCircle2 size={13} /> Overview, career, relationships, health, wealth</li>
              <li><CheckCircle2 size={13} /> All 9 grahas, computed — not guessed</li>
            </ul>
          </div>
        </div>
      </section>

      <div className="page-hero-banner shell">
        <Image src="/images/kundli-hero.jpg" alt="A diamond-shaped Vedic birth chart with astrology books" fill sizes="(max-width: 800px) 100vw, 1200px" style={{ objectFit: "cover" }} />
      </div>

      <section className="ask-form-section shell" id="kundli-form">
        <KundliReportForm
          member={member ? { name: member.name, email: member.email, birthDate: member.birthDate, birthTime: member.birthTime, birthPlace: member.birthPlace } : null}
          price={AI_KUNDLI_PRICE}
          currency={AI_READING_CURRENCY}
          onlinePaymentsAvailable={isRazorpayConfigured()}
        />
        <p className="legal-note">This report offers guidance and reflection based on your birth chart, not a guarantee of any outcome — it is not a substitute for medical, legal, or financial advice.</p>
      </section>
    <SiteFooter />
    </main>
  );
}
