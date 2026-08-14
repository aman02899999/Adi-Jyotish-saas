"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { CalendarDays, Check, Clock3, LoaderCircle, MapPin, MessageCircleQuestion, Sparkles, UserRound, X } from "lucide-react";
import { openRazorpayCheckout } from "@/lib/razorpay-checkout";
import { ReadingShareNudge } from "@/components/reading-share-nudge";

type MemberPrefill = { name: string; email: string; birthDate: string | null; birthTime: string | null; birthPlace: string | null };

export function AskReadingForm({ member, price, currency, onlinePaymentsAvailable, isFreeEligible }: {
  member: MemberPrefill | null;
  price: number;
  currency: string;
  onlinePaymentsAvailable: boolean;
  isFreeEligible: boolean;
}) {
  const [clientName, setClientName] = useState(member?.name ?? "");
  const [birthDate, setBirthDate] = useState(member?.birthDate ?? "");
  const [birthTime, setBirthTime] = useState(member?.birthTime ?? "");
  const [birthPlace, setBirthPlace] = useState(member?.birthPlace ?? "");
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [readingId, setReadingId] = useState<string | null>(null);

  if (!member) {
    return (
      <div className="ask-signin">
        <MessageCircleQuestion size={26} />
        <h2>Sign in to ask your question</h2>
        <p>Create a free account to submit birth details and receive your reading in your dashboard.</p>
        <div className="ask-signin__actions">
          <Link href="/account?mode=register" className="button">Create your account</Link>
          <Link href="/account" className="button button--ghost">Sign in</Link>
        </div>
        <small>You&apos;ll land right back here to ask your question.</small>
      </div>
    );
  }

  const memberEmail = member.email;

  async function pollForAnswer(id: string, attemptsLeft: number) {
    if (attemptsLeft <= 0) { setWaiting(false); return; }
    await new Promise((resolve) => setTimeout(resolve, 4000));
    const response = await fetch(`/api/ai-readings/${id}`);
    const data = await response.json();
    if (response.ok && data.reading?.status === "answered" && data.reading.answer) {
      setAnswer(data.reading.answer);
      setWaiting(false);
      return;
    }
    await pollForAnswer(id, attemptsLeft - 1);
  }

  async function retryNow() {
    if (!readingId) return;
    setWaiting(true);
    setError("");
    const response = await fetch(`/api/ai-readings/${readingId}/retry`, { method: "POST" });
    const data = await response.json();
    if (response.ok && data.answer) { setAnswer(data.answer); setWaiting(false); }
    else { setError(data.error || "Still preparing your reading."); await pollForAnswer(readingId, 3); }
  }

  async function submit() {
    setError("");
    if (!clientName.trim() || !birthDate || !birthTime || !birthPlace.trim()) { setError("Please complete your name and exact birth date, time, and place."); return; }
    if (question.trim().length < 8) { setError("Please write a fuller question — at least a sentence."); return; }

    setLoading(true);
    try {
      const response = await fetch("/api/ai-readings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientName, birthDate, birthTime, birthPlace, question }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Your reading could not be started.");

      if (data.free) {
        setReadingId(data.readingId);
        if (data.answer) { setAnswer(data.answer); setLoading(false); return; }
        setWaiting(true);
        setLoading(false);
        await pollForAnswer(data.readingId, 5);
        return;
      }

      if (!data.orderId) throw new Error(data.error || "Your reading could not be started.");
      setReadingId(data.readingId);

      await openRazorpayCheckout({
        key: data.key,
        amount: data.amount,
        currency: data.currency,
        order_id: data.orderId,
        name: "Adi Jyotish Guru",
        description: `Ask Shree Santram Shashtri · ${currency} ${price}`,
        prefill: { name: clientName, email: memberEmail },
        theme: { color: "#a95838" },
        onSuccess: async (payment) => {
          const verify = await fetch(`/api/ai-readings/${data.readingId}/verify`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ razorpay_order_id: payment.razorpay_order_id, razorpay_payment_id: payment.razorpay_payment_id, razorpay_signature: payment.razorpay_signature }),
          });
          const verifyData = await verify.json();
          setLoading(false);
          if (verify.ok && verifyData.answer) { setAnswer(verifyData.answer); return; }
          if (verify.ok) { setWaiting(true); await pollForAnswer(data.readingId, 5); return; }
          setError(verifyData.error || "Payment could not be confirmed. Contact support if you were charged.");
        },
        onDismiss: () => setLoading(false),
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Your reading could not be started.");
      setLoading(false);
    }
  }

  if (answer) {
    return (
      <div className="ask-answer">
        <div className="ask-answer__badge"><Sparkles size={15} /> Your reading is ready</div>
        <h2>From Shree Santram Shashtri</h2>
        <div className="ask-answer__body">{answer.split("\n").filter((line) => line.trim()).map((line, index) => <p key={index}>{line}</p>)}</div>
        <ReadingShareNudge
          path="/ask"
          shareTitle="I just got a live astrology answer from Shree Santram Shashtri"
          shareText="I just got a live astrology answer from Shree Santram Shashtri on Adi Jyotish Guru — your first question is free, try it:"
        />
        <div className="ask-answer__actions">
          <Link href="/dashboard/ai-readings" className="button button--ghost">View in your dashboard</Link>
          <button type="button" className="button" onClick={() => { setAnswer(null); setQuestion(""); setReadingId(null); }}>Ask another question</button>
        </div>
      </div>
    );
  }

  if (waiting) {
    return (
      <div className="ask-waiting">
        <LoaderCircle size={26} className="spin" />
        <h2>Preparing your reading…</h2>
        <p>Your payment is confirmed. Shree Santram Shashtri is studying your chart — this usually takes under a minute.</p>
        {error && <p className="ask-waiting__error">{error}</p>}
        <button type="button" className="button button--ghost" onClick={retryNow}>Check again</button>
      </div>
    );
  }

  return (
    <div className="ask-form-card">
      <header><div><p>{isFreeEligible ? "Your first question is free" : `${currency} ${price} · one question, one answer`}</p><h2>Tell Shree Santram Shashtri about yourself</h2></div></header>
      <div className="booking-fields">
        <label><span>Your name</span><div><UserRound size={16} /><input value={clientName} onChange={(event) => setClientName(event.target.value)} placeholder="Full name" /></div></label>
        <label><span>Birth date</span><div><CalendarDays size={16} /><input type="date" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} /></div></label>
        <label><span>Exact birth time</span><div><Clock3 size={16} /><input type="time" value={birthTime} onChange={(event) => setBirthTime(event.target.value)} /></div><small>Not sure? Enter your closest known time.</small></label>
        <label className="wide"><span>Birth place</span><div><MapPin size={16} /><input value={birthPlace} onChange={(event) => setBirthPlace(event.target.value)} placeholder="City, country" /></div></label>
        <label className="wide"><span>Your question</span><textarea rows={4} maxLength={600} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="What would you like Shree Santram Shashtri to look into?" /><small>{question.length}/600</small></label>
      </div>
      <button type="button" className="button ask-form-card__submit" disabled={loading || (!isFreeEligible && !onlinePaymentsAvailable)} onClick={submit}>
        {loading ? "Preparing…" : isFreeEligible ? "Get my first reading free" : `Pay ${currency} ${price} & get my reading`}
      </button>
      {!isFreeEligible && !onlinePaymentsAvailable && <p className="ask-form-card__note">Online payments are being configured — please check back shortly.</p>}
      {error && <div className="toast"><Check size={15} />{error}<button onClick={() => setError("")}><X size={14} /></button></div>}
    </div>
  );
}
