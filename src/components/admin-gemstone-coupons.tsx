"use client";

import { FormEvent, useState } from "react";
import { Check, Edit3, Plus, TicketPercent, X } from "lucide-react";
import type { GemstoneCoupon } from "@/lib/gemstone-coupons";

type FormState = {
  code: string; description: string; discountType: string; discountValue: string;
  minOrderAmount: string; maxDiscountAmount: string; usageLimit: string; perCustomerLimit: string;
  expiresAt: string; active: boolean;
};
const emptyForm: FormState = { code: "", description: "", discountType: "percent", discountValue: "10", minOrderAmount: "0", maxDiscountAmount: "", usageLimit: "", perCustomerLimit: "1", expiresAt: "", active: true };

export function AdminGemstoneCoupons({ initialCoupons }: { initialCoupons: GemstoneCoupon[] }) {
  const [items, setItems] = useState(initialCoupons);
  const [editing, setEditing] = useState<GemstoneCoupon | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  function startCreate() { setEditing(null); setForm(emptyForm); setOpen(true); }
  function startEdit(coupon: GemstoneCoupon) {
    setEditing(coupon);
    setForm({
      code: coupon.code, description: coupon.description, discountType: coupon.discountType, discountValue: String(coupon.discountValue),
      minOrderAmount: String(coupon.minOrderAmount), maxDiscountAmount: coupon.maxDiscountAmount != null ? String(coupon.maxDiscountAmount) : "",
      usageLimit: coupon.usageLimit != null ? String(coupon.usageLimit) : "", perCustomerLimit: coupon.perCustomerLimit != null ? String(coupon.perCustomerLimit) : "",
      expiresAt: coupon.expiresAt ? new Date(coupon.expiresAt).toISOString().slice(0, 10) : "", active: coupon.active,
    });
    setOpen(true);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setNotice("");
    const payload = {
      ...form,
      discountValue: Number(form.discountValue) || 0,
      minOrderAmount: Number(form.minOrderAmount) || 0,
      maxDiscountAmount: form.maxDiscountAmount.trim() ? Number(form.maxDiscountAmount) : null,
      usageLimit: form.usageLimit.trim() ? Number(form.usageLimit) : null,
      perCustomerLimit: form.perCustomerLimit.trim() ? Number(form.perCustomerLimit) : null,
      expiresAt: form.expiresAt || null,
    };
    try {
      const response = await fetch(editing ? `/api/admin/gemstones/coupons/${editing.id}` : "/api/admin/gemstones/coupons", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save coupon.");
      setItems((current) => editing ? current.map((item) => item.id === editing.id ? data : item) : [...current, data]);
      setOpen(false);
      setNotice(editing ? "Coupon updated." : "Coupon created.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(coupon: GemstoneCoupon) {
    const response = await fetch(`/api/admin/gemstones/coupons/${coupon.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !coupon.active }) });
    if (response.ok) { const data = await response.json(); setItems((current) => current.map((item) => item.id === coupon.id ? data : item)); }
  }

  return (
    <>
      <section className="admin-table-card">
        <div className="admin-table-header"><div><h2>Coupons</h2><p>Discount codes customers can apply at checkout.</p></div><button className="button button--small" onClick={startCreate}><Plus size={16} /> Add coupon</button></div>
        <div className="service-table" role="table" aria-label="Coupons">
          <div className="service-table__head" role="row"><span>Code</span><span>Discount</span><span>Used</span><span>Expires</span><span>Status</span><span>Actions</span></div>
          {items.map((coupon) => (
            <div className="service-table__row" role="row" key={coupon.id}>
              <div className="table-service"><span className="table-service__icon"><TicketPercent size={17} /></span><div><strong>{coupon.code}</strong><small>{coupon.description || "No description"}</small></div></div>
              <strong>{coupon.discountType === "percent" ? `${coupon.discountValue}%` : `₹${coupon.discountValue}`}</strong>
              <span>{coupon.usageCount}{coupon.usageLimit ? ` / ${coupon.usageLimit}` : ""}</span>
              <span>{coupon.expiresAt ? new Date(coupon.expiresAt).toLocaleDateString("en", { month: "short", day: "numeric" }) : "Never"}</span>
              <button className={`status-toggle ${coupon.active ? "is-active" : ""}`} onClick={() => toggleActive(coupon)}><i>{coupon.active ? <Check size={10} /> : null}</i>{coupon.active ? "Active" : "Disabled"}</button>
              <div className="row-actions"><button onClick={() => startEdit(coupon)} aria-label={`Edit ${coupon.code}`}><Edit3 size={16} /></button></div>
            </div>
          ))}
          {!items.length && <div className="empty-state"><TicketPercent size={24} /><h3>No coupons yet</h3><p>Create your first discount code.</p></div>}
        </div>
      </section>

      {notice && <div className="toast" role="status"><Check size={16} />{notice}<button onClick={() => setNotice("")} aria-label="Dismiss"><X size={14} /></button></div>}

      {open && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
          <section className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="coupon-form-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-header"><div><p>{editing ? "Update coupon" : "Create a new coupon"}</p><h2 id="coupon-form-title">{editing ? "Edit coupon" : "Add coupon"}</h2></div><button onClick={() => setOpen(false)} aria-label="Close"><X size={20} /></button></div>
            <form onSubmit={save}>
              <label className="field"><span>Code</span><input required maxLength={40} value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} placeholder="e.g. WELCOME10" /></label>
              <label className="field"><span>Type</span><select value={form.discountType} onChange={(event) => setForm({ ...form, discountType: event.target.value })}><option value="percent">Percentage</option><option value="flat">Flat amount</option></select></label>
              <label className="field"><span>Discount value</span><div className="input-suffix"><input required min="0" type="number" value={form.discountValue} onChange={(event) => setForm({ ...form, discountValue: event.target.value })} /><b>{form.discountType === "percent" ? "%" : "₹"}</b></div></label>
              <label className="field"><span>Minimum order</span><div className="input-prefix"><b>₹</b><input min="0" type="number" value={form.minOrderAmount} onChange={(event) => setForm({ ...form, minOrderAmount: event.target.value })} /></div></label>
              <label className="field"><span>Max discount cap (optional)</span><div className="input-prefix"><b>₹</b><input min="0" type="number" value={form.maxDiscountAmount} onChange={(event) => setForm({ ...form, maxDiscountAmount: event.target.value })} /></div></label>
              <label className="field"><span>Total usage limit (optional)</span><input min="0" type="number" value={form.usageLimit} onChange={(event) => setForm({ ...form, usageLimit: event.target.value })} /></label>
              <label className="field"><span>Per-customer limit (optional)</span><input min="0" type="number" value={form.perCustomerLimit} onChange={(event) => setForm({ ...form, perCustomerLimit: event.target.value })} /></label>
              <label className="field"><span>Expires on (optional)</span><input type="date" value={form.expiresAt} onChange={(event) => setForm({ ...form, expiresAt: event.target.value })} /></label>
              <label className="field field--full"><span>Description</span><input maxLength={200} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Shown to admins only" /></label>
              <div className="form-options field--full"><label><button type="button" className={`switch ${form.active ? "on" : ""}`} onClick={() => setForm({ ...form, active: !form.active })}><i /></button><span><strong>Active</strong><small>Customers can redeem this code</small></span></label></div>
              <div className="modal-actions field--full"><button type="button" className="button button--ghost" onClick={() => setOpen(false)}>Cancel</button><button className="button" disabled={saving}>{saving ? "Saving…" : editing ? "Save changes" : "Create coupon"}</button></div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
