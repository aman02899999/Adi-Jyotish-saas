import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { ArrowRight, CheckCircle2, Clock3, ShieldCheck, Sparkles } from "lucide-react";
import { AskReadingForm } from "@/components/ask-reading-form";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { AI_READING_CURRENCY, AI_READING_PRICE, isEligibleForFreeReading } from "@/lib/ai-readings";
import { getCurrentMember } from "@/lib/member-auth";
import { isRazorpayConfigured } from "@/lib/razorpay";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Ask Shree Santram Shashtri · Instant Live Reading",
  description: "Get an instant, personal Vedic astrology answer from our Live Jyotish guide, Shree Santram Shashtri — pay once, receive your reading in moments.",
  openGraph: { title: "Ask Shree Santram Shashtri · Instant Live Reading", description: "Pay once, ask your question, receive an instant personal Jyotish reading.", url: "/ask" },
};

export default async function AskPage() {
  const member = await getCurrentMember();
  const isFreeEligible = member ? await isEligibleForFreeReading(member.id) : false;

  return (
    <main className="marketing-page">
      <SiteHeader />

      <section className="ask-hero shell">
        <div className="ask-hero__copy reveal">
          <p className="eyebrow"><span /> Instant Live reading</p>
          <h1>Ask<br /><em>Shree Santram Shashtri.</em></h1>
          <p className="ask-hero__lead">Share your birth details and your question. Our Live Jyotish guide studies your chart and answers in moments — no waiting for an appointment.</p>
          <ul className="ask-hero__points">
            <li><Sparkles size={15} /> Personal answer, generated just for you</li>
            <li><Clock3 size={15} /> Ready in under a minute after payment</li>
            <li><ShieldCheck size={15} /> Your birth details are kept private</li>
          </ul>
        </div>
        <div className="ask-hero__persona reveal reveal--delay">
          <div className="ask-persona-card">
            <div className="ask-persona-avatar"><Sparkles size={26} /></div>
            <strong>Shree Santram Shashtri</strong>
            <span>Live Jyotish Guide · Available instantly</span>
            <div className="ask-persona-price">{isFreeEligible ? "Free" : `${AI_READING_CURRENCY} ${AI_READING_PRICE}`}<small>{isFreeEligible ? "your first reading" : "per reading"}</small></div>
            <ul>
              <li><CheckCircle2 size={13} /> One focused question, one clear answer</li>
              <li><CheckCircle2 size={13} /> Grounded in classical Jyotish method</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="ask-form-section shell" id="ask-form">
        <AskReadingForm
          member={member ? { name: member.name, email: member.email, birthDate: member.birthDate, birthTime: member.birthTime, birthPlace: member.birthPlace } : null}
          price={AI_READING_PRICE}
          currency={AI_READING_CURRENCY}
          onlinePaymentsAvailable={isRazorpayConfigured()}
          isFreeEligible={isFreeEligible}
        />
        <p className="legal-note">This reading offers guidance and reflection, not a guarantee of any outcome — it is not a substitute for medical, legal, or financial advice.</p>
      </section>

      <div className="shell" style={{ paddingBlock: "10px 60px" }}>
        <div className="cta-banner reveal">
          <div className="cta-banner__copy">
            <strong>Want your whole picture, not just one answer?</strong>
            <span>Get a full Kundli report covering career, relationships, health, and wealth in one reading.</span>
          </div>
          <Link href="/kundli" className="button button--light">Get full report <ArrowRight size={15} /></Link>
        </div>
      </div>
    <SiteFooter />
    </main>
  );
}
