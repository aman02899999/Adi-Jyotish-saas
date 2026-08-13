"use client";

import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { useEffect, useMemo, useState } from "react";
import { Award, Check, CheckCircle2, Gem, Heart, Minus, MessageSquarePlus, Plus, RotateCcw, ShieldCheck, ShoppingBag, Star, Truck, X } from "lucide-react";
import { useGemstoneCart } from "@/components/gemstone-cart-context";

type Variant = { id: string; label: string; weightCarat: string; weightRatti: string; certificationLevel: string; price: number; compareAtPrice: number | null; stockQuantity: number };
type ProductImage = { url: string; alt: string };
type Review = { id: string; reviewerName: string; rating: number; title: string; body: string; verified: boolean; createdAt: string };

type ProductDetail = {
  id: string; slug: string; name: string; shortDescription: string; description: string; benefits: string; whoShouldWear: string;
  recommendedZodiac: string; recommendedPlanets: string; origin: string; color: string; treatment: string; certification: string; certificateUrl: string;
  currency: string; categoryName: string; ratingAverage: number; ratingCount: number;
  images: ProductImage[]; variants: Variant[];
};

const RECENTLY_VIEWED_KEY = "jyotish_gem_recently_viewed";

export function GemstoneProductDetail({ product, reviews: initialReviews, wishlisted, signedIn }: { product: ProductDetail; reviews: Review[]; wishlisted: boolean; signedIn: boolean }) {
  const { addLine } = useGemstoneCart();
  const [selectedVariantId, setSelectedVariantId] = useState(product.variants[0]?.id ?? null);
  const [quantity, setQuantity] = useState(1);
  const [activeImage, setActiveImage] = useState(0);
  const [tab, setTab] = useState<"description" | "benefits" | "wear" | "specs">("description");
  const [liked, setLiked] = useState(wishlisted);
  const [certificateOpen, setCertificateOpen] = useState(false);
  const [addedNotice, setAddedNotice] = useState("");
  const [reviews, setReviews] = useState(initialReviews);
  const [reviewForm, setReviewForm] = useState({ reviewerName: "", rating: 5, title: "", body: "" });
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewNotice, setReviewNotice] = useState("");

  const variant = useMemo(() => product.variants.find((item) => item.id === selectedVariantId) ?? product.variants[0], [product.variants, selectedVariantId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(RECENTLY_VIEWED_KEY);
      const list: string[] = raw ? JSON.parse(raw) : [];
      const next = [product.slug, ...list.filter((slug) => slug !== product.slug)].slice(0, 8);
      window.localStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(next));
    } catch {
      // ignore storage errors
    }
  }, [product.slug]);

  function addToCart() {
    if (!variant) return;
    addLine({
      variantId: variant.id, productId: product.id, slug: product.slug, productName: product.name,
      variantLabel: variant.label, price: variant.price, compareAtPrice: variant.compareAtPrice,
      imageUrl: product.images[0]?.url ?? null, currency: product.currency, maxQuantity: variant.stockQuantity,
    }, quantity);
    setAddedNotice("Added to your cart.");
    setTimeout(() => setAddedNotice(""), 2000);
  }

  function buyNow() {
    addToCart();
    window.location.href = "/gemstones/cart";
  }

  async function toggleWishlist() {
    if (!signedIn) { window.location.href = "/account"; return; }
    const response = await fetch("/api/gemstones/wishlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId: product.id }) });
    if (response.ok) { const data = await response.json(); setLiked(data.added); }
  }

  async function submitReview(event: React.FormEvent) {
    event.preventDefault();
    setReviewSaving(true);
    setReviewNotice("");
    try {
      const response = await fetch("/api/gemstones/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id, ...reviewForm }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Review could not be submitted.");
      setReviewNotice("Thank you! Your review will appear once it's approved.");
      setReviewForm({ reviewerName: "", rating: 5, title: "", body: "" });
    } catch (error) {
      setReviewNotice(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setReviewSaving(false);
    }
  }

  const discountPercent = variant?.compareAtPrice && variant.compareAtPrice > variant.price ? Math.round(((variant.compareAtPrice - variant.price) / variant.compareAtPrice) * 100) : 0;

  return (
    <section className="product-detail shell">
      <div className="product-detail__gallery">
        <div className="product-detail__main-image">
          {product.images[activeImage] ? <Image src={product.images[activeImage].url} alt={product.images[activeImage].alt || product.name} fill sizes="(max-width: 900px) 100vw, 45vw" priority /> : <span className="product-card__placeholder"><Gem size={40} /></span>}
          {discountPercent > 0 && <em className="product-card__badge product-card__badge--sale">-{discountPercent}%</em>}
        </div>
        {product.images.length > 1 && (
          <div className="product-detail__thumbs">
            {product.images.map((image, index) => (
              <button key={index} className={index === activeImage ? "active" : ""} onClick={() => setActiveImage(index)} aria-label={`View image ${index + 1}`}>
                <Image src={image.url} alt={image.alt || product.name} fill sizes="80px" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="product-detail__info">
        <p className="eyebrow"><span /> {product.categoryName}</p>
        <h1>{product.name}</h1>
        {product.ratingCount > 0 && <div className="product-card__rating"><Star size={14} fill="currentColor" /> {product.ratingAverage} <span>({product.ratingCount} review{product.ratingCount === 1 ? "" : "s"})</span></div>}
        <p className="product-detail__short">{product.shortDescription}</p>

        <div className="product-detail__price">
          <strong>{product.currency} {variant?.price ?? "—"}</strong>
          {variant?.compareAtPrice && variant.compareAtPrice > variant.price && <s>{product.currency} {variant.compareAtPrice}</s>}
        </div>

        {product.variants.length > 1 && (
          <div className="product-detail__variants">
            <span>Weight / grade</span>
            <div>
              {product.variants.map((item) => (
                <button key={item.id} className={item.id === selectedVariantId ? "active" : ""} disabled={item.stockQuantity === 0} onClick={() => setSelectedVariantId(item.id)}>
                  {item.label}{item.stockQuantity === 0 && " (out of stock)"}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="product-detail__qty">
          <span>Quantity</span>
          <div className="qty-stepper">
            <button type="button" onClick={() => setQuantity((value) => Math.max(1, value - 1))} aria-label="Decrease quantity"><Minus size={14} /></button>
            <span>{quantity}</span>
            <button type="button" onClick={() => setQuantity((value) => Math.min(variant?.stockQuantity ?? 1, value + 1))} aria-label="Increase quantity"><Plus size={14} /></button>
          </div>
          {variant && variant.stockQuantity > 0 && variant.stockQuantity <= 5 && <small className="product-detail__low-stock">Only {variant.stockQuantity} left</small>}
        </div>

        <div className="product-detail__actions">
          <button className="button" disabled={!variant || variant.stockQuantity === 0} onClick={addToCart}><ShoppingBag size={16} /> Add to Cart</button>
          <button className="button button--light" disabled={!variant || variant.stockQuantity === 0} onClick={buyNow}>Buy Now</button>
          <button className={`product-detail__wish ${liked ? "active" : ""}`} onClick={toggleWishlist} aria-label={liked ? "Remove from wishlist" : "Add to wishlist"}><Heart size={18} fill={liked ? "currentColor" : "none"} /></button>
        </div>
        {addedNotice && <div className="product-detail__added"><Check size={14} /> {addedNotice} <Link href="/gemstones/cart">View cart</Link></div>}

        <div className="product-detail__trust">
          <button type="button" className="product-detail__cert-trigger" onClick={() => setCertificateOpen(true)}><ShieldCheck size={15} /> Certified authentic — <span>View certificate</span></button>
          <span><Truck size={15} /> {variant && variant.stockQuantity > 0 ? "Ships in 2-4 business days" : "Currently unavailable"}</span>
          <span><RotateCcw size={15} /> 7-day return window</span>
        </div>

        <div className="product-detail__tabs">
          <div className="product-detail__tabs-head">
            <button className={tab === "description" ? "active" : ""} onClick={() => setTab("description")}>Description</button>
            <button className={tab === "benefits" ? "active" : ""} onClick={() => setTab("benefits")}>Benefits</button>
            <button className={tab === "wear" ? "active" : ""} onClick={() => setTab("wear")}>Who Should Wear</button>
            <button className={tab === "specs" ? "active" : ""} onClick={() => setTab("specs")}>Specifications</button>
          </div>
          <div className="product-detail__tabs-body">
            {tab === "description" && <p>{product.description || "No description provided yet."}</p>}
            {tab === "benefits" && <p>{product.benefits || "No benefits listed yet."}</p>}
            {tab === "wear" && <p>{product.whoShouldWear || "No guidance provided yet."}</p>}
            {tab === "specs" && (
              <dl className="product-detail__specs">
                <div><dt>Weight</dt><dd>{variant && variant.weightRatti && variant.weightRatti !== "—" ? `${variant.weightRatti} Ratti${variant.weightCarat && variant.weightCarat !== "—" ? ` (${variant.weightCarat} ct)` : ""}` : "—"}</dd></div>
                <div><dt>Origin</dt><dd>{product.origin || "—"}</dd></div>
                <div><dt>Color</dt><dd>{product.color || "—"}</dd></div>
                <div><dt>Treatment</dt><dd>{product.treatment || "—"}</dd></div>
                <div><dt>Certification</dt><dd>{product.certification || "—"}</dd></div>
                <div><dt>Recommended zodiac</dt><dd>{product.recommendedZodiac || "—"}</dd></div>
                <div><dt>Recommended planets</dt><dd>{product.recommendedPlanets || "—"}</dd></div>
                <div><dt>SKU</dt><dd>{variant?.label ?? "—"}</dd></div>
              </dl>
            )}
          </div>
        </div>
      </div>

      <div className="product-detail__reviews">
        <h2>Customer reviews</h2>
        <div className="review-list">
          {reviews.map((review) => (
            <article className="review-item" key={review.id}>
              <div className="review-item__head"><strong>{review.reviewerName}</strong>{review.verified && <em><CheckCircle2 size={12} /> Verified purchase</em>}<span className="review-item__stars"><Star size={12} fill="currentColor" /> {review.rating}/5</span></div>
              {review.title && <h4>{review.title}</h4>}
              <p>{review.body}</p>
              <small>{new Date(review.createdAt).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}</small>
            </article>
          ))}
          {!reviews.length && <p className="review-empty">No reviews yet — be the first to share your experience.</p>}
        </div>

        <form className="review-form" onSubmit={submitReview}>
          <h3><MessageSquarePlus size={16} /> Write a review</h3>
          <div className="review-form__row">
            <label className="field"><span>Your name</span><input required value={reviewForm.reviewerName} onChange={(event) => setReviewForm({ ...reviewForm, reviewerName: event.target.value })} /></label>
            <label className="field"><span>Rating</span><select value={reviewForm.rating} onChange={(event) => setReviewForm({ ...reviewForm, rating: Number(event.target.value) })}>{[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>{value} star{value === 1 ? "" : "s"}</option>)}</select></label>
          </div>
          <label className="field field--full"><span>Title (optional)</span><input maxLength={160} value={reviewForm.title} onChange={(event) => setReviewForm({ ...reviewForm, title: event.target.value })} /></label>
          <label className="field field--full"><span>Your review</span><textarea required minLength={8} rows={4} value={reviewForm.body} onChange={(event) => setReviewForm({ ...reviewForm, body: event.target.value })} placeholder="Share your experience with this gemstone…" /></label>
          <button className="button button--small" disabled={reviewSaving}>{reviewSaving ? "Submitting…" : "Submit review"}</button>
          {reviewNotice && <div className="toast"><Check size={15} />{reviewNotice}<button type="button" onClick={() => setReviewNotice("")}><X size={14} /></button></div>}
        </form>
      </div>

      {certificateOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setCertificateOpen(false)}>
          <section className="certificate-modal" role="dialog" aria-modal="true" aria-labelledby="certificate-modal-title" onMouseDown={(event) => event.stopPropagation()}>
            <button type="button" className="certificate-modal__close" onClick={() => setCertificateOpen(false)} aria-label="Close certificate"><X size={18} /></button>
            <h2 id="certificate-modal-title" className="certificate-modal__title">Certificate of Authenticity</h2>
            {product.certificateUrl ? (
              <div className="certificate-modal__scan">
                {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary admin-supplied certificate URL, not a known image host */}
                <img src={product.certificateUrl} alt={`${product.name} lab certificate`} />
                <a href={product.certificateUrl} target="_blank" rel="noopener noreferrer">Open original document ↗</a>
              </div>
            ) : (
              <div className="certificate-card">
                <div className="certificate-card__seal"><Award size={26} /></div>
                <p className="certificate-card__lab">{variant?.certificationLevel || product.certification || "In-house gemological verification"}</p>
                <dl>
                  <div><dt>Gemstone</dt><dd>{product.name}</dd></div>
                  <div><dt>Weight</dt><dd>{variant && variant.weightRatti && variant.weightRatti !== "—" ? `${variant.weightRatti} Ratti${variant.weightCarat && variant.weightCarat !== "—" ? ` (${variant.weightCarat} ct)` : ""}` : "—"}</dd></div>
                  <div><dt>Color</dt><dd>{product.color || "—"}</dd></div>
                  <div><dt>Origin</dt><dd>{product.origin || "—"}</dd></div>
                  <div><dt>Treatment</dt><dd>{product.treatment || "—"}</dd></div>
                </dl>
                <small>This summary reflects our gemological verification on file. Contact us for the full lab report.</small>
              </div>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
