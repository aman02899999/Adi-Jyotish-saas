"use client";

import { useState } from "react";
import { CloudRain, Flame, LoaderCircle, Meh, NotebookPen, Smile, Sparkles } from "lucide-react";

const MOODS = ["great", "good", "neutral", "low", "stressed"] as const;
type Mood = (typeof MOODS)[number];
const MOOD_LABELS: Record<Mood, string> = { great: "Great", good: "Good", neutral: "Neutral", low: "Low", stressed: "Stressed" };
const MOOD_ICONS: Record<Mood, typeof Smile> = { great: Sparkles, good: Smile, neutral: Meh, low: CloudRain, stressed: Flame };
const HOUSE_LABELS: Record<number, string> = {
  1: "self & instincts", 2: "money & family", 3: "courage & communication", 4: "home & emotional comfort",
  5: "creativity & romance", 6: "work & daily friction", 7: "partnership", 8: "deep, private matters",
  9: "belief & the bigger picture", 10: "career & public life", 11: "gains & friendships", 12: "rest & release",
};

type JournalEntry = { id: string; entryDate: string; mood: Mood; note: string; moonHouse: number | null };
type MoodInsight = { house: number; negativeCount: number; totalInHouse: number } | null;

function formatEntryDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric" });
}

export function JournalWidget({ initialEntries, initialInsight }: { initialEntries: JournalEntry[]; initialInsight: MoodInsight }) {
  const [entries, setEntries] = useState(initialEntries);
  const [insight, setInsight] = useState(initialInsight);
  const [mood, setMood] = useState<Mood | null>(null);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function submit() {
    if (!mood) { setError("Pick a mood first."); return; }
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mood, note }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save your entry.");
      setEntries(data.entries);
      setInsight(data.insight);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="journal-widget">
      <div className="journal-log">
        <p className="journal-log__prompt">How are you feeling today?</p>
        <div className="journal-mood-picker">
          {MOODS.map((option) => {
            const Icon = MOOD_ICONS[option];
            return (
              <button key={option} type="button" className={mood === option ? "journal-mood journal-mood--active" : "journal-mood"} onClick={() => setMood(option)}>
                <Icon size={20} /><span>{MOOD_LABELS[option]}</span>
              </button>
            );
          })}
        </div>
        <textarea placeholder="Anything on your mind? (optional)" value={note} onChange={(event) => setNote(event.target.value)} maxLength={280} rows={2} />
        <button type="button" className="button button--small" disabled={loading} onClick={submit}>
          {loading ? <><LoaderCircle size={14} className="spin" /> Saving…</> : saved ? "Saved!" : "Log today's mood"}
        </button>
        {error && <p className="journal-error">{error}</p>}
      </div>

      {insight && (
        <div className="journal-insight">
          <Sparkles size={16} />
          <p>Across your entries, low and stressed moods show up more often when the Moon is transiting your <strong>{HOUSE_LABELS[insight.house]}</strong> house ({insight.negativeCount} of {insight.totalInHouse} entries there). Worth noticing next time it comes around.</p>
        </div>
      )}

      {entries.length > 0 ? (
        <div className="journal-timeline">
          {entries.slice(0, 10).map((entry) => {
            const Icon = MOOD_ICONS[entry.mood];
            return (
              <div key={entry.id} className="journal-entry">
                <div className="journal-entry__icon"><Icon size={16} /></div>
                <div>
                  <div className="journal-entry__head"><strong>{MOOD_LABELS[entry.mood]}</strong><small>{formatEntryDate(entry.entryDate)}</small></div>
                  {entry.note && <p>{entry.note}</p>}
                  {entry.moonHouse && <span className="journal-entry__tag">Moon in your {HOUSE_LABELS[entry.moonHouse]} house</span>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="consultation-empty"><NotebookPen size={26} /><h3>No entries yet</h3><p>Log your first mood above to start your timeline — patterns show up after a few entries.</p></div>
      )}
    </div>
  );
}
