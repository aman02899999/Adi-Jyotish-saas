import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getActivePersonas } from "@/lib/ai-personas";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Live AI Readings",
  description: "Ask a question and get an instant, personal reading from one of our Live guides.",
  openGraph: { title: "Live AI Readings", description: "Ask a question and get an instant, personal reading.", url: "/ai" },
};

export default async function AiPersonasIndexPage() {
  const personas = await getActivePersonas();

  return (
    <main className="marketing-page">
      <SiteHeader />
      <section className="ask-hero shell" style={{ gridTemplateColumns: "1fr" }}>
        <div className="ask-hero__copy reveal">
          <p className="eyebrow"><span /> Live guides</p>
          <h1>Ask your question,<br /><em>get a personal answer.</em></h1>
          <p className="ask-hero__lead">Every guide below answers instantly, in their own voice, based on exactly what you ask.</p>
        </div>
      </section>

      <section className="category-strip shell" aria-label="AI readings">
        <div className="category-grid">
          {personas.map((persona) => (
            <Link href={`/ai/${persona.slug}`} className="category-tile" key={persona.id}>
              <span>{persona.avatarUrl ? <img src={persona.avatarUrl} alt="" style={{ width: 21, height: 21, borderRadius: "50%", objectFit: "cover" }} /> : <Sparkles size={21} strokeWidth={1.4} />}</span>
              <strong>{persona.name}</strong>
              <small>{persona.title} · {persona.price > 0 ? `₹${persona.price}` : "Free"}</small>
            </Link>
          ))}
          {personas.length === 0 && <p style={{ color: "var(--muted)" }}>No live readings are available right now — check back soon.</p>}
        </div>
      </section>

      <div className="shell" style={{ paddingBottom: 40 }}>
        <Link href="/astrologers" className="button button--ghost">Browse human practitioners instead <ArrowRight size={15} /></Link>
      </div>

      <SiteFooter />
    </main>
  );
}
