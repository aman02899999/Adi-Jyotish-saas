import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BlockRenderer } from "@/components/block-renderer";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getPublishedCustomPageBySlug } from "@/lib/custom-pages";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = await getPublishedCustomPageBySlug(slug);
  if (!page) return { title: "Page not found" };
  return {
    title: page.title,
    description: page.metaDescription || undefined,
    openGraph: { title: page.title, description: page.metaDescription || undefined, url: `/p/${page.slug}` },
  };
}

export default async function CustomPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await getPublishedCustomPageBySlug(slug);
  if (!page) notFound();

  return (
    <main className="marketing-page">
      <SiteHeader />
      <BlockRenderer blocks={page.blocks} />
      <SiteFooter />
    </main>
  );
}
