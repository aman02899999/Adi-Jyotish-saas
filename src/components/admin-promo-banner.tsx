"use client";

import { useState } from "react";
import { Check } from "lucide-react";

export function AdminPromoBanner({ initial }: { initial: { enabled: boolean; message: string; ctaLabel: string | null; ctaHref: string | null } }) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [message, setMessage] = useState(initial.message);
  const [ctaLabel, setCtaLabel] = useState(initial.ctaLabel ?? "");
  const [ctaHref, setCtaHref] = useState(initial.ctaHref ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true);
    setError("");
    setSaved(false);
    const response = await fetch("/api/admin/promo-banner", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled, message, ctaLabel, ctaHref }),
    });
    const data = await response.json();
    if (!response.ok) setError(data.error || "Could not save the banner.");
    else setSaved(true);
    setSaving(false);
  }

  return (
    <section className="admin-table-card">
      <div className="admin-table-header">
        <div>
          <h2>Site-wide promo banner</h2>
          <p>A dismissible announcement bar shown to every visitor — use it for seasonal offers, festival campaigns, or launches. Turn it off any time.</p>
        </div>
        <button type="button" className={`status-toggle ${enabled ? "is-active" : ""}`} onClick={() => setEnabled((value) => !value)}><i>{enabled ? <Check size={10} /> : null}</i>{enabled ? "Live" : "Off"}</button>
      </div>
      <div className="settings-fields">
        <label><span>Banner message</span><input value={message} onChange={(event) => setMessage(event.target.value)} maxLength={200} placeholder="Diwali special — 20% off your first reading" /></label>
        <label><span>Button label (optional)</span><input value={ctaLabel} onChange={(event) => setCtaLabel(event.target.value)} maxLength={40} placeholder="Claim offer" /></label>
        <label><span>Button link (optional)</span><input value={ctaHref} onChange={(event) => setCtaHref(event.target.value)} maxLength={300} placeholder="/pricing" /></label>
      </div>
      {error && <div className="finance-config-note" style={{ margin: "0 22px 16px" }}><span>{error}</span></div>}
      <div style={{ padding: "0 22px 22px", display: "flex", alignItems: "center", gap: 12 }}>
        <button className="button" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save banner"}</button>
        {saved && <small style={{ color: "var(--muted)" }}>Saved.</small>}
      </div>
    </section>
  );
}
