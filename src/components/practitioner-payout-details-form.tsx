"use client";

import { FormEvent, useState } from "react";
import { Banknote, Check, X } from "lucide-react";

export type PayoutDetailsInitial = {
  bankAccountName: string | null;
  bankIfsc: string | null;
  hasBankAccount: boolean;
  hasUpi: boolean;
};

export function PractitionerPayoutDetailsForm({ initialDetails }: { initialDetails: PayoutDetailsInitial }) {
  const [bankAccountName, setBankAccountName] = useState(initialDetails.bankAccountName ?? "");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [bankIfsc, setBankIfsc] = useState(initialDetails.bankIfsc ?? "");
  const [upiId, setUpiId] = useState("");
  const [saved, setSaved] = useState({ bank: initialDetails.hasBankAccount, upi: initialDetails.hasUpi });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      const response = await fetch("/api/practitioner/payout-details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bankAccountName, bankAccountNumber, bankIfsc, upiId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Payout details could not be saved.");
      setSaved({ bank: Boolean(bankAccountNumber) || saved.bank, upi: Boolean(upiId) || saved.upi });
      setBankAccountNumber("");
      setUpiId("");
      setNotice("Payout details saved.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="settings-card two-factor-card">
      <header><div><p>Bank transfer or UPI</p><h2>Where should we send your earnings?</h2></div><Banknote size={18} /></header>
      <p className="two-factor-hint">
        {saved.bank || saved.upi ? "Payout details are saved. Enter new details below to replace them." : "Add at least one payout method before requesting your first payout."}
      </p>
      {notice && <div className="toast"><Check size={15} />{notice}<button onClick={() => setNotice("")}><X size={14} /></button></div>}
      <form className="admin-auth-form" onSubmit={submit}>
        <label><span>Account holder name</span><input value={bankAccountName} onChange={(event) => setBankAccountName(event.target.value)} placeholder="As it appears on your bank account" /></label>
        <label><span>Bank account number {saved.bank && <em>(saved — enter a new number to replace it)</em>}</span><input value={bankAccountNumber} onChange={(event) => setBankAccountNumber(event.target.value)} placeholder={saved.bank ? "•••• saved" : "Account number"} /></label>
        <label><span>IFSC code</span><input value={bankIfsc} onChange={(event) => setBankIfsc(event.target.value.toUpperCase())} placeholder="e.g. HDFC0001234" maxLength={11} /></label>
        <label><span>UPI ID (optional) {saved.upi && <em>(saved — enter a new ID to replace it)</em>}</span><input value={upiId} onChange={(event) => setUpiId(event.target.value)} placeholder={saved.upi ? "•••• saved" : "name@bank"} /></label>
        {error && <p className="admin-auth-error" role="alert">{error}</p>}
        <button className="button admin-auth-submit" disabled={saving}>{saving ? "Saving…" : "Save payout details"}</button>
      </form>
    </section>
  );
}
