import type { Metadata } from "next";
import { CheckCircle2, Clock3, ShieldCheck, Sparkles } from "lucide-react";
import { VarshphalReportForm } from "@/components/varshphal-report-form";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { AI_READING_CURRENCY, AI_VARSHPHAL_PRICE } from "@/lib/ai-readings";
import { getCurrentMember } from "@/lib/member-auth";
import { isRazorpayConfigured } from "@/lib/razorpay";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Varshphal · Annual Solar Return Report",
  description: "Your personal Varshphal — the exact moment your Sun returns to its natal position this year, and what the resulting chart says about the year ahead.",
  openGraph: { title: "Varshphal · Annual Solar Return Report", description: "A real annual forecast, computed from your Sun's exact return moment.", url: "/varshphal" },
};

export default async function VarshphalPage() {
  const member = await getCurrentMember();

  return (
    <main className="marketing-page">
      <SiteHeader />

      <section className="ask-hero shell">
        <div className="ask-hero__copy reveal">
          <p className="eyebrow"><span /> Varshphal</p>
          <h1>Your year,<br /><em>cast in the stars.</em></h1>
          <p className="ask-hero__lead">Once a year, your Sun returns to the exact sidereal position it held at your birth. That instant opens a fresh chart — your Varshphal — and classical Jyotish reads it for the year&rsquo;s tone: career, relationships, and where your growth is likely to come from.</p>
          <ul className="ask-hero__points">
            <li><Sparkles size={15} /> The exact return moment, numerically computed</li>
            <li><Clock3 size={15} /> Ready instantly after payment</li>
            <li><ShieldCheck size={15} /> Your birth details are kept private</li>
          </ul>
        </div>
        <div className="ask-hero__persona reveal reveal--delay">
          <div className="ask-persona-card">
            <div className="ask-persona-avatar"><Sparkles size={26} /></div>
            <strong>Solar Return Engine</strong>
            <span>Real astronomical search · Not a template</span>
            <div className="ask-persona-price">{AI_READING_CURRENCY} {AI_VARSHPHAL_PRICE}<small>per year</small></div>
            <ul>
              <li><CheckCircle2 size={13} /> This year&rsquo;s Lagna, Varshesh, and key houses</li>
              <li><CheckCircle2 size={13} /> Full planetary table for the return chart</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="ask-form-section shell" id="varshphal-form">
        <VarshphalReportForm
          member={member ? { name: member.name, email: member.email, birthDate: member.birthDate, birthTime: member.birthTime, birthPlace: member.birthPlace } : null}
          price={AI_VARSHPHAL_PRICE}
          currency={AI_READING_CURRENCY}
          onlinePaymentsAvailable={isRazorpayConfigured()}
        />
        <p className="legal-note">This report offers guidance and reflection for the year ahead, not a guarantee of any outcome — it is not a substitute for medical, legal, or financial advice.</p>
      </section>
      <SiteFooter />
    </main>
  );
}
