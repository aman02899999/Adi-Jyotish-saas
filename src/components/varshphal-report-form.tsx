"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { Check, LoaderCircle, Sparkles, X } from "lucide-react";
import { openRazorpayCheckout } from "@/lib/razorpay-checkout";

type MemberPrefill = { name: string; email: string; birthDate: string | null; birthTime: string | null; birthPlace: string | null };

const SECTION_HEADINGS = ["Overview", "Career & Public Life", "Relationships", "Wealth & Growth", "This Year's Planetary Positions"];

function parseSections(text: string): Array<{ heading: string | null; paragraphs: string[] }> {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const sections: Array<{ heading: string | null; paragraphs: string[] }> = [];
  let current: { heading: string | null; paragraphs: string[] } = { heading: null, paragraphs: [] };

  for (const line of lines) {
    const heading = SECTION_HEADINGS.find((candidate) => line === `${candidate}:` || line.startsWith(`${candidate}:`));
    if (heading) {
      if (current.heading || current.paragraphs.length) sections.push(current);
      const rest = line.slice(heading.length + 1).trim();
      current = { heading, paragraphs: rest ? [rest] : [] };
    } else {
      current.paragraphs.push(line);
    }
  }
  if (current.heading || current.paragraphs.length) sections.push(current);
  return sections.length ? sections : [{ heading: null, paragraphs: lines }];
}

export function VarshphalReportForm({ member, price, currency, onlinePaymentsAvailable }: {
  member: MemberPrefill | null;
  price: number;
  currency: string;
  onlinePaymentsAvailable: boolean;
}) {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);

  if (!member) {
    return (
      <div className="ask-signin">
        <Sparkles size={26} />
        <h2>Sign in for your Varshphal</h2>
        <p>Create a free account to generate your annual solar-return report.</p>
        <div className="ask-signin__actions">
          <Link href="/account?mode=register" className="button">Create your account</Link>
          <Link href="/account" className="button button--ghost">Sign in</Link>
        </div>
      </div>
    );
  }

  if (!member.birthDate || !member.birthTime || !member.birthPlace) {
    return (
      <div className="ask-signin">
        <Sparkles size={26} />
        <h2>Complete your birth profile first</h2>
        <p>Varshphal needs your exact birth date, time, and place to find your Sun&rsquo;s real return moment.</p>
        <Link href="/onboarding" className="button">Complete birth profile</Link>
      </div>
    );
  }

  const { name: clientName, email: memberEmail, birthDate, birthTime, birthPlace } = member;

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
    setLoading(true);
    try {
      const response = await fetch("/api/varshphal-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientName, birthDate, birthTime, birthPlace, year }),
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
        description: `Varshphal Report ${year} · ${currency} ${price}`,
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
        <div className="ask-answer__badge"><Sparkles size={15} /> Your {year} Varshphal is ready</div>
        <h2>Your annual solar-return report</h2>
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
        </div>
      </div>
    );
  }

  if (waiting) {
    return (
      <div className="ask-waiting">
        <LoaderCircle size={26} className="spin" />
        <h2>Finding your Sun&rsquo;s return moment…</h2>
        <p>Your payment is confirmed. We&rsquo;re computing the exact instant your Sun returns to its natal position this year — usually under a minute.</p>
        <button type="button" className="button button--ghost" onClick={retryNow}>Check again</button>
      </div>
    );
  }

  return (
    <div className="ask-form-card">
      <header><div><p>{currency} {price} · your annual solar-return chart</p><h2>Get your Varshphal</h2></div></header>
      <div className="gift-amount-picker">
        <button type="button" className={year === currentYear ? "active" : ""} onClick={() => setYear(currentYear)}>{currentYear}</button>
        <button type="button" className={year === currentYear + 1 ? "active" : ""} onClick={() => setYear(currentYear + 1)}>{currentYear + 1}</button>
      </div>
      <p className="legal-note">Computed for {clientName}, using your saved birth profile ({birthPlace}). Update it in <Link href="/onboarding">your birth profile</Link> if anything&rsquo;s changed.</p>
      <button type="button" className="button ask-form-card__submit" disabled={loading || !onlinePaymentsAvailable} onClick={submit}>
        {loading ? "Opening payment…" : `Pay ${currency} ${price} & get my ${year} Varshphal`}
      </button>
      {!onlinePaymentsAvailable && <p className="ask-form-card__note">Online payments are being configured — please check back shortly.</p>}
      {error && <div className="toast"><Check size={15} />{error}<button onClick={() => setError("")}><X size={14} /></button></div>}
    </div>
  );
}
