"use client";

import { useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import { Check, LoaderCircle, Plus, ScanFace, Sparkles, UploadCloud, UserRound, X } from "lucide-react";
import { openRazorpayCheckout } from "@/lib/razorpay-checkout";
import { walletShortfallMessage } from "@/components/wallet-pay";
import { ReadingShareNudge } from "@/components/reading-share-nudge";

type MemberPrefill = { name: string; email: string };
type FacePhoto = { file: File; preview: string };

const MAX_PHOTOS = 5;

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
  const [question, setQuestion] = useState("");
  const [photos, setPhotos] = useState<FacePhoto[]>([]);
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
        <p>Ek free account banayein taaki aap apni tasveerein bhej saken aur apni report seedhe apne dashboard mein pa saken.</p>
        <div className="ask-signin__actions">
          <Link href="/account?mode=register" className="button">Account banayein</Link>
          <Link href="/account" className="button button--ghost">Sign in</Link>
        </div>
        <small>Payment ke baad aap yahin wapas aa jaayenge.</small>
      </div>
    );
  }

  const memberEmail = member.email;

  async function pickFiles(picked: FileList) {
    setError("");
    const remaining = MAX_PHOTOS - photos.length;
    if (remaining <= 0) { setError(`Aap zyada se zyada ${MAX_PHOTOS} tasveerein bhej sakte hain.`); return; }
    const toAdd = Array.from(picked).slice(0, remaining);
    const compressed = await Promise.all(toAdd.map(async (file) => {
      const compressedFile = await compressImage(file);
      return { file: compressedFile, preview: URL.createObjectURL(compressedFile) };
    }));
    setPhotos((current) => [...current, ...compressed]);
  }

  function removePhoto(index: number) {
    setPhotos((current) => current.filter((_, i) => i !== index));
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
    if (photos.length === 0) { setError("Kam se kam ek chehre ki tasveer upload karna zaroori hai."); return; }

    setLoading(true);
    try {
      const form = new FormData();
      form.set("clientName", clientName);
      form.set("question", question);
      for (const photo of photos) form.append("faceImages", photo.file);
      const response = await fetch("/api/ai-readings/face", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Aapki report shuru nahi ho saki.");
      if (!data.orderId) {
        // No card order means Razorpay is not configured on this deployment — settle from the
        // member's wallet instead. A short balance comes back as a 402 naming the exact top-up.
        const walletPay = await fetch(`/api/ai-readings/${data.readingId}/pay-from-wallet`, { method: "POST" });
        const walletData = await walletPay.json();
        if (walletPay.ok) {
          if (walletData.answer) { setAnswer(walletData.answer); setLoading(false); return; }
          setWaiting(true); setLoading(false); await pollForAnswer(data.readingId, 6); return;
        }
        throw new Error(walletShortfallMessage(walletData) ?? walletData.error ?? "Aapki report shuru nahi ho saki.");
      }
      setReadingId(data.readingId);

      await openRazorpayCheckout({
        key: data.key,
        amount: data.amount,
        currency: data.currency,
        order_id: data.orderId,
        name: "Adi Jyotish Guru",
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
        <ReadingShareNudge
          path="/face-reading"
          shareTitle="I just got my face read by Acharya Devraj Bhardwaj"
          shareText="I just got my face read by Acharya Devraj Bhardwaj on Adi Jyotish Guru — try it:"
        />
        <div className="ask-answer__actions">
          <Link href="/dashboard/ai-readings" className="button button--ghost">Dashboard mein dekhein</Link>
          <button type="button" className="button" onClick={() => { setAnswer(null); setPhotos([]); setQuestion(""); setReadingId(null); }}>Nayi reading lein</button>
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
      <header><div><p>{currency} {price} · poori Mukh Samudrik report</p><h2>Apni chehre ki tasveerein bhejein</h2></div></header>
      <div className="booking-fields">
        <label className="wide"><span>Aapka naam</span><div><UserRound size={16} /><input value={clientName} onChange={(event) => setClientName(event.target.value)} placeholder="Poora naam" /></div></label>
      </div>

      <div className="face-upload-grid">
        {photos.map((photo, index) => (
          <div className="face-upload-tile face-upload-tile--filled" key={photo.preview}>
            {/* eslint-disable-next-line @next/next/no-img-element -- a local object: URL preview, not a next/image-eligible remote asset */}
            <img src={photo.preview} alt={`Chehra tasveer ${index + 1}`} className="face-upload-tile__preview" />
            <button type="button" className="face-upload-tile__remove" aria-label="Tasveer hataayein" onClick={() => removePhoto(index)}><X size={13} /></button>
          </div>
        ))}
        {photos.length < MAX_PHOTOS && (
          <div className="face-upload-tile face-upload-tile--empty" onClick={() => inputRef.current?.click()}>
            <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(event) => { if (event.target.files?.length) pickFiles(event.target.files); event.target.value = ""; }} />
            {photos.length === 0 ? <UploadCloud size={22} /> : <Plus size={22} />}
            <span>{photos.length === 0 ? "Photo chunein" : "Aur jodein"}</span>
          </div>
        )}
      </div>
      <p className="palm-upload-tip">Tip: 1 se {MAX_PHOTOS} tak tasveerein bhej sakte hain (alag angles jitna behtar) — acchi roshni mein, seedhe camera ki taraf dekhkar, bina chashme/topi ke photo lein.</p>

      <label className="wide" style={{ marginTop: 16 }}><span>Aapka sawaal (agar koi ho)</span><textarea rows={3} maxLength={600} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Jaise: Mera career kaisa rahega? Ya koi khaas sawaal jo aap Acharya ji se poochna chahte hain." /><small>{question.length}/600</small></label>

      <button type="button" className="button ask-form-card__submit" disabled={loading || !onlinePaymentsAvailable} onClick={submit}>
        {loading ? "Taiyaar ho raha hai…" : `Pay ${currency} ${price} & meri report paayein`}
      </button>
      {!onlinePaymentsAvailable && <p className="ask-form-card__note">Online payments abhi configure ho rahe hain — kripya thodi der baad try karein.</p>}
      {onlinePaymentsAvailable && <p className="ask-form-card__note">Secured by Razorpay — aapse sirf confirm karne ke baad hi charge hoga.</p>}
      {error && <div className="toast"><Check size={15} />{error}<button onClick={() => setError("")}><X size={14} /></button></div>}
    </div>
  );
}
