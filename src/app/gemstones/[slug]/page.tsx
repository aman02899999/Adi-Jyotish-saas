import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { GemstoneProductCard } from "@/components/gemstone-product-card";
import { GemstoneProductDetail } from "@/components/gemstone-product-detail";
import { GemstoneRecentlyViewed } from "@/components/gemstone-recently-viewed";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getPublishedReviews } from "@/lib/gemstone-reviews";
import { getWishlistProductIds } from "@/lib/gemstone-wishlist";
import { getProductBySlug, getRelatedProducts } from "@/lib/gemstones";
import { getCurrentMember } from "@/lib/member-auth";
import { getSiteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return {};
  return {
    title: product.metaTitle || `${product.name} · Buy Gemstones`,
    description: product.metaDescription || product.shortDescription,
    openGraph: { title: product.name, description: product.shortDescription, url: `/gemstones/${product.slug}`, images: product.images[0] ? [product.images[0].url] : undefined },
    alternates: { canonical: `/gemstones/${product.slug}` },
  };
}

export default async function GemstoneProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();

  const [related, reviews, member] = await Promise.all([
    getRelatedProducts(product.categoryId, product.id, 4),
    getPublishedReviews(product.id),
    getCurrentMember(),
  ]);
  const wishlistIds = member ? await getWishlistProductIds(member.id) : [];
  const site = getSiteUrl();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.shortDescription,
    sku: product.sku,
    image: product.images.map((image) => image.url),
    category: product.categoryName,
    offers: product.variants.map((variant) => ({
      "@type": "Offer",
      price: variant.price,
      priceCurrency: product.currency,
      availability: variant.stockQuantity > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      url: new URL(`/gemstones/${product.slug}`, site).toString(),
    })),
    aggregateRating: product.ratingCount > 0 ? { "@type": "AggregateRating", ratingValue: product.ratingAverage, reviewCount: product.ratingCount } : undefined,
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Gemstones", item: new URL("/gemstones", site).toString() },
      { "@type": "ListItem", position: 2, name: product.categoryName, item: new URL(`/gemstones/shop?category=${product.categorySlug}`, site).toString() },
      { "@type": "ListItem", position: 3, name: product.name, item: new URL(`/gemstones/${product.slug}`, site).toString() },
    ],
  };

  return (
    <main className="marketing-page gem-store">
      <SiteHeader />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />

      <nav className="gem-breadcrumbs shell" aria-label="Breadcrumb">
        <Link href="/gemstones">Gemstones</Link><ChevronRight size={13} />
        <Link href={`/gemstones/shop?category=${product.categorySlug}`}>{product.categoryName}</Link><ChevronRight size={13} />
        <span>{product.name}</span>
      </nav>

      <GemstoneProductDetail
        product={{
          id: product.id, slug: product.slug, name: product.name, shortDescription: product.shortDescription,
          description: product.description, benefits: product.benefits, whoShouldWear: product.whoShouldWear,
          recommendedZodiac: product.recommendedZodiac, recommendedPlanets: product.recommendedPlanets,
          origin: product.origin, color: product.color, treatment: product.treatment, certification: product.certification,
          currency: product.currency, categoryName: product.categoryName, ratingAverage: product.ratingAverage, ratingCount: product.ratingCount,
          images: product.images.map((image) => ({ url: image.url, alt: image.alt })),
          variants: product.variants.map((variant) => ({ id: variant.id, label: variant.label, weightCarat: variant.weightCarat, weightRatti: variant.weightRatti, certificationLevel: variant.certificationLevel, price: variant.price, compareAtPrice: variant.compareAtPrice, stockQuantity: variant.stockQuantity })),
        }}
        reviews={reviews.map((review) => ({ id: review.id, reviewerName: review.reviewerName, rating: review.rating, title: review.title, body: review.body, verified: Boolean(review.orderId), createdAt: String(review.createdAt) }))}
        wishlisted={wishlistIds.includes(product.id)}
        signedIn={Boolean(member)}
      />

      {related.length > 0 && (
        <section className="gem-rail shell">
          <div className="gem-rail__head reveal"><div><p className="eyebrow"><span /> You may also like</p><h2>Related gemstones</h2></div></div>
          <div className="product-grid">{related.map((item) => <GemstoneProductCard key={item.id} product={item} wishlisted={wishlistIds.includes(item.id)} signedIn={Boolean(member)} />)}</div>
        </section>
      )}

      <GemstoneRecentlyViewed excludeSlug={product.slug} wishlistIds={wishlistIds} signedIn={Boolean(member)} />
    <SiteFooter />
    </main>
  );
}
