"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Check, Lock, ShieldCheck, Tag, X } from "lucide-react";
import { useGemstoneCart } from "@/components/gemstone-cart-context";
import { openRazorpayCheckout } from "@/lib/razorpay-checkout";
import { trackEvent } from "@/lib/track-event";

type MemberInfo = { name: string; email: string; phone: string | null };

const FREE_SHIPPING_THRESHOLD = 2000;
const FLAT_SHIPPING_FEE = 99;

// Mirrors computeShippingFee() in lib/gemstone-orders.ts, which the server evaluates against the
// discounted subtotal (subtotal - discount), not the raw one — this has to match or the total
// shown here can disagree with what createPendingOrder actually charges.
function computeShippingFee(discountedSubtotal: number) {
  return discountedSubtotal >= FREE_SHIPPING_THRESHOLD ? 0 : FLAT_SHIPPING_FEE;
}

export function GemstoneCheckoutForm({ member }: { member: MemberInfo | null }) {
  const { lines, subtotal, clearCart } = useGemstoneCart();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [couponInput, setCouponInput] = useState(searchParams.get("coupon") ?? "");
  const [coupon, setCoupon] = useState<{ code: string; discountAmount: number } | null>(null);
  const [couponError, setCouponError] = useState("");
  const [applyingCoupon, setApplyingCoupon] = useState(false);
  const [form, setForm] = useState({
    name: member?.name ?? "", phone: member?.phone ?? "", email: member?.email ?? "",
    line1: "", line2: "", city: "", state: "", pincode: "", country: "India",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function applyCoupon() {
    if (!couponInput.trim()) return;
    setApplyingCoupon(true);
    setCouponError("");
    try {
      const response = await fetch("/api/gemstones/coupons/validate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: couponInput, subtotal }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Coupon could not be applied.");
      setCoupon({ code: data.code, discountAmount: data.discountAmount });
    } catch (caught) {
      setCouponError(caught instanceof Error ? caught.message : "Coupon could not be applied.");
      setCoupon(null);
    } finally {
      setApplyingCoupon(false);
    }
  }

  // Auto-apply a coupon carried over from the cart page (?coupon=CODE) so the discount is already
  // shown here instead of only surfacing once Razorpay opens with a lower-than-displayed amount.
  useEffect(() => {
    const fromUrl = searchParams.get("coupon");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- applyCoupon's state updates come from its async fetch response, not synchronously during this effect
    if (fromUrl) applyCoupon();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const discount = coupon?.discountAmount ?? 0;
  const discountedSubtotal = Math.max(0, subtotal - discount);
  const shippingFee = computeShippingFee(discountedSubtotal);
  const total = discountedSubtotal + shippingFee;

  if (!member) {
    return (
      <section className="shell" style={{ paddingBlock: 40 }}>
        <div className="ask-signin">
          <ShieldCheck size={26} />
          <h2>Sign in to complete your purchase</h2>
          <p>Create a free account or sign in to check out. Your cart is saved, and every order you place is tracked in your dashboard.</p>
          <div className="ask-signin__actions">
            <Link href="/account?mode=register" className="button">Create account</Link>
            <Link href="/account" className="button button--ghost">Sign in</Link>
          </div>
        </div>
      </section>
    );
  }

  if (!lines.length) {
    return (
      <section className="shell" style={{ paddingBlock: 40 }}>
        <div className="empty-state" style={{ minHeight: 260 }}><h3>Your cart is empty</h3><p>Add a gemstone before checking out.</p><Link href="/gemstones/shop" className="button button--small">Shop gemstones</Link></div>
      </section>
    );
  }

  async function placeOrder() {
    if (!member) return;
    setError("");
    if (!form.name.trim() || !form.phone.trim() || !form.line1.trim() || !form.city.trim() || !form.state.trim() || !form.pincode.trim()) {
      setError("Please complete your shipping address.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/gemstones/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines: lines.map((line) => ({ productId: line.productId, variantId: line.variantId, quantity: line.quantity })),
          couponCode: (coupon?.code ?? couponInput) || undefined,
          shipping: { name: form.name, phone: form.phone, line1: form.line1, line2: form.line2, city: form.city, state: form.state, pincode: form.pincode, country: form.country },
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Your order could not be started.");

      await openRazorpayCheckout({
        key: data.key,
        amount: data.amount,
        currency: data.currency,
        order_id: data.razorpayOrderId,
        name: "Adi Jyotish Guru",
        description: `Gemstone order · ${data.orderNumber}`,
        prefill: { name: form.name, email: member.email, contact: form.phone },
        theme: { color: "#a95838" },
        onSuccess: async (payment) => {
          const verify = await fetch(`/api/gemstones/orders/${data.orderId}/verify`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ razorpay_order_id: payment.razorpay_order_id, razorpay_payment_id: payment.razorpay_payment_id, razorpay_signature: payment.razorpay_signature }),
          });
          const verifyData = await verify.json();
          setLoading(false);
          if (verify.ok) {
            trackEvent("purchase", { value: total, currency: "INR", item_category: "gemstone" });
            clearCart();
            router.push(`/gemstones/order/${data.orderNumber}`);
          } else {
            setError(verifyData.error || "Payment could not be confirmed. Contact support if you were charged.");
          }
        },
        onDismiss: () => setLoading(false),
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Your order could not be started.");
      setLoading(false);
    }
  }

  return (
    <section className="checkout-layout shell">
      <div className="checkout-form">
        <h2>Shipping address</h2>
        <div className="booking-fields">
          <label><span>Full name</span><div><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></div></label>
          <label><span>Phone number</span><div><input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="+91 …" /></div></label>
          <label className="wide"><span>Address line 1</span><div><input value={form.line1} onChange={(event) => setForm({ ...form, line1: event.target.value })} /></div></label>
          <label className="wide"><span>Address line 2 (optional)</span><div><input value={form.line2} onChange={(event) => setForm({ ...form, line2: event.target.value })} /></div></label>
          <label><span>City</span><div><input value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} /></div></label>
          <label><span>State</span><div><input value={form.state} onChange={(event) => setForm({ ...form, state: event.target.value })} /></div></label>
          <label><span>Pincode</span><div><input value={form.pincode} onChange={(event) => setForm({ ...form, pincode: event.target.value })} /></div></label>
          <label><span>Country</span><div><input value={form.country} onChange={(event) => setForm({ ...form, country: event.target.value })} /></div></label>
        </div>
      </div>

      <aside className="cart-summary">
        <h2>Order summary</h2>
        {lines.map((line) => <div className="cart-summary__row" key={line.variantId}><span>{line.productName} × {line.quantity}</span><strong>{line.currency} {line.price * line.quantity}</strong></div>)}

        <div className="cart-summary__coupon">
          <div className="input-prefix" style={{ flex: 1 }}><Tag size={14} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "var(--muted)" }} /><input style={{ paddingLeft: 30 }} value={couponInput} onChange={(event) => setCouponInput(event.target.value.toUpperCase())} placeholder="Coupon code" /></div>
          <button type="button" className="button button--ghost button--small" disabled={applyingCoupon} onClick={applyCoupon}>{applyingCoupon ? "Applying…" : "Apply"}</button>
        </div>
        {couponError && <p className="cart-summary__error">{couponError}</p>}
        {coupon && <p className="cart-summary__coupon-applied"><Check size={13} /> {coupon.code} applied</p>}

        <div className="cart-summary__row"><span>Subtotal</span><strong>₹{subtotal}</strong></div>
        {coupon && <div className="cart-summary__row"><span>Discount</span><strong>-₹{discount}</strong></div>}
        <div className="cart-summary__row"><span>Shipping</span><strong>{shippingFee ? `₹${shippingFee}` : "Free"}</strong></div>
        <div className="cart-summary__row cart-summary__row--total"><span>Total</span><strong>₹{total}</strong></div>
        <button className="button cart-summary__checkout" disabled={loading} onClick={placeOrder}><Lock size={15} /> {loading ? "Opening payment…" : "Pay & place order"}</button>
        <p className="ask-form-card__note">Secured by Razorpay. You&apos;ll be charged exactly the total shown above.</p>
        {error && <div className="toast"><Check size={15} />{error}<button onClick={() => setError("")}><X size={14} /></button></div>}
      </aside>
    </section>
  );
}
