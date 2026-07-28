"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  CircleDollarSign,
  Edit3,
  Eye,
  Filter,
  Plus,
  Search,
  Sparkles,
  Star,
  Trash2,
  X,
} from "lucide-react";

export type AdminService = {
  id: number;
  title: string;
  slug: string;
  category: string;
  description: string;
  price: number;
  duration: number;
  icon: string;
  active: boolean;
  featured: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
};

type FormState = {
  title: string;
  category: string;
  description: string;
  price: string;
  duration: string;
  icon: string;
  active: boolean;
  featured: boolean;
};

const emptyForm: FormState = {
  title: "",
  category: "Foundations",
  description: "",
  price: "49",
  duration: "45",
  icon: "sparkles",
  active: true,
  featured: false,
};

const categories = ["Foundations", "Guidance", "Timing", "Relationships", "Purpose", "Wellbeing"];
const icons = ["sparkles", "orbit", "sun", "calendar", "heart", "briefcase"];

export function AdminPanel({ initialServices }: { initialServices: AdminService[] }) {
  const [items, setItems] = useState(initialServices);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [editing, setEditing] = useState<AdminService | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  const filtered = useMemo(() => items.filter((item) => {
    const matchesQuery = `${item.title} ${item.category}`.toLowerCase().includes(query.toLowerCase());
    const matchesStatus = status === "all" || (status === "active" ? item.active : !item.active);
    return matchesQuery && matchesStatus;
  }), [items, query, status]);

  const stats = useMemo(() => ({
    active: items.filter((item) => item.active).length,
    revenue: items.reduce((sum, item) => sum + item.price * (item.featured ? 14 : 7), 0),
    average: items.length ? Math.round(items.reduce((sum, item) => sum + item.price, 0) / items.length) : 0,
  }), [items]);

  function startCreate() {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  }

  function startEdit(item: AdminService) {
    setEditing(item);
    setForm({
      title: item.title,
      category: item.category,
      description: item.description,
      price: String(item.price),
      duration: String(item.duration),
      icon: item.icon,
      active: item.active,
      featured: item.featured,
    });
    setOpen(true);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setNotice("");
    const payload = { ...form, price: Number(form.price), duration: Number(form.duration) };
    try {
      const response = await fetch(editing ? `/api/services/${editing.id}` : "/api/services", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save service.");
      setItems((current) => editing ? current.map((item) => item.id === editing.id ? data : item) : [data, ...current]);
      setOpen(false);
      setNotice(editing ? "Service updated successfully." : "New service published successfully.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(item: AdminService) {
    if (!window.confirm(`Delete “${item.title}”? This cannot be undone.`)) return;
    const response = await fetch(`/api/services/${item.id}`, { method: "DELETE" });
    if (response.ok) {
      setItems((current) => current.filter(({ id }) => id !== item.id));
      setNotice("Service deleted.");
    } else {
      setNotice("Could not delete this service.");
    }
  }

  async function toggle(item: AdminService, field: "active" | "featured") {
    const payload = { ...item, [field]: !item[field] };
    const response = await fetch(`/api/services/${item.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (response.ok) {
      const data = await response.json();
      setItems((current) => current.map((entry) => entry.id === item.id ? data : entry));
      setNotice(field === "active" ? `Service ${data.active ? "published" : "hidden"}.` : "Featured status updated.");
    }
  }

  return (
    <>
      <section className="admin-stats" aria-label="Service summary">
        <article><span><Sparkles size={20} /></span><div><small>All services</small><strong>{items.length}</strong><p><b>+2</b> this month</p></div></article>
        <article><span><Eye size={20} /></span><div><small>Published</small><strong>{stats.active}</strong><p>{items.length - stats.active} drafts hidden</p></div></article>
        <article><span><CircleDollarSign size={20} /></span><div><small>Est. revenue</small><strong>${stats.revenue.toLocaleString()}</strong><p><b>+12.4%</b> vs last month</p></div></article>
        <article><span><Star size={20} /></span><div><small>Average price</small><strong>${stats.average}</strong><p>Across the catalogue</p></div></article>
      </section>

      <section className="admin-table-card">
        <div className="admin-table-header">
          <div><h2>Service catalogue</h2><p>Manage what members can discover and book.</p></div>
          <button className="button button--small" onClick={startCreate}><Plus size={16} /> Add service</button>
        </div>
        <div className="admin-toolbar">
          <label><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search services…" /></label>
          <div className="filter-select"><Filter size={15} /><select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter by status"><option value="all">All statuses</option><option value="active">Published</option><option value="draft">Draft</option></select><ChevronDown size={14} /></div>
          <span>{filtered.length} results</span>
        </div>

        <div className="service-table" role="table" aria-label="Astrology services">
          <div className="service-table__head" role="row"><span>Service</span><span>Category</span><span>Price</span><span>Status</span><span>Featured</span><span>Actions</span></div>
          {filtered.map((item) => (
            <div className="service-table__row" role="row" key={item.id}>
              <div className="table-service"><span className="table-service__icon"><Sparkles size={17} /></span><div><strong>{item.title}</strong><small>{item.duration} min · Updated {new Date(item.updatedAt).toLocaleDateString("en", { month: "short", day: "numeric" })}</small></div></div>
              <span className="category-tag">{item.category}</span>
              <strong>${item.price}</strong>
              <button className={`status-toggle ${item.active ? "is-active" : ""}`} onClick={() => toggle(item, "active")}><i>{item.active ? <Check size={10} /> : null}</i>{item.active ? "Published" : "Draft"}</button>
              <button className={`star-toggle ${item.featured ? "is-featured" : ""}`} onClick={() => toggle(item, "featured")} aria-label={`${item.featured ? "Remove" : "Add"} featured status`}><Star size={17} fill={item.featured ? "currentColor" : "none"} /></button>
              <div className="row-actions"><button onClick={() => startEdit(item)} aria-label={`Edit ${item.title}`}><Edit3 size={16} /></button><button className="danger" onClick={() => remove(item)} aria-label={`Delete ${item.title}`}><Trash2 size={16} /></button></div>
            </div>
          ))}
          {filtered.length === 0 && <div className="empty-state"><Search size={24} /><h3>No services found</h3><p>Try a different search or status filter.</p></div>}
        </div>
      </section>

      {notice && <div className="toast" role="status"><Check size={16} />{notice}<button onClick={() => setNotice("")} aria-label="Dismiss"><X size={14} /></button></div>}

      {open && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
          <section className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="service-form-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-header"><div><p>{editing ? "Update catalogue" : "Create a new offering"}</p><h2 id="service-form-title">{editing ? "Edit service" : "Add service"}</h2></div><button onClick={() => setOpen(false)} aria-label="Close"><X size={20} /></button></div>
            <form onSubmit={save}>
              <label className="field field--full"><span>Service title</span><input required maxLength={120} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="e.g. Solar Return Reading" /></label>
              <label className="field"><span>Category</span><select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
              <label className="field"><span>Visual icon</span><select value={form.icon} onChange={(event) => setForm({ ...form, icon: event.target.value })}>{icons.map((icon) => <option key={icon} value={icon}>{icon.charAt(0).toUpperCase() + icon.slice(1)}</option>)}</select></label>
              <label className="field"><span>Price (USD)</span><div className="input-prefix"><b>$</b><input required min="0" type="number" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} /></div></label>
              <label className="field"><span>Duration</span><div className="input-suffix"><input required min="5" step="5" type="number" value={form.duration} onChange={(event) => setForm({ ...form, duration: event.target.value })} /><b>min</b></div></label>
              <label className="field field--full"><span>Description</span><textarea required rows={4} maxLength={500} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Describe the clarity this reading offers…" /><small>{form.description.length}/500</small></label>
              <div className="form-options field--full">
                <label><button type="button" className={`switch ${form.active ? "on" : ""}`} onClick={() => setForm({ ...form, active: !form.active })}><i /></button><span><strong>Publish immediately</strong><small>Visible in the member experience</small></span></label>
                <label><button type="button" className={`switch ${form.featured ? "on" : ""}`} onClick={() => setForm({ ...form, featured: !form.featured })}><i /></button><span><strong>Feature this service</strong><small>Prioritize across catalogue</small></span></label>
              </div>
              <div className="modal-actions field--full"><button type="button" className="button button--ghost" onClick={() => setOpen(false)}>Cancel</button><button className="button" disabled={saving}>{saving ? "Saving…" : editing ? "Save changes" : "Create service"}</button></div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
