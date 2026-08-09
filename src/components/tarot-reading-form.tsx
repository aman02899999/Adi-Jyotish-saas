"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, LoaderCircle, Sparkles, UserRound, X } from "lucide-react";
import { openRazorpayCheckout } from "@/lib/razorpay-checkout";
import { ReadingShareNudge } from "@/components/reading-share-nudge";

type MemberPrefill = { name: string; email: string };
type TarotCardDraw = { name: string; position: string; reversed: boolean };
type OrderData = { readingId: string; orderId: string; amount: number; currency: string; key: string };

export function TarotReadingForm({ member, price, currency, onlinePaymentsAvailable }: {
  member: MemberPrefill | null;
  price: number;
  currency: string;
  onlinePaymentsAvailable: boolean;
}) {
  const [clientName, setClientName] = useState(member?.name ?? "");
  const [question, setQuestion] = useState("");
  const [cards, setCards] = useState<TarotCardDraw[] | null>(null);
  const [order, setOrder] = useState<OrderData | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);

  if (!member) {
    return (
      <div className="ask-signin">
        <Sparkles size={26} />
        <h2>Tarot reading ke liye sign in karein</h2>
        <p>Ek free account banayein taaki aap apna sawaal pooch saken aur apni tarot reading seedhe apne dashboard mein pa saken.</p>
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

  async function drawCards() {
    setError("");
    if (!clientName.trim()) { setError("Please apna naam likhein."); return; }
    if (question.trim().length < 8) { setError("Apna sawaal thoda vistaar se likhein (kam se kam ek poora vaakya)."); return; }

    setDrawing(true);
    try {
      const response = await fetch("/api/ai-readings/tarot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientName, question }),
      });
      const data = await response.json();
      if (!response.ok || !data.orderId) throw new Error(data.error || "Cards khinchi nahi ja saki.");
      setCards(data.cards);
      setOrder({ readingId: data.readingId, orderId: data.orderId, amount: data.amount, currency: data.currency, key: data.key });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Cards khinchi nahi ja saki.");
    } finally {
      setDrawing(false);
    }
  }

  async function unlockReading() {
    if (!order) return;
    setError("");
    setPaying(true);
    try {
      await openRazorpayCheckout({
        key: order.key,
        amount: order.amount,
        currency: order.currency,
        order_id: order.orderId,
        name: "Jyotish Studio",
        description: `Tarot Mystic Divya · ${currency} ${price}`,
        prefill: { name: clientName, email: memberEmail },
        theme: { color: "#a95838" },
        onSuccess: async (payment) => {
          const verify = await fetch(`/api/ai-readings/${order.readingId}/verify`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ razorpay_order_id: payment.razorpay_order_id, razorpay_payment_id: payment.razorpay_payment_id, razorpay_signature: payment.razorpay_signature }),
          });
          const verifyData = await verify.json();
          setPaying(false);
          if (verify.ok && verifyData.answer) { setAnswer(verifyData.answer); return; }
          if (verify.ok) { setWaiting(true); await pollForAnswer(order.readingId, 6); return; }
          setError(verifyData.error || "Payment confirm nahi ho saka. Agar paise kat gaye hain to support se sampark karein.");
        },
        onDismiss: () => setPaying(false),
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Payment shuru nahi ho saka.");
      setPaying(false);
    }
  }

  if (answer) {
    return (
      <div className="ask-answer">
        <div className="ask-answer__badge"><Sparkles size={15} /> Aapki reading taiyaar hai</div>
        <h2>Tarot Mystic Divya ki taraf se</h2>
        <div className="ask-answer__body">
          {answer.split("\n").filter((line) => line.trim()).map((line, index) => {
            const boldMatch = line.match(/^\*\*(.+?)\*\*\s*(.*)$/);
            if (boldMatch) return <p key={index}><strong>{boldMatch[1]}</strong>{boldMatch[2] ? ` ${boldMatch[2]}` : ""}</p>;
            return <p key={index}>{line.replace(/\*\*/g, "")}</p>;
          })}
        </div>
        <ReadingShareNudge
          path="/tarot-reading"
          shareTitle="I just got a tarot reading from Tarot Mystic Divya"
          shareText="I just got a tarot reading from Tarot Mystic Divya on Adi Jyotish Guru — try it:"
        />
        <div className="ask-answer__actions">
          <Link href="/dashboard/ai-readings" className="button button--ghost">Dashboard mein dekhein</Link>
          <button type="button" className="button" onClick={() => { setAnswer(null); setCards(null); setOrder(null); setQuestion(""); }}>Nayi reading lein</button>
        </div>
      </div>
    );
  }

  if (waiting) {
    return (
      <div className="ask-waiting">
        <LoaderCircle size={26} className="spin" />
        <h2>Aapke cards padhe ja rahe hain…</h2>
        <p>Aapka payment confirm ho gaya hai. Tarot Mystic Divya aapke spread ka dhyan se adhyayan kar rahi hain — usually ek minute se kam samay lagta hai.</p>
      </div>
    );
  }

  if (cards && order) {
    return (
      <div className="ask-form-card">
        <header><div><p>{currency} {price} · poori tarot reading unlock karein</p><h2>Aapke cards khinch liye gaye hain</h2></div></header>
        <div className="tarot-card-grid">
          {cards.map((card, index) => (
            <div key={index} className="tarot-card">
              <span className="tarot-card__position">{card.position}</span>
              <strong className="tarot-card__name">{card.name}</strong>
              <span className={`tarot-card__orientation tarot-card__orientation--${card.reversed ? "reversed" : "upright"}`}>{card.reversed ? "Reversed" : "Upright"}</span>
            </div>
          ))}
        </div>
        <p className="palm-upload-tip">Yeh teen cards aapke sawaal ke liye khinche gaye hain. Poori Hinglish reading — har card ka matlab, aur Divya ki salah — unlock karne ke liye payment karein.</p>
        <button type="button" className="button ask-form-card__submit" disabled={paying || !onlinePaymentsAvailable} onClick={unlockReading}>
          {paying ? "Taiyaar ho raha hai…" : `Pay ${currency} ${price} & poori reading paayein`}
        </button>
        {!onlinePaymentsAvailable && <p className="ask-form-card__note">Online payments abhi configure ho rahe hain — kripya thodi der baad try karein.</p>}
        {error && <div className="toast"><Check size={15} />{error}<button onClick={() => setError("")}><X size={14} /></button></div>}
      </div>
    );
  }

  return (
    <div className="ask-form-card">
      <header><div><p>{currency} {price} · teen-card spread + poori reading</p><h2>Apna sawaal poochein</h2></div></header>
      <div className="booking-fields">
        <label className="wide"><span>Aapka naam</span><div><UserRound size={16} /><input value={clientName} onChange={(event) => setClientName(event.target.value)} placeholder="Poora naam" /></div></label>
        <label className="wide"><span>Aapka sawaal</span><textarea rows={4} maxLength={600} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Jaise: Mera career agle saal kaisa rahega?" /><small>{question.length}/600</small></label>
      </div>
      <button type="button" className="button ask-form-card__submit" disabled={drawing} onClick={drawCards}>
        {drawing ? "Cards khinchi ja rahi hain…" : "Cards Kholein"}
      </button>
      {error && <div className="toast"><Check size={15} />{error}<button onClick={() => setError("")}><X size={14} /></button></div>}
    </div>
  );
}
