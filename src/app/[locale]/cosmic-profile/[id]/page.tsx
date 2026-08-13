import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { ArrowUpRight, Moon, Sparkles, Sun, SunMoon } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ShareButtons } from "@/components/share-buttons";
import { getCosmicProfileCard } from "@/lib/cosmic-profile-card";
import { getSiteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const card = await getCosmicProfileCard(id);
  if (!card) return {};
  const title = `${card.name}'s Cosmic Profile · Adi Jyotish Guru`;
  return {
    title,
    description: card.blurb,
    openGraph: { title, description: card.blurb, url: `/cosmic-profile/${id}`, images: [{ url: `/api/cosmic-profile-card/${id}`, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title, description: card.blurb, images: [`/api/cosmic-profile-card/${id}`] },
  };
}

export default async function CosmicProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const card = await getCosmicProfileCard(id);
  if (!card) notFound();

  const shareUrl = new URL(`/cosmic-profile/${id}`, getSiteUrl()).toString();

  return (
    <main className="marketing-page">
      <SiteHeader />
      <section className="hero-cosmic">
        <div className="cosmic-card-hero shell">
          <p className="eyebrow"><span /> Cosmic Profile</p>
          <h1>{card.name}&rsquo;s chart,<br /><em>at a glance.</em></h1>
          <div className="cosmic-card-signs">
            <div><Sun size={19} /><span>Sun</span><strong>{card.sunRashi}</strong></div>
            <div><Moon size={19} /><span>Moon</span><strong>{card.moonRashi}</strong></div>
            <div><SunMoon size={19} /><span>Rising</span><strong>{card.risingRashi}</strong></div>
          </div>
          <p className="cosmic-card-blurb">&ldquo;{card.blurb}&rdquo;</p>
          <ShareButtons url={shareUrl} title={`${card.name}'s Cosmic Profile`} text={card.blurb} />
        </div>
      </section>

      <section className="cosmic-card-cta shell">
        <Sparkles size={22} />
        <h2>Get your own free cosmic profile.</h2>
        <p>A real sidereal Vedic chart — not a generic sun-sign guess.</p>
        <Link href="/account?mode=register" className="button">Create your chart <ArrowUpRight size={15} /></Link>
      </section>

      <SiteFooter />
    </main>
  );
}
