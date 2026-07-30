"use client";

import { useMemo, useState } from "react";
import { Banknote, Check, ChevronDown, Clock3, ReceiptText, Search, Wallet, X } from "lucide-react";

export type AdminPayoutRow = {
  id: number;
  practitionerId: number;
  amount: number;
  currency: string;
  status: string;
  notes: string | null;
  adminNotes: string | null;
  transactionRef: string | null;
  processedBy: number | null;
  requestedAt: Date | string;
  processedAt: Date | string | null;
  updatedAt: Date | string;
  practitionerName: string;
  practitionerEmail: string;
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  bankIfsc: string | null;
  upiId: string | null;
};

export function AdminPayouts({ initialPayouts }: { initialPayouts: AdminPayoutRow[] }) {
  const [items, setItems] = useState(initialPayouts);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState<number | null>(null);

  const filtered = useMemo(
    () =>
      items.filter(
        (item) =>
          `${item.practitionerName} ${item.practitionerEmail}`.toLowerCase().includes(query.toLowerCase()) &&
          (filter === "all" || item.status === filter),
      ),
    [items, query, filter],
  );

  const stats = useMemo(
    () => ({
      pending: items.filter((item) => item.status === "requested").reduce((sum, item) => sum + item.amount, 0),
      pendingCount: items.filter((item) => item.status === "requested").length,
      approved: items.filter((item) => item.status === "approved").reduce((sum, item) => sum + item.amount, 0),
      paid: items.filter((item) => item.status === "paid").reduce((sum, item) => sum + item.amount, 0),
    }),
    [items],
  );

  async function update(payout: AdminPayoutRow, status: "approved" | "paid" | "rejected") {
    const labels: Record<string, string> = {
      approved: "Approve this payout request?",
      paid: "Mark this payout as paid out?",
      rejected: "Reject this payout request?",
    };
    let transactionRef: string | null = null;
    if (status === "paid") {
      transactionRef = window.prompt("Bank/UPI transaction reference (UTR) for this transfer — required to mark paid:");
      if (!transactionRef?.trim()) return;
    } else if (!window.confirm(labels[status])) {
      return;
    }
    setSaving(payout.id);
    const response = await fetch(`/api/admin/practitioner-payouts/${payout.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, transactionRef }),
    });
    const data = await response.json();
    if (response.ok) {
      setItems((current) => current.map((item) => (item.id === payout.id ? { ...item, ...data } : item)));
      setNotice(status === "approved" ? "Payout approved." : status === "paid" ? "Payout marked as paid." : "Payout rejected.");
    } else {
      setNotice(data.error || "Payout could not be updated.");
    }
    setSaving(null);
  }

  return (
    <>
      <section className="finance-stats">
        <article><span><Clock3 size={20} /></span><div><small>Awaiting review</small><strong>₹{stats.pending.toLocaleString()}</strong><p>{stats.pendingCount} requests</p></div></article>
        <article><span><Wallet size={20} /></span><div><small>Approved, unpaid</small><strong>₹{stats.approved.toLocaleString()}</strong><p>Ready to disburse</p></div></article>
        <article><span><Banknote size={20} /></span><div><small>Paid out</small><strong>₹{stats.paid.toLocaleString()}</strong><p>Lifetime disbursed</p></div></article>
      </section>

      <section className="admin-table-card">
        <div className="admin-table-header"><div><h2>Payout requests</h2><p>Review and disburse practitioner earnings.</p></div></div>
        <div className="admin-toolbar">
          <label><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Practitioner or email…" /></label>
          <div className="filter-select">
            <select value={filter} onChange={(event) => setFilter(event.target.value)}>
              <option value="all">All statuses</option>
              <option value="requested">Requested</option>
              <option value="approved">Approved</option>
              <option value="paid">Paid</option>
              <option value="rejected">Rejected</option>
            </select>
            <ChevronDown size={14} />
          </div>
          <span>{filtered.length} requests</span>
        </div>
        <div className="payout-table">
          <div className="payout-table__head"><span>Practitioner</span><span>Amount</span><span>Requested</span><span>Notes</span><span>Payout to</span><span>Status</span><span>Actions</span></div>
          {filtered.map((payout) => (
            <div className="payout-table__row" key={payout.id}>
              <div className="finance-customer"><strong>{payout.practitionerName}</strong><small>{payout.practitionerEmail}</small></div>
              <strong>{payout.currency} {payout.amount.toLocaleString()}</strong>
              <div className="finance-date"><strong>{new Date(payout.requestedAt).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}</strong><small>{new Date(payout.requestedAt).toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" })}</small></div>
              <small>{payout.notes || "—"}</small>
              {payout.bankAccountNumber ? (
                <small title={payout.bankIfsc ?? ""}>{payout.bankAccountName} · {payout.bankAccountNumber}</small>
              ) : payout.upiId ? (
                <small>{payout.upiId}</small>
              ) : (
                <small>No details on file</small>
              )}
              <span className={`invoice-status invoice-status--${payout.status}`}>{payout.status}{payout.transactionRef && <em title={`Ref: ${payout.transactionRef}`}> ✓</em>}</span>
              <div className="finance-actions">
                {payout.status === "requested" && (
                  <>
                    <button disabled={saving === payout.id} onClick={() => update(payout, "approved")}>Approve</button>
                    <button className="refund" disabled={saving === payout.id} onClick={() => update(payout, "rejected")}>Reject</button>
                  </>
                )}
                {payout.status === "approved" && (
                  <button disabled={saving === payout.id} onClick={() => update(payout, "paid")}>Mark paid</button>
                )}
              </div>
            </div>
          ))}
          {!filtered.length && <div className="empty-state"><ReceiptText size={25} /><h3>No payout requests</h3><p>Requests appear here once a practitioner asks for a payout.</p></div>}
        </div>
      </section>

      {notice && <div className="toast"><Check size={15} />{notice}<button onClick={() => setNotice("")}><X size={14} /></button></div>}
    </>
  );
}
