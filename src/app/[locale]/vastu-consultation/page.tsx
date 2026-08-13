import type { Metadata } from "next";
import { CheckCircle2, Clock3, Compass, ShieldCheck } from "lucide-react";
import { VastuReadingForm } from "@/components/vastu-reading-form";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { AI_READING_CURRENCY, AI_VASTU_READING_PRICE } from "@/lib/ai-readings";
import { getCurrentMember } from "@/lib/member-auth";
import { isRazorpayConfigured } from "@/lib/razorpay";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Vastu Shastri Ramesh Chaturvedi · Vastu Consultation",
  description: "Describe your home or office layout and receive a full Hinglish Vastu Shastra consultation with practical remedies from Vastu Shastri Ramesh Chaturvedi.",
  openGraph: { title: "Vastu Shastri Ramesh Chaturvedi · Vastu Consultation", description: "Describe your property, pay once, get your personal Hinglish Vastu consultation.", url: "/vastu-consultation" },
};

export default async function VastuConsultationPage() {
  const member = await getCurrentMember();

  return (
    <main className="marketing-page">
      <SiteHeader />

      <section className="ask-hero shell">
        <div className="ask-hero__copy reveal">
          <p className="eyebrow"><span /> Ultra-premium · Vastu Shastra</p>
          <h1>Vastu Shastri<br /><em>Ramesh Chaturvedi.</em></h1>
          <p className="ask-hero__lead">Apne ghar ya office ka layout aur chinta likhein — Vastu Shastri Ramesh Chaturvedi use dhyan se padhkar aapke liye ek poori Hinglish consultation aur vyavaharik upay taiyaar karte hain.</p>
          <ul className="ask-hero__points">
            <li><Compass size={15} /> Disha aur ऊर्जा pravah ka gehra vishleshan</li>
            <li><Clock3 size={15} /> Consultation kuch hi minute mein, payment ke baad</li>
            <li><ShieldCheck size={15} /> Aapka vivaran niji (private) rehta hai</li>
          </ul>
        </div>
        <div className="ask-hero__persona reveal reveal--delay">
          <div className="ask-persona-card">
            <div className="ask-persona-avatar"><Compass size={26} /></div>
            <strong>Vastu Shastri Ramesh Chaturvedi</strong>
            <span>Vastu Salahkar · Personal consultation</span>
            <div className="ask-persona-price">{AI_READING_CURRENCY} {AI_VASTU_READING_PRICE}<small>ek baar ka payment</small></div>
            <ul>
              <li><CheckCircle2 size={13} /> Aapke khud ke ghar/office ke layout par based</li>
              <li><CheckCircle2 size={13} /> Vyavaharik upay, poori tarah Hinglish mein</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="ask-form-section shell" id="vastu-form">
        <VastuReadingForm
          member={member ? { name: member.name, email: member.email } : null}
          price={AI_VASTU_READING_PRICE}
          currency={AI_READING_CURRENCY}
          onlinePaymentsAvailable={isRazorpayConfigured()}
        />
        <p className="legal-note">Vastu Shastra ek paramparik (traditional) vidya hai jo sadiyon se chali aa rahi hai — yeh vigyanik roop se saabit nahi hai aur ise manoranjan aur aatmik margdarshan ke roop mein liya jaana chahiye, na ki structural, safety, medical, legal, ya financial faisalon ke aadhar ke roop mein. Ghar ki structural safety ke liye hamesha ek qualified engineer se salah lein.</p>
      </section>

      <SiteFooter />
    </main>
  );
}
