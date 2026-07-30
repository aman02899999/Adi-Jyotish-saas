import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Award, BadgeCheck, PackageCheck, ShieldCheck, Sparkles, Truck } from "lucide-react";
import { GemstoneProductCard } from "@/components/gemstone-product-card";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getWishlistProductIds } from "@/lib/gemstone-wishlist";
import { getActiveCategories, getProductCatalog } from "@/lib/gemstones";
import { getCurrentMember } from "@/lib/member-auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Buy Gemstones · Genuine Vedic Gemstones",
  description: "Discover premium natural gemstones carefully selected for spiritual and astrological guidance. Shop securely with verified quality and transparent information.",
  openGraph: { title: "Buy Gemstones · Genuine Vedic Gemstones", description: "Shop authentic, certified Vedic gemstones online.", url: "/gemstones" },
};

const marqueeItems = [
  "Certified Genuine Gemstones", "Lab Verified Quality", "Secure Razorpay Payments", "Fast Delivery Across India",
  "Carefully Curated Collection", "Premium Packaging", "Trusted by Thousands of Customers", "Easy Order Tracking",
];

export default async function GemstonesLandingPage() {
  const [categories, featured, trending, bestsellers, member] = await Promise.all([
    getActiveCategories(),
    getProductCatalog({ featured: true, pageSize: 8 }),
    getProductCatalog({ trending: true, pageSize: 8 }),
    getProductCatalog({ bestseller: true, pageSize: 8 }),
    getCurrentMember(),
  ]);
  const wishlistIds = member ? await getWishlistProductIds(member.id) : [];

  return (
    <main className="marketing-page gem-store">
      <SiteHeader />

      <section className="gem-hero shell">
        <div className="gem-hero__copy reveal">
          <p className="eyebrow"><span /> The Buy Gemstones module</p>
          <h1>Genuine<br /><em>Vedic Gemstones.</em></h1>
          <p className="gem-hero__lead">Discover premium natural gemstones carefully selected for spiritual and astrological guidance. Shop securely with verified quality and transparent information.</p>
          <div className="hero-actions">
            <Link href="/gemstones/shop" className="button">Explore Gemstones <ArrowRight size={17} /></Link>
            <Link href="#learn" className="button button--ghost">Learn About Gemstones</Link>
          </div>
        </div>
        <div className="gem-hero__art reveal reveal--delay">
          <div className="gem-hero__halo" />
          <Image src="/images/gemstones/hero-gemstones.jpg" alt="Premium Vedic gemstones collection" fill priority sizes="(max-width: 800px) 100vw, 55vw" />
        </div>
      </section>

      <div className="gem-marquee" aria-hidden="true">
        <div className="gem-marquee__track">
          {[...marqueeItems, ...marqueeItems].map((item, index) => <span key={index}><Sparkles size={13} /> {item}</span>)}
        </div>
      </div>

      <section className="gem-categories shell" id="categories">
        <div className="section-heading reveal">
          <div><p className="eyebrow"><span /> Shop by stone</p><h2 style={{ fontSize: "clamp(32px,3.4vw,46px)" }}>Every gem,<br /><em>one destination.</em></h2></div>
        </div>
        <div className="gem-category-grid">
          {categories.map((category) => (
            <Link href={`/gemstones/shop?category=${category.slug}`} className="gem-category-tile reveal" key={category.id}>
              <div className="gem-category-tile__art">{category.imageUrl && <Image src={category.imageUrl} alt={category.name} fill sizes="180px" />}</div>
              <strong>{category.name}</strong>
              <small>{category.productCount} piece{category.productCount === 1 ? "" : "s"}</small>
            </Link>
          ))}
        </div>
      </section>

      {featured.items.length > 0 && (
        <section className="gem-rail shell">
          <div className="gem-rail__head reveal"><div><p className="eyebrow"><span /> Handpicked</p><h2>Featured gemstones</h2></div><Link href="/gemstones/shop?featured=1" className="text-arrow">View all <ArrowRight size={16} /></Link></div>
          <div className="product-grid">{featured.items.map((product) => <GemstoneProductCard key={product.id} product={product} wishlisted={wishlistIds.includes(product.id)} />)}</div>
        </section>
      )}

      {trending.items.length > 0 && (
        <section className="gem-rail shell">
          <div className="gem-rail__head reveal"><div><p className="eyebrow"><span /> Right now</p><h2>Trending gemstones</h2></div><Link href="/gemstones/shop?trending=1" className="text-arrow">View all <ArrowRight size={16} /></Link></div>
          <div className="product-grid">{trending.items.map((product) => <GemstoneProductCard key={product.id} product={product} wishlisted={wishlistIds.includes(product.id)} />)}</div>
        </section>
      )}

      {bestsellers.items.length > 0 && (
        <section className="gem-rail shell">
          <div className="gem-rail__head reveal"><div><p className="eyebrow"><span /> Loved by seekers</p><h2>Bestselling gemstones</h2></div><Link href="/gemstones/shop?bestseller=1" className="text-arrow">View all <ArrowRight size={16} /></Link></div>
          <div className="product-grid">{bestsellers.items.map((product) => <GemstoneProductCard key={product.id} product={product} wishlisted={wishlistIds.includes(product.id)} />)}</div>
        </section>
      )}

      <section className="gem-trust shell" id="learn">
        <div className="gem-trust__grid">
          <article><span><BadgeCheck size={22} /></span><div><strong>Certified Authentic</strong><p>Every gemstone is lab-verified with transparent origin and treatment details.</p></div></article>
          <article><span><ShieldCheck size={22} /></span><div><strong>Secure Payments</strong><p>Checkout is protected end-to-end through Razorpay.</p></div></article>
          <article><span><Truck size={22} /></span><div><strong>Fast Delivery</strong><p>Carefully packaged and dispatched across India.</p></div></article>
          <article><span><Award size={22} /></span><div><strong>Curated Quality</strong><p>Each piece is reviewed by our studio before it&apos;s listed.</p></div></article>
          <article><span><PackageCheck size={22} /></span><div><strong>Easy Tracking</strong><p>Follow your order from processing to delivery in your dashboard.</p></div></article>
          <article><span><Sparkles size={22} /></span><div><strong>Astrologically Guided</strong><p>Every listing notes recommended zodiac signs and planetary influence.</p></div></article>
        </div>
      </section>

      <section className="cta shell reveal">
        <div className="cta-zodiac" aria-hidden="true">✦</div>
        <p className="eyebrow"><span /> Find your stone</p>
        <h2>Wear what<br /><em>the sky recommends.</em></h2>
        <p>Share your birth date and let our AI guide point you to your stone from the full collection.</p>
        <Link href="/gemstones/recommend" className="button button--light">Get an AI recommendation <Sparkles size={16} /></Link>
      </section>
    <SiteFooter />
    </main>
  );
}
