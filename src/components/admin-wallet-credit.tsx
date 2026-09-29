"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";

type MemberOption = { id: string; name: string; email: string };

function newRequestId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

/** Credits a member's wallet by hand: the refund path for a reading that could not be produced,
 * a missed session, or goodwill. One request id per submission, so a double click credits once. */
export function AdminWalletCredit({ members, currency }: { members: MemberOption[]; currency: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [requestId, setRequestId] = useState(newRequestId);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const member = members.find((option) => option.email.toLowerCase() === email.trim().toLowerCase());
    if (!member) { setNotice("No member has that email. Pick one from the list."); return; }
    if (!window.confirm(`Add ${currency} ${amount} to ${member.name}'s wallet?`)) return;

    setSaving(true);
    setNotice("");
    try {
      const response = await fetch("/api/admin/wallets/credit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: member.id, amount: Number(amount), reason, requestId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { setNotice(data.error || "The wallet could not be credited."); return; }
      setNotice(`${currency} ${amount} added to ${member.name}'s wallet. New balance: ${data.wallet.currency} ${data.wallet.balance}.`);
      setEmail("");
      setAmount("");
      setReason("");
      setRequestId(newRequestId());
      router.refresh();
    } catch {
      setNotice("The wallet could not be credited. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="admin-table-card">
      <div className="admin-table-header"><div><h2>Credit a wallet</h2><p>Refund a failed reading or a missed session, or add goodwill credit. The member is notified, and the credit is recorded in the audit log.</p></div></div>
      <form className="wallet-credit-form" onSubmit={submit}>
        <label className="field"><span>Member email</span><input list="wallet-credit-members" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="member@example.com" required autoComplete="off" /></label>
        <datalist id="wallet-credit-members">{members.map((member) => <option key={member.id} value={member.email}>{member.name}</option>)}</datalist>
        <label className="field"><span>Amount ({currency})</span><input type="number" min={1} max={50000} step={1} value={amount} onChange={(event) => setAmount(event.target.value)} required /></label>
        <label className="field field--full"><span>Reason (shown to the member)</span><input value={reason} onChange={(event) => setReason(event.target.value)} minLength={3} maxLength={200} placeholder="Refund for a palm reading that could not be generated" required /></label>
        <button className="button" type="submit" disabled={saving}>{saving ? "Crediting…" : "Credit wallet"}</button>
      </form>
      {notice && <div className="toast" role="status"><Check size={15} />{notice}<button type="button" onClick={() => setNotice("")} aria-label="Dismiss"><X size={14} /></button></div>}
    </section>
  );
}
