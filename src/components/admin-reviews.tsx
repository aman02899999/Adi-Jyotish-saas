"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, Eye, EyeOff, Search, Star, Trash2, X } from "lucide-react";

export type AdminReview = {
  id: number;
  practitionerId: number;
  practitionerName: string;
  practitionerSlug: string;
  reviewerName: string;
  rating: number;
  clarity: number;
  empathy: number;
  usefulness: number;
  body: string;
  status: string;
  createdAt: Date | string;
};

export function AdminReviews({ initialReviews }: { initialReviews: AdminReview[] }) {
  const [items, setItems] = useState(initialReviews);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [saving, setSaving] = useState<number | null>(null);
  const [notice, setNotice] = useState("");

  const filtered = useMemo(() => items.filter((item) => `${item.practitionerName} ${item.reviewerName} ${item.body}`.toLowerCase().includes(query.toLowerCase()) && (filter === "all" || item.status === filter)), [items, query, filter]);
  const stats = useMemo(() => ({ published: items.filter((item) => item.status === "published").length, hidden: items.filter((item) => item.status === "hidden").length, average: items.length ? (items.reduce((sum, item) => sum + item.rating, 0) / items.length).toFixed(1) : "—" }), [items]);

  async function setStatus(review: AdminReview, status: string) {
    setSaving(review.id);
    const response = await fetch(`/api/admin/reviews/${review.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    const data = await response.json();
    if (response.ok) {
      setItems((current) => current.map((item) => item.id === review.id ? { ...item, status: data.status, updatedAt: data.updatedAt } : item));
      setNotice(status === "hidden" ? "Review hidden from the public profile." : "Review published.");
    } else setNotice(data.error || "Review could not be updated.");
    setSaving(null);
  }

  async function remove(review: AdminReview) {
    if (!window.confirm(`Permanently delete this review from ${review.reviewerName}?`)) return;
    setSaving(review.id);
    const response = await fetch(`/api/admin/reviews/${review.id}`, { method: "DELETE" });
    if (response.ok) {
      setItems((current) => current.filter((item) => item.id !== review.id));
      setNotice("Review deleted.");
    } else setNotice("Review could not be deleted.");
    setSaving(null);
  }

  return (
    <>
      <section className="finance-stats">
        <article><span><Star size={20} /></span><div><small>All reviews</small><strong>{items.length}</strong><p>{stats.average} average rating</p></div></article>
        <article><span><Eye size={20} /></span><div><small>Published</small><strong>{stats.published}</strong><p>Visible on profiles</p></div></article>
        <article><span><EyeOff size={20} /></span><div><small>Hidden</small><strong>{stats.hidden}</strong><p>Moderated out of view</p></div></article>
      </section>
      <section className="admin-table-card">
        <div className="admin-table-header"><div><h2>Consultation reviews</h2><p>Moderate verified-session feedback across every practitioner.</p></div></div>
        <div className="admin-toolbar">
          <label><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Practitioner, reviewer, or review text…" /></label>
          <div className="filter-select"><select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All statuses</option><option value="published">Published</option><option value="hidden">Hidden</option></select><ChevronDown size={14} /></div>
          <span>{filtered.length} reviews</span>
        </div>
        <div className="review-moderation-list">
          {filtered.map((review) => (
            <article className="review-moderation-row" key={review.id}>
              <div className="review-moderation-main">
                <div><strong>{review.practitionerName}</strong><span className={`invoice-status invoice-status--${review.status === "published" ? "paid" : "void"}`}>{review.status}</span></div>
                <p>“{review.body}”</p>
                <small>{review.reviewerName} · <Star size={11} fill="currentColor" /> {review.rating}.0 · {new Date(review.createdAt).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}</small>
              </div>
              <div className="row-actions">
                {review.status === "published"
                  ? <button disabled={saving === review.id} onClick={() => setStatus(review, "hidden")} aria-label="Hide review"><EyeOff size={16} /></button>
                  : <button disabled={saving === review.id} onClick={() => setStatus(review, "published")} aria-label="Publish review"><Eye size={16} /></button>}
                <button className="danger" disabled={saving === review.id} onClick={() => remove(review)} aria-label="Delete review"><Trash2 size={16} /></button>
              </div>
            </article>
          ))}
          {!filtered.length && <div className="empty-state"><Star size={24} /><h3>No reviews found</h3><p>Try a different search or filter.</p></div>}
        </div>
      </section>
      {notice && <div className="toast" role="status"><Check size={16} />{notice}<button onClick={() => setNotice("")} aria-label="Dismiss"><X size={14} /></button></div>}
    </>
  );
}
