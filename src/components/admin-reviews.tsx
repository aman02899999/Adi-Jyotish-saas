"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Check, ChevronDown, ChevronLeft, ChevronRight, Eye, EyeOff, Search, Star, Trash2, X } from "lucide-react";

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
  /** "seed" marks a synthetic review; genuine ones are "member" or absent. See review-provenance.ts. */
  source?: string | null;
  createdAt: Date | string;
};

/** Kept in step with review-provenance.ts, which is server-only and cannot be imported here. */
const isSynthetic = (review: AdminReview) => review.source === "seed";

const PAGE_SIZE = 50;

export function AdminReviews({ initialReviews }: { initialReviews: AdminReview[] }) {
  const [items, setItems] = useState(initialReviews);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  // Genuine by default: synthetic rows can outnumber real ones by hundreds to one, and moderating
  // real client feedback is what this screen is for.
  const [sourceFilter, setSourceFilter] = useState<"genuine" | "synthetic" | "all">("genuine");
  const [page, setPage] = useState(0);
  const [saving, setSaving] = useState<string | null>(null);
  const [purging, setPurging] = useState(false);
  const [notice, setNotice] = useState("");

  const syntheticCount = useMemo(() => items.filter(isSynthetic).length, [items]);

  const filtered = useMemo(() => {
    const needle = query.toLowerCase();
    return items.filter((item) =>
      (sourceFilter === "all" || (sourceFilter === "synthetic") === isSynthetic(item))
      && (filter === "all" || item.status === filter)
      && `${item.practitionerName} ${item.reviewerName} ${item.body}`.toLowerCase().includes(needle));
  }, [items, query, filter, sourceFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  // Figures describe genuine reviews only — the same set the public site shows.
  const stats = useMemo(() => {
    const genuine = items.filter((item) => !isSynthetic(item));
    const published = genuine.filter((item) => item.status === "published");
    return {
      genuine: genuine.length,
      published: published.length,
      hidden: genuine.filter((item) => item.status === "hidden").length,
      average: published.length ? (published.reduce((sum, item) => sum + item.rating, 0) / published.length).toFixed(1) : "—",
    };
  }, [items]);

  function resetPaging<T>(setter: (value: T) => void) {
    return (value: T) => { setter(value); setPage(0); };
  }

  async function setStatus(review: AdminReview, status: string) {
    setSaving(review.id);
    try {
      const response = await fetch(`/api/admin/reviews/${review.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        setItems((current) => current.map((item) => item.id === review.id ? { ...item, status: data.status } : item));
        setNotice(status === "hidden" ? "Review hidden from the public profile." : "Review published.");
      } else setNotice(data.error || "Review could not be updated.");
    } catch {
      setNotice("Network error — the review was not updated.");
    } finally {
      setSaving(null);
    }
  }

  async function remove(review: AdminReview) {
    if (!window.confirm(`Permanently delete this review from ${review.reviewerName}?`)) return;
    setSaving(review.id);
    try {
      const response = await fetch(`/api/admin/reviews/${review.id}`, { method: "DELETE" });
      if (response.ok) {
        setItems((current) => current.filter((item) => item.id !== review.id));
        setNotice("Review deleted.");
      } else {
        const data = await response.json().catch(() => ({}));
        setNotice(data.error || "Review could not be deleted.");
      }
    } catch {
      setNotice("Network error — the review was not deleted.");
    } finally {
      setSaving(null);
    }
  }

  async function purgeSynthetic() {
    if (!window.confirm(`Permanently delete all ${syntheticCount} synthetic reviews? They are already hidden from the public site and do not affect pricing. Genuine reviews are not touched. This cannot be undone.`)) return;
    setPurging(true);
    try {
      const response = await fetch("/api/admin/reviews/synthetic", { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        setItems((current) => current.filter((item) => !isSynthetic(item)));
        setSourceFilter("genuine");
        setPage(0);
        setNotice(`Deleted ${data.deleted} synthetic review${data.deleted === 1 ? "" : "s"}.`);
      } else setNotice(data.error || "Synthetic reviews could not be deleted.");
    } catch {
      setNotice("Network error — synthetic reviews were not deleted.");
    } finally {
      setPurging(false);
    }
  }

  return (
    <>
      <section className="finance-stats">
        <article><span><Star size={20} /></span><div><small>Genuine reviews</small><strong>{stats.genuine}</strong><p>{stats.average} average (published)</p></div></article>
        <article><span><Eye size={20} /></span><div><small>Published</small><strong>{stats.published}</strong><p>Visible on profiles</p></div></article>
        <article><span><EyeOff size={20} /></span><div><small>Hidden</small><strong>{stats.hidden}</strong><p>Moderated out of view</p></div></article>
      </section>
      {syntheticCount > 0 && (
        <section className="admin-table-card admin-callout" role="alert">
          <div className="admin-table-header">
            <div>
              <h2><AlertTriangle size={17} /> {syntheticCount} synthetic review{syntheticCount === 1 ? "" : "s"} in the database</h2>
              <p>These were generated, not written by clients. They are no longer shown publicly and no longer affect ratings or prices, but they are still stored. Deleting them is permanent and leaves genuine reviews untouched.</p>
            </div>
            <button className="button button--danger" disabled={purging} onClick={purgeSynthetic}><Trash2 size={16} /> {purging ? "Deleting…" : "Delete all synthetic"}</button>
          </div>
        </section>
      )}
      <section className="admin-table-card">
        <div className="admin-table-header"><div><h2>Consultation reviews</h2><p>Moderate client feedback across every practitioner. Only genuine, published reviews appear on the site.</p></div></div>
        <div className="admin-toolbar">
          <label><Search size={16} /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} placeholder="Practitioner, reviewer, or review text…" /></label>
          <div className="filter-select"><select aria-label="Status" value={filter} onChange={(event) => resetPaging(setFilter)(event.target.value)}><option value="all">All statuses</option><option value="published">Published</option><option value="hidden">Hidden</option></select><ChevronDown size={14} /></div>
          <div className="filter-select"><select aria-label="Source" value={sourceFilter} onChange={(event) => resetPaging(setSourceFilter)(event.target.value as "genuine" | "synthetic" | "all")}><option value="genuine">Genuine</option><option value="synthetic">Synthetic</option><option value="all">All sources</option></select><ChevronDown size={14} /></div>
          <span>{filtered.length} reviews</span>
        </div>
        <div className="review-moderation-list">
          {visible.map((review) => (
            <article className="review-moderation-row" key={review.id}>
              <div className="review-moderation-main">
                <div>
                  <strong>{review.practitionerName}</strong>
                  <span className={`invoice-status invoice-status--${review.status === "published" ? "paid" : "void"}`}>{review.status}</span>
                  {isSynthetic(review) && <span className="invoice-status invoice-status--rejected" title="Generated, not written by a client. Not shown publicly.">synthetic</span>}
                </div>
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
          {!visible.length && <div className="empty-state"><Star size={24} /><h3>No reviews found</h3><p>Try a different search or filter.</p></div>}
        </div>
        {pageCount > 1 && (
          <nav className="admin-pager" aria-label="Review pages">
            <button disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} aria-label="Previous page"><ChevronLeft size={15} /></button>
            <span>Page {currentPage + 1} of {pageCount}</span>
            <button disabled={currentPage >= pageCount - 1} onClick={() => setPage(currentPage + 1)} aria-label="Next page"><ChevronRight size={15} /></button>
          </nav>
        )}
      </section>
      {notice && <div className="toast" role="status"><Check size={16} />{notice}<button onClick={() => setNotice("")} aria-label="Dismiss"><X size={14} /></button></div>}
    </>
  );
}
