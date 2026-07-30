"use client";

import { useState } from "react";
import { CalendarDays, Check, Gem, LoaderCircle, MessageCircleQuestion, Sparkles, UserRound, X } from "lucide-react";
import { GemstoneProductCard } from "@/components/gemstone-product-card";
import { TurnstileWidget, isTurnstileEnabled } from "@/components/turnstile-widget";
import type { ProductListItem } from "@/lib/gemstones";

type Result = { narrative: string; sign: { name: string; symbol: string }; products: ProductListItem[] };

export function GemstoneRecommendationForm({ prefillName }: { prefillName: string }) {
  const [name, setName] = useState(prefillName);
  const [birthDate, setBirthDate] = useState("");
  const [concern, setConcern] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [turnstileToken, setTurnstileToken] = useState("");

  async function submit() {
    setError("");
    if (!name.trim() || !birthDate) { setError("Please share your name and birth date."); return; }
    if (isTurnstileEnabled() && !turnstileToken) { setError("Please complete the verification check above."); return; }
    setLoading(true);
    try {
      const response = await fetch("/api/gemstone-recommendation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, birthDate, concern, turnstileToken }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Your recommendation could not be prepared.");
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
        <div className="ask-answer__badge"><Sparkles size={15} /> Recommended for {result.sign.symbol} {result.sign.name}</div>
        <h2>From Shree Santram Shashtri</h2>
        <div className="ask-answer__body">{result.narrative.split("\n").filter((line) => line.trim()).map((line, index) => <p key={index}>{line}</p>)}</div>
        {result.products.length > 0 && (
          <div className="product-grid ask-answer__products">
            {result.products.map((product) => <GemstoneProductCard key={product.id} product={product} wishlisted={false} />)}
          </div>
        )}
        <div className="ask-answer__actions">
          <button type="button" className="button button--ghost" onClick={() => { setResult(null); setConcern(""); }}>Get another recommendation</button>
        </div>
      </div>
    );
  }

  return (
    <div className="ask-form-card">
      <header><div><p>Free · takes 10 seconds</p><h2>Find your stone</h2></div></header>
      <div className="booking-fields">
        <label><span>Your name</span><div><UserRound size={16} /><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Full name" /></div></label>
        <label><span>Birth date</span><div><CalendarDays size={16} /><input type="date" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} /></div></label>
        <label className="wide"><span>What would you like to improve? <i>optional</i></span><div><MessageCircleQuestion size={16} /><input value={concern} onChange={(event) => setConcern(event.target.value.slice(0, 300))} placeholder="Career, relationships, confidence…" /></div></label>
      </div>
      <TurnstileWidget onVerify={setTurnstileToken} />
      <button type="button" className="button ask-form-card__submit" disabled={loading} onClick={submit}>
        {loading ? <><LoaderCircle size={16} className="spin" /> Reading your chart…</> : <><Gem size={16} /> Get my recommendation</>}
      </button>
      {error && <div className="toast"><Check size={15} />{error}<button onClick={() => setError("")}><X size={14} /></button></div>}
    </div>
  );
}
