"use client";

import { useState } from "react";
import { CalendarDays, Check, Clock3, HeartHandshake, LoaderCircle, MapPin, UserRound, X } from "lucide-react";

type Breakdown = { varna: number; vashya: number; tara: number; yoni: number; grahaMaitri: number; gana: number; bhakoot: number; nadi: number };
type Result = {
  score: number; maxScore: number; breakdown: Breakdown; nadiDosha: boolean; bhakootDosha: boolean;
  moonARashi: string; moonANakshatra: string; moonBRashi: string; moonBNakshatra: string; narrative: string;
};

const KOOTA_META: Array<{ key: keyof Breakdown; label: string; max: number }> = [
  { key: "varna", label: "Varna", max: 1 },
  { key: "vashya", label: "Vashya", max: 2 },
  { key: "tara", label: "Tara", max: 3 },
  { key: "yoni", label: "Yoni", max: 4 },
  { key: "grahaMaitri", label: "Graha Maitri", max: 5 },
  { key: "gana", label: "Gana", max: 6 },
  { key: "bhakoot", label: "Bhakoot", max: 7 },
  { key: "nadi", label: "Nadi", max: 8 },
];

export function KundliMatchingForm() {
  const [nameA, setNameA] = useState("");
  const [birthDateA, setBirthDateA] = useState("");
  const [birthTimeA, setBirthTimeA] = useState("");
  const [birthPlaceA, setBirthPlaceA] = useState("");
  const [nameB, setNameB] = useState("");
  const [birthDateB, setBirthDateB] = useState("");
  const [birthTimeB, setBirthTimeB] = useState("");
  const [birthPlaceB, setBirthPlaceB] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  async function submit() {
    setError("");
    if (!nameA.trim() || !birthDateA || !birthTimeA || !birthPlaceA.trim() || !nameB.trim() || !birthDateB || !birthTimeB || !birthPlaceB.trim()) {
      setError("Please complete both people's name, exact birth date, time, and place — Guna Milan needs the Moon's real position.");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/kundli-matching", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nameA, birthDateA, birthTimeA, birthPlaceA, nameB, birthDateB, birthTimeB, birthPlaceB }),
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
        <div className="ask-answer__badge"><HeartHandshake size={15} /> Guna Milan complete</div>
        <div className="match-score"><strong>{result.score}</strong><span>/ {result.maxScore} guna points</span></div>
        <p className="match-moons">{nameA}&rsquo;s Moon: <strong>{result.moonARashi}</strong> ({result.moonANakshatra}) · {nameB}&rsquo;s Moon: <strong>{result.moonBRashi}</strong> ({result.moonBNakshatra})</p>
        <div className="koota-grid">
          {KOOTA_META.map((koota) => (
            <div key={koota.key} className={result.breakdown[koota.key] === 0 ? "koota koota--zero" : "koota"}>
              <span>{koota.label}</span>
              <strong>{result.breakdown[koota.key]}<small>/{koota.max}</small></strong>
            </div>
          ))}
        </div>
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
      <header><div><p>Free · real Ashtakoot Guna Milan engine</p><h2>Kundli matching</h2></div></header>
      <div className="booking-fields">
        <label><span>First person&rsquo;s name</span><div><UserRound size={16} /><input value={nameA} onChange={(event) => setNameA(event.target.value)} placeholder="Full name" /></div></label>
        <label><span>Their birth date</span><div><CalendarDays size={16} /><input type="date" value={birthDateA} onChange={(event) => setBirthDateA(event.target.value)} /></div></label>
        <label><span>Their birth time</span><div><Clock3 size={16} /><input type="time" value={birthTimeA} onChange={(event) => setBirthTimeA(event.target.value)} /></div></label>
        <label><span>Their birth place</span><div><MapPin size={16} /><input value={birthPlaceA} onChange={(event) => setBirthPlaceA(event.target.value)} placeholder="City, country" /></div></label>
        <label><span>Second person&rsquo;s name</span><div><UserRound size={16} /><input value={nameB} onChange={(event) => setNameB(event.target.value)} placeholder="Full name" /></div></label>
        <label><span>Their birth date</span><div><CalendarDays size={16} /><input type="date" value={birthDateB} onChange={(event) => setBirthDateB(event.target.value)} /></div></label>
        <label><span>Their birth time</span><div><Clock3 size={16} /><input type="time" value={birthTimeB} onChange={(event) => setBirthTimeB(event.target.value)} /></div></label>
        <label><span>Their birth place</span><div><MapPin size={16} /><input value={birthPlaceB} onChange={(event) => setBirthPlaceB(event.target.value)} placeholder="City, country" /></div></label>
      </div>
      <button type="button" className="button ask-form-card__submit" disabled={loading} onClick={submit}>
        {loading ? <><LoaderCircle size={16} className="spin" /> Comparing charts…</> : <><HeartHandshake size={16} /> Check compatibility</>}
      </button>
      {error && <div className="toast"><Check size={15} />{error}<button onClick={() => setError("")}><X size={14} /></button></div>}
    </div>
  );
}
