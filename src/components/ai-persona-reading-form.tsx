"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, LoaderCircle, Sparkles, UserRound, X } from "lucide-react";
import { openRazorpayCheckout } from "@/lib/razorpay-checkout";
import { ReadingShareNudge } from "@/components/reading-share-nudge";

type MemberPrefill = { name: string; email: string };

export function AiPersonaReadingForm({ slug, name, member, price, currency, onlinePaymentsAvailable, sampleQuestions }: {
  slug: string;
  name: string;
  member: MemberPrefill | null;
  price: number;
  currency: string;
  onlinePaymentsAvailable: boolean;
  sampleQuestions: string[];
}) {
  const [clientName, setClientName] = useState(member?.name ?? "");
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [readingId, setReadingId] = useState<string | null>(null);

  if (!member) {
    return (
      <div className="ask-signin">
        <UserRound size={26} />
        <h2>Sign in to ask {name}</h2>
        <p>Create a free account so you can send your question and get your answer straight to your dashboard.</p>
        <div className="ask-signin__actions">
          <Link href="/account?mode=register" className="button">Create account</Link>
          <Link href="/account" className="button button--ghost">Sign in</Link>
        </div>
        <small>You&rsquo;ll come right back here after.</small>
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
    else { setError(data.error || "Your reading is still being prepared."); await pollForAnswer(readingId, 3); }
  }

  async function submit() {
    setError("");
    if (!clientName.trim()) { setError("Please share your name."); return; }
    if (question.trim().length < 8) { setError("Please write a fuller question (at least a sentence)."); return; }

    setLoading(true);
    try {
      const response = await fetch(`/api/ai-readings/persona/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientName, question }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Your reading could not be started.");

      if (data.free) {
        setLoading(false);
        if (data.answer) { setAnswer(data.answer); return; }
        setReadingId(data.readingId);
        setWaiting(true);
        await pollForAnswer(data.readingId, 6);
        return;
      }
      if (!data.orderId) throw new Error(data.error || "Your reading could not be started.");
      setReadingId(data.readingId);

      await openRazorpayCheckout({
        key: data.key,
        amount: data.amount,
        currency: data.currency,
        order_id: data.orderId,
        name: "Jyotish Studio",
        description: `${name} · ${currency} ${price}`,
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
          if (verify.ok) { setWaiting(true); await pollForAnswer(data.readingId, 6); return; }
          setError(verifyData.error || "Payment could not be confirmed. If money was deducted, please contact support.");
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
        <h2>From {name}</h2>
        <div className="ask-answer__body">
          {answer.split("\n").filter((line) => line.trim()).map((line, index) => {
            const boldMatch = line.match(/^\*\*(.+?)\*\*\s*(.*)$/);
            if (boldMatch) return <p key={index}><strong>{boldMatch[1]}</strong>{boldMatch[2] ? ` ${boldMatch[2]}` : ""}</p>;
            return <p key={index}>{line.replace(/\*\*/g, "")}</p>;
          })}
        </div>
        <ReadingShareNudge
          path={`/ai/${slug}`}
          shareTitle={`I just got a reading from ${name}`}
          shareText={`I just got a reading from ${name} on Adi Jyotish Guru — try it:`}
        />
        <div className="ask-answer__actions">
          <Link href="/dashboard/ai-readings" className="button button--ghost">View in dashboard</Link>
          <button type="button" className="button" onClick={() => { setAnswer(null); setQuestion(""); setReadingId(null); }}>Ask another question</button>
        </div>
      </div>
    );
  }

  if (waiting) {
    return (
      <div className="ask-waiting">
        <LoaderCircle size={26} className="spin" />
        <h2>{name} is preparing your reading…</h2>
        <p>This usually takes under a minute.</p>
        <button type="button" className="button button--ghost" onClick={retryNow}>Check again</button>
      </div>
    );
  }

  return (
    <div className="ask-form-card">
      <header><div><p>{price > 0 ? `${currency} ${price} · your personal reading` : "Free · your personal reading"}</p><h2>What would you like to ask?</h2></div></header>
      <div className="booking-fields">
        <label className="wide"><span>Your name</span><div><UserRound size={16} /><input value={clientName} onChange={(event) => setClientName(event.target.value)} placeholder="Full name" /></div></label>
        <label className="wide"><span>Your question</span><textarea rows={5} maxLength={800} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder={sampleQuestions[0] || "Ask your question…"} /><small>{question.length}/800</small></label>
      </div>
      {sampleQuestions.length > 0 && (
        <div className="ask-form-card__samples">
          {sampleQuestions.slice(0, 3).map((sample) => (
            <button type="button" key={sample} onClick={() => setQuestion(sample)}>{sample}</button>
          ))}
        </div>
      )}
      <button type="button" className="button ask-form-card__submit" disabled={loading || (price > 0 && !onlinePaymentsAvailable)} onClick={submit}>
        {loading ? "Preparing…" : price > 0 ? `Pay ${currency} ${price} & get my reading` : "Get my free reading"}
      </button>
      {price > 0 && !onlinePaymentsAvailable && <p className="ask-form-card__note">Online payments are being configured — please try again shortly.</p>}
      {error && <div className="toast"><Check size={15} />{error}<button onClick={() => setError("")}><X size={14} /></button></div>}
    </div>
  );
}
