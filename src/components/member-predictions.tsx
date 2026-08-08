"use client";

import { useMemo, useState } from "react";
import { Check, CircleHelp, LoaderCircle, Plus, ThumbsDown, ThumbsUp, X } from "lucide-react";

type PredictionStatus = "pending" | "came_true" | "did_not_happen" | "unclear";
type Prediction = {
  id: string;
  practitionerName: string;
  serviceTitle: string;
  text: string;
  expectedByDate: string;
  status: PredictionStatus;
  createdAt: string | Date;
};
type EligibleBooking = { id: string; serviceTitle: string; practitionerName: string; scheduledAt: string };

const STATUS_LABEL: Record<PredictionStatus, string> = { pending: "Awaiting outcome", came_true: "Came true", did_not_happen: "Didn't happen", unclear: "Unclear" };

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(base: string, days: number) {
  const date = new Date(`${base}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function MemberPredictions({ initialPredictions, eligibleBookings }: { initialPredictions: Prediction[]; eligibleBookings: EligibleBooking[] }) {
  const [predictions, setPredictions] = useState(initialPredictions);
  const [showForm, setShowForm] = useState(false);
  const [bookingId, setBookingId] = useState(eligibleBookings[0]?.id ?? "");
  const [text, setText] = useState("");
  const [expectedByDate, setExpectedByDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const today = useMemo(() => todayIso(), []);
  const due = predictions.filter((p) => p.status === "pending" && p.expectedByDate <= today);
  const dueIds = new Set(due.map((p) => p.id));
  const rest = predictions.filter((p) => !dueIds.has(p.id));

  async function submit() {
    setError("");
    if (!bookingId || !text.trim() || !expectedByDate) {
      setError("Please choose the consultation, describe the prediction, and set an expected-by date.");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/member/predictions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId, text, expectedByDate }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save this prediction.");
      setPredictions((current) => [data, ...current]);
      setText(""); setExpectedByDate("");
      setShowForm(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function resolve(id: string, status: Exclude<PredictionStatus, "pending">) {
    setResolvingId(id);
    setError("");
    try {
      const response = await fetch(`/api/member/predictions/${id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not update this prediction.");
      setPredictions((current) => current.map((p) => (p.id === id ? data : p)));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong. Please try again.");
    } finally {
      setResolvingId(null);
    }
  }

  return (
    <>
      <div className="consultation-heading billing-heading">
        <div><p>Accountability</p><h1>Predictions</h1><span>Log what a practitioner told you, and mark whether it came true — real transparency, not a guess.</span></div>
        {!showForm && eligibleBookings.length > 0 && <button type="button" className="button button--small" onClick={() => setShowForm(true)}><Plus size={14} /> Log a prediction</button>}
      </div>

      {error && <div className="toast"><Check size={15} />{error}<button onClick={() => setError("")}><X size={14} /></button></div>}

      {showForm && (
        <div className="ask-form-card family-form">
          <header><div><p>From a completed consultation</p><h2>Log a prediction</h2></div></header>
          <div className="booking-fields">
            <label className="wide"><span>Which consultation was this from?</span><div><select value={bookingId} onChange={(event) => setBookingId(event.target.value)}>{eligibleBookings.map((booking) => <option key={booking.id} value={booking.id}>{booking.serviceTitle} with {booking.practitionerName} · {new Date(booking.scheduledAt).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Kolkata" })}</option>)}</select></div></label>
            <label className="wide"><span>What did they predict?</span><textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="e.g. A career change or promotion is likely within the next 6 months" maxLength={600} /></label>
            <label><span>Expected by</span><div><input type="date" min={addDaysIso(todayIso(), 1)} value={expectedByDate} onChange={(event) => setExpectedByDate(event.target.value)} /></div></label>
          </div>
          <div className="ask-answer__actions">
            <button type="button" className="button" disabled={loading} onClick={submit}>{loading ? <><LoaderCircle size={16} className="spin" /> Saving…</> : <>Save prediction</>}</button>
            <button type="button" className="button button--ghost" onClick={() => { setShowForm(false); setError(""); }}>Cancel</button>
          </div>
        </div>
      )}

      {due.length > 0 && (
        <div className="prediction-due">
          <p className="prediction-due__heading">Did these come true?</p>
          {due.map((prediction) => (
            <div key={prediction.id} className="prediction-card prediction-card--due">
              <p className="prediction-card__text">&ldquo;{prediction.text}&rdquo;</p>
              <p className="prediction-card__meta">{prediction.practitionerName} · {prediction.serviceTitle} · expected by {new Date(`${prediction.expectedByDate}T00:00:00Z`).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}</p>
              <div className="prediction-card__resolve">
                <button type="button" disabled={resolvingId === prediction.id} onClick={() => resolve(prediction.id, "came_true")}><ThumbsUp size={14} /> Came true</button>
                <button type="button" disabled={resolvingId === prediction.id} onClick={() => resolve(prediction.id, "did_not_happen")}><ThumbsDown size={14} /> Didn&rsquo;t happen</button>
                <button type="button" disabled={resolvingId === prediction.id} onClick={() => resolve(prediction.id, "unclear")}><CircleHelp size={14} /> Unclear</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {rest.length > 0 ? (
        <div className="prediction-list">
          {rest.map((prediction) => (
            <div key={prediction.id} className={`prediction-card prediction-card--${prediction.status}`}>
              <div className="prediction-card__head"><span>{STATUS_LABEL[prediction.status]}</span><small>{new Date(prediction.createdAt).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}</small></div>
              <p className="prediction-card__text">&ldquo;{prediction.text}&rdquo;</p>
              <p className="prediction-card__meta">{prediction.practitionerName} · {prediction.serviceTitle} · expected by {new Date(`${prediction.expectedByDate}T00:00:00Z`).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}</p>
            </div>
          ))}
        </div>
      ) : predictions.length === 0 && !showForm ? (
        <div className="consultation-empty"><CircleHelp size={26} /><h3>No predictions logged yet</h3><p>{eligibleBookings.length > 0 ? "After a consultation, log what your practitioner predicted so you can check back later." : "Complete a consultation with a practitioner to start logging predictions."}</p></div>
      ) : null}
    </>
  );
}
