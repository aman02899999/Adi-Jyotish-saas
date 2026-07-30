import type { Metadata } from "next";
import { CheckCircle2, Clock3, ScrollText, ShieldCheck } from "lucide-react";
import { KundliReportForm } from "@/components/kundli-report-form";
import { SiteHeader } from "@/components/site-header";
import { AI_KUNDLI_PRICE, AI_READING_CURRENCY } from "@/lib/ai-readings";
import { getCurrentMember } from "@/lib/member-auth";
import { isRazorpayConfigured } from "@/lib/razorpay";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Full Kundli Report · AI Birth Chart Analysis",
  description: "A complete AI-generated Vedic Kundli report covering career, relationships, health, and wealth from our Jyotish guide, Shree Santram Shashtri.",
  openGraph: { title: "Full Kundli Report · AI Birth Chart Analysis", description: "One payment, your complete birth chart analysis across every life area.", url: "/kundli" },
};

export default async function KundliPage() {
  const member = await getCurrentMember();

  return (
    <main className="marketing-page">
      <SiteHeader />

      <section className="ask-hero shell">
        <div className="ask-hero__copy reveal">
          <p className="eyebrow"><span /> Full Kundli report</p>
          <h1>Your whole chart,<br /><em>in one reading.</em></h1>
          <p className="ask-hero__lead">Share your birth details once. Our AI Jyotish guide studies your full chart and prepares a complete report across career, relationships, health, and wealth — not just one answer.</p>
          <ul className="ask-hero__points">
            <li><ScrollText size={15} /> Five sections, your whole picture</li>
            <li><Clock3 size={15} /> Ready in under a minute after payment</li>
            <li><ShieldCheck size={15} /> Your birth details are kept private</li>
          </ul>
        </div>
        <div className="ask-hero__persona reveal reveal--delay">
          <div className="ask-persona-card">
            <div className="ask-persona-avatar"><ScrollText size={26} /></div>
            <strong>Shree Santram Shashtri</strong>
            <span>AI Jyotish Guide · Available instantly</span>
            <div className="ask-persona-price">{AI_READING_CURRENCY} {AI_KUNDLI_PRICE}<small>full report</small></div>
            <ul>
              <li><CheckCircle2 size={13} /> Overview, career, relationships, health, wealth</li>
              <li><CheckCircle2 size={13} /> Grounded in classical Jyotish method</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="ask-form-section shell" id="kundli-form">
        <KundliReportForm
          member={member ? { name: member.name, email: member.email, birthDate: member.birthDate, birthTime: member.birthTime, birthPlace: member.birthPlace } : null}
          price={AI_KUNDLI_PRICE}
          currency={AI_READING_CURRENCY}
          onlinePaymentsAvailable={isRazorpayConfigured()}
        />
      </section>
    </main>
  );
}
