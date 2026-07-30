import type { Metadata } from "next";
import { CheckCircle2, Clock3, HeartHandshake, ShieldCheck } from "lucide-react";
import { KundliMatchingForm } from "@/components/kundli-matching-form";
import { SiteHeader } from "@/components/site-header";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Kundli Matching · Free AI Compatibility Reading",
  description: "Check Vedic compatibility between two people with a free, AI-guided guna milan reading from our Jyotish guide, Shree Santram Shashtri.",
  openGraph: { title: "Kundli Matching · Free AI Compatibility Reading", description: "Two birth dates in, a classical compatibility reading out.", url: "/kundli-matching" },
};

export default function KundliMatchingPage() {
  return (
    <main className="marketing-page">
      <SiteHeader />

      <section className="ask-hero shell">
        <div className="ask-hero__copy reveal">
          <p className="eyebrow"><span /> Kundli matching</p>
          <h1>Are your stars<br /><em>aligned?</em></h1>
          <p className="ask-hero__lead">Share two birth dates and Shree Santram Shashtri will weigh classical guna milan compatibility — emotional harmony, communication, and long-term potential.</p>
          <ul className="ask-hero__points">
            <li><HeartHandshake size={15} /> Free, honest, balanced reading</li>
            <li><Clock3 size={15} /> Ready in under a minute</li>
            <li><ShieldCheck size={15} /> Birth details are kept private</li>
          </ul>
        </div>
        <div className="ask-hero__persona reveal reveal--delay">
          <div className="ask-persona-card">
            <div className="ask-persona-avatar"><HeartHandshake size={26} /></div>
            <strong>Shree Santram Shashtri</strong>
            <span>AI Jyotish Guide · Free tool</span>
            <ul>
              <li><CheckCircle2 size={13} /> Grounded in classical guna milan</li>
              <li><CheckCircle2 size={13} /> Balanced — strengths and friction both</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="ask-form-section shell">
        <KundliMatchingForm />
      </section>
    </main>
  );
}
