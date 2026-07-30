"use client";

import { useState } from "react";
import { CalendarDays, Check, HeartHandshake, LoaderCircle, UserRound, X } from "lucide-react";

type Result = { score: number; narrative: string };

export function KundliMatchingForm() {
  const [nameA, setNameA] = useState("");
  const [birthDateA, setBirthDateA] = useState("");
  const [nameB, setNameB] = useState("");
  const [birthDateB, setBirthDateB] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  async function submit() {
    setError("");
    if (!nameA.trim() || !birthDateA || !nameB.trim() || !birthDateB) { setError("Please share both names and birth dates."); return; }
    setLoading(true);
    try {
      const response = await fetch("/api/kundli-matching", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nameA, birthDateA, nameB, birthDateB }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Your compatibility reading could not be prepared.");
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
        <div className="ask-answer__badge"><HeartHandshake size={15} /> Compatibility reading ready</div>
        <div className="match-score"><strong>{result.score}</strong><span>/ 100 compatibility</span></div>
        <h2>From Shree Santram Shashtri</h2>
        <div className="ask-answer__body">{result.narrative.split(/\n{2,}/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>
        <div className="ask-answer__actions">
          <button type="button" className="button button--ghost" onClick={() => { setResult(null); }}>Match another pair</button>
        </div>
      </div>
    );
  }

  return (
    <div className="ask-form-card">
      <header><div><p>Free · classical guna milan</p><h2>Kundli matching</h2></div></header>
      <div className="booking-fields">
        <label><span>First person&rsquo;s name</span><div><UserRound size={16} /><input value={nameA} onChange={(event) => setNameA(event.target.value)} placeholder="Full name" /></div></label>
        <label><span>Their birth date</span><div><CalendarDays size={16} /><input type="date" value={birthDateA} onChange={(event) => setBirthDateA(event.target.value)} /></div></label>
        <label><span>Second person&rsquo;s name</span><div><UserRound size={16} /><input value={nameB} onChange={(event) => setNameB(event.target.value)} placeholder="Full name" /></div></label>
        <label><span>Their birth date</span><div><CalendarDays size={16} /><input type="date" value={birthDateB} onChange={(event) => setBirthDateB(event.target.value)} /></div></label>
      </div>
      <button type="button" className="button ask-form-card__submit" disabled={loading} onClick={submit}>
        {loading ? <><LoaderCircle size={16} className="spin" /> Comparing charts…</> : <><HeartHandshake size={16} /> Check compatibility</>}
      </button>
      {error && <div className="toast"><Check size={15} />{error}<button onClick={() => setError("")}><X size={14} /></button></div>}
    </div>
  );
}
