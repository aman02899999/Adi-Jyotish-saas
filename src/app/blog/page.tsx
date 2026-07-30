import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getAllPosts } from "@/lib/blog";

export const metadata: Metadata = {
  title: "The Jyotish Journal",
  description: "Notes on Vedic astrology — Moon signs, planetary transits, Muhurat timing, and how to read your chart with real clarity.",
  openGraph: { title: "The Jyotish Journal", description: "Notes on Vedic astrology, written to be actually useful.", url: "/blog" },
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en", { month: "long", day: "numeric", year: "numeric" });
}

export default function BlogIndexPage() {
  const posts = getAllPosts();
  const [featured, ...rest] = posts;

  return (
    <main className="marketing-page blog-page">
      <SiteHeader />
      <section className="blog-hero shell">
        <p className="eyebrow"><span /> The Jyotish journal</p>
        <h1>Notes for the<br /><em>curious and the committed.</em></h1>
        <p>Grounded explanations of how Vedic astrology actually works — no vague predictions, just the tradition explained clearly.</p>
      </section>

      {featured && (
        <section className="shell blog-featured">
          <Link href={`/blog/${featured.slug}`} className="blog-featured__card">
            <div className="blog-featured__art">
              <Image src={featured.cover} alt={featured.title} fill sizes="(max-width: 900px) 100vw, 60vw" />
            </div>
            <div className="blog-featured__copy">
              <p className="eyebrow"><span /> {featured.category}</p>
              <h2>{featured.title}</h2>
              <p>{featured.excerpt}</p>
              <div className="blog-meta">
                <span>{formatDate(featured.publishedAt)}</span><b>·</b><span>{featured.readMinutes} min read</span>
              </div>
              <span className="text-arrow">Read the piece <ArrowRight size={16} /></span>
            </div>
          </Link>
        </section>
      )}

      <section className="shell blog-grid">
        {rest.map((post) => (
          <Link href={`/blog/${post.slug}`} className="blog-card reveal" key={post.slug}>
            <div className="blog-card__art">
              <Image src={post.cover} alt={post.title} fill sizes="(max-width: 700px) 100vw, 33vw" />
            </div>
            <div className="blog-card__copy">
              <p className="eyebrow"><span /> {post.category}</p>
              <h3>{post.title}</h3>
              <p>{post.excerpt}</p>
              <div className="blog-meta"><span>{formatDate(post.publishedAt)}</span><b>·</b><span>{post.readMinutes} min read</span></div>
            </div>
          </Link>
        ))}
      </section>

      <section className="cta shell reveal">
        <div className="cta-zodiac" aria-hidden="true">✦</div>
        <p className="eyebrow"><span /> Ready for your own reading</p>
        <h2>Your chart says more<br /><em>than any article can.</em></h2>
        <p>A personal consultation reads your exact birth details, not a general pattern.</p>
        <Link href="/book" className="button button--light">Begin your reading <ArrowRight size={17} /></Link>
      </section>
    <SiteFooter />
    </main>
  );
}
