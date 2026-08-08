"use client";

import { useState } from "react";
import Link from "next/link";
import { BookOpen, CalendarDays, Check, Clock3, LoaderCircle, MapPin, Sparkles, UserRound, X } from "lucide-react";
import { openRazorpayCheckout } from "@/lib/razorpay-checkout";

type MemberPrefill = { name: string; email: string; birthDate: string | null; birthTime: string | null; birthPlace: string | null };

export function LalKitabReadingForm({ member, price, currency, onlinePaymentsAvailable }: {
  member: MemberPrefill | null;
  price: number;
  currency: string;
  onlinePaymentsAvailable: boolean;
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
        <BookOpen size={26} />
        <h2>Lal Kitab reading ke liye sign in karein</h2>
        <p>Ek free account banayein taaki aap apni janm detail bhej saken aur apni report seedhe apne dashboard mein pa saken.</p>
        <div className="ask-signin__actions">
          <Link href="/account?mode=register" className="button">Account banayein</Link>
          <Link href="/account" className="button button--ghost">Sign in</Link>
        </div>
        <small>Payment ke baad aap yahin wapas aa jaayenge.</small>
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
    else { setError(data.error || "Report abhi bhi taiyaar ho raha hai."); await pollForAnswer(readingId, 3); }
  }

  async function submit() {
    setError("");
    if (!clientName.trim() || !birthDate || !birthTime || !birthPlace.trim()) { setError("Please apna naam aur exact janm tithi, samay, aur sthan bharein."); return; }
    if (question.trim().length < 8) { setError("Apni chinta thodi vistaar se likhein (kam se kam ek poora vaakya)."); return; }

    setLoading(true);
    try {
      const response = await fetch("/api/ai-readings/lal-kitab", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientName, birthDate, birthTime, birthPlace, question }),
      });
      const data = await response.json();
      if (!response.ok || !data.orderId) throw new Error(data.error || "Aapki report shuru nahi ho saki.");
      setReadingId(data.readingId);

      await openRazorpayCheckout({
        key: data.key,
        amount: data.amount,
        currency: data.currency,
        order_id: data.orderId,
        name: "Jyotish Studio",
        description: `Pandit Girish Trivedi · ${currency} ${price}`,
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
          setError(verifyData.error || "Payment confirm nahi ho saka. Agar paise kat gaye hain to support se sampark karein.");
        },
        onDismiss: () => setLoading(false),
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Aapki report shuru nahi ho saki.");
      setLoading(false);
    }
  }

  if (answer) {
    return (
      <div className="ask-answer">
        <div className="ask-answer__badge"><Sparkles size={15} /> Aapki report taiyaar hai</div>
        <h2>Pandit Girish Trivedi ki taraf se</h2>
        <div className="ask-answer__body">
          {answer.split("\n").filter((line) => line.trim()).map((line, index) => {
            const boldMatch = line.match(/^\*\*(.+?)\*\*\s*(.*)$/);
            if (boldMatch) return <p key={index}><strong>{boldMatch[1]}</strong>{boldMatch[2] ? ` ${boldMatch[2]}` : ""}</p>;
            return <p key={index}>{line.replace(/\*\*/g, "")}</p>;
          })}
        </div>
        <div className="ask-answer__actions">
          <Link href="/dashboard/ai-readings" className="button button--ghost">Dashboard mein dekhein</Link>
          <button type="button" className="button" onClick={() => { setAnswer(null); setQuestion(""); setReadingId(null); }}>Nayi reading lein</button>
        </div>
      </div>
    );
  }

  if (waiting) {
    return (
      <div className="ask-waiting">
        <LoaderCircle size={26} className="spin" />
        <h2>Aapki Lal Kitab reading taiyaar ho rahi hai…</h2>
        <p>Aapka payment confirm ho gaya hai. Pandit Girish Trivedi aapki janm detail ka dhyan se adhyayan kar rahe hain — usually ek minute se kam samay lagta hai.</p>
        <button type="button" className="button button--ghost" onClick={retryNow}>Dobara check karein</button>
      </div>
    );
  }

  return (
    <div className="ask-form-card">
      <header><div><p>{currency} {price} · janm detail + upay ke saath poori report</p><h2>Apni janm detail aur chinta bharein</h2></div></header>
      <div className="booking-fields">
        <label><span>Aapka naam</span><div><UserRound size={16} /><input value={clientName} onChange={(event) => setClientName(event.target.value)} placeholder="Poora naam" /></div></label>
        <label><span>Janm tithi</span><div><CalendarDays size={16} /><input type="date" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} /></div></label>
        <label><span>Exact janm samay</span><div><Clock3 size={16} /><input type="time" value={birthTime} onChange={(event) => setBirthTime(event.target.value)} /></div><small>Pata nahi? Jitna nazdeek ho utna samay bharein.</small></label>
        <label className="wide"><span>Janm sthan</span><div><MapPin size={16} /><input value={birthPlace} onChange={(event) => setBirthPlace(event.target.value)} placeholder="Shehar, desh" /></div></label>
        <label className="wide"><span>Aapki chinta</span><textarea rows={4} maxLength={600} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Jaise: Career mein baar baar rukavat aa rahi hai, iska Lal Kitab upay kya hai?" /><small>{question.length}/600</small></label>
      </div>
      <button type="button" className="button ask-form-card__submit" disabled={loading || !onlinePaymentsAvailable} onClick={submit}>
        {loading ? "Taiyaar ho raha hai…" : `Pay ${currency} ${price} & meri report paayein`}
      </button>
      {!onlinePaymentsAvailable && <p className="ask-form-card__note">Online payments abhi configure ho rahe hain — kripya thodi der baad try karein.</p>}
      {error && <div className="toast"><Check size={15} />{error}<button onClick={() => setError("")}><X size={14} /></button></div>}
    </div>
  );
}
