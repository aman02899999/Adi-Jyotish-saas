"use client";

import { useState } from "react";
import { Check, EyeOff, Star, Trash2, X } from "lucide-react";

export type AdminReviewRow = {
  id: number;
  productName: string;
  reviewerName: string;
  rating: number;
  title: string;
  body: string;
  status: string;
  orderId: number | null;
  createdAt: string | Date;
};

export function AdminGemstoneReviews({ initialReviews }: { initialReviews: AdminReviewRow[] }) {
  const [items, setItems] = useState(initialReviews);
  const [filter, setFilter] = useState("pending");
  const [notice, setNotice] = useState("");

  const visible = items.filter((review) => filter === "all" || review.status === filter);

  async function setStatus(review: AdminReviewRow, status: "published" | "hidden") {
    const response = await fetch(`/api/admin/gemstones/reviews/${review.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    if (response.ok) { const data = await response.json(); setItems((current) => current.map((item) => item.id === review.id ? { ...item, status: data.status } : item)); setNotice(`Review ${status}.`); }
  }

  async function remove(review: AdminReviewRow) {
    if (!window.confirm("Delete this review permanently?")) return;
    const response = await fetch(`/api/admin/gemstones/reviews/${review.id}`, { method: "DELETE" });
    if (response.ok) { setItems((current) => current.filter((item) => item.id !== review.id)); setNotice("Review deleted."); }
  }

  return (
    <>
      <section className="admin-table-card">
        <div className="admin-table-header"><div><h2>Reviews</h2><p>Moderate customer reviews before they go live.</p></div></div>
        <div className="admin-toolbar">
          <div className="filter-select"><select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="pending">Pending</option><option value="published">Published</option><option value="hidden">Hidden</option><option value="all">All</option></select></div>
          <span>{visible.length} reviews</span>
        </div>
        <div className="gem-review-list">
          {visible.map((review) => (
            <article className="gem-review-item" key={review.id}>
              <div className="gem-review-item__head">
                <div><strong>{review.productName}</strong><small>{review.reviewerName} {review.orderId ? "· Verified purchase" : ""} · {new Date(review.createdAt).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}</small></div>
                <span className="gem-review-item__rating"><Star size={13} fill="currentColor" /> {review.rating}/5</span>
              </div>
              {review.title && <h4>{review.title}</h4>}
              <p>{review.body}</p>
              <div className="gem-review-item__actions">
                {review.status !== "published" && <button onClick={() => setStatus(review, "published")}><Check size={14} /> Publish</button>}
                {review.status !== "hidden" && <button onClick={() => setStatus(review, "hidden")}><EyeOff size={14} /> Hide</button>}
                <button className="danger" onClick={() => remove(review)}><Trash2 size={14} /> Delete</button>
              </div>
            </article>
          ))}
          {!visible.length && <div className="empty-state"><Star size={24} /><h3>No reviews here</h3><p>Nothing to moderate in this filter.</p></div>}
        </div>
      </section>
      {notice && <div className="toast" role="status"><Check size={16} />{notice}<button onClick={() => setNotice("")} aria-label="Dismiss"><X size={14} /></button></div>}
    </>
  );
}
