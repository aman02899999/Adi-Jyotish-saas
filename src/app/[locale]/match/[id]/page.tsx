import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { ArrowUpRight, HeartHandshake } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ShareButtons } from "@/components/share-buttons";
import { getShareableKundliMatch } from "@/lib/kundli-matching";
import { getSiteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const match = await getShareableKundliMatch(id);
  if (!match) return {};
  const title = `${match.nameA} & ${match.nameB}: ${match.score}/${match.maxScore} · Adi Jyotish Guru`;
  const description = `${match.tierLabel} on the classical Ashtakoot Guna Milan scale.`;
  return {
    title,
    description,
    openGraph: { title, description, url: `/match/${id}`, images: [{ url: `/api/match-card/${id}`, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title, description, images: [`/api/match-card/${id}`] },
  };
}

export default async function MatchCardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const match = await getShareableKundliMatch(id);
  if (!match) notFound();

  const shareUrl = new URL(`/match/${id}`, getSiteUrl()).toString();

  return (
    <main className="marketing-page">
      <SiteHeader />
      <section className="hero-cosmic">
        <div className="cosmic-card-hero shell">
          <p className="eyebrow"><span /> Kundli matching</p>
          <h1>{match.nameA} &amp; {match.nameB}</h1>
          <div className="match-score match-score--share"><strong>{match.score}</strong><span>/ {match.maxScore} guna points</span></div>
          <p className="cosmic-card-blurb">{match.tierLabel}</p>
          <ShareButtons url={shareUrl} title={`${match.nameA} & ${match.nameB}'s compatibility match`} text={`We scored ${match.score}/${match.maxScore} on the classical Ashtakoot Guna Milan scale.`} />
        </div>
      </section>

      <section className="cosmic-card-cta shell">
        <HeartHandshake size={22} />
        <h2>Check your own compatibility.</h2>
        <p>Free · real Ashtakoot Guna Milan engine, not a generic quiz.</p>
        <Link href="/kundli-matching" className="button">Match your charts <ArrowUpRight size={15} /></Link>
      </section>

      <SiteFooter />
    </main>
  );
}
