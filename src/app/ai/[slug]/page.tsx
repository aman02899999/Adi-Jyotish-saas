import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckCircle2, Clock3, ShieldCheck, Sparkles } from "lucide-react";
import { AiPersonaReadingForm } from "@/components/ai-persona-reading-form";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getPersonaBySlug } from "@/lib/ai-personas";
import { getCurrentMember } from "@/lib/member-auth";
import { isRazorpayConfigured } from "@/lib/razorpay";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const persona = await getPersonaBySlug(slug);
  if (!persona || !persona.active) return { title: "Reading not found" };
  return {
    title: `${persona.name} · ${persona.title}`,
    description: persona.description,
    openGraph: { title: `${persona.name} · ${persona.title}`, description: persona.description, url: `/ai/${persona.slug}` },
  };
}

export default async function AiPersonaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [persona, member] = await Promise.all([getPersonaBySlug(slug), getCurrentMember()]);
  if (!persona || !persona.active) notFound();

  return (
    <main className="marketing-page">
      <SiteHeader />

      <section className="ask-hero shell">
        <div className="ask-hero__copy reveal">
          <p className="eyebrow"><span /> Live · {persona.title}</p>
          <h1>{persona.name}</h1>
          <p className="ask-hero__lead">{persona.description}</p>
          <ul className="ask-hero__points">
            <li><Sparkles size={15} /> Personal answer to your exact question</li>
            <li><Clock3 size={15} /> Ready in about a minute after payment</li>
            <li><ShieldCheck size={15} /> Your question stays private</li>
          </ul>
        </div>
        <div className="ask-hero__persona reveal reveal--delay">
          <div className="ask-persona-card">
            <div className="ask-persona-avatar">
              {persona.avatarUrl ? <img src={persona.avatarUrl} alt={persona.name} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit" }} /> : <Sparkles size={26} />}
            </div>
            <strong>{persona.name}</strong>
            <span>{persona.title}</span>
            <div className="ask-persona-price">{persona.price > 0 ? <>{persona.currency} {persona.price}<small>one-time payment</small></> : <>Free<small>for members</small></>}</div>
            <ul>
              <li><CheckCircle2 size={13} /> Based on exactly what you ask</li>
              <li><CheckCircle2 size={13} /> A full, personal answer — every time</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="ask-form-section shell" id="persona-form">
        <AiPersonaReadingForm
          slug={persona.slug}
          name={persona.name}
          member={member ? { name: member.name, email: member.email } : null}
          price={persona.price}
          currency={persona.currency}
          onlinePaymentsAvailable={isRazorpayConfigured()}
          sampleQuestions={persona.sampleQuestions}
        />
        <p className="legal-note">Readings are offered for guidance and self-reflection. They are not a substitute for medical, legal, or financial advice, and no specific outcome is guaranteed.</p>
      </section>

      <SiteFooter />
    </main>
  );
}
