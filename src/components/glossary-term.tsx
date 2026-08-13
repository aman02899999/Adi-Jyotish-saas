"use client";

import { useEffect, useId, useRef, useState } from "react";
import { GLOSSARY, type GlossaryKey } from "@/lib/glossary";

/** Wraps a Sanskrit/Jyotish word with a tap-or-hover explainer so a first-time visitor never has to
 * leave the page to understand it. Click/tap toggles the popover (works identically on touch and
 * desktop); closes on outside click or Escape. `children` overrides the displayed label — the
 * glossary key still controls which definition shows. */
export function GlossaryTerm({ termKey, children }: { termKey: GlossaryKey; children?: React.ReactNode }) {
  const entry = GLOSSARY[termKey];
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const popoverId = useId();

  useEffect(() => {
    if (!open) return;
    function onOutside(event: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false);
    }
    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onOutside);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("pointerdown", onOutside);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  return (
    <span className="glossary-term" ref={wrapRef}>
      <button
        type="button"
        className="glossary-term__trigger"
        aria-expanded={open}
        aria-describedby={open ? popoverId : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        {children ?? entry.term}
      </button>
      {open && (
        <span role="tooltip" id={popoverId} className="glossary-term__popover">
          <strong>{entry.term}</strong>
          <span>{entry.definition}</span>
        </span>
      )}
    </span>
  );
}
