import type { Metadata } from "next";
import { CheckCircle2, Clock3, Hand, ShieldCheck } from "lucide-react";
import { PalmReadingForm } from "@/components/palm-reading-form";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { AI_PALM_READING_ORIGINAL_PRICE, AI_PALM_READING_PRICE, AI_READING_CURRENCY } from "@/lib/ai-readings";
import { getCurrentMember } from "@/lib/member-auth";
import { isRazorpayConfigured } from "@/lib/razorpay";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Pandit Trilochan Shashtri · Hast Rekha (Palm Reading)",
  description: "Upload photos of both palms and receive a full Hinglish hast rekha (palmistry) report from Pandit Trilochan Shashtri — career, love, health, and your future, read from your own hands.",
  openGraph: { title: "Pandit Trilochan Shashtri · Palm Reading", description: "Upload both palms, pay once, get your personal Hinglish hast rekha report.", url: "/palm-reading" },
};

const discountPercent = Math.round((1 - AI_PALM_READING_PRICE / AI_PALM_READING_ORIGINAL_PRICE) * 100);

export default async function PalmReadingPage() {
  const member = await getCurrentMember();

  return (
    <main className="marketing-page">
      <SiteHeader />

      <section className="ask-hero shell">
        <div className="ask-hero__copy reveal">
          <p className="eyebrow"><span /> Ultra-premium · Hast Rekha Shastra</p>
          <h1>Pandit Trilochan<br /><em>Shashtri.</em></h1>
          <p className="ask-hero__lead">Apne dono hatheliyon ki tasveer bhejein — Pandit Trilochan Shashtri unhe dhyan se padhkar aapke career, pyaar, sehat, aur bhavishya par ek poori Hinglish report taiyaar karte hain.</p>
          <ul className="ask-hero__points">
            <li><Hand size={15} /> Dono haathon ki gehri hast rekha vishleshan</li>
            <li><Clock3 size={15} /> Report kuch hi minute mein, payment ke baad</li>
            <li><ShieldCheck size={15} /> Aapki tasveerein niji (private) rehti hain</li>
          </ul>
        </div>
        <div className="ask-hero__persona reveal reveal--delay">
          <div className="ask-persona-card">
            <div className="ask-persona-avatar"><Hand size={26} /></div>
            <strong>Pandit Trilochan Shashtri</strong>
            <span>Hast Rekha Shastri · Personal reading</span>
            <div className="palm-price-row">
              <span className="palm-price-original">{AI_READING_CURRENCY} {AI_PALM_READING_ORIGINAL_PRICE}</span>
              <span className="palm-price-badge">{discountPercent}% OFF</span>
            </div>
            <div className="ask-persona-price">{AI_READING_CURRENCY} {AI_PALM_READING_PRICE}<small>ek baar ka payment</small></div>
            <ul>
              <li><CheckCircle2 size={13} /> Career, dhan, pyaar, sehat — sab ek report mein</li>
              <li><CheckCircle2 size={13} /> Poori tarah Hinglish mein, samajhne mein aasaan</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="ask-form-section shell" id="palm-form">
        <PalmReadingForm
          member={member ? { name: member.name, email: member.email } : null}
          price={AI_PALM_READING_PRICE}
          originalPrice={AI_PALM_READING_ORIGINAL_PRICE}
          currency={AI_READING_CURRENCY}
          onlinePaymentsAvailable={isRazorpayConfigured()}
        />
        <p className="legal-note">Hast Rekha Shastra ek paramparik (traditional) vidya hai jo peedhiyon se chali aa rahi hai — yeh vigyanik roop se saabit nahi hai aur ise manoranjan aur aatmik margdarshan ke roop mein liya jaana chahiye, na ki medical, legal, ya financial faisalon ke aadhar ke roop mein.</p>
      </section>

      <SiteFooter />
    </main>
  );
}
