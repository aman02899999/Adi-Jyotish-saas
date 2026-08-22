"use client";

import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { useState } from "react";
import { Gem, Heart, ShoppingBag, Star } from "lucide-react";
import { useGemstoneCart } from "@/components/gemstone-cart-context";
import type { ProductListItem } from "@/lib/gemstones";

export function GemstoneProductCard({ product, wishlisted, signedIn }: { product: ProductListItem; wishlisted: boolean; signedIn?: boolean }) {
  const { addLine } = useGemstoneCart();
  const [liked, setLiked] = useState(wishlisted);
  const [wishBusy, setWishBusy] = useState(false);
  const [justAdded, setJustAdded] = useState(false);

  const discountPercent = product.compareAtPrice && product.compareAtPrice > product.price
    ? Math.round(((product.compareAtPrice - product.price) / product.compareAtPrice) * 100)
    : 0;

  function quickAdd() {
    if (!product.defaultVariantId || !product.inStock) return;
    addLine({
      variantId: product.defaultVariantId,
      productId: product.id,
      slug: product.slug,
      productName: product.name,
      variantLabel: product.defaultVariantLabel ?? "Standard",
      price: product.price,
      compareAtPrice: product.compareAtPrice,
      imageUrl: product.primaryImageUrl,
      currency: product.currency,
      maxQuantity: product.defaultVariantStock,
    });
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1600);
  }

  async function toggleWishlist(event: React.MouseEvent) {
    event.preventDefault();
    if (!signedIn) { window.location.href = "/account"; return; }
    setWishBusy(true);
    try {
      const response = await fetch("/api/gemstones/wishlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId: product.id }) });
      if (response.ok) { const data = await response.json(); setLiked(data.added); }
    } finally {
      setWishBusy(false);
    }
  }

  return (
    <article className="product-card">
      <Link href={`/gemstones/${product.slug}`} className="product-card__art">
        {product.primaryImageUrl ? <Image src={product.primaryImageUrl} alt={product.name} fill sizes="(max-width: 700px) 45vw, 260px" /> : <span className="product-card__placeholder"><Gem size={28} /></span>}
        {discountPercent > 0 && <em className="product-card__badge product-card__badge--sale">-{discountPercent}%</em>}
        {product.featured && <em className="product-card__badge product-card__badge--featured">Featured</em>}
        {!product.inStock && <em className="product-card__badge product-card__badge--out">Out of stock</em>}
        <button type="button" className={`product-card__wish ${liked ? "active" : ""}`} onClick={toggleWishlist} disabled={wishBusy} aria-label={liked ? "Remove from wishlist" : "Add to wishlist"}><Heart size={15} fill={liked ? "currentColor" : "none"} /></button>
      </Link>
      <div className="product-card__body">
        <small>{product.categoryName}</small>
        <Link href={`/gemstones/${product.slug}`}><h3>{product.name}</h3></Link>
        {product.ratingCount > 0 && <div className="product-card__rating"><Star size={12} fill="currentColor" /> {product.ratingAverage} <span>({product.ratingCount})</span></div>}
        <div className="product-card__price"><strong>{product.currency} {product.price}</strong>{product.compareAtPrice && product.compareAtPrice > product.price && <s>{product.currency} {product.compareAtPrice}</s>}</div>
        <button type="button" className="button button--small product-card__cart" disabled={!product.inStock} onClick={quickAdd}>
          <ShoppingBag size={14} /> {justAdded ? "Added!" : product.inStock ? "Add to Cart" : "Out of stock"}
        </button>
      </div>
    </article>
  );
}
