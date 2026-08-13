"use client";

import { useState } from "react";
import { Check, Gift, LoaderCircle, X } from "lucide-react";
import { openRazorpayCheckout } from "@/lib/razorpay-checkout";
import { ShareButtons } from "@/components/share-buttons";

const GIFT_AMOUNTS = [500, 1000, 2000, 5000] as const;

export function GiftPurchaseForm({ onlinePaymentsAvailable, member }: {
  onlinePaymentsAvailable: boolean;
  member: { name: string; email: string };
}) {
  const [amount, setAmount] = useState<number>(1000);
  const [recipientName, setRecipientName] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [giftCode, setGiftCode] = useState("");

  async function purchase() {
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/gift/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, recipientName, message }),
      });
      const data = await response.json();
      if (!response.ok || !data.orderId) throw new Error(data.error || "Gift purchase could not be started.");

      await openRazorpayCheckout({
        key: data.key,
        amount: data.amount,
        currency: data.currency,
        order_id: data.orderId,
        name: "Adi Jyotish Guru",
        description: `Gift card · ₹${amount}`,
        prefill: { name: member.name, email: member.email },
        theme: { color: "#a95838" },
        onSuccess: async (payment) => {
          const verify = await fetch("/api/gift/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ razorpay_order_id: payment.razorpay_order_id, razorpay_payment_id: payment.razorpay_payment_id, razorpay_signature: payment.razorpay_signature }),
          });
          const verifyData = await verify.json();
          if (verify.ok) setGiftCode(verifyData.code);
          else setError(verifyData.error || "Payment could not be confirmed. Contact support if you were charged.");
          setLoading(false);
        },
        onDismiss: () => setLoading(false),
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Gift purchase could not be started.");
      setLoading(false);
    }
  }

  if (giftCode) {
    const shareUrl = `${window.location.origin}/gift/${giftCode}`;
    return (
      <div className="ask-answer">
        <div className="ask-answer__badge"><Gift size={15} /> Gift ready</div>
        <h2>Send this link to {recipientName || "them"}.</h2>
        <p className="gift-code-display">{giftCode}</p>
        <p>Anyone with this link can claim ₹{amount} of wallet credit — good toward any reading, chat, or gemstone on the site.</p>
        <ShareButtons url={shareUrl} title="A gift from Adi Jyotish Guru" text={`I sent you a ₹${amount} gift on Adi Jyotish Guru — tap to claim it.`} />
      </div>
    );
  }

  return (
    <div className="ask-form-card">
      <header><div><p>Wallet credit, gifted</p><h2>Send an astrology gift</h2></div></header>
      <div className="gift-amount-picker">
        {GIFT_AMOUNTS.map((value) => (
          <button key={value} type="button" className={value === amount ? "active" : ""} onClick={() => setAmount(value)}>₹{value}</button>
        ))}
      </div>
      <div className="booking-fields">
        <label><span>Recipient&rsquo;s name (optional)</span><div><input value={recipientName} onChange={(event) => setRecipientName(event.target.value)} placeholder="Who is this for?" /></div></label>
        <label className="wide"><span>A short message (optional)</span><div><input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Happy birthday! Enjoy a reading on me." maxLength={280} /></div></label>
      </div>
      <button type="button" className="button ask-form-card__submit" disabled={loading || !onlinePaymentsAvailable} onClick={purchase}>
        {loading ? <><LoaderCircle size={16} className="spin" /> Opening…</> : <><Gift size={16} /> Buy ₹{amount} gift</>}
      </button>
      {!onlinePaymentsAvailable && <p className="legal-note">Online payments are being configured — check back shortly.</p>}
      {error && <div className="toast"><Check size={15} />{error}<button onClick={() => setError("")}><X size={14} /></button></div>}
    </div>
  );
}
