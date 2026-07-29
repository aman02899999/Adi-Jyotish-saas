"use client";

import { FormEvent, useState } from "react";
import { Check, Edit3, Gem, Plus, Trash2, X } from "lucide-react";
import type { GemstoneCategory } from "@/db/schema";

type CategoryRow = GemstoneCategory & { productCount: number };

type FormState = { name: string; slug: string; description: string; imageUrl: string; sortOrder: string; active: boolean };
const emptyForm: FormState = { name: "", slug: "", description: "", imageUrl: "", sortOrder: "0", active: true };

export function AdminGemstoneCategories({ initialCategories }: { initialCategories: CategoryRow[] }) {
  const [items, setItems] = useState(initialCategories);
  const [editing, setEditing] = useState<CategoryRow | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  function startCreate() { setEditing(null); setForm(emptyForm); setOpen(true); }
  function startEdit(category: CategoryRow) {
    setEditing(category);
    setForm({ name: category.name, slug: category.slug, description: category.description, imageUrl: category.imageUrl ?? "", sortOrder: String(category.sortOrder), active: category.active });
    setOpen(true);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setNotice("");
    const payload = { ...form, sortOrder: Number(form.sortOrder) || 0, imageUrl: form.imageUrl.trim() || null };
    try {
      const response = await fetch(editing ? `/api/admin/gemstones/categories/${editing.id}` : "/api/admin/gemstones/categories", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save category.");
      setItems((current) => editing ? current.map((item) => item.id === editing.id ? { ...item, ...data } : item) : [...current, { ...data, productCount: 0 }]);
      setOpen(false);
      setNotice(editing ? "Category updated." : "Category created.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(category: CategoryRow) {
    const response = await fetch(`/api/admin/gemstones/categories/${category.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !category.active }) });
    if (response.ok) {
      const data = await response.json();
      setItems((current) => current.map((item) => item.id === category.id ? { ...item, ...data } : item));
    }
  }

  async function remove(category: CategoryRow) {
    if (!window.confirm(`Delete "${category.name}"? This only works if it has no products.`)) return;
    const response = await fetch(`/api/admin/gemstones/categories/${category.id}`, { method: "DELETE" });
    const data = await response.json();
    if (response.ok) { setItems((current) => current.filter((item) => item.id !== category.id)); setNotice("Category deleted."); }
    else setNotice(data.error || "Could not delete category.");
  }

  return (
    <>
      <section className="admin-table-card">
        <div className="admin-table-header">
          <div><h2>Gemstone categories</h2><p>Organize the storefront into browsable categories.</p></div>
          <button className="button button--small" onClick={startCreate}><Plus size={16} /> Add category</button>
        </div>
        <div className="service-table" role="table" aria-label="Gemstone categories">
          <div className="service-table__head" role="row"><span>Category</span><span>Products</span><span>Sort</span><span>Status</span><span>Actions</span></div>
          {items.map((category) => (
            <div className="service-table__row" role="row" key={category.id}>
              <div className="table-service"><span className="table-service__icon"><Gem size={17} /></span><div><strong>{category.name}</strong><small>{category.slug}</small></div></div>
              <span>{category.productCount}</span>
              <span>{category.sortOrder}</span>
              <button className={`status-toggle ${category.active ? "is-active" : ""}`} onClick={() => toggleActive(category)}><i>{category.active ? <Check size={10} /> : null}</i>{category.active ? "Visible" : "Hidden"}</button>
              <div className="row-actions"><button onClick={() => startEdit(category)} aria-label={`Edit ${category.name}`}><Edit3 size={16} /></button><button className="danger" onClick={() => remove(category)} aria-label={`Delete ${category.name}`}><Trash2 size={16} /></button></div>
            </div>
          ))}
          {!items.length && <div className="empty-state"><Gem size={24} /><h3>No categories yet</h3><p>Create your first gemstone category.</p></div>}
        </div>
      </section>

      {notice && <div className="toast" role="status"><Check size={16} />{notice}<button onClick={() => setNotice("")} aria-label="Dismiss"><X size={14} /></button></div>}

      {open && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
          <section className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="category-form-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-header"><div><p>{editing ? "Update category" : "Create a new category"}</p><h2 id="category-form-title">{editing ? "Edit category" : "Add category"}</h2></div><button onClick={() => setOpen(false)} aria-label="Close"><X size={20} /></button></div>
            <form onSubmit={save}>
              <label className="field field--full"><span>Category name</span><input required maxLength={80} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. Ruby" /></label>
              <label className="field"><span>Slug (optional)</span><input maxLength={100} value={form.slug} onChange={(event) => setForm({ ...form, slug: event.target.value })} placeholder="auto-generated from name" /></label>
              <label className="field"><span>Sort order</span><input min="0" type="number" value={form.sortOrder} onChange={(event) => setForm({ ...form, sortOrder: event.target.value })} /></label>
              <label className="field field--full"><span>Image URL (optional)</span><input type="url" value={form.imageUrl} onChange={(event) => setForm({ ...form, imageUrl: event.target.value })} placeholder="https://…" /></label>
              <label className="field field--full"><span>Description</span><textarea rows={3} maxLength={400} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
              <div className="form-options field--full">
                <label><button type="button" className={`switch ${form.active ? "on" : ""}`} onClick={() => setForm({ ...form, active: !form.active })}><i /></button><span><strong>Visible on storefront</strong><small>Shown in category browsing</small></span></label>
              </div>
              <div className="modal-actions field--full"><button type="button" className="button button--ghost" onClick={() => setOpen(false)}>Cancel</button><button className="button" disabled={saving}>{saving ? "Saving…" : editing ? "Save changes" : "Create category"}</button></div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
