import type { Metadata } from "next";
import { CheckCircle2, Clock3, ScanFace, ShieldCheck } from "lucide-react";
import { FaceReadingForm } from "@/components/face-reading-form";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { AI_FACE_READING_PRICE, AI_READING_CURRENCY } from "@/lib/ai-readings";
import { getCurrentMember } from "@/lib/member-auth";
import { isRazorpayConfigured } from "@/lib/razorpay";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Acharya Devraj Bhardwaj · Mukh Samudrik Shastra (Face Reading)",
  description: "Upload a clear face photo and receive a full Hinglish Mukh Samudrik Shastra (face reading) report from Acharya Devraj Bhardwaj — personality, career, and relationships, read from your features.",
  openGraph: { title: "Acharya Devraj Bhardwaj · Face Reading", description: "Upload your photo, pay once, get your personal Hinglish Mukh Samudrik report.", url: "/face-reading" },
};

export default async function FaceReadingPage() {
  const member = await getCurrentMember();

  return (
    <main className="marketing-page">
      <SiteHeader />

      <section className="ask-hero shell">
        <div className="ask-hero__copy reveal">
          <p className="eyebrow"><span /> Ultra-premium · Mukh Samudrik Shastra</p>
          <h1>Acharya Devraj<br /><em>Bhardwaj.</em></h1>
          <p className="ask-hero__lead">Apne chehre ki ek saaf tasveer bhejein — Acharya Devraj Bhardwaj use dhyan se padhkar aapke vyaktitva, career, aur rishton par ek poori Hinglish report taiyaar karte hain.</p>
          <ul className="ask-hero__points">
            <li><ScanFace size={15} /> Gehra Mukh Samudrik Shastra vishleshan</li>
            <li><Clock3 size={15} /> Report kuch hi minute mein, payment ke baad</li>
            <li><ShieldCheck size={15} /> Aapki tasveer niji (private) rehti hai</li>
          </ul>
        </div>
        <div className="ask-hero__persona reveal reveal--delay">
          <div className="ask-persona-card">
            <div className="ask-persona-avatar"><ScanFace size={26} /></div>
            <strong>Acharya Devraj Bhardwaj</strong>
            <span>Mukh Samudrik Shastri · Personal reading</span>
            <div className="ask-persona-price">{AI_READING_CURRENCY} {AI_FACE_READING_PRICE}<small>ek baar ka payment</small></div>
            <ul>
              <li><CheckCircle2 size={13} /> Swabhav, career, aur rishtey — sab ek report mein</li>
              <li><CheckCircle2 size={13} /> Poori tarah Hinglish mein, samajhne mein aasaan</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="ask-form-section shell" id="face-form">
        <FaceReadingForm
          member={member ? { name: member.name, email: member.email } : null}
          price={AI_FACE_READING_PRICE}
          currency={AI_READING_CURRENCY}
          onlinePaymentsAvailable={isRazorpayConfigured()}
        />
        <p className="legal-note">Mukh Samudrik Shastra ek paramparik (traditional) vidya hai jo peedhiyon se chali aa rahi hai — yeh vigyanik roop se saabit nahi hai aur ise manoranjan aur aatmik margdarshan ke roop mein liya jaana chahiye, na ki medical, legal, ya financial faisalon ke aadhar ke roop mein.</p>
      </section>

      <SiteFooter />
    </main>
  );
}
