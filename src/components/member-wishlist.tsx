"use client";

import Link from "next/link";
import { Heart } from "lucide-react";
import { GemstoneCartProvider } from "@/components/gemstone-cart-context";
import { GemstoneProductCard } from "@/components/gemstone-product-card";
import type { ProductListItem } from "@/lib/gemstones";

export function MemberWishlist({ products }: { products: ProductListItem[] }) {
  return (
    <>
      <div className="consultation-heading billing-heading"><div><p>Buy Gemstones</p><h1>Wishlist</h1><span>Gemstones you&apos;ve saved for later.</span></div><Link href="/gemstones/shop" className="button button--small"><Heart size={14} /> Keep browsing</Link></div>
      {products.length ? (
        <GemstoneCartProvider>
          <div className="product-grid">
            {products.map((product) => <GemstoneProductCard key={product.id} product={product} wishlisted signedIn />)}
          </div>
        </GemstoneCartProvider>
      ) : (
        <div className="consultation-empty"><Heart size={26} /><h3>Your wishlist is empty</h3><p>Save gemstones you love to find them again later.</p><Link href="/gemstones/shop" className="button button--small">Shop now</Link></div>
      )}
    </>
  );
}
