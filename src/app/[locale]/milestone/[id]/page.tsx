import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { ArrowUpRight, Sparkles } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ShareButtons } from "@/components/share-buttons";
import { getMilestone } from "@/lib/milestones";
import { getSiteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const milestone = await getMilestone(id);
  if (!milestone) return {};
  const title = `${milestone.value.toLocaleString("en-IN")} consultations delivered · Adi Jyotish Guru`;
  const description = "A real milestone — real consultations delivered by our verified Vedic astrologers.";
  return {
    title,
    description,
    openGraph: { title, description, url: `/milestone/${id}`, images: [{ url: `/api/milestone-card/${id}`, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title, description, images: [`/api/milestone-card/${id}`] },
  };
}

export default async function MilestonePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const milestone = await getMilestone(id);
  if (!milestone) notFound();

  const shareUrl = new URL(`/milestone/${id}`, getSiteUrl()).toString();

  return (
    <main className="marketing-page">
      <SiteHeader />
      <section className="hero-cosmic">
        <div className="cosmic-card-hero shell">
          <p className="eyebrow"><span /> Milestone</p>
          <h1>{milestone.value.toLocaleString("en-IN")}<br /><em>consultations delivered.</em></h1>
          <p className="cosmic-card-blurb">Real sessions, with real Vedic astrologers — not a vanity number. Thank you to everyone who trusted us with their questions.</p>
          <ShareButtons url={shareUrl} title={`${milestone.value.toLocaleString("en-IN")} consultations delivered`} text="A real milestone at Adi Jyotish Guru." />
        </div>
      </section>

      <section className="cosmic-card-cta shell">
        <Sparkles size={22} />
        <h2>Be part of the next milestone.</h2>
        <p>Book a private reading with a verified Vedic astrologer.</p>
        <Link href="/astrologers" className="button">Browse astrologers <ArrowUpRight size={15} /></Link>
      </section>

      <SiteFooter />
    </main>
  );
}
