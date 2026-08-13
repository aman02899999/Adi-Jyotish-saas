"use client";

import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { Layers, MessageCircle, ScrollText, Sparkles, Users, X } from "lucide-react";

const STORAGE_KEY = "adiJyotish:startHereSeen";

const OPTIONS = [
  { icon: Sparkles, title: "Get today’s free horoscope", note: "Pick your sign, see today’s sky", href: "/horoscope" },
  { icon: MessageCircle, title: "Ask one question, get an answer", note: "Your first reading is free", href: "/ask" },
  { icon: Users, title: "Talk to a live astrologer", note: "Book a call or start a chat session", href: "/astrologers" },
  { icon: ScrollText, title: "Get my full birth chart", note: "A complete Kundli report", href: "/kundli" },
  { icon: Layers, title: "Just show me everything", note: "Browse every reading & tool", href: "/#tools" },
];

/** A one-time, dismissible "what do you need?" prompt shown to first-time homepage visitors —
 * routes them straight to the right tool instead of leaving them to parse the full nav. Remembers
 * dismissal (any close action, or picking an option) in localStorage so it never shows twice. */
export function StartHerePicker() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY)) return;
    } catch {
      return; // storage blocked (private browsing etc.) — skip the prompt rather than risk showing it every visit
    }
    const timer = setTimeout(() => setOpen(true), 900);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") dismiss();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function dismiss() {
    setOpen(false);
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // nothing to fall back to — worst case the prompt reappears next visit
    }
  }

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={dismiss} role="presentation">
      <div
        className="start-here-card"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="start-here-title"
      >
        <div className="modal-header">
          <div>
            <p>Welcome</p>
            <h2 id="start-here-title">What brings you here today?</h2>
          </div>
          <button type="button" onClick={dismiss} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="start-here-grid">
          {OPTIONS.map((option) => {
            const Icon = option.icon;
            return (
              <Link key={option.title} href={option.href} className="start-here-option" onClick={dismiss}>
                <span className="start-here-option__icon">
                  <Icon size={19} strokeWidth={1.6} />
                </span>
                <span>
                  <strong>{option.title}</strong>
                  <small>{option.note}</small>
                </span>
              </Link>
            );
          })}
        </div>
        <button type="button" className="start-here-skip" onClick={dismiss}>
          I&rsquo;ll explore on my own
        </button>
      </div>
    </div>
  );
}
