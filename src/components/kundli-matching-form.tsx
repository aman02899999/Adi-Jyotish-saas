"use client";

import { useState } from "react";
import { CalendarDays, Check, Clock3, Download, HeartHandshake, LoaderCircle, Share2, UserRound, X } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { TurnstileWidget, isTurnstileEnabled } from "@/components/turnstile-widget";
import { ShareButtons } from "@/components/share-buttons";
import { PlaceAutocomplete } from "@/components/place-autocomplete";

type Breakdown = { varna: number; vashya: number; tara: number; yoni: number; grahaMaitri: number; gana: number; bhakoot: number; nadi: number };
type TimelineMonth = { monthLabel: string; score: number; tier: "favorable" | "supportive" | "neutral" | "caution"; headline: string };
type Result = {
  id: string; score: number; maxScore: number; breakdown: Breakdown; nadiDosha: boolean; bhakootDosha: boolean;
  moonARashi: string; moonANakshatra: string; moonBRashi: string; moonBNakshatra: string; narrative: string;
  timeline: TimelineMonth[];
};

const TIER_LABEL: Record<TimelineMonth["tier"], string> = { favorable: "Favorable", supportive: "Supportive", neutral: "Neutral", caution: "Use caution" };

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
  const [turnstileToken, setTurnstileToken] = useState("");
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<"unauthenticated" | "other" | null>(null);

  async function downloadPdf() {
    if (!result) return;
    setPdfError(null);
    setPdfLoading(true);
    try {
      const response = await fetch(`/api/kundli-matching/${result.id}/pdf`);
      if (!response.ok) {
        setPdfError(response.status === 401 || response.status === 404 ? "unauthenticated" : "other");
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Compatibility-${nameA}-${nameB}.pdf`.replace(/\s+/g, "-");
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setPdfError("other");
    } finally {
      setPdfLoading(false);
    }
  }

  async function submit() {
    setError("");
    if (!nameA.trim() || !birthDateA || !birthTimeA || !birthPlaceA.trim() || !nameB.trim() || !birthDateB || !birthTimeB || !birthPlaceB.trim()) {
      setError("Please complete both people's name, exact birth date, time, and place — Guna Milan needs the Moon's real position.");
      return;
    }
    if (isTurnstileEnabled() && !turnstileToken) {
      setError("Please complete the verification check above.");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/kundli-matching", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nameA, birthDateA, birthTimeA, birthPlaceA, nameB, birthDateB, birthTimeB, birthPlaceB, turnstileToken }),
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
        <h2>12-month compatibility timeline</h2>
        <p className="timeline-intro">Real Jupiter, Venus, and Saturn transits checked against both your natal Moons — not a static score, but when the sky actually favors this pairing.</p>
        <div className="compat-timeline">
          {result.timeline.map((month) => (
            <div key={month.monthLabel} className={`timeline-month timeline-month--${month.tier}`}>
              <div className="timeline-month__head"><strong>{month.monthLabel}</strong><span>{TIER_LABEL[month.tier]}</span></div>
              <p>{month.headline}</p>
            </div>
          ))}
        </div>
        <div className="match-share">
          <p><Share2 size={15} /> Share this match</p>
          <ShareButtons
            url={`${window.location.origin}/match/${result.id}`}
            title={`${nameA} & ${nameB}'s compatibility match`}
            text={`We scored ${result.score}/${result.maxScore} on the classical Ashtakoot Guna Milan scale.`}
          />
        </div>
        <div className="ask-answer__actions">
          <button type="button" className="button button--ghost" onClick={() => { setResult(null); }}>Match another pair</button>
          <button type="button" className="button" disabled={pdfLoading} onClick={downloadPdf}>
            {pdfLoading ? <><LoaderCircle size={16} className="spin" /> Preparing PDF…</> : <><Download size={16} /> Download PDF</>}
          </button>
        </div>
        {pdfError === "unauthenticated" && (
          <p className="ask-form-card__note">Sign in to download the PDF version of this report — free accounts can save and revisit their matches. <Link href="/account">Sign in</Link></p>
        )}
        {pdfError === "other" && (
          <p className="ask-form-card__note">The PDF could not be generated right now. Please try again shortly.</p>
        )}
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
        <label><span>Their birth place</span><PlaceAutocomplete value={birthPlaceA} onChange={setBirthPlaceA} /></label>
        <label><span>Second person&rsquo;s name</span><div><UserRound size={16} /><input value={nameB} onChange={(event) => setNameB(event.target.value)} placeholder="Full name" /></div></label>
        <label><span>Their birth date</span><div><CalendarDays size={16} /><input type="date" value={birthDateB} onChange={(event) => setBirthDateB(event.target.value)} /></div></label>
        <label><span>Their birth time</span><div><Clock3 size={16} /><input type="time" value={birthTimeB} onChange={(event) => setBirthTimeB(event.target.value)} /></div></label>
        <label><span>Their birth place</span><PlaceAutocomplete value={birthPlaceB} onChange={setBirthPlaceB} /></label>
      </div>
      <TurnstileWidget onVerify={setTurnstileToken} />
      <button type="button" className="button ask-form-card__submit" disabled={loading} onClick={submit}>
        {loading ? <><LoaderCircle size={16} className="spin" /> Comparing charts…</> : <><HeartHandshake size={16} /> Check compatibility</>}
      </button>
      {error && <div className="toast"><Check size={15} />{error}<button onClick={() => setError("")}><X size={14} /></button></div>}
    </div>
  );
}
