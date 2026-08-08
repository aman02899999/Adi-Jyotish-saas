"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Check, LoaderCircle, ScanFace, Sparkles, UploadCloud, UserRound, X } from "lucide-react";
import { openRazorpayCheckout } from "@/lib/razorpay-checkout";

type MemberPrefill = { name: string; email: string };

/** Same client-side compression rationale as the palm-reading form — phone camera photos easily
 * run 4-8MB, and serverless request-body limits (as well as plain upload speed) make that worth
 * avoiding. */
async function compressImage(file: File, maxDimension = 1600, quality = 0.85): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, width, height);
  const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) return file;
  return new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" });
}

export function FaceReadingForm({ member, price, currency, onlinePaymentsAvailable }: {
  member: MemberPrefill | null;
  price: number;
  currency: string;
  onlinePaymentsAvailable: boolean;
}) {
  const [clientName, setClientName] = useState(member?.name ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [readingId, setReadingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  if (!member) {
    return (
      <div className="ask-signin">
        <ScanFace size={26} />
        <h2>Face reading ke liye sign in karein</h2>
        <p>Ek free account banayein taaki aap apni tasveer bhej saken aur apni report seedhe apne dashboard mein pa saken.</p>
        <div className="ask-signin__actions">
          <Link href="/account?mode=register" className="button">Account banayein</Link>
          <Link href="/account" className="button button--ghost">Sign in</Link>
        </div>
        <small>Payment ke baad aap yahin wapas aa jaayenge.</small>
      </div>
    );
  }

  const memberEmail = member.email;

  async function pickFile(picked: File) {
    setError("");
    const compressed = await compressImage(picked);
    setFile(compressed);
    setPreview(URL.createObjectURL(compressed));
  }

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
    if (!clientName.trim()) { setError("Please apna naam likhein."); return; }
    if (!file) { setError("Apni chehre ki tasveer upload karna zaroori hai."); return; }

    setLoading(true);
    try {
      const form = new FormData();
      form.set("clientName", clientName);
      form.set("faceImage", file);
      const response = await fetch("/api/ai-readings/face", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok || !data.orderId) throw new Error(data.error || "Aapki report shuru nahi ho saki.");
      setReadingId(data.readingId);

      await openRazorpayCheckout({
        key: data.key,
        amount: data.amount,
        currency: data.currency,
        order_id: data.orderId,
        name: "Jyotish Studio",
        description: `Acharya Devraj Bhardwaj · ${currency} ${price}`,
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
        <h2>Acharya Devraj Bhardwaj ki taraf se</h2>
        <div className="ask-answer__body">
          {answer.split("\n").filter((line) => line.trim()).map((line, index) => {
            const boldMatch = line.match(/^\*\*(.+?)\*\*\s*(.*)$/);
            if (boldMatch) return <p key={index}><strong>{boldMatch[1]}</strong>{boldMatch[2] ? ` ${boldMatch[2]}` : ""}</p>;
            return <p key={index}>{line.replace(/\*\*/g, "")}</p>;
          })}
        </div>
        <div className="ask-answer__actions">
          <Link href="/dashboard/ai-readings" className="button button--ghost">Dashboard mein dekhein</Link>
          <button type="button" className="button" onClick={() => { setAnswer(null); setFile(null); setPreview(null); setReadingId(null); }}>Nayi reading lein</button>
        </div>
      </div>
    );
  }

  if (waiting) {
    return (
      <div className="ask-waiting">
        <LoaderCircle size={26} className="spin" />
        <h2>Aapka chehra padha ja raha hai…</h2>
        <p>Aapka payment confirm ho gaya hai. Acharya Devraj Bhardwaj aapke Mukh Samudrik ka dhyan se adhyayan kar rahe hain — usually ek minute se kam samay lagta hai.</p>
        <button type="button" className="button button--ghost" onClick={retryNow}>Dobara check karein</button>
      </div>
    );
  }

  return (
    <div className="ask-form-card">
      <header><div><p>{currency} {price} · poori Mukh Samudrik report</p><h2>Apni chehre ki tasveer bhejein</h2></div></header>
      <div className="booking-fields">
        <label className="wide"><span>Aapka naam</span><div><UserRound size={16} /><input value={clientName} onChange={(event) => setClientName(event.target.value)} placeholder="Poora naam" /></div></label>
      </div>
      <div className="palm-upload-slot" onClick={() => inputRef.current?.click()}>
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => { const picked = event.target.files?.[0]; if (picked) pickFile(picked); }} />
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- a local object: URL preview, not a next/image-eligible remote asset
          <img src={preview} alt="Face preview" className="palm-upload-slot__preview" />
        ) : (
          <UploadCloud size={26} />
        )}
        <strong>Chehre ki tasveer</strong>
        <span>{file ? file.name : "Yahan click karke photo chunein"}</span>
      </div>
      <p className="palm-upload-tip">Tip: acchi roshni mein, seedhe camera ki taraf dekhkar, bina chashme/topi ke photo lein — jitni saaf tasveer, utni behtar reading.</p>
      <button type="button" className="button ask-form-card__submit" disabled={loading || !onlinePaymentsAvailable} onClick={submit}>
        {loading ? "Taiyaar ho raha hai…" : `Pay ${currency} ${price} & meri report paayein`}
      </button>
      {!onlinePaymentsAvailable && <p className="ask-form-card__note">Online payments abhi configure ho rahe hain — kripya thodi der baad try karein.</p>}
      {error && <div className="toast"><Check size={15} />{error}<button onClick={() => setError("")}><X size={14} /></button></div>}
    </div>
  );
}
