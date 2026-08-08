import type { Metadata } from "next";
import { BookOpen, CheckCircle2, Clock3, ShieldCheck } from "lucide-react";
import { LalKitabReadingForm } from "@/components/lal-kitab-reading-form";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { AI_LAL_KITAB_READING_PRICE, AI_READING_CURRENCY } from "@/lib/ai-readings";
import { getCurrentMember } from "@/lib/member-auth";
import { isRazorpayConfigured } from "@/lib/razorpay";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Pandit Girish Trivedi · Lal Kitab Remedial Reading",
  description: "Share your birth details and concern, and receive a full Hinglish Lal Kitab reading with practical remedies (upay) from Pandit Girish Trivedi.",
  openGraph: { title: "Pandit Girish Trivedi · Lal Kitab Reading", description: "Share your birth details, pay once, get your personal Hinglish Lal Kitab reading with remedies.", url: "/lal-kitab-reading" },
};

export default async function LalKitabReadingPage() {
  const member = await getCurrentMember();

  return (
    <main className="marketing-page">
      <SiteHeader />

      <section className="ask-hero shell">
        <div className="ask-hero__copy reveal">
          <p className="eyebrow"><span /> Ultra-premium · Lal Kitab</p>
          <h1>Pandit Girish<br /><em>Trivedi.</em></h1>
          <p className="ask-hero__lead">Apni janm detail aur chinta likhein — Pandit Girish Trivedi Lal Kitab ki paramparik shaili mein aapke liye ek poori Hinglish reading aur saral gharelu upay taiyaar karte hain.</p>
          <ul className="ask-hero__points">
            <li><BookOpen size={15} /> Lal Kitab ki paramparik shaili mein vishleshan</li>
            <li><Clock3 size={15} /> Report kuch hi minute mein, payment ke baad</li>
            <li><ShieldCheck size={15} /> Aapki janm detail niji (private) rehti hai</li>
          </ul>
        </div>
        <div className="ask-hero__persona reveal reveal--delay">
          <div className="ask-persona-card">
            <div className="ask-persona-avatar"><BookOpen size={26} /></div>
            <strong>Pandit Girish Trivedi</strong>
            <span>Lal Kitab Visheshagya · Personal reading</span>
            <div className="ask-persona-price">{AI_READING_CURRENCY} {AI_LAL_KITAB_READING_PRICE}<small>ek baar ka payment</small></div>
            <ul>
              <li><CheckCircle2 size={13} /> Aapki chinta ke liye saral gharelu upay</li>
              <li><CheckCircle2 size={13} /> Poori tarah Hinglish mein, samajhne mein aasaan</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="ask-form-section shell" id="lalkitab-form">
        <LalKitabReadingForm
          member={member ? { name: member.name, email: member.email, birthDate: member.birthDate, birthTime: member.birthTime, birthPlace: member.birthPlace } : null}
          price={AI_LAL_KITAB_READING_PRICE}
          currency={AI_READING_CURRENCY}
          onlinePaymentsAvailable={isRazorpayConfigured()}
        />
        <p className="legal-note">Lal Kitab ek paramparik (traditional) upay-shastra hai jo 19वीं सदी se chali aa rahi hai — yeh vigyanik roop se saabit nahi hai aur ise manoranjan aur aatmik margdarshan ke roop mein liya jaana chahiye, na ki medical, legal, ya financial faisalon ke aadhar ke roop mein.</p>
      </section>

      <SiteFooter />
    </main>
  );
}
