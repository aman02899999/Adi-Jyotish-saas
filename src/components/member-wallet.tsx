"use client";

import { useState } from "react";
import { Check, PlusCircle, Wallet as WalletIcon, X } from "lucide-react";
import { openRazorpayCheckout } from "@/lib/razorpay-checkout";

export type WalletEntryRow = { id: number; type: string; amount: number; balanceAfter: number; referenceType: string | null; createdAt: Date | string };

const PRESETS = [100, 250, 500, 1000];

export function MemberWallet({ balance, currency, entries, onlinePaymentsAvailable, member }: {
  balance: number;
  currency: string;
  entries: WalletEntryRow[];
  onlinePaymentsAvailable: boolean;
  member: { name: string; email: string };
}) {
  const [amount, setAmount] = useState(250);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [liveBalance, setLiveBalance] = useState(balance);

  async function recharge() {
    setLoading(true);
    setNotice("");
    try {
      const response = await fetch("/api/member/wallet/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount }) });
      const data = await response.json();
      if (!response.ok || !data.orderId) throw new Error(data.error || "Recharge could not be started.");

      await openRazorpayCheckout({
        key: data.key,
        amount: data.amount,
        currency: data.currency,
        order_id: data.orderId,
        name: "Jyotish Studio",
        description: `Wallet recharge · ${currency} ${amount}`,
        prefill: { name: member.name, email: member.email },
        theme: { color: "#a95838" },
        onSuccess: async (payment) => {
          const verify = await fetch("/api/member/wallet/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ razorpay_order_id: payment.razorpay_order_id, razorpay_payment_id: payment.razorpay_payment_id, razorpay_signature: payment.razorpay_signature }) });
          const verifyData = await verify.json();
          if (verify.ok) { setLiveBalance(verifyData.balance); setNotice("Wallet recharged. Your new balance is shown below."); setTimeout(() => window.location.reload(), 1200); }
          else setNotice(verifyData.error || "Payment could not be confirmed. Contact support if you were charged.");
          setLoading(false);
        },
        onDismiss: () => setLoading(false),
      });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Recharge could not be started.");
      setLoading(false);
    }
  }

  return (
    <>
      <div className="consultation-heading billing-heading"><div><p>Instant chat balance</p><h1>Wallet</h1><span>Recharge to start metered instant chats with online practitioners.</span></div></div>
      <section className="member-billing-summary">
        <article><span><WalletIcon size={19} /></span><div><small>Balance</small><strong>{currency} {liveBalance}</strong></div></article>
      </section>
      {!onlinePaymentsAvailable && <div className="finance-config-note"><WalletIcon size={18} /><div><strong>Recharge is temporarily unavailable</strong><span>Online payments are being configured.</span></div></div>}
      <section className="member-invoice-card">
        <header><div><p>Add funds</p><h2>Recharge your wallet</h2></div></header>
        <div className="wallet-recharge">
          <div className="wallet-presets">{PRESETS.map((value) => <button key={value} className={value === amount ? "active" : ""} onClick={() => setAmount(value)}>{currency} {value}</button>)}</div>
          <div className="wallet-custom"><label>Custom amount<div className="input-prefix"><b>{currency}</b><input type="number" min={50} max={50000} value={amount} onChange={(event) => setAmount(Number(event.target.value))} /></div></label>
            <button className="button" disabled={loading || !onlinePaymentsAvailable} onClick={recharge}><PlusCircle size={16} />{loading ? "Opening…" : `Add ${currency} ${amount}`}</button>
          </div>
        </div>
      </section>
      <section className="member-invoice-card">
        <header><div><p>Ledger</p><h2>Recent activity</h2></div><span>{entries.length} entries</span></header>
        <div className="member-invoice-list">
          {entries.map((entry) => (
            <article key={entry.id}>
              <div className="member-invoice-icon"><WalletIcon size={16} /></div>
              <div className="member-invoice-name"><small>{entry.type.replace("_", " ")}</small><h3>{entry.amount > 0 ? "+" : ""}{currency} {entry.amount}</h3><p>{new Date(entry.createdAt).toLocaleString("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p></div>
              <div className="member-invoice-amount"><strong>{currency} {entry.balanceAfter}</strong><span className="invoice-status invoice-status--paid">balance</span></div>
            </article>
          ))}
          {!entries.length && <div className="consultation-empty"><WalletIcon size={26} /><h3>No wallet activity yet</h3><p>Recharge to start your first instant chat.</p></div>}
        </div>
      </section>
      {notice && <div className="toast"><Check size={15} />{notice}<button onClick={() => setNotice("")}><X size={14} /></button></div>}
    </>
  );
}
