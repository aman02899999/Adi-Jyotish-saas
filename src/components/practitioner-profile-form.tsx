"use client";

import { FormEvent, useState } from "react";
import { Check, Save, X } from "lucide-react";

type Profile = { bio: string; specialties: string; languages: string; consultationModes: string; photoUrl: string | null };

export function PractitionerProfileForm({ initialProfile }: { initialProfile: Profile }) {
  const [form, setForm] = useState(initialProfile);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/practitioner/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Profile could not be updated.");
      setNotice("Profile updated.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="settings-layout" onSubmit={submit}>
      <section className="settings-card">
        <header><div><p>Public profile</p><h2>Your details</h2></div></header>
        <div className="settings-fields">
          <label className="field--full"><span>Bio</span><textarea rows={5} value={form.bio} onChange={(event) => setForm({ ...form, bio: event.target.value })} /></label>
          <label><span>Specialties (comma separated)</span><input value={form.specialties} onChange={(event) => setForm({ ...form, specialties: event.target.value })} /></label>
          <label><span>Languages</span><input value={form.languages} onChange={(event) => setForm({ ...form, languages: event.target.value })} /></label>
          <label><span>Consultation modes</span><input value={form.consultationModes} onChange={(event) => setForm({ ...form, consultationModes: event.target.value })} /></label>
          <label><span>Photo URL</span><input value={form.photoUrl ?? ""} onChange={(event) => setForm({ ...form, photoUrl: event.target.value })} placeholder="https://…" /></label>
        </div>
      </section>
      <div className="settings-save">
        <button className="button" disabled={saving}><Save size={15} />{saving ? "Saving…" : "Save profile"}</button>
      </div>
      {error && <p className="admin-auth-error" role="alert">{error}</p>}
      {notice && <div className="toast"><Check size={15} />{notice}<button type="button" onClick={() => setNotice("")}><X size={14} /></button></div>}
    </form>
  );
}
