"use client";

import { FormEvent, useState } from "react";
import { Check, X } from "lucide-react";
import type { FooterContent, HomeHeroContent } from "@/lib/site-content";

export function AdminWebsiteContent({ initialHero, initialFooter }: { initialHero: HomeHeroContent; initialFooter: FooterContent }) {
  const [hero, setHero] = useState(initialHero);
  const [footer, setFooter] = useState(initialFooter);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/site-content", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hero, footer }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not save.");
      setHero(data.hero);
      setFooter(data.footer);
      setNotice("Homepage & footer updated.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="settings-layout" onSubmit={save}>
      <section className="settings-card">
        <header><div><p>Homepage</p><h2>Hero section</h2></div></header>
        <div className="settings-fields">
          <label><span>Eyebrow text</span><input maxLength={120} value={hero.eyebrow} onChange={(event) => setHero({ ...hero, eyebrow: event.target.value })} /></label>
          <label><span>Headline (line 1)</span><input maxLength={80} value={hero.headline} onChange={(event) => setHero({ ...hero, headline: event.target.value })} /></label>
          <label><span>Headline (line 2, italic)</span><input maxLength={80} value={hero.headlineEm} onChange={(event) => setHero({ ...hero, headlineEm: event.target.value })} /></label>
          <label className="field--full"><span>Lead paragraph</span><textarea rows={2} maxLength={300} value={hero.lead} onChange={(event) => setHero({ ...hero, lead: event.target.value })} /></label>
          <label><span>Primary button label</span><input maxLength={40} value={hero.primaryCtaLabel} onChange={(event) => setHero({ ...hero, primaryCtaLabel: event.target.value })} /></label>
          <label><span>Primary button link</span><input maxLength={200} value={hero.primaryCtaHref} onChange={(event) => setHero({ ...hero, primaryCtaHref: event.target.value })} /></label>
          <label><span>Secondary button label</span><input maxLength={40} value={hero.secondaryCtaLabel} onChange={(event) => setHero({ ...hero, secondaryCtaLabel: event.target.value })} /></label>
          <label><span>Secondary button link</span><input maxLength={200} value={hero.secondaryCtaHref} onChange={(event) => setHero({ ...hero, secondaryCtaHref: event.target.value })} /></label>
        </div>
      </section>

      <section className="settings-card">
        <header><div><p>Site-wide</p><h2>Footer tagline</h2></div></header>
        <div className="settings-fields">
          <label className="field--full"><span>Footer blurb (blank line for line break)</span><textarea rows={2} maxLength={400} value={footer.blurb} onChange={(event) => setFooter({ ...footer, blurb: event.target.value })} /></label>
        </div>
      </section>

      <div className="settings-save">
        <button className="button" disabled={saving}>{saving ? "Saving…" : "Save changes"}</button>
      </div>
      {error && <p className="admin-auth-error" role="alert">{error}</p>}
      {notice && <div className="toast"><Check size={15} />{notice}<button type="button" onClick={() => setNotice("")}><X size={14} /></button></div>}
    </form>
  );
}
