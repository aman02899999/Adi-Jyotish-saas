"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { ArrowRight, Loader2 } from "lucide-react";

type Sign = { key: string; name: string; symbol: string };
type Period = "today" | "tomorrow" | "week" | "month";

const PERIOD_LABELS: Record<Period, string> = { today: "Today", tomorrow: "Tomorrow", week: "This week", month: "This month" };

export function HomeHoroscopeTeaser({
  signs,
  initialSign,
  initialContent,
  initialDateLabel,
}: {
  signs: Sign[];
  initialSign: string;
  initialContent: string;
  initialDateLabel: string;
}) {
  const [sign, setSign] = useState(initialSign);
  const [period, setPeriod] = useState<Period>("today");
  const [content, setContent] = useState(initialContent);
  const [dateLabel, setDateLabel] = useState(initialDateLabel);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load(nextSign: string, nextPeriod: Period) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/horoscope/${nextSign}?period=${nextPeriod}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Reading could not be loaded.");
      setContent(data.content);
      setDateLabel(data.dateLabel ?? data.date ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reading could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  function pickSign(key: string) {
    if (key === sign) return;
    setSign(key);
    load(key, period);
  }

  function pickPeriod(next: Period) {
    if (next === period) return;
    setPeriod(next);
    load(sign, next);
  }

  const active = signs.find((entry) => entry.key === sign) ?? signs[0];

  return (
    <div className="horoscope-teaser">
      <div className="horoscope-teaser__signs" role="tablist" aria-label="Choose your zodiac sign">
        {signs.map((entry) => (
          <button key={entry.key} type="button" className={entry.key === sign ? "active" : ""} onClick={() => pickSign(entry.key)} aria-pressed={entry.key === sign}>
            <span>{entry.symbol}</span>
            <small>{entry.name}</small>
          </button>
        ))}
      </div>

      <div className="horoscope-teaser__panel">
        <div className="horoscope-teaser__tabs" role="tablist" aria-label="Choose a time period">
          {(Object.keys(PERIOD_LABELS) as Period[]).map((key) => (
            <button key={key} type="button" className={key === period ? "active" : ""} onClick={() => pickPeriod(key)} aria-pressed={key === period}>
              {PERIOD_LABELS[key]}
            </button>
          ))}
        </div>

        <div className="horoscope-teaser__body">
          <div className="horoscope-teaser__head">
            <span className="horoscope-teaser__symbol">{active.symbol}</span>
            <div><small>{dateLabel}</small><strong>{active.name}</strong></div>
          </div>
          {loading ? (
            <p className="horoscope-teaser__loading"><Loader2 size={15} className="spin" /> Reading the sky…</p>
          ) : error ? (
            <p className="horoscope-teaser__loading">{error}</p>
          ) : (
            content.split(/\n{2,}/).map((paragraph, index) => <p key={index}>{paragraph}</p>)
          )}
        </div>

        <Link href={`/horoscope?sign=${sign}`} className="horoscope-teaser__cta">Read the full daily horoscope <ArrowRight size={15} /></Link>
      </div>
    </div>
  );
}
