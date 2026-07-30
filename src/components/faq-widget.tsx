"use client";

import { useMemo, useState } from "react";
import { ChevronDown, MessageCircleQuestion, Search, X } from "lucide-react";
import type { FaqEntry } from "@/lib/faq-data";

export function FaqWidget({ faqs, title }: { faqs: FaqEntry[]; title: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return faqs;
    return faqs.filter((entry) =>
      entry.question.toLowerCase().includes(needle) ||
      entry.answer.toLowerCase().includes(needle) ||
      entry.category.toLowerCase().includes(needle)
    );
  }, [faqs, query]);

  const grouped = useMemo(() => {
    const byCategory = new Map<string, FaqEntry[]>();
    for (const entry of filtered) {
      const list = byCategory.get(entry.category) ?? [];
      list.push(entry);
      byCategory.set(entry.category, list);
    }
    return Array.from(byCategory.entries());
  }, [filtered]);

  return (
    <div className="faq-widget">
      {open && (
        <div className="faq-widget__panel">
          <header>
            <div><MessageCircleQuestion size={16} /><strong>{title}</strong></div>
            <button type="button" aria-label="Close help" onClick={() => setOpen(false)}><X size={16} /></button>
          </header>
          <label className="faq-widget__search"><Search size={14} /><input placeholder="Search a question…" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
          <div className="faq-widget__list">
            {grouped.length === 0 && <p className="faq-widget__empty">No matching questions — try a different word.</p>}
            {grouped.map(([category, entries]) => (
              <div key={category} className="faq-widget__category">
                <p>{category}</p>
                {entries.map((entry) => {
                  const isExpanded = expandedId === entry.id;
                  return (
                    <div key={entry.id} className={isExpanded ? "faq-widget__item faq-widget__item--open" : "faq-widget__item"}>
                      <button type="button" onClick={() => setExpandedId(isExpanded ? null : entry.id)}>
                        <span>{entry.question}</span>
                        <ChevronDown size={14} />
                      </button>
                      {isExpanded && <p>{entry.answer}</p>}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
      <button type="button" className="faq-widget__trigger" onClick={() => setOpen((current) => !current)} aria-label={open ? "Close help" : "Open help"}>
        {open ? <X size={20} /> : <MessageCircleQuestion size={20} />}
      </button>
    </div>
  );
}
