import type { Metadata } from "next";
import { CheckCircle2, Gem, ShieldCheck, Sparkles } from "lucide-react";
import { GemstoneRecommendationForm } from "@/components/gemstone-recommendation-form";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getCurrentMember } from "@/lib/member-auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Live Gemstone Recommendation · Find Your Stone",
  description: "Share your name and birth date to get a Live-guided Vedic gemstone recommendation from our Jyotish guide, Shree Santram Shashtri — free, in seconds.",
  openGraph: { title: "Live Gemstone Recommendation · Find Your Stone", description: "Free Live-guided gemstone recommendation based on your zodiac sign.", url: "/gemstones/recommend" },
};

export default async function GemstoneRecommendPage() {
  const member = await getCurrentMember();

  return (
    <main className="marketing-page gem-store">
      <SiteHeader />

      <section className="ask-hero shell">
        <div className="ask-hero__copy reveal">
          <p className="eyebrow"><span /> Live gemstone recommendation</p>
          <h1>Find the stone<br /><em>meant for you.</em></h1>
          <p className="ask-hero__lead">Share your name and birth date. Shree Santram Shashtri will read your sign&rsquo;s ruling planet and point you to the gemstones in our collection that classically suit it.</p>
          <ul className="ask-hero__points">
            <li><Sparkles size={15} /> Free, personal, ready in seconds</li>
            <li><Gem size={15} /> Matched against our real, in-stock collection</li>
            <li><ShieldCheck size={15} /> Your details are never shared</li>
          </ul>
        </div>
        <div className="ask-hero__persona reveal reveal--delay">
          <div className="ask-persona-card">
            <div className="ask-persona-avatar"><Gem size={26} /></div>
            <strong>Shree Santram Shashtri</strong>
            <span>Live Jyotish Guide · Free tool</span>
            <ul>
              <li><CheckCircle2 size={13} /> Grounded in classical planetary rulership</li>
              <li><CheckCircle2 size={13} /> Only recommends stones we actually stock</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="ask-form-section shell">
        <GemstoneRecommendationForm prefillName={member?.name ?? ""} />
        <p className="legal-note">Gemstone recommendations are offered for guidance based on traditional Vedic astrology, not a guarantee of any outcome.</p>
      </section>
    <SiteFooter />
    </main>
  );
}
