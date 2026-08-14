"use client";

import { useState } from "react";
import { CalendarClock, Check, LoaderCircle, Sparkles, X } from "lucide-react";

const DECISION_OPTIONS: { key: string; label: string }[] = [
  { key: "new_venture", label: "Starting a new venture or business" },
  { key: "contract_signing", label: "Signing a contract or agreement" },
  { key: "travel", label: "Starting a journey or trip" },
  { key: "house_warming", label: "Moving into a new home" },
  { key: "marriage_ceremony", label: "Marriage or engagement ceremony" },
  { key: "important_conversation", label: "An important conversation or negotiation" },
];

type MuhurtaDay = {
  date: string;
  dateLabel: string;
  score: number;
  tier: "excellent" | "good" | "workable" | "avoid";
  reasons: string[];
  tithi: string;
  nakshatra: string;
  vara: string;
  abhijitWindow: { start: string; end: string } | null;
  rahuKalaWindow: { start: string; end: string } | null;
};

type Result = { days: MuhurtaDay[]; varaNote: string; referenceLocationLabel: string };

const TIER_LABEL: Record<MuhurtaDay["tier"], string> = { excellent: "Excellent", good: "Good", workable: "Workable", avoid: "Avoid" };

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(base: string, days: number) {
  const date = new Date(`${base}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });
}

export function MuhuratConciergeForm() {
  const [decisionType, setDecisionType] = useState(DECISION_OPTIONS[0].key);
  const [startDate, setStartDate] = useState(todayIso());
  const [endDate, setEndDate] = useState(addDaysIso(todayIso(), 13));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  async function submit() {
    setError("");
    if (!startDate || !endDate) {
      setError("Please choose a start and end date.");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/muhurat-concierge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decisionType, startDate, endDate }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not find your best days. Please try again.");
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
        <div className="ask-answer__badge"><CalendarClock size={15} /> Best days found</div>
        <p className="timeline-intro">{result.varaNote}</p>
        <p className="legal-note">Abhijit and Rahu Kaal clock times below are computed for {result.referenceLocationLabel} — sunrise/sunset shift by up to an hour across India, so treat these as a close estimate and confirm exact timing locally for a ceremony that depends on precise minutes.</p>
        <div className="muhurat-day-list">
          {result.days.map((day) => (
            <div key={day.date} className={`muhurat-day muhurat-day--${day.tier}`}>
              <div className="muhurat-day__head"><strong>{day.dateLabel}</strong><span>{TIER_LABEL[day.tier]}</span></div>
              <p className="muhurat-day__meta">{day.tithi} · {day.nakshatra} nakshatra · {day.vara}</p>
              {day.reasons.length > 0 && <ul className="muhurat-day__reasons">{day.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>}
              <div className="muhurat-day__windows">
                {day.abhijitWindow && <span className="muhurat-day__window muhurat-day__window--good">Abhijit {formatTime(day.abhijitWindow.start)}–{formatTime(day.abhijitWindow.end)}</span>}
                {day.rahuKalaWindow && <span className="muhurat-day__window muhurat-day__window--bad">Avoid Rahu Kaal {formatTime(day.rahuKalaWindow.start)}–{formatTime(day.rahuKalaWindow.end)}</span>}
              </div>
            </div>
          ))}
        </div>
        <div className="ask-answer__actions">
          <button type="button" className="button button--ghost" onClick={() => setResult(null)}>Search another range</button>
        </div>
      </div>
    );
  }

  return (
    <div className="ask-form-card">
      <header><div><p>Free · real Panchang engine</p><h2>Muhurat concierge</h2></div></header>
      <div className="booking-fields">
        <label><span>What are you planning?</span><div><Sparkles size={16} /><select value={decisionType} onChange={(event) => setDecisionType(event.target.value)}>{DECISION_OPTIONS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</select></div></label>
        <label><span>Earliest date</span><div><CalendarClock size={16} /><input type="date" min={todayIso()} value={startDate} onChange={(event) => setStartDate(event.target.value)} /></div></label>
        <label><span>Latest date</span><div><CalendarClock size={16} /><input type="date" min={startDate} value={endDate} onChange={(event) => setEndDate(event.target.value)} /></div></label>
      </div>
      <button type="button" className="button ask-form-card__submit" disabled={loading} onClick={submit}>
        {loading ? <><LoaderCircle size={16} className="spin" /> Checking the sky…</> : <><CalendarClock size={16} /> Find my best days</>}
      </button>
      {error && <div className="toast"><Check size={15} />{error}<button onClick={() => setError("")}><X size={14} /></button></div>}
    </div>
  );
}
