"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Mail, MessageCircle, Share2 } from "lucide-react";

/** One-tap sharing to WhatsApp, X, Facebook, email, or clipboard — plus the native share sheet
 * where the browser supports it. Pure client-side, no API keys or external accounts needed. */
export function ShareButtons({ url, title, text }: { url: string; title: string; text?: string }) {
  const [copied, setCopied] = useState(false);
  // Detected after mount only — navigator.share support must match the server's markup-less
  // render on first paint, or React flags a hydration mismatch.
  const [canNativeShare, setCanNativeShare] = useState(false);
  useEffect(() => {
    const supported = typeof navigator !== "undefined" && "share" in navigator;
    Promise.resolve().then(() => setCanNativeShare(supported));
  }, []);
  const shareText = text ?? title;

  function copyLink() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  async function nativeShare() {
    try {
      await navigator.share({ title, text: shareText, url });
    } catch {
      // User cancelled the share sheet — nothing to do.
    }
  }

  return (
    <div className="share-buttons">
      {canNativeShare && (
        <button type="button" onClick={nativeShare} aria-label="Share"><Share2 size={16} /> Share</button>
      )}
      <a href={`https://wa.me/?text=${encodeURIComponent(`${shareText} ${url}`)}`} target="_blank" rel="noopener noreferrer" aria-label="Share on WhatsApp"><MessageCircle size={16} /> WhatsApp</a>
      <a href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(shareText)}`} target="_blank" rel="noopener noreferrer" aria-label="Share on X">𝕏</a>
      <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`} target="_blank" rel="noopener noreferrer" aria-label="Share on Facebook">f</a>
      <a href={`mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(`${shareText}\n\n${url}`)}`} aria-label="Share by email"><Mail size={16} /></a>
      <button type="button" onClick={copyLink} aria-label="Copy link">{copied ? <Check size={16} /> : <Copy size={16} />} {copied ? "Copied" : "Copy link"}</button>
    </div>
  );
}
