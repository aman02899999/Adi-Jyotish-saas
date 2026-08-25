import type { Metadata } from "next";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { Award, BadgeCheck, Gem, PackageCheck, ShieldCheck, Sparkles, Truck } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export const metadata: Metadata = {
  title: "Buy Gemstones · Coming Soon",
  description: "Our certified Vedic gemstone store is on its way. Get a free personalised gemstone recommendation now while you wait.",
  openGraph: { title: "Buy Gemstones · Coming Soon", description: "Certified Vedic gemstones, arriving soon.", url: "/gemstones" },
};

/** The storefront (shop, product pages, cart, checkout, compare, order confirmation) is
 * intentionally offline while the catalogue is finalized — every route under /gemstones/*
 * redirects back here (see each page.tsx) except /gemstones/recommend, the free AI gemstone
 * recommender, which stays live since it's a lead-gen tool independent of checkout being open.
 * Admin product/category/order management (src/app/[locale]/admin/(protected)/gemstones/*) is
 * untouched so the catalogue can keep being prepared behind the scenes. */
export default function GemstonesComingSoonPage() {
  return (
    <main className="marketing-page gem-store">
      <SiteHeader />

      <section className="gem-hero shell">
        <div className="gem-hero__copy reveal">
          <p className="eyebrow"><span /> Buy Gemstones</p>
          <h1>Genuine Vedic<br /><em>Gemstones — Coming Soon.</em></h1>
          <p className="gem-hero__lead">We&apos;re finishing certification and curation on our gemstone collection. In the meantime, get a free personalised recommendation so you know exactly which stone to look for the moment we open.</p>
          <div className="hero-actions">
            <Link href="/gemstones/recommend" className="button">Get a Free Recommendation <Sparkles size={17} /></Link>
            <Link href="/astrologers" className="button button--ghost">Talk to an Astrologer Instead</Link>
          </div>
        </div>
        <div className="gem-hero__art reveal reveal--delay">
          <div className="gem-hero__halo" />
          <Image src="/images/gemstones/hero-gemstones.jpg" alt="Premium Vedic gemstones collection" fill priority sizes="(max-width: 800px) 100vw, 55vw" />
        </div>
      </section>

      <section className="gem-trust shell" id="learn">
        <div className="section-heading reveal">
          <div><p className="eyebrow"><span /> What to expect</p><h2 style={{ fontSize: "clamp(28px,3vw,40px)" }}>Built for trust,<br /><em>from day one.</em></h2></div>
        </div>
        <div className="gem-trust__grid">
          <article><span><BadgeCheck size={22} /></span><div><strong>Certified Authentic</strong><p>Every gemstone will be lab-verified with transparent origin and treatment details.</p></div></article>
          <article><span><ShieldCheck size={22} /></span><div><strong>Secure Payments</strong><p>Checkout will be protected end-to-end through Razorpay.</p></div></article>
          <article><span><Truck size={22} /></span><div><strong>Fast Delivery</strong><p>Carefully packaged and dispatched across India.</p></div></article>
          <article><span><Award size={22} /></span><div><strong>Curated Quality</strong><p>Each piece is reviewed by our studio before it&apos;s listed.</p></div></article>
          <article><span><PackageCheck size={22} /></span><div><strong>Easy Tracking</strong><p>Follow your order from processing to delivery in your dashboard.</p></div></article>
          <article><span><Gem size={22} /></span><div><strong>Astrologically Guided</strong><p>Every listing will note recommended zodiac signs and planetary influence.</p></div></article>
        </div>
      </section>

      <section className="cta shell reveal">
        <div className="cta-zodiac" aria-hidden="true">✦</div>
        <p className="eyebrow"><span /> Find your stone</p>
        <h2>Wear what<br /><em>the sky recommends.</em></h2>
        <p>Share your birth date and let our AI guide point you to your stone — free, and ready before the store is.</p>
        <Link href="/gemstones/recommend" className="button button--light">Get a Live recommendation <Sparkles size={16} /></Link>
      </section>
    <SiteFooter />
    </main>
  );
}
