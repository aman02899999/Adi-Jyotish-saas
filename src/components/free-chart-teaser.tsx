"use client";

import { useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import { ArrowRight, CalendarDays, Clock3, Lock, LoaderCircle, MapPin, Sparkles } from "lucide-react";
import { PlaceAutocomplete } from "@/components/place-autocomplete";
import { trackEvent } from "@/lib/track-event";

type Sign = { name: string; english: string };
/** Mirrors lib/free-chart.ts: without a birth time, a fact can have two or three possible values. */
type Preview = {
  matchedPlace: string;
  timeKnown: boolean;
  ascendant: { name: string; english: string; degree: number } | null;
  moon: { signs: Sign[]; nakshatras: string[]; pada: number | null };
  sun: { signs: Sign[] };
  mahadasha: { lord: string; endsOn: string | null } | null;
};

const either = (values: string[]) => values.join(" or ");

/** Read by the Kundli report form, so a visitor who unlocks the full report doesn't type it twice. */
export const FREE_CHART_BIRTH_KEY = "ajg.freeChartBirth";

const LOCKED = ["Career and wealth, house by house", "Marriage and relationship timing", "Health and the planets behind it", "Your next dasha periods, year by year"];

/**
 * The homepage's first action: a real chart from birth details in a few seconds, with no sign-up
 * and no AI cost (see lib/free-chart.ts). It shows the facts people recognise as theirs, then the
 * sections the full report adds, locked, with the two ways forward.
 */
export function FreeChartTeaser(props: { kundliPrice: number; currency: string; signedIn: boolean }) {
  // The id sits on a wrapper that never changes, so the sticky call to action keeps tracking it
  // when the form is swapped for the result.
  return <div id="free-chart" className="free-chart-anchor"><FreeChartBody {...props} /></div>;
}

function FreeChartBody({ kundliPrice, currency, signedIn }: { kundliPrice: number; currency: string; signedIn: boolean }) {
  const [birthDate, setBirthDate] = useState("");
  const [birthTime, setBirthTime] = useState("");
  const [timeUnknown, setTimeUnknown] = useState(false);
  const [birthPlace, setBirthPlace] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  // The funnel, without any birth details: started the form, saw a chart, took a way forward.
  const started = useRef(false);
  function markStarted() {
    if (started.current) return;
    started.current = true;
    trackEvent("free_chart_start");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    const details = { birthDate, birthTime: timeUnknown ? "" : birthTime, birthPlace };
    try {
      const response = await fetch("/api/free-chart", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...details, timeUnknown }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || "Your chart could not be calculated. Please try again.");
        trackEvent("free_chart_error", { status: response.status });
        return;
      }
      setPreview(data as Preview);
      trackEvent("generate_lead", { lead_source: "free_chart", time_known: !timeUnknown });
      try { sessionStorage.setItem(FREE_CHART_BIRTH_KEY, JSON.stringify({ ...details, timeUnknown })); } catch { /* private mode: prefill is only a convenience */ }
    } catch {
      setError("Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  if (preview) {
    const { ascendant, moon, sun, mahadasha } = preview;
    const needsTime = "Depends on your birth time";
    const facts = [
      { label: "Lagna (Ascendant)", value: ascendant ? `${ascendant.name} · ${ascendant.degree}°` : "Needs your birth time", note: ascendant ? ascendant.english : "It changes every two hours" },
      { label: "Moon sign (Rashi)", value: either(moon.signs.map((entry) => entry.name)), note: moon.signs.length > 1 ? needsTime : moon.signs[0].english },
      { label: "Birth nakshatra", value: either(moon.nakshatras), note: moon.pada ? `Pada ${moon.pada}` : moon.nakshatras.length > 1 ? needsTime : "The same all that day" },
      {
        label: "Running Mahadasha",
        value: mahadasha ? mahadasha.lord.replace(/ \(.*\)/, "") : preview.timeKnown ? "—" : "Needs your birth time",
        note: mahadasha?.endsOn ? `until ${new Date(`${mahadasha.endsOn}T00:00:00`).toLocaleDateString("en", { month: "short", year: "numeric" })}` : mahadasha ? "Its end date needs your birth time" : "",
      },
    ];
    return (
      <div className="free-chart free-chart--result" aria-live="polite">
        <p className="free-chart__badge"><Sparkles size={13} /> Your chart · {preview.matchedPlace}</p>
        <div className="free-chart__facts">
          {facts.map((fact, index) => (
            <div className="free-chart__fact" key={fact.label} style={{ animationDelay: `${index * 110}ms` }}>
              <small>{fact.label}</small>
              <strong>{fact.value}</strong>
              <span>{fact.note}</span>
            </div>
          ))}
        </div>
        <p className="free-chart__sun">Sun in {either(sun.signs.map((entry) => `${entry.name} (${entry.english})`))}, sidereal: the zodiac Vedic astrology uses, which is why it may differ from your Western sign.</p>
        <ul className="free-chart__locked" aria-label="In the full Kundli report">
          {LOCKED.map((item) => <li key={item}><Lock size={13} /> {item}</li>)}
        </ul>
        <div className="free-chart__actions">
          <Link href="/kundli" className="button" onClick={() => trackEvent("free_chart_unlock", { value: kundliPrice, currency })}>Unlock my full Kundli · {currency === "INR" ? "₹" : `${currency} `}{kundliPrice} <ArrowRight size={16} /></Link>
          {!signedIn && <Link href="/account?mode=register" className="button button--ghost" onClick={() => trackEvent("free_chart_save")}>Save my chart free</Link>}
        </div>
        <button type="button" className="free-chart__again" onClick={() => setPreview(null)}>Try someone else&rsquo;s birth details</button>
      </div>
    );
  }

  return (
    <form className="free-chart" onSubmit={submit} onFocus={markStarted}>
      <p className="free-chart__badge"><Sparkles size={13} /> Free · about 10 seconds · no sign-up</p>
      <h2>See your birth chart now</h2>
      <p className="free-chart__lead">Real planetary positions for the moment you were born: your Lagna, Moon sign, nakshatra and the dasha you are in today.</p>
      <label className="free-chart__field">
        <span><CalendarDays size={14} /> Date of birth</span>
        <input type="date" required value={birthDate} max={new Date().toISOString().slice(0, 10)} min="1900-01-01" onChange={(event) => setBirthDate(event.target.value)} />
      </label>
      <label className="free-chart__field">
        <span><Clock3 size={14} /> Time of birth</span>
        <input type="time" required={!timeUnknown} disabled={timeUnknown} value={timeUnknown ? "" : birthTime} onChange={(event) => setBirthTime(event.target.value)} />
      </label>
      <label className="free-chart__check">
        <input type="checkbox" checked={timeUnknown} onChange={(event) => setTimeUnknown(event.target.checked)} /> I don&rsquo;t know my birth time
      </label>
      <div className="free-chart__field">
        <span><MapPin size={14} /> Place of birth</span>
        <PlaceAutocomplete value={birthPlace} onChange={setBirthPlace} required id="free-chart-place" placeholder="Start typing your city" />
      </div>
      {error && <p className="free-chart__error" role="alert">{error}</p>}
      <button className="button free-chart__submit" type="submit" disabled={loading}>
        {loading ? <><LoaderCircle size={17} className="spin" /> Reading the sky…</> : <>Reveal my chart <ArrowRight size={17} /></>}
      </button>
      <small className="free-chart__privacy">Nothing is saved unless you create an account.</small>
    </form>
  );
}
