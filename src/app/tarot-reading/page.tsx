import type { Metadata } from "next";
import Image from "next/image";
import { CheckCircle2, Clock3, Layers, ShieldCheck } from "lucide-react";
import { TarotReadingForm } from "@/components/tarot-reading-form";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { AI_READING_CURRENCY, AI_TAROT_READING_PRICE } from "@/lib/ai-readings";
import { getCurrentMember } from "@/lib/member-auth";
import { isRazorpayConfigured } from "@/lib/razorpay";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Tarot Mystic Divya · Tarot Card Reading",
  description: "Ask your question, draw a three-card past-present-future tarot spread, and receive a full Hinglish tarot reading from Tarot Mystic Divya — Divine Light and Vision.",
  openGraph: { title: "Tarot Mystic Divya · Tarot Reading", description: "Draw your cards, pay once, get your personal Hinglish tarot reading.", url: "/tarot-reading" },
};

export default async function TarotReadingPage() {
  const member = await getCurrentMember();

  return (
    <main className="marketing-page">
      <SiteHeader />

      <section className="ask-hero shell">
        <div className="ask-hero__copy reveal">
          <p className="eyebrow"><span /> Ultra-premium · Tarot Reading</p>
          <h1>Tarot Mystic<br /><em>Divya.</em></h1>
          <p className="ask-hero__lead">Apna sawaal likhein, teen cards ka spread khinchein — Bhoot, Vartaman, aur Bhavishya — aur Tarot Mystic Divya unhe padhkar aapke liye ek poori Hinglish reading taiyaar karti hain.</p>
          <ul className="ask-hero__points">
            <li><Layers size={15} /> Past · Present · Future teen-card spread</li>
            <li><Clock3 size={15} /> Report kuch hi minute mein, payment ke baad</li>
            <li><ShieldCheck size={15} /> Aapka sawaal aur reading niji (private) rehti hai</li>
          </ul>
        </div>
        <div className="ask-hero__persona reveal reveal--delay">
          <div className="ask-persona-card">
            <div className="ask-persona-avatar"><Layers size={26} /></div>
            <strong>Tarot Mystic Divya</strong>
            <span>Divine Light and Vision · Personal reading</span>
            <div className="ask-persona-price">{AI_READING_CURRENCY} {AI_TAROT_READING_PRICE}<small>ek baar ka payment</small></div>
            <ul>
              <li><CheckCircle2 size={13} /> Aapke khud ke sawaal par based, teen-card spread</li>
              <li><CheckCircle2 size={13} /> Poori tarah Hinglish mein, samajhne mein aasaan</li>
            </ul>
          </div>
        </div>
      </section>

      <div className="page-hero-banner shell">
        <Image src="/images/tarot-reading-hero.jpg" alt="A hand placing a tarot card face-up during a reading" fill sizes="(max-width: 800px) 100vw, 1200px" style={{ objectFit: "cover" }} />
      </div>

      <section className="ask-form-section shell" id="tarot-form">
        <TarotReadingForm
          member={member ? { name: member.name, email: member.email } : null}
          price={AI_TAROT_READING_PRICE}
          currency={AI_READING_CURRENCY}
          onlinePaymentsAvailable={isRazorpayConfigured()}
        />
        <p className="legal-note">Tarot ek paramparik aur sahajik (intuitive) vidya hai jo sadiyon se chali aa rahi hai — yeh vigyanik roop se saabit nahi hai aur ise manoranjan aur aatmik margdarshan ke roop mein liya jaana chahiye, na ki medical, legal, ya financial faisalon ke aadhar ke roop mein.</p>
      </section>

      <SiteFooter />
    </main>
  );
}
