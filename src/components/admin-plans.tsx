"use client";

import { FormEvent, useState } from "react";
import { Check, Crown, Edit3, Plus, ShieldCheck, Sparkles, X } from "lucide-react";
import type { MembershipPlan } from "@/db/schema";

type FormState = {
  key: string;
  name: string;
  tagline: string;
  description: string;
  priceMonthly: string;
  priceYearly: string;
  features: string;
  sessionDiscountPercent: string;
  highlighted: boolean;
  active: boolean;
  sortOrder: string;
};

const emptyForm: FormState = {
  key: "",
  name: "",
  tagline: "",
  description: "",
  priceMonthly: "299",
  priceYearly: "2999",
  features: "",
  sessionDiscountPercent: "0",
  highlighted: false,
  active: true,
  sortOrder: "1",
};

export function AdminPlans({ initialPlans, razorpayConfigured, razorpayMode }: { initialPlans: MembershipPlan[]; razorpayConfigured: boolean; razorpayMode: "test" | "live" }) {
  const [items, setItems] = useState(initialPlans);
  const [editing, setEditing] = useState<MembershipPlan | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  function startCreate() {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  }

  function startEdit(plan: MembershipPlan) {
    setEditing(plan);
    setForm({
      key: plan.key,
      name: plan.name,
      tagline: plan.tagline,
      description: plan.description,
      priceMonthly: String(plan.priceMonthly),
      priceYearly: plan.priceYearly != null ? String(plan.priceYearly) : "",
      features: plan.features,
      sessionDiscountPercent: String(plan.sessionDiscountPercent),
      highlighted: plan.highlighted,
      active: plan.active,
      sortOrder: String(plan.sortOrder),
    });
    setOpen(true);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setNotice("");
    const payload = {
      ...form,
      priceMonthly: Number(form.priceMonthly),
      priceYearly: form.priceYearly.trim() ? Number(form.priceYearly) : null,
      sessionDiscountPercent: Number(form.sessionDiscountPercent),
      sortOrder: Number(form.sortOrder),
    };
    try {
      const response = await fetch(editing ? `/api/admin/plans/${editing.id}` : "/api/admin/plans", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save plan.");
      setItems((current) => editing ? current.map((item) => item.id === editing.id ? data : item) : [...current, data]);
      setOpen(false);
      setNotice(editing ? "Plan updated." : "Plan created.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  async function toggle(plan: MembershipPlan, field: "active" | "highlighted") {
    const response = await fetch(`/api/admin/plans/${plan.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...plan, [field]: !plan[field] }),
    });
    if (response.ok) {
      const data = await response.json();
      setItems((current) => current.map((item) => item.id === plan.id ? data : item));
      setNotice(field === "active" ? `Plan ${data.active ? "published" : "hidden"}.` : "Highlight updated.");
    }
  }

  return (
    <>
      {!razorpayConfigured && <div className="finance-config-note"><ShieldCheck size={18} /><div><strong>Manual mode is active</strong><span>Add server-side RAZORPAY_TEST_KEY_ID/SECRET (or RAZORPAY_KEY_ID/SECRET) to auto-create billing plans and accept subscriptions.</span></div></div>}
      {razorpayConfigured && razorpayMode === "test" && <div className="finance-config-note"><ShieldCheck size={18} /><div><strong>Razorpay is in test mode</strong><span>No real money moves. Set RAZORPAY_MODE=live with RAZORPAY_LIVE_KEY_ID/SECRET when you&rsquo;re ready to accept real payments.</span></div></div>}
      <section className="admin-table-card">
        <div className="admin-table-header">
          <div><h2>Membership plans</h2><p>Recurring tiers members can subscribe to from Pricing.</p></div>
          <button className="button button--small" onClick={startCreate}><Plus size={16} /> Add plan</button>
        </div>
        <div className="service-table" role="table" aria-label="Membership plans">
          <div className="service-table__head" role="row"><span>Plan</span><span>Monthly</span><span>Yearly</span><span>Status</span><span>Highlighted</span><span>Actions</span></div>
          {items.map((plan) => (
            <div className="service-table__row" role="row" key={plan.id}>
              <div className="table-service"><span className="table-service__icon"><Sparkles size={17} /></span><div><strong>{plan.name}</strong><small>{plan.key} · {plan.razorpayPlanIdMonthly ? "Synced with Razorpay" : "Not synced"}</small></div></div>
              <strong>{plan.currency} {plan.priceMonthly}</strong>
              <strong>{plan.priceYearly != null ? `${plan.currency} ${plan.priceYearly}` : "—"}</strong>
              <button className={`status-toggle ${plan.active ? "is-active" : ""}`} onClick={() => toggle(plan, "active")}><i>{plan.active ? <Check size={10} /> : null}</i>{plan.active ? "Published" : "Draft"}</button>
              <button className={`star-toggle ${plan.highlighted ? "is-featured" : ""}`} onClick={() => toggle(plan, "highlighted")} aria-label={`${plan.highlighted ? "Remove" : "Add"} highlight`}><Crown size={17} fill={plan.highlighted ? "currentColor" : "none"} /></button>
              <div className="row-actions"><button onClick={() => startEdit(plan)} aria-label={`Edit ${plan.name}`}><Edit3 size={16} /></button></div>
            </div>
          ))}
          {items.length === 0 && <div className="empty-state"><Sparkles size={24} /><h3>No plans yet</h3><p>Create your first membership tier.</p></div>}
        </div>
      </section>

      {notice && <div className="toast" role="status"><Check size={16} />{notice}<button onClick={() => setNotice("")} aria-label="Dismiss"><X size={14} /></button></div>}

      {open && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
          <section className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="plan-form-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-header"><div><p>{editing ? "Update tier" : "Create a new tier"}</p><h2 id="plan-form-title">{editing ? "Edit plan" : "Add plan"}</h2></div><button onClick={() => setOpen(false)} aria-label="Close"><X size={20} /></button></div>
            <form onSubmit={save}>
              <label className="field field--full"><span>Plan name</span><input required maxLength={80} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. Plus" /></label>
              <label className="field field--full"><span>Tagline</span><input maxLength={160} value={form.tagline} onChange={(event) => setForm({ ...form, tagline: event.target.value })} placeholder="One line describing who this is for" /></label>
              <label className="field"><span>Monthly price</span><div className="input-prefix"><b>₹</b><input required min="0" type="number" value={form.priceMonthly} onChange={(event) => setForm({ ...form, priceMonthly: event.target.value })} /></div></label>
              <label className="field"><span>Yearly price (optional)</span><div className="input-prefix"><b>₹</b><input min="0" type="number" value={form.priceYearly} onChange={(event) => setForm({ ...form, priceYearly: event.target.value })} /></div></label>
              <label className="field"><span>Consultation discount</span><div className="input-suffix"><input min="0" max="100" type="number" value={form.sessionDiscountPercent} onChange={(event) => setForm({ ...form, sessionDiscountPercent: event.target.value })} /><b>%</b></div></label>
              <label className="field"><span>Sort order</span><input min="0" type="number" value={form.sortOrder} onChange={(event) => setForm({ ...form, sortOrder: event.target.value })} /></label>
              <label className="field field--full"><span>Description</span><textarea rows={2} maxLength={300} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Shown under the plan name on Pricing" /></label>
              <label className="field field--full"><span>Features (one per line)</span><textarea rows={5} maxLength={800} value={form.features} onChange={(event) => setForm({ ...form, features: event.target.value })} placeholder={"Full daily horoscope\n10% off consultations"} /></label>
              <div className="form-options field--full">
                <label><button type="button" className={`switch ${form.active ? "on" : ""}`} onClick={() => setForm({ ...form, active: !form.active })}><i /></button><span><strong>Publish immediately</strong><small>Visible on the Pricing page</small></span></label>
                <label><button type="button" className={`switch ${form.highlighted ? "on" : ""}`} onClick={() => setForm({ ...form, highlighted: !form.highlighted })}><i /></button><span><strong>Highlight this plan</strong><small>Shown as the recommended tier</small></span></label>
              </div>
              <div className="modal-actions field--full"><button type="button" className="button button--ghost" onClick={() => setOpen(false)}>Cancel</button><button className="button" disabled={saving}>{saving ? "Saving…" : editing ? "Save changes" : "Create plan"}</button></div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
