"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Check, Lock, ShieldCheck, X } from "lucide-react";
import { useGemstoneCart } from "@/components/gemstone-cart-context";
import { openRazorpayCheckout } from "@/lib/razorpay-checkout";
import { trackEvent } from "@/lib/track-event";

type MemberInfo = { name: string; email: string; phone: string | null };

const FREE_SHIPPING_THRESHOLD = 2000;
const FLAT_SHIPPING_FEE = 99;

export function GemstoneCheckoutForm({ member }: { member: MemberInfo | null }) {
  const { lines, subtotal, clearCart } = useGemstoneCart();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [couponCode, setCouponCode] = useState(searchParams.get("coupon") ?? "");
  const [form, setForm] = useState({
    name: member?.name ?? "", phone: member?.phone ?? "", email: member?.email ?? "",
    line1: "", line2: "", city: "", state: "", pincode: "", country: "India",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const shippingFee = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : FLAT_SHIPPING_FEE;

  if (!lines.length) {
    return (
      <section className="shell" style={{ paddingBlock: 40 }}>
        <div className="empty-state" style={{ minHeight: 260 }}><h3>Your cart is empty</h3><p>Add a gemstone before checking out.</p><Link href="/gemstones/shop" className="button button--small">Shop gemstones</Link></div>
      </section>
    );
  }

  async function placeOrder() {
    setError("");
    if (!form.name.trim() || !form.phone.trim() || !form.line1.trim() || !form.city.trim() || !form.state.trim() || !form.pincode.trim()) {
      setError("Please complete your shipping address.");
      return;
    }
    if (!member && !form.email.trim()) { setError("Enter an email address for your order confirmation."); return; }

    setLoading(true);
    try {
      const response = await fetch("/api/gemstones/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines: lines.map((line) => ({ productId: line.productId, variantId: line.variantId, quantity: line.quantity })),
          couponCode: couponCode || undefined,
          guestName: member ? undefined : form.name,
          guestEmail: member ? undefined : form.email,
          guestPhone: member ? undefined : form.phone,
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
        name: "Adi Jyotish Gurus",
        description: `Gemstone order · ${data.orderNumber}`,
        prefill: { name: form.name, email: member?.email ?? form.email, contact: form.phone },
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
            trackEvent("purchase", { value: subtotal + shippingFee, currency: "INR", item_category: "gemstone" });
            clearCart();
            router.push(`/gemstones/order/${data.orderNumber}${member ? "" : `?email=${encodeURIComponent(form.email)}`}`);
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
        {!member && (
          <div className="finance-config-note"><ShieldCheck size={18} /><div><strong>Checking out as a guest</strong><span>Have an account? <Link href="/account">Sign in</Link> to track this order in your dashboard.</span></div></div>
        )}
        <h2>Shipping address</h2>
        <div className="booking-fields">
          <label><span>Full name</span><div><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></div></label>
          <label><span>Phone number</span><div><input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="+91 …" /></div></label>
          {!member && <label className="wide"><span>Email (for order confirmation)</span><div><input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></div></label>}
          <label className="wide"><span>Address line 1</span><div><input value={form.line1} onChange={(event) => setForm({ ...form, line1: event.target.value })} /></div></label>
          <label className="wide"><span>Address line 2 (optional)</span><div><input value={form.line2} onChange={(event) => setForm({ ...form, line2: event.target.value })} /></div></label>
          <label><span>City</span><div><input value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} /></div></label>
          <label><span>State</span><div><input value={form.state} onChange={(event) => setForm({ ...form, state: event.target.value })} /></div></label>
          <label><span>Pincode</span><div><input value={form.pincode} onChange={(event) => setForm({ ...form, pincode: event.target.value })} /></div></label>
          <label><span>Country</span><div><input value={form.country} onChange={(event) => setForm({ ...form, country: event.target.value })} /></div></label>
          <label className="wide"><span>Coupon code (optional)</span><div><input value={couponCode} onChange={(event) => setCouponCode(event.target.value.toUpperCase())} /></div></label>
        </div>
      </div>

      <aside className="cart-summary">
        <h2>Order summary</h2>
        {lines.map((line) => <div className="cart-summary__row" key={line.variantId}><span>{line.productName} × {line.quantity}</span><strong>{line.currency} {line.price * line.quantity}</strong></div>)}
        <div className="cart-summary__row"><span>Shipping</span><strong>{shippingFee ? `₹${shippingFee}` : "Free"}</strong></div>
        <div className="cart-summary__row cart-summary__row--total"><span>Estimated total</span><strong>₹{subtotal + shippingFee}</strong></div>
        <button className="button cart-summary__checkout" disabled={loading} onClick={placeOrder}><Lock size={15} /> {loading ? "Opening payment…" : "Pay & place order"}</button>
        <p className="ask-form-card__note">Secured by Razorpay. Final total including any coupon is confirmed on the payment screen.</p>
        {error && <div className="toast"><Check size={15} />{error}<button onClick={() => setError("")}><X size={14} /></button></div>}
      </aside>
    </section>
  );
}
