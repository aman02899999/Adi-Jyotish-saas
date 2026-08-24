import type { Metadata } from "next";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { ArrowRight, CheckCircle2, ShieldCheck, Sparkles } from "lucide-react";
import { MarketplaceExplorer } from "@/components/marketplace-explorer";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getCurrentMember } from "@/lib/member-auth";
import { getFavoritePractitionerIds, getMarketplacePractitioners } from "@/lib/marketplace";

export const dynamic = "force-dynamic";

// Keyed by the `query` values the homepage's category tiles link with
// (/astrologers?q=<key>) — each one gets its own hero copy instead of the
// generic default, so a category click actually feels like it landed
// somewhere relevant instead of the same page every time.
const CATEGORY_COPY: Record<string, { eyebrow: string; heading: string; emphasis: string; lead: string }> = {
  relationship: {
    eyebrow: "Love & Relationships",
    heading: "Understand your heart's",
    emphasis: "timing.",
    lead: "Guides who read connection and compatibility with care — timing, patterns, and what's really going on beneath the surface, not sun-sign clichés.",
  },
  marriage: {
    eyebrow: "Marriage & Compatibility",
    heading: "Guidance for marriage",
    emphasis: "and compatibility.",
    lead: "Practitioners who specialize in chart matching, muhurat timing, and marriage-focused readings for you and your partner.",
  },
  career: {
    eyebrow: "Career & Business",
    heading: "Clarity for your",
    emphasis: "career and business.",
    lead: "Guides who read growth cycles, career transitions, and business timing — grounded advice for real decisions.",
  },
  health: {
    eyebrow: "Health & Wellness",
    heading: "Insight into your",
    emphasis: "vitality and wellness.",
    lead: "Practitioners focused on health patterns and wellness through the chart, paired with practical, grounded guidance.",
  },
  vastu: {
    eyebrow: "Family & Home",
    heading: "Harmony for your",
    emphasis: "family and home.",
    lead: "Guides specializing in family dynamics, home harmony, and Vastu-based remedies for a more settled household.",
  },
  education: {
    eyebrow: "Education",
    heading: "Focus for your",
    emphasis: "academic journey.",
    lead: "Practitioners who read timing for exams, learning focus, and academic milestones for you or your child.",
  },
};

const DEFAULT_COPY = {
  eyebrow: "The Jyotish guide collective",
  heading: "Meet the person",
  emphasis: "behind the reading.",
  lead: "Choose a practitioner by method, language, lived experience, and the kind of conversation you need—not by a noisy popularity contest.",
};

function copyFor(q: string | undefined) {
  return (q && CATEGORY_COPY[q]) || DEFAULT_COPY;
}

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ q?: string }> }): Promise<Metadata> {
  const { q } = await searchParams;
  const copy = copyFor(q);
  const title = q && CATEGORY_COPY[q] ? `${copy.eyebrow} · Vedic Astrologers` : "Vedic Astrologers";
  const description = q && CATEGORY_COPY[q] ? copy.lead : "Meet verified Vedic astrologers for thoughtful private readings, transparent specialties, and real-time scheduling.";
  return {
    title,
    description,
    openGraph: { title, description, url: q ? `/astrologers?q=${encodeURIComponent(q)}` : "/astrologers" },
  };
}

export default async function AstrologersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const [{ q }, people, member] = await Promise.all([searchParams, getMarketplacePractitioners(), getCurrentMember()]);
  const favorites = member ? await getFavoritePractitionerIds(member.id) : [];
  const cards = people.map((person) => ({
    id: person.id,
    slug: person.slug,
    name: person.name,
    title: person.title,
    bio: person.bio,
    specialties: person.specialties,
    languages: person.languages,
    consultationModes: person.consultationModes,
    experienceYears: person.experienceYears,
    verified: person.verified,
    verificationLevel: person.verificationLevel,
    photoUrl: person.photoUrl,
    online: person.online,
    featured: person.featured,
    rating: person.rating,
    reviewCount: person.reviewCount,
    chatRatePerMinute: person.chatRatePerMinute,
    discountedRatePerMinute: person.discountedRatePerMinute,
    reviewDiscountPercent: person.reviewDiscountPercent,
    sessionPrice: person.sessionPrice,
    sessionOriginalPrice: person.sessionOriginalPrice,
    sessionDiscountPercent: person.sessionDiscountPercent,
    availableDays: new Set(person.rules.filter((rule) => rule.active).map((rule) => rule.weekday)).size,
  }));
  const copy = copyFor(q);

  return (
    <main className="marketplace-page">
      <SiteHeader />
      <section className="marketplace-hero shell">
        <div>
          <p className="eyebrow"><span />{copy.eyebrow}</p>
          <h1>{copy.heading}<br /><em>{copy.emphasis}</em></h1>
          <p>{copy.lead}</p>
          <div>
            <Link className="button" href="#experts">Find your guide <ArrowRight size={16} /></Link>
            <Link className="button button--ghost" href="/book">Browse open times</Link>
          </div>
        </div>
        <aside>
          <div className="marketplace-hero-photo">
            <Image src="/images/astrologers-hero.jpg" alt="Hands unrolling an astrological birth chart scroll beside a compass, under a starry sky" fill sizes="(max-width: 720px) 100vw, 480px" style={{ objectFit: "cover" }} priority />
          </div>
          <div className="marketplace-trust">
            <article><CheckCircle2 size={17} /><span><strong>Identity & method reviewed</strong><small>Every published guide passes studio review.</small></span></article>
            <article><ShieldCheck size={17} /><span><strong>Private by design</strong><small>Your birth details stay within your care journey.</small></span></article>
            <article><Sparkles size={17} /><span><strong>Real consultation reviews</strong><small>Only completed sessions can be reviewed.</small></span></article>
          </div>
        </aside>
      </section>
      <section className="marketplace-body shell" id="experts">
        <div className="marketplace-heading">
          <div>
            <p>Choose with confidence</p>
            <h2>Practitioners, not profiles<br /><em>optimized for clicks.</em></h2>
          </div>
          <span>Our ordering favors fit, verification, experience, and availability. New guides are not penalized for having fewer reviews.</span>
        </div>
        <MarketplaceExplorer people={cards} favoriteIds={favorites} memberSignedIn={Boolean(member)} initialQuery={q ?? ""} />
      </section>
      <SiteFooter />
    </main>
  );
}
