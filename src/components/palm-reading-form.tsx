"use client";

import { useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import { Check, Hand, LoaderCircle, Sparkles, UploadCloud, UserRound, X } from "lucide-react";
import { openRazorpayCheckout } from "@/lib/razorpay-checkout";
import { ReadingShareNudge } from "@/components/reading-share-nudge";

type MemberPrefill = { name: string; email: string };
type PalmSlot = "left" | "right";

/** Downscales and re-encodes a palm photo client-side before upload — phone camera photos easily
 * run 4-8MB, and serverless request-body limits (as well as plain upload speed) make that worth
 * avoiding. 1600px on the long edge is comfortably enough resolution for line detail while
 * keeping the file in the low hundreds of KB to a couple MB range. */
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

function UploadSlot({ label, hint, file, previewUrl, onSelect }: {
  label: string;
  hint: string;
  file: File | null;
  previewUrl: string | null;
  onSelect: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="palm-upload-slot" onClick={() => inputRef.current?.click()}>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => { const picked = event.target.files?.[0]; if (picked) onSelect(picked); }} />
      {previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- a local object: URL preview, not a next/image-eligible remote asset
        <img src={previewUrl} alt={`${label} preview`} className="palm-upload-slot__preview" />
      ) : (
        <UploadCloud size={26} />
      )}
      <strong>{label}</strong>
      <span>{file ? file.name : hint}</span>
    </div>
  );
}

export function PalmReadingForm({ member, price, originalPrice, currency, onlinePaymentsAvailable }: {
  member: MemberPrefill | null;
  price: number;
  originalPrice: number;
  currency: string;
  onlinePaymentsAvailable: boolean;
}) {
  const [clientName, setClientName] = useState(member?.name ?? "");
  const [leftFile, setLeftFile] = useState<File | null>(null);
  const [rightFile, setRightFile] = useState<File | null>(null);
  const [leftPreview, setLeftPreview] = useState<string | null>(null);
  const [rightPreview, setRightPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [readingId, setReadingId] = useState<string | null>(null);

  if (!member) {
    return (
      <div className="ask-signin">
        <Hand size={26} />
        <h2>Palm reading ke liye sign in karein</h2>
        <p>Ek free account banayein taaki aap apni hatheliyon ki tasveer bhej saken aur apni report seedhe apne dashboard mein pa saken.</p>
        <div className="ask-signin__actions">
          <Link href="/account?mode=register" className="button">Account banayein</Link>
          <Link href="/account" className="button button--ghost">Sign in</Link>
        </div>
        <small>Payment ke baad aap yahin wapas aa jaayenge.</small>
      </div>
    );
  }

  const memberEmail = member.email;

  async function pickSlot(slot: PalmSlot, picked: File) {
    setError("");
    const compressed = await compressImage(picked);
    const url = URL.createObjectURL(compressed);
    if (slot === "left") { setLeftFile(compressed); setLeftPreview(url); }
    else { setRightFile(compressed); setRightPreview(url); }
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
    if (!leftFile || !rightFile) { setError("Dono haathon ki tasveer upload karna zaroori hai."); return; }

    setLoading(true);
    try {
      const form = new FormData();
      form.set("clientName", clientName);
      form.set("leftPalmImage", leftFile);
      form.set("rightPalmImage", rightFile);
      const response = await fetch("/api/ai-readings/palm", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok || !data.orderId) throw new Error(data.error || "Aapki report shuru nahi ho saki.");
      setReadingId(data.readingId);

      await openRazorpayCheckout({
        key: data.key,
        amount: data.amount,
        currency: data.currency,
        order_id: data.orderId,
        name: "Adi Jyotish Guru",
        description: `Pandit Trilochan Shashtri · ${currency} ${price}`,
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
        <h2>Pandit Trilochan Shashtri ki taraf se</h2>
        <div className="ask-answer__body">
          {answer.split("\n").filter((line) => line.trim()).map((line, index) => {
            const boldMatch = line.match(/^\*\*(.+?)\*\*\s*(.*)$/);
            if (boldMatch) return <p key={index}><strong>{boldMatch[1]}</strong>{boldMatch[2] ? ` ${boldMatch[2]}` : ""}</p>;
            return <p key={index}>{line.replace(/\*\*/g, "")}</p>;
          })}
        </div>
        <ReadingShareNudge
          path="/palm-reading"
          shareTitle="I just got my palm read by Pandit Trilochan Shashtri"
          shareText="I just got my palm read by Pandit Trilochan Shashtri on Adi Jyotish Guru — try it:"
        />
        <div className="ask-answer__actions">
          <Link href="/dashboard/ai-readings" className="button button--ghost">Dashboard mein dekhein</Link>
          <button type="button" className="button" onClick={() => { setAnswer(null); setLeftFile(null); setRightFile(null); setLeftPreview(null); setRightPreview(null); setReadingId(null); }}>Nayi reading lein</button>
        </div>
      </div>
    );
  }

  if (waiting) {
    return (
      <div className="ask-waiting">
        <LoaderCircle size={26} className="spin" />
        <h2>Aapki hatheli padhi ja rahi hai…</h2>
        <p>Aapka payment confirm ho gaya hai. Pandit Trilochan Shashtri aapke hast rekha ka dhyan se adhyayan kar rahe hain — usually ek minute se kam samay lagta hai.</p>
        <button type="button" className="button button--ghost" onClick={retryNow}>Dobara check karein</button>
      </div>
    );
  }

  return (
    <div className="ask-form-card">
      <header><div><p>{currency} {price} · dono hatheliyon ki poori report</p><h2>Apni hatheliyon ki tasveer bhejein</h2></div></header>
      <div className="booking-fields">
        <label className="wide"><span>Aapka naam</span><div><UserRound size={16} /><input value={clientName} onChange={(event) => setClientName(event.target.value)} placeholder="Poora naam" /></div></label>
      </div>
      <div className="palm-upload-grid">
        <UploadSlot label="Bayan Haath (Left Palm)" hint="Yahan click karke photo chunein" file={leftFile} previewUrl={leftPreview} onSelect={(file) => pickSlot("left", file)} />
        <UploadSlot label="Dayan Haath (Right Palm)" hint="Yahan click karke photo chunein" file={rightFile} previewUrl={rightPreview} onSelect={(file) => pickSlot("right", file)} />
      </div>
      <p className="palm-upload-tip">Tip: acchi roshni mein, hatheli poori tarah khuli hui, camera ke seedhe saamne rakhkar photo lein — jitni saaf tasveer, utni behtar reading.</p>
      <button type="button" className="button ask-form-card__submit" disabled={loading || !onlinePaymentsAvailable} onClick={submit}>
        {loading ? "Taiyaar ho raha hai…" : `Pay ${currency} ${price} & meri report paayein`}
      </button>
      {!onlinePaymentsAvailable && <p className="ask-form-card__note">Online payments abhi configure ho rahe hain — kripya thodi der baad try karein.</p>}
      {onlinePaymentsAvailable && <p className="ask-form-card__note">Secured by Razorpay — aapse sirf confirm karne ke baad hi charge hoga.</p>}
      {error && <div className="toast"><Check size={15} />{error}<button onClick={() => setError("")}><X size={14} /></button></div>}
    </div>
  );
}
