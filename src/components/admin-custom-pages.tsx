"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { Check, ExternalLink, FileText, Plus, Trash2, X } from "lucide-react";
import type { CustomPage } from "@/lib/custom-pages";

export function AdminCustomPages({ initialPages }: { initialPages: CustomPage[] }) {
  const [items, setItems] = useState(initialPages);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  async function create(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setNotice("");
    try {
      const response = await fetch("/api/admin/custom-pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, metaDescription: "" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not create page.");
      setItems((current) => [data, ...current]);
      setOpen(false);
      setTitle("");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(page: CustomPage) {
    if (!confirm(`Delete "${page.title}"? This can't be undone.`)) return;
    const response = await fetch(`/api/admin/custom-pages/${page.id}`, { method: "DELETE" });
    const data = await response.json().catch(() => ({}));
    if (response.ok) {
      setItems((current) => current.filter((item) => item.id !== page.id));
      setNotice("Page deleted.");
    } else {
      setNotice(data.error || "Could not delete page.");
    }
  }

  return (
    <section className="admin-table-card" style={{ marginTop: 24 }}>
      <div className="admin-table-header">
        <div><h2>Custom pages</h2><p>Build new pages from scratch with drag-and-drop blocks — live at /p/[url].</p></div>
        <button className="button button--small" onClick={() => setOpen(true)}><Plus size={16} /> New page</button>
      </div>
      <div className="service-table" role="table" aria-label="Custom pages">
        <div className="service-table__head" role="row"><span>Page</span><span>URL</span><span>Blocks</span><span>Status</span><span>Actions</span></div>
        {items.map((page) => (
          <div className="service-table__row" role="row" key={page.id}>
            <div className="table-service"><span className="table-service__icon"><FileText size={17} /></span><div><strong>{page.title}</strong></div></div>
            <span>/p/{page.slug}</span>
            <span>{page.blocks.length}</span>
            <span className={`status-toggle ${page.published ? "is-active" : ""}`}><i>{page.published ? <Check size={10} /> : null}</i>{page.published ? "Published" : "Draft"}</span>
            <div className="row-actions">
              {page.published && <a href={`/p/${page.slug}`} target="_blank" rel="noreferrer" aria-label={`View ${page.title}`}><ExternalLink size={16} /></a>}
              <Link href={`/admin/website/${page.id}`} className="button button--ghost button--small">Edit</Link>
              <button onClick={() => remove(page)} aria-label={`Delete ${page.title}`}><Trash2 size={16} /></button>
            </div>
          </div>
        ))}
        {items.length === 0 && <div className="empty-state"><FileText size={24} /><h3>No custom pages yet</h3><p>Create your first page.</p></div>}
      </div>

      {notice && <div className="toast" role="status"><Check size={16} />{notice}<button onClick={() => setNotice("")} aria-label="Dismiss"><X size={14} /></button></div>}

      {open && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
          <section className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="page-form-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-header"><div><p>New page</p><h2 id="page-form-title">Create a custom page</h2></div><button onClick={() => setOpen(false)} aria-label="Close"><X size={20} /></button></div>
            <form onSubmit={create}>
              <label className="field field--full"><span>Page title</span><input required maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. About Us" autoFocus /></label>
              <div className="modal-actions field--full"><button type="button" className="button button--ghost" onClick={() => setOpen(false)}>Cancel</button><button className="button" disabled={saving}>{saving ? "Creating…" : "Create page"}</button></div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}
