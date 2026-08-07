"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, Eye, EyeOff, Search, Sparkles, Star, Trash2, X } from "lucide-react";

export type AdminReview = {
  id: string;
  practitionerId: string;
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

export type SeedablePractitioner = { id: string; name: string; featured: boolean };

export function AdminReviews({ initialReviews, practitioners = [] }: { initialReviews: AdminReview[]; practitioners?: SeedablePractitioner[] }) {
  const [items, setItems] = useState(initialReviews);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [saving, setSaving] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [seeding, setSeeding] = useState(false);
  const [seedLog, setSeedLog] = useState<string[]>([]);

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

  async function seedAllProfiles() {
    if (!practitioners.length) return;
    if (!window.confirm(`Generate realistic reviews for all ${practitioners.length} practitioner profiles? Senior (featured) profiles get 400-1000 reviews each, others get 30-40. This can take a few minutes and adds real Firestore documents.`)) return;
    setSeeding(true);
    setSeedLog([]);
    let totalAdded = 0;
    for (const person of practitioners) {
      setSeedLog((log) => [...log, `Seeding ${person.name}…`]);
      try {
        const response = await fetch("/api/admin/reviews/seed", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ practitionerId: person.id, practitionerName: person.name, isSenior: person.featured }),
        });
        const data = await response.json();
        if (response.ok) {
          totalAdded += data.added;
          setSeedLog((log) => [...log.slice(0, -1), `${person.name}: ${data.added ? `+${data.added} reviews (now ${data.existingSeedCount})` : `already at target (${data.existingSeedCount})`}`]);
        } else {
          setSeedLog((log) => [...log.slice(0, -1), `${person.name}: failed — ${data.error || "unknown error"}`]);
        }
      } catch {
        setSeedLog((log) => [...log.slice(0, -1), `${person.name}: network error, skipped.`]);
      }
    }
    setSeeding(false);
    setNotice(`Seeding complete — ${totalAdded} new reviews added.`);
    window.location.reload();
  }

  return (
    <>
      <section className="finance-stats">
        <article><span><Star size={20} /></span><div><small>All reviews</small><strong>{items.length}</strong><p>{stats.average} average rating</p></div></article>
        <article><span><Eye size={20} /></span><div><small>Published</small><strong>{stats.published}</strong><p>Visible on profiles</p></div></article>
        <article><span><EyeOff size={20} /></span><div><small>Hidden</small><strong>{stats.hidden}</strong><p>Moderated out of view</p></div></article>
      </section>
      {practitioners.length > 0 && (
        <section className="admin-table-card">
          <div className="admin-table-header">
            <div><h2>Seed realistic reviews</h2><p>Generate varied English/Hinglish reviews across states (and a small international slice) for every profile. Safe to re-run — tops up to each profile&apos;s target instead of duplicating.</p></div>
            <button className="button" disabled={seeding} onClick={seedAllProfiles}><Sparkles size={16} /> {seeding ? "Seeding…" : "Seed all profiles"}</button>
          </div>
          {seedLog.length > 0 && <div className="seed-log">{seedLog.map((line, index) => <p key={index}>{line}</p>)}</div>}
        </section>
      )}
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
