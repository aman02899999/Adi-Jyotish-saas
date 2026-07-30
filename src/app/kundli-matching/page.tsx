import type { Metadata } from "next";
import { CheckCircle2, Clock3, HeartHandshake, ShieldCheck } from "lucide-react";
import { KundliMatchingForm } from "@/components/kundli-matching-form";
import { SiteHeader } from "@/components/site-header";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Kundli Matching · Free Ashtakoot Guna Milan Engine",
  description: "Check real Vedic compatibility between two people with our Ashtakoot Guna Milan engine — real planetary positions, all 8 kootas scored out of 36.",
  openGraph: { title: "Kundli Matching · Free Ashtakoot Guna Milan Engine", description: "Real birth charts in, a full 36-point guna milan score out.", url: "/kundli-matching" },
};

export default function KundliMatchingPage() {
  return (
    <main className="marketing-page">
      <SiteHeader />

      <section className="ask-hero shell">
        <div className="ask-hero__copy reveal">
          <p className="eyebrow"><span /> Kundli matching</p>
          <h1>Are your stars<br /><em>aligned?</em></h1>
          <p className="ask-hero__lead">Share both people&rsquo;s exact birth date, time, and place — our engine computes each Moon&rsquo;s real sidereal position and scores all 8 classical kootas (Varna, Vashya, Tara, Yoni, Graha Maitri, Gana, Bhakoot, Nadi) out of 36.</p>
          <ul className="ask-hero__points">
            <li><HeartHandshake size={15} /> Real Ashtakoot Guna Milan, not a guess</li>
            <li><Clock3 size={15} /> Ready in under a minute</li>
            <li><ShieldCheck size={15} /> Birth details are kept private</li>
          </ul>
        </div>
        <div className="ask-hero__persona reveal reveal--delay">
          <div className="ask-persona-card">
            <div className="ask-persona-avatar"><HeartHandshake size={26} /></div>
            <strong>Guna Milan Engine</strong>
            <span>Real chart calculation · Free tool</span>
            <ul>
              <li><CheckCircle2 size={13} /> All 8 kootas, scored classically</li>
              <li><CheckCircle2 size={13} /> Flags Nadi &amp; Bhakoot dosha</li>
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
