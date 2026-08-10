"use client";

import { useState } from "react";
import { Check, Coins, Send, X } from "lucide-react";

type Payout = { id: string; amount: number; currency: string; status: string; notes: string | null; adminNotes: string | null; requestedAt: string };
type Stats = { totalEarned: number; paidOut: number; pendingOut: number; availableBalance: number };

export function PractitionerEarnings({ initialStats, initialPayouts }: { initialStats: Stats; initialPayouts: Payout[] }) {
  const [stats, setStats] = useState(initialStats);
  const [payouts, setPayouts] = useState(initialPayouts);
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  async function requestPayout(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      const response = await fetch("/api/practitioner/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: Number(amount), notes }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Payout could not be requested.");
      setPayouts((current) => [data, ...current]);
      setStats((current) => ({ ...current, pendingOut: current.pendingOut + data.amount, availableBalance: current.availableBalance - data.amount }));
      setAmount("");
      setNotes("");
      setNotice("Payout requested.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <section className="overview-kpis">
        <article><span><Coins size={18} /></span><div><small>Available to withdraw</small><strong>₹{stats.availableBalance}</strong></div></article>
        <article><span><Coins size={18} /></span><div><small>Total earned</small><strong>₹{stats.totalEarned}</strong></div></article>
        <article><span><Coins size={18} /></span><div><small>Pending payouts</small><strong>₹{stats.pendingOut}</strong></div></article>
        <article><span><Coins size={18} /></span><div><small>Paid out</small><strong>₹{stats.paidOut}</strong></div></article>
      </section>

      <section className="settings-card" style={{ marginBottom: 24 }}>
        <header><div><p>Request funds</p><h2>Request a payout</h2></div><Send size={18} /></header>
        <form className="settings-fields" style={{ padding: "18px 19px" }} onSubmit={requestPayout}>
          <label><span>Amount (₹)</span><input type="number" min="100" max={stats.availableBalance} required value={amount} onChange={(event) => setAmount(event.target.value)} placeholder={`Up to ₹${stats.availableBalance}`} /></label>
          <label className="field--full"><span>Note (optional)</span><input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Bank details or a note for the finance team" /></label>
          {error && <p className="admin-auth-error" role="alert">{error}</p>}
          <button className="button button--small" disabled={saving || stats.availableBalance < 100}>{saving ? "Requesting…" : "Request payout"}</button>
        </form>
      </section>

      <section className="admin-table-card">
        <div className="admin-table-header"><div><h2>Payout history</h2><p>Track the status of every request.</p></div></div>
        <div className="team-table">
          <div className="team-table__head"><span>Requested</span><span>Amount</span><span>Status</span><span>Note</span><span /></div>
          {payouts.map((payout) => (
            <div className="team-table__row" key={payout.id}>
              <div className="team-person"><div><strong>{new Date(payout.requestedAt).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}</strong></div></div>
              <span>₹{payout.amount}</span>
              <span style={{ textTransform: "capitalize" }}>{payout.status}</span>
              <span>{payout.adminNotes || payout.notes || "—"}</span>
              <span />
            </div>
          ))}
          {!payouts.length && <div style={{ padding: 24, textAlign: "center", color: "var(--muted)", fontSize: 12 }}>No payout requests yet.</div>}
        </div>
      </section>

      {notice && <div className="toast"><Check size={15} />{notice}<button onClick={() => setNotice("")}><X size={14} /></button></div>}
    </>
  );
}
