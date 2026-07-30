import type { Metadata } from "next";
import { CheckCircle2, Clock3, Hash, ShieldCheck } from "lucide-react";
import { NumerologyForm } from "@/components/numerology-form";
import { SiteHeader } from "@/components/site-header";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Numerology Reading · Free Life Path & Destiny Numbers",
  description: "Discover your Life Path and Destiny numbers with a free AI-guided numerology reading from our Jyotish guide, Shree Santram Shashtri.",
  openGraph: { title: "Numerology Reading · Free Life Path & Destiny Numbers", description: "Your name and birth date, decoded through numerology.", url: "/numerology" },
};

export default function NumerologyPage() {
  return (
    <main className="marketing-page">
      <SiteHeader />

      <section className="ask-hero shell">
        <div className="ask-hero__copy reveal">
          <p className="eyebrow"><span /> Numerology reading</p>
          <h1>The numbers<br /><em>behind your name.</em></h1>
          <p className="ask-hero__lead">Your name and birth date carry two core numbers — your Life Path and your Destiny. Shree Santram Shashtri will calculate both and explain what they mean for you.</p>
          <ul className="ask-hero__points">
            <li><Hash size={15} /> Free, personal, ready in seconds</li>
            <li><Clock3 size={15} /> Two numbers, one grounded reading</li>
            <li><ShieldCheck size={15} /> Your details are never shared</li>
          </ul>
        </div>
        <div className="ask-hero__persona reveal reveal--delay">
          <div className="ask-persona-card">
            <div className="ask-persona-avatar"><Hash size={26} /></div>
            <strong>Shree Santram Shashtri</strong>
            <span>AI Jyotish Guide · Free tool</span>
            <ul>
              <li><CheckCircle2 size={13} /> Life Path number, calculated from your birth date</li>
              <li><CheckCircle2 size={13} /> Destiny number, calculated from your name</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="ask-form-section shell">
        <NumerologyForm />
      </section>
    </main>
  );
}
