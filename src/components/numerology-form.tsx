"use client";

import { useState } from "react";
import { CalendarDays, Check, Hash, LoaderCircle, UserRound, X } from "lucide-react";

type Result = { lifePathNumber: number; destinyNumber: number; narrative: string };

export function NumerologyForm() {
  const [name, setName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  async function submit() {
    setError("");
    if (!name.trim() || !birthDate) { setError("Please share your name and birth date."); return; }
    setLoading(true);
    try {
      const response = await fetch("/api/numerology", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, birthDate }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Your numerology reading could not be prepared.");
      setResult(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (result) {
    return (
      <div className="ask-answer">
        <div className="ask-answer__badge"><Hash size={15} /> Your numerology reading is ready</div>
        <div className="numerology-numbers">
          <div><strong>{result.lifePathNumber}</strong><span>Life Path</span></div>
          <div><strong>{result.destinyNumber}</strong><span>Destiny</span></div>
        </div>
        <h2>From Shree Santram Shashtri</h2>
        <div className="ask-answer__body">{result.narrative.split(/\n{2,}/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>
        <div className="ask-answer__actions">
          <button type="button" className="button button--ghost" onClick={() => setResult(null)}>Get another reading</button>
        </div>
      </div>
    );
  }

  return (
    <div className="ask-form-card">
      <header><div><p>Free · Life Path &amp; Destiny numbers</p><h2>Your numerology reading</h2></div></header>
      <div className="booking-fields">
        <label><span>Your name</span><div><UserRound size={16} /><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Full name" /></div></label>
        <label><span>Birth date</span><div><CalendarDays size={16} /><input type="date" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} /></div></label>
      </div>
      <button type="button" className="button ask-form-card__submit" disabled={loading} onClick={submit}>
        {loading ? <><LoaderCircle size={16} className="spin" /> Calculating…</> : <><Hash size={16} /> Get my numbers</>}
      </button>
      {error && <div className="toast"><Check size={15} />{error}<button onClick={() => setError("")}><X size={14} /></button></div>}
    </div>
  );
}
