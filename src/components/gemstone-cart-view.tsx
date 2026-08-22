"use client";

import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { useState } from "react";
import { ArrowRight, Check, Gem, Minus, Plus, ShoppingBag, Tag, Trash2 } from "lucide-react";
import { useGemstoneCart } from "@/components/gemstone-cart-context";

const FREE_SHIPPING_THRESHOLD = 2000;
const FLAT_SHIPPING_FEE = 99;

export function GemstoneCartView() {
  const { lines, updateQuantity, removeLine, subtotal } = useGemstoneCart();
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState<{ code: string; discountAmount: number } | null>(null);
  const [couponError, setCouponError] = useState("");
  const [applying, setApplying] = useState(false);

  const shippingFee = subtotal - (coupon?.discountAmount ?? 0) >= FREE_SHIPPING_THRESHOLD ? 0 : FLAT_SHIPPING_FEE;
  const total = Math.max(0, subtotal - (coupon?.discountAmount ?? 0)) + shippingFee;

  async function applyCoupon() {
    if (!couponInput.trim()) return;
    setApplying(true);
    setCouponError("");
    try {
      const response = await fetch("/api/gemstones/coupons/validate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: couponInput, subtotal }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Coupon could not be applied.");
      setCoupon({ code: data.code, discountAmount: data.discountAmount });
    } catch (error) {
      setCouponError(error instanceof Error ? error.message : "Coupon could not be applied.");
      setCoupon(null);
    } finally {
      setApplying(false);
    }
  }

  if (!lines.length) {
    return (
      <section className="shell" style={{ paddingBlock: 90 }}>
        <div className="empty-state" style={{ minHeight: 320 }}>
          <ShoppingBag size={32} />
          <h3>Your cart is empty</h3>
          <p>Explore our collection to find your gemstone.</p>
          <Link href="/gemstones/shop" className="button button--small">Shop gemstones</Link>
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="shop-header shell">
        <p className="eyebrow"><span /> Your cart</p>
        <h1>Review your<br /><em>selection.</em></h1>
      </section>

      <section className="cart-layout shell">
        <div className="cart-lines">
          {lines.map((line) => (
            <article className="cart-line" key={line.variantId}>
              <div className="cart-line__art">{line.imageUrl ? <Image src={line.imageUrl} alt={line.productName} fill sizes="90px" /> : <Gem size={22} />}</div>
              <div className="cart-line__info">
                <Link href={`/gemstones/${line.slug}`}><strong>{line.productName}</strong></Link>
                <small>{line.variantLabel}</small>
                <div className="qty-stepper">
                  <button type="button" onClick={() => updateQuantity(line.variantId, line.quantity - 1)} aria-label="Decrease quantity"><Minus size={13} /></button>
                  <span>{line.quantity}</span>
                  <button type="button" onClick={() => updateQuantity(line.variantId, line.quantity + 1)} aria-label="Increase quantity"><Plus size={13} /></button>
                </div>
              </div>
              <div className="cart-line__price"><strong>{line.currency} {line.price * line.quantity}</strong><button type="button" onClick={() => removeLine(line.variantId)}><Trash2 size={14} /> Remove</button></div>
            </article>
          ))}
        </div>

        <aside className="cart-summary">
          <h2>Order summary</h2>
          <div className="cart-summary__coupon">
            <div className="input-prefix" style={{ flex: 1 }}><Tag size={14} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "var(--muted)" }} /><input style={{ paddingLeft: 30 }} value={couponInput} onChange={(event) => setCouponInput(event.target.value.toUpperCase())} placeholder="Coupon code" /></div>
            <button type="button" className="button button--ghost button--small" disabled={applying} onClick={applyCoupon}>{applying ? "Applying…" : "Apply"}</button>
          </div>
          {couponError && <p className="cart-summary__error">{couponError}</p>}
          {coupon && <p className="cart-summary__coupon-applied"><Check size={13} /> {coupon.code} applied</p>}

          <div className="cart-summary__row"><span>Subtotal</span><strong>₹{subtotal}</strong></div>
          {coupon && <div className="cart-summary__row"><span>Discount</span><strong>-₹{coupon.discountAmount}</strong></div>}
          <div className="cart-summary__row"><span>Shipping</span><strong>{shippingFee ? `₹${shippingFee}` : "Free"}</strong></div>
          <div className="cart-summary__row cart-summary__row--total"><span>Total</span><strong>₹{total}</strong></div>

          <Link href={`/gemstones/checkout${coupon ? `?coupon=${coupon.code}` : ""}`} className="button cart-summary__checkout">Proceed to checkout <ArrowRight size={16} /></Link>
          <Link href="/gemstones/shop" className="text-arrow" style={{ justifyContent: "center", marginTop: 14 }}>Continue shopping</Link>
        </aside>
      </section>
    </>
  );
}
