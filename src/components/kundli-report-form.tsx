"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { CalendarDays, Check, Clock3, LoaderCircle, MapPin, Sparkles, UserRound, X } from "lucide-react";
import { openRazorpayCheckout } from "@/lib/razorpay-checkout";

type MemberPrefill = { name: string; email: string; birthDate: string | null; birthTime: string | null; birthPlace: string | null };

const SECTION_HEADINGS = ["Overview", "Career & Purpose", "Relationships", "Health & Wellbeing", "Wealth & Guidance", "Doshas", "Planetary Positions"];

function parseSections(text: string): Array<{ heading: string | null; paragraphs: string[] }> {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const sections: Array<{ heading: string | null; paragraphs: string[] }> = [];
  let current: { heading: string | null; paragraphs: string[] } = { heading: null, paragraphs: [] };

  for (const line of lines) {
    const heading = SECTION_HEADINGS.find((candidate) => line.replace(/\*\*/g, "") === `${candidate}:` || line.replace(/\*\*/g, "").startsWith(`${candidate}:`));
    if (heading) {
      if (current.heading || current.paragraphs.length) sections.push(current);
      const rest = line.replace(/\*\*/g, "").slice(heading.length + 1).trim();
      current = { heading, paragraphs: rest ? [rest] : [] };
    } else {
      current.paragraphs.push(line);
    }
  }
  if (current.heading || current.paragraphs.length) sections.push(current);
  return sections.length ? sections : [{ heading: null, paragraphs: lines }];
}

export function KundliReportForm({ member, price, currency, onlinePaymentsAvailable }: {
  member: MemberPrefill | null;
  price: number;
  currency: string;
  onlinePaymentsAvailable: boolean;
}) {
  const [clientName, setClientName] = useState(member?.name ?? "");
  const [birthDate, setBirthDate] = useState(member?.birthDate ?? "");
  const [birthTime, setBirthTime] = useState(member?.birthTime ?? "");
  const [birthPlace, setBirthPlace] = useState(member?.birthPlace ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);

  if (!member) {
    return (
      <div className="ask-signin">
        <Sparkles size={26} />
        <h2>Sign in for your full report</h2>
        <p>Create a free account to submit birth details and receive your Kundli report in your dashboard.</p>
        <div className="ask-signin__actions">
          <Link href="/account?mode=register" className="button">Create your account</Link>
          <Link href="/account" className="button button--ghost">Sign in</Link>
        </div>
        <small>You&apos;ll land right back here to request your report.</small>
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
    if (!reportId) return;
    setWaiting(true);
    setError("");
    const response = await fetch(`/api/ai-readings/${reportId}/retry`, { method: "POST" });
    const data = await response.json();
    if (response.ok && data.answer) { setAnswer(data.answer); setWaiting(false); }
    else { setError(data.error || "Still preparing your report."); await pollForAnswer(reportId, 3); }
  }

  async function submit() {
    setError("");
    if (!clientName.trim() || !birthDate || !birthTime || !birthPlace.trim()) { setError("Please complete your name and exact birth date, time, and place."); return; }

    setLoading(true);
    try {
      const response = await fetch("/api/kundli-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientName, birthDate, birthTime, birthPlace }),
      });
      const data = await response.json();
      if (!response.ok || !data.orderId) throw new Error(data.error || "Your report could not be started.");
      setReportId(data.readingId);

      await openRazorpayCheckout({
        key: data.key,
        amount: data.amount,
        currency: data.currency,
        order_id: data.orderId,
        name: "Adi Jyotish Guru",
        description: `Full Kundli Report · ${currency} ${price}`,
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
      setError(caught instanceof Error ? caught.message : "Your report could not be started.");
      setLoading(false);
    }
  }

  if (answer) {
    const sections = parseSections(answer);
    return (
      <div className="ask-answer">
        <div className="ask-answer__badge"><Sparkles size={15} /> Your Kundli report is ready</div>
        <h2>From Shree Santram Shashtri</h2>
        <div className="ask-answer__body kundli-report">
          {sections.map((section, index) => (
            <div className="kundli-report__section" key={index}>
              {section.heading && <h3>{section.heading}</h3>}
              {section.paragraphs.map((paragraph, pIndex) => <p key={pIndex}>{paragraph}</p>)}
            </div>
          ))}
        </div>
        <div className="ask-answer__actions">
          <Link href="/dashboard/ai-readings" className="button button--ghost">View in your dashboard</Link>
          {reportId && <a href={`/api/ai-readings/${reportId}/pdf`} className="button">Download PDF</a>}
        </div>
      </div>
    );
  }

  if (waiting) {
    return (
      <div className="ask-waiting">
        <LoaderCircle size={26} className="spin" />
        <h2>Preparing your report…</h2>
        <p>Your payment is confirmed. Shree Santram Shashtri is studying your full chart — this usually takes under a minute.</p>
        <button type="button" className="button button--ghost" onClick={retryNow}>Check again</button>
      </div>
    );
  }

  return (
    <div className="ask-form-card">
      <header><div><p>{currency} {price} · your complete birth chart</p><h2>Tell Shree Santram Shashtri about yourself</h2></div></header>
      <div className="booking-fields">
        <label><span>Your name</span><div><UserRound size={16} /><input value={clientName} onChange={(event) => setClientName(event.target.value)} placeholder="Full name" /></div></label>
        <label><span>Birth date</span><div><CalendarDays size={16} /><input type="date" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} /></div></label>
        <label><span>Exact birth time</span><div><Clock3 size={16} /><input type="time" value={birthTime} onChange={(event) => setBirthTime(event.target.value)} /></div><small>Not sure? Enter your closest known time.</small></label>
        <label className="wide"><span>Birth place</span><div><MapPin size={16} /><input value={birthPlace} onChange={(event) => setBirthPlace(event.target.value)} placeholder="City, country" /></div></label>
      </div>
      <button type="button" className="button ask-form-card__submit" disabled={loading || !onlinePaymentsAvailable} onClick={submit}>
        {loading ? "Opening payment…" : `Pay ${currency} ${price} & get my report`}
      </button>
      {!onlinePaymentsAvailable && <p className="ask-form-card__note">Online payments are being configured — please check back shortly.</p>}
      {onlinePaymentsAvailable && <p className="ask-form-card__note">Secured by Razorpay — you&apos;ll only be charged after confirming.</p>}
      {error && <div className="toast"><Check size={15} />{error}<button onClick={() => setError("")}><X size={14} /></button></div>}
    </div>
  );
}
