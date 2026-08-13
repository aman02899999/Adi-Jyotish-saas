"use client";

import { FormEvent, useState } from "react";
import { Check, Crown, Edit3, Mail, Plus, ShieldCheck, Trash2, Users, X } from "lucide-react";
import { AvatarImage } from "@/components/avatar-image";
import type { Practitioner } from "@/lib/scheduling";

type FormState = {
  name: string; email: string; title: string; bio: string; specialties: string; languages: string;
  consultationModes: string; experienceYears: string; chatRatePerMinute: string; photoUrl: string; videoUrl: string;
  featured: boolean; active: boolean;
};

const emptyForm: FormState = {
  name: "", email: "", title: "", bio: "", specialties: "", languages: "English, Hindi",
  consultationModes: "Chat, Call, Video", experienceYears: "5", chatRatePerMinute: "15", photoUrl: "", videoUrl: "",
  featured: false, active: false,
};

export function AdminPractitioners({ initialPractitioners }: { initialPractitioners: Practitioner[] }) {
  const [items, setItems] = useState(initialPractitioners);
  const [editing, setEditing] = useState<Practitioner | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [invitePath, setInvitePath] = useState<{ id: string; path: string } | null>(null);

  function startCreate() {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  }

  function startEdit(person: Practitioner) {
    setEditing(person);
    setForm({
      name: person.name, email: person.email, title: person.title, bio: person.bio,
      specialties: person.specialties, languages: person.languages, consultationModes: person.consultationModes,
      experienceYears: String(person.experienceYears), chatRatePerMinute: String(person.chatRatePerMinute),
      photoUrl: person.photoUrl ?? "", videoUrl: person.videoUrl ?? "", featured: person.featured, active: person.active,
    });
    setOpen(true);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setNotice("");
    const payload = {
      ...form,
      experienceYears: Number(form.experienceYears),
      chatRatePerMinute: Number(form.chatRatePerMinute),
      photoUrl: form.photoUrl.trim() || null,
      videoUrl: form.videoUrl.trim() || null,
    };
    try {
      const response = await fetch(editing ? `/api/admin/practitioners/${editing.id}` : "/api/admin/practitioners", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save practitioner.");
      setItems((current) => editing ? current.map((item) => item.id === editing.id ? data : item) : [data, ...current]);
      setOpen(false);
      setNotice(editing ? "Practitioner updated." : "Practitioner created. Send them a portal invite when ready.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  async function toggle(person: Practitioner, field: "active" | "featured" | "verified") {
    const response = await fetch(`/api/admin/practitioners/${person.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: !person[field] }),
    });
    const data = await response.json();
    if (response.ok) {
      setItems((current) => current.map((item) => item.id === person.id ? data : item));
    } else {
      setNotice(data.error || "Could not update practitioner.");
    }
  }

  async function sendInvite(person: Practitioner) {
    setNotice("");
    const response = await fetch(`/api/admin/practitioners/${person.id}/invite`, { method: "POST" });
    const data = await response.json();
    if (response.ok) {
      setInvitePath({ id: person.id, path: data.invitePath });
      setNotice(`Invite created for ${person.name}.`);
    } else {
      setNotice(data.error || "Could not create an invite.");
    }
  }

  async function remove(person: Practitioner) {
    if (!confirm(`Delete ${person.name}? This only works if they have no bookings or reviews yet.`)) return;
    const response = await fetch(`/api/admin/practitioners/${person.id}`, { method: "DELETE" });
    const data = await response.json().catch(() => ({}));
    if (response.ok) {
      setItems((current) => current.filter((item) => item.id !== person.id));
      setNotice("Practitioner deleted.");
    } else {
      setNotice(data.error || "Could not delete practitioner — deactivate instead.");
    }
  }

  return (
    <>
      <section className="admin-table-card">
        <div className="admin-table-header">
          <div><h2>Practitioners</h2><p>Create and manage every human practitioner on the marketplace.</p></div>
          <button className="button button--small" onClick={startCreate}><Plus size={16} /> Add practitioner</button>
        </div>
        <div className="service-table" role="table" aria-label="Practitioners">
          <div className="service-table__head" role="row"><span>Practitioner</span><span>Experience</span><span>Rate</span><span>Status</span><span>Featured</span><span>Actions</span></div>
          {items.map((person) => (
            <div className="service-table__row" role="row" key={person.id}>
              <div className="table-service">
                <span className="table-service__icon"><AvatarImage src={person.photoUrl} alt="" style={{ width: 34, height: 34, borderRadius: "50%", objectFit: "cover" }} fallback={<Users size={17} />} /></span>
                <div><strong>{person.name}</strong><small>{person.email} · {person.hasPortalAccess ? "Portal linked" : "Not yet invited"}</small></div>
              </div>
              <strong>{person.experienceYears} yrs</strong>
              <strong>₹{person.chatRatePerMinute}/min</strong>
              <button className={`status-toggle ${person.active ? "is-active" : ""}`} onClick={() => toggle(person, "active")}><i>{person.active ? <Check size={10} /> : null}</i>{person.active ? "Published" : "Draft"}</button>
              <button className={`star-toggle ${person.featured ? "is-featured" : ""}`} onClick={() => toggle(person, "featured")} aria-label={`${person.featured ? "Remove" : "Add"} featured`}><Crown size={17} fill={person.featured ? "currentColor" : "none"} /></button>
              <div className="row-actions">
                {!person.hasPortalAccess && <button onClick={() => sendInvite(person)} aria-label={`Invite ${person.name}`} title="Send portal invite"><Mail size={16} /></button>}
                <button onClick={() => toggle(person, "verified")} aria-label={`${person.verified ? "Unverify" : "Verify"} ${person.name}`} title={person.verified ? "Verified" : "Mark verified"}><ShieldCheck size={16} color={person.verified ? "var(--copper, #a95838)" : undefined} /></button>
                <button onClick={() => startEdit(person)} aria-label={`Edit ${person.name}`}><Edit3 size={16} /></button>
                <button onClick={() => remove(person)} aria-label={`Delete ${person.name}`}><Trash2 size={16} /></button>
              </div>
            </div>
          ))}
          {items.length === 0 && <div className="empty-state"><Users size={24} /><h3>No practitioners yet</h3><p>Create your first practitioner profile.</p></div>}
        </div>
      </section>

      {invitePath && (
        <div className="toast" role="status">
          <Check size={16} />
          Invite link: <code style={{ userSelect: "all" }}>{invitePath.path}</code>
          <button onClick={() => setInvitePath(null)} aria-label="Dismiss"><X size={14} /></button>
        </div>
      )}
      {notice && !invitePath && <div className="toast" role="status"><Check size={16} />{notice}<button onClick={() => setNotice("")} aria-label="Dismiss"><X size={14} /></button></div>}

      {open && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
          <section className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="practitioner-form-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-header"><div><p>{editing ? "Update profile" : "Onboard a new practitioner"}</p><h2 id="practitioner-form-title">{editing ? "Edit practitioner" : "Add practitioner"}</h2></div><button onClick={() => setOpen(false)} aria-label="Close"><X size={20} /></button></div>
            <form onSubmit={save}>
              <label className="field"><span>Full name</span><input required maxLength={120} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. Pandit Ravi Shankar" /></label>
              <label className="field"><span>Email</span><input required type="email" maxLength={180} disabled={Boolean(editing)} value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="practitioner@example.com" /></label>
              <label className="field field--full"><span>Title</span><input maxLength={160} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="e.g. Vedic Astrologer · Marriage & Career" /></label>
              <label className="field field--full"><span>Bio</span><textarea rows={3} maxLength={2000} value={form.bio} onChange={(event) => setForm({ ...form, bio: event.target.value })} placeholder="Shown on their public profile" /></label>
              <label className="field field--full"><span>Specialties (comma separated)</span><input maxLength={300} value={form.specialties} onChange={(event) => setForm({ ...form, specialties: event.target.value })} placeholder="Marriage, Career, Health" /></label>
              <label className="field"><span>Languages</span><input maxLength={200} value={form.languages} onChange={(event) => setForm({ ...form, languages: event.target.value })} /></label>
              <label className="field"><span>Consultation modes</span><input maxLength={200} value={form.consultationModes} onChange={(event) => setForm({ ...form, consultationModes: event.target.value })} /></label>
              <label className="field"><span>Experience (years)</span><input min="0" max="60" type="number" value={form.experienceYears} onChange={(event) => setForm({ ...form, experienceYears: event.target.value })} /></label>
              <label className="field"><span>Chat rate</span><div className="input-prefix"><b>₹/min</b><input min="0" type="number" value={form.chatRatePerMinute} onChange={(event) => setForm({ ...form, chatRatePerMinute: event.target.value })} /></div></label>
              <label className="field field--full"><span>Photo URL (optional)</span><input value={form.photoUrl} onChange={(event) => setForm({ ...form, photoUrl: event.target.value })} placeholder="https://…" /></label>
              <label className="field field--full"><span>Video intro URL (optional)</span><input value={form.videoUrl} onChange={(event) => setForm({ ...form, videoUrl: event.target.value })} placeholder="https://… a short .mp4 clip" /></label>
              <div className="form-options field--full">
                <label><button type="button" className={`switch ${form.active ? "on" : ""}`} onClick={() => setForm({ ...form, active: !form.active })}><i /></button><span><strong>Publish to marketplace</strong><small>Visible on /astrologers once on</small></span></label>
                <label><button type="button" className={`switch ${form.featured ? "on" : ""}`} onClick={() => setForm({ ...form, featured: !form.featured })}><i /></button><span><strong>Feature on homepage</strong><small>Shown in the senior astrologers strip</small></span></label>
              </div>
              <div className="modal-actions field--full"><button type="button" className="button button--ghost" onClick={() => setOpen(false)}>Cancel</button><button className="button" disabled={saving}>{saving ? "Saving…" : editing ? "Save changes" : "Create practitioner"}</button></div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
