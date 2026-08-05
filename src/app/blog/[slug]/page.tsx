import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { JsonLd } from "@/components/json-ld";
import { ShareButtons } from "@/components/share-buttons";
import { getAllPosts, getPostBySlug } from "@/lib/blog";
import { getSiteUrl } from "@/lib/site-url";

export function generateStaticParams() {
  return getAllPosts().map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) return {};
  return {
    title: post.title,
    description: post.excerpt,
    openGraph: { title: post.title, description: post.excerpt, url: `/blog/${post.slug}`, images: [{ url: post.cover, width: 1200, height: 800, alt: post.title }] },
  };
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en", { month: "long", day: "numeric", year: "numeric" });
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();

  const others = getAllPosts().filter((p) => p.slug !== post.slug).slice(0, 2);

  return (
    <main className="marketing-page blog-post-page">
      <JsonLd data={{
        "@context": "https://schema.org",
        "@type": "Article",
        headline: post.title,
        description: post.excerpt,
        image: new URL(post.cover, getSiteUrl()).toString(),
        datePublished: post.publishedAt,
        author: { "@type": "Person", name: post.author },
        publisher: { "@type": "Organization", name: "Adi Jyotish Gurus" },
        mainEntityOfPage: new URL(`/blog/${post.slug}`, getSiteUrl()).toString(),
      }} />
      <SiteHeader />
      <article className="blog-post shell">
        <Link href="/blog" className="text-arrow blog-post__back"><ArrowLeft size={15} /> The journal</Link>
        <p className="eyebrow"><span /> {post.category}</p>
        <h1>{post.title}</h1>
        <div className="blog-meta blog-meta--post"><span>{post.author}</span><b>·</b><span>{formatDate(post.publishedAt)}</span><b>·</b><span>{post.readMinutes} min read</span></div>
        <ShareButtons url={new URL(`/blog/${post.slug}`, getSiteUrl()).toString()} title={post.title} text={post.excerpt} />

        <div className="blog-post__art">
          <Image src={post.cover} alt={post.title} fill priority sizes="(max-width: 900px) 100vw, 900px" />
        </div>

        <div className="blog-post__body">
          {post.body.map((block, index) => (
            <section key={index}>
              {block.heading && <h2>{block.heading}</h2>}
              {block.paragraphs.map((paragraph, pIndex) => (
                <p key={pIndex}>{paragraph}</p>
              ))}
            </section>
          ))}
        </div>

        <div className="blog-post__cta">
          <p className="eyebrow"><span /> Take it further</p>
          <h3>Curious what your own chart shows?</h3>
          <p>This is general guidance. A consultation reads your exact birth chart.</p>
          <Link href="/book" className="button">Book a reading <ArrowRight size={16} /></Link>
        </div>

        {others.length > 0 && (
          <div className="blog-post__more">
            <p className="eyebrow"><span /> Keep reading</p>
            <div className="blog-grid blog-grid--compact">
              {others.map((other) => (
                <Link href={`/blog/${other.slug}`} className="blog-card" key={other.slug}>
                  <div className="blog-card__art"><Image src={other.cover} alt={other.title} fill sizes="(max-width: 700px) 100vw, 33vw" /></div>
                  <div className="blog-card__copy">
                    <p className="eyebrow"><span /> {other.category}</p>
                    <h3>{other.title}</h3>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </article>
    <SiteFooter />
    </main>
  );
}
