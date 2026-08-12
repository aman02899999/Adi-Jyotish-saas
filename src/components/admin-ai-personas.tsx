"use client";

import { FormEvent, useState } from "react";
import { Bot, Check, Edit3, ExternalLink, Plus, Trash2, X } from "lucide-react";
import type { AiPersona } from "@/lib/ai-personas";

type FormState = {
  name: string; title: string; avatarUrl: string; description: string; systemPrompt: string;
  sampleQuestions: string; price: string; active: boolean;
};

const emptyForm: FormState = {
  name: "", title: "", avatarUrl: "", description: "", systemPrompt: "",
  sampleQuestions: "", price: "149", active: false,
};

export function AdminAiPersonas({ initialPersonas }: { initialPersonas: AiPersona[] }) {
  const [items, setItems] = useState(initialPersonas);
  const [editing, setEditing] = useState<AiPersona | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  function startCreate() {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  }

  function startEdit(persona: AiPersona) {
    setEditing(persona);
    setForm({
      name: persona.name, title: persona.title, avatarUrl: persona.avatarUrl ?? "",
      description: persona.description, systemPrompt: persona.systemPrompt,
      sampleQuestions: persona.sampleQuestions.join("\n"), price: String(persona.price), active: persona.active,
    });
    setOpen(true);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setNotice("");
    const payload = {
      ...form,
      avatarUrl: form.avatarUrl.trim() || null,
      sampleQuestions: form.sampleQuestions.split("\n").map((line) => line.trim()).filter(Boolean),
      price: Number(form.price),
      currency: "INR",
    };
    try {
      const response = await fetch(editing ? `/api/admin/ai-personas/${editing.id}` : "/api/admin/ai-personas", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save persona.");
      setItems((current) => editing ? current.map((item) => item.id === editing.id ? data : item) : [data, ...current]);
      setOpen(false);
      setNotice(editing ? "Persona updated." : "Persona created.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(persona: AiPersona) {
    const response = await fetch(`/api/admin/ai-personas/${persona.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !persona.active }),
    });
    const data = await response.json();
    if (response.ok) setItems((current) => current.map((item) => item.id === persona.id ? data : item));
    else setNotice(data.error || "Could not update persona.");
  }

  async function remove(persona: AiPersona) {
    if (!confirm(`Delete ${persona.name}? This only works if they have no readings on record.`)) return;
    const response = await fetch(`/api/admin/ai-personas/${persona.id}`, { method: "DELETE" });
    const data = await response.json().catch(() => ({}));
    if (response.ok) {
      setItems((current) => current.filter((item) => item.id !== persona.id));
      setNotice("Persona deleted.");
    } else {
      setNotice(data.error || "Could not delete persona — deactivate instead.");
    }
  }

  return (
    <>
      <section className="admin-table-card">
        <div className="admin-table-header">
          <div><h2>AI personas</h2><p>Create new Live AI readings — each gets its own page at /ai/[slug].</p></div>
          <button className="button button--small" onClick={startCreate}><Plus size={16} /> Add persona</button>
        </div>
        <div className="service-table" role="table" aria-label="AI personas">
          <div className="service-table__head" role="row"><span>Persona</span><span>Price</span><span>Status</span><span /><span>Actions</span></div>
          {items.map((persona) => (
            <div className="service-table__row" role="row" key={persona.id}>
              <div className="table-service">
                <span className="table-service__icon">{persona.avatarUrl ? <img src={persona.avatarUrl} alt="" style={{ width: 34, height: 34, borderRadius: "50%", objectFit: "cover" }} /> : <Bot size={17} />}</span>
                <div><strong>{persona.name}</strong><small>{persona.title}</small></div>
              </div>
              <strong>{persona.price > 0 ? `₹${persona.price}` : "Free"}</strong>
              <button className={`status-toggle ${persona.active ? "is-active" : ""}`} onClick={() => toggleActive(persona)}><i>{persona.active ? <Check size={10} /> : null}</i>{persona.active ? "Live" : "Draft"}</button>
              <span />
              <div className="row-actions">
                {persona.active && <a href={`/ai/${persona.slug}`} target="_blank" rel="noreferrer" aria-label={`View ${persona.name}`}><ExternalLink size={16} /></a>}
                <button onClick={() => startEdit(persona)} aria-label={`Edit ${persona.name}`}><Edit3 size={16} /></button>
                <button onClick={() => remove(persona)} aria-label={`Delete ${persona.name}`}><Trash2 size={16} /></button>
              </div>
            </div>
          ))}
          {items.length === 0 && <div className="empty-state"><Bot size={24} /><h3>No personas yet</h3><p>Create your first AI reading persona.</p></div>}
        </div>
      </section>

      {notice && <div className="toast" role="status"><Check size={16} />{notice}<button onClick={() => setNotice("")} aria-label="Dismiss"><X size={14} /></button></div>}

      {open && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
          <section className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="persona-form-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-header"><div><p>{editing ? "Update persona" : "Create a new AI persona"}</p><h2 id="persona-form-title">{editing ? "Edit persona" : "Add persona"}</h2></div><button onClick={() => setOpen(false)} aria-label="Close"><X size={20} /></button></div>
            <form onSubmit={save}>
              <label className="field"><span>Name</span><input required maxLength={120} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. Guru Anand Mystic" /></label>
              <label className="field"><span>Title / specialty</span><input required maxLength={160} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="e.g. Dream Interpretation Expert" /></label>
              <label className="field field--full"><span>Description (shown on their page)</span><textarea required rows={2} maxLength={500} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="One or two sentences describing what this persona does" /></label>
              <label className="field field--full">
                <span>AI instructions (system prompt)</span>
                <textarea required rows={8} maxLength={6000} value={form.systemPrompt} onChange={(event) => setForm({ ...form, systemPrompt: event.target.value })} placeholder="You are [name], a warm and knowledgeable [specialty]. Describe their voice, how to structure an answer, what to never claim (no medical/legal/financial guarantees), and how to sign off." />
                <small>This defines the persona&rsquo;s voice and how it answers — be specific and detailed.</small>
              </label>
              <label className="field field--full"><span>Sample questions (one per line, optional)</span><textarea rows={3} maxLength={600} value={form.sampleQuestions} onChange={(event) => setForm({ ...form, sampleQuestions: event.target.value })} placeholder={"What does it mean when I dream of water?\nWhy do I keep having the same dream?"} /></label>
              <label className="field field--full"><span>Photo/avatar URL (optional)</span><input value={form.avatarUrl} onChange={(event) => setForm({ ...form, avatarUrl: event.target.value })} placeholder="https://…" /></label>
              <label className="field"><span>Price per reading</span><div className="input-prefix"><b>₹</b><input min="0" type="number" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} /></div><small>0 = always free</small></label>
              <div className="form-options field--full">
                <label><button type="button" className={`switch ${form.active ? "on" : ""}`} onClick={() => setForm({ ...form, active: !form.active })}><i /></button><span><strong>Publish immediately</strong><small>Live at /ai/[slug] once on</small></span></label>
              </div>
              <div className="modal-actions field--full"><button type="button" className="button button--ghost" onClick={() => setOpen(false)}>Cancel</button><button className="button" disabled={saving}>{saving ? "Saving…" : editing ? "Save changes" : "Create persona"}</button></div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
