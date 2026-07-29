import type { Metadata } from "next";
import { CheckCircle2, Clock3, ShieldCheck, Sparkles } from "lucide-react";
import { AskReadingForm } from "@/components/ask-reading-form";
import { SiteHeader } from "@/components/site-header";
import { AI_READING_CURRENCY, AI_READING_PRICE } from "@/lib/ai-readings";
import { getCurrentMember } from "@/lib/member-auth";
import { isRazorpayConfigured } from "@/lib/razorpay";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Ask Shree Santram Shashtri · Instant AI Reading",
  description: "Get an instant, personal Vedic astrology answer from our AI Jyotish guide, Shree Santram Shashtri — pay once, receive your reading in moments.",
  openGraph: { title: "Ask Shree Santram Shashtri · Instant AI Reading", description: "Pay once, ask your question, receive an instant personal Jyotish reading.", url: "/ask" },
};

export default async function AskPage() {
  const member = await getCurrentMember();

  return (
    <main className="marketing-page">
      <SiteHeader />

      <section className="ask-hero shell">
        <div className="ask-hero__copy reveal">
          <p className="eyebrow"><span /> Instant AI reading</p>
          <h1>Ask<br /><em>Shree Santram Shashtri.</em></h1>
          <p className="ask-hero__lead">Share your birth details and your question. Our AI Jyotish guide studies your chart and answers in moments — no waiting for an appointment.</p>
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
            <span>AI Jyotish Guide · Available instantly</span>
            <div className="ask-persona-price">{AI_READING_CURRENCY} {AI_READING_PRICE}<small>per reading</small></div>
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
        />
      </section>
    </main>
  );
}
