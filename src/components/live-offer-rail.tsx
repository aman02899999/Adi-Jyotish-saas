"use client";

import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { ArrowRight, CalendarClock, Gift, MessageCircle, Moon, Sparkles, Star, Users } from "lucide-react";

const ICONS = { chat: MessageCircle, muhurat: CalendarClock, moon: Moon, gift: Gift, invite: Users, chart: Sparkles, rating: Star };

export type RailItem = { icon: keyof typeof ICONS; text: string; cta: string; href: string };

const ROTATE_MS = 4500;

/**
 * The homepage's self-running advert: one reason to act right now at a time, each built from live
 * data (who is online, today's muhurat, where the Moon is). Nothing here is invented; an item with
 * nothing true to say is left out by the page. It pauses while the visitor hovers or focuses it, or
 * switches tabs, and does not move at all for visitors who ask for reduced motion.
 */
export function LiveOfferRail({ items }: { items: RailItem[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || items.length < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") setIndex((current) => (current + 1) % items.length);
    }, ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [paused, items.length]);

  if (!items.length) return null;
  const item = items[index % items.length];
  const Icon = ICONS[item.icon];

  return (
    <section
      className="offer-rail"
      aria-label="Live now"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="shell offer-rail__inner">
        <span className="offer-rail__live"><i /> Live</span>
        <Link href={item.href} className="offer-rail__item" key={index}>
          <span className="offer-rail__icon"><Icon size={16} /></span>
          <span className="offer-rail__text">{item.text}</span>
          <span className="offer-rail__cta">{item.cta} <ArrowRight size={14} /></span>
        </Link>
        {items.length > 1 && (
          <div className="offer-rail__dots" role="tablist" aria-label="Choose an update">
            {items.map((entry, dot) => (
              <button key={entry.text} type="button" role="tab" aria-selected={dot === index % items.length} aria-label={`Update ${dot + 1} of ${items.length}`} onClick={() => { setIndex(dot); setPaused(true); }} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
