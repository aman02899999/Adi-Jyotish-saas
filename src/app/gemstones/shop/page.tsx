import type { Metadata } from "next";
import { GemstoneShopExplorer } from "@/components/gemstone-shop-explorer";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getWishlistProductIds } from "@/lib/gemstone-wishlist";
import { getActiveCategories, getProductCatalog, type ProductFilters } from "@/lib/gemstones";
import { getCurrentMember } from "@/lib/member-auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Shop Gemstones · Buy Gemstones",
  description: "Browse, filter, and compare certified Vedic gemstones by category, price, zodiac sign, and planet.",
};

type SearchParams = Record<string, string | undefined>;

function parseFilters(params: SearchParams): ProductFilters {
  return {
    category: params.category,
    search: params.search,
    minPrice: params.minPrice ? Number(params.minPrice) : undefined,
    maxPrice: params.maxPrice ? Number(params.maxPrice) : undefined,
    zodiac: params.zodiac,
    planet: params.planet,
    certification: params.certification,
    featured: params.featured === "1",
    trending: params.trending === "1",
    bestseller: params.bestseller === "1",
    sort: (params.sort as ProductFilters["sort"]) ?? "newest",
    page: params.page ? Number(params.page) : 1,
    pageSize: 12,
  };
}

export default async function GemstoneShopPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const filters = parseFilters(params);
  const [catalog, categories, member] = await Promise.all([getProductCatalog(filters), getActiveCategories(), getCurrentMember()]);
  const wishlistIds = member ? await getWishlistProductIds(member.id) : [];

  return (
    <main className="marketing-page gem-store">
      <SiteHeader />
      <section className="shop-header shell">
        <p className="eyebrow"><span /> Buy Gemstones</p>
        <h1>Shop the full<br /><em>Vedic gemstone collection.</em></h1>
      </section>
      <GemstoneShopExplorer
        initialItems={catalog.items}
        total={catalog.total}
        page={catalog.page}
        pageSize={catalog.pageSize}
        categories={categories.map((category) => ({ slug: category.slug, name: category.name, productCount: category.productCount }))}
        initialFilters={params}
        wishlistIds={wishlistIds}
        signedIn={Boolean(member)}
      />
    <SiteFooter />
    </main>
  );
}
