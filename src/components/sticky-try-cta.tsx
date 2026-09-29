"use client";

import { useEffect, useState } from "react";
import { ArrowUp, Sparkles } from "lucide-react";

/**
 * Keeps the homepage's first action one tap away once the visitor has scrolled past it: a slim bar
 * that brings them back to the free chart form. It hides while the form or the footer is on screen,
 * so it never covers either.
 */
export function StickyTryCta({ targetId = "free-chart" }: { targetId?: string }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const target = document.getElementById(targetId);
    const footer = document.querySelector("footer");
    if (!target) return;
    let pastTarget = false;
    let footerShowing = false;
    const update = () => setVisible(pastTarget && !footerShowing);
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === target) pastTarget = !entry.isIntersecting && entry.boundingClientRect.top < 0;
        else footerShowing = entry.isIntersecting;
      }
      update();
    });
    observer.observe(target);
    if (footer) observer.observe(footer);
    return () => observer.disconnect();
  }, [targetId]);

  function goToForm() {
    const target = document.getElementById(targetId);
    if (!target) return;
    target.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
    target.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
  }

  return (
    <div className={`sticky-try ${visible ? "sticky-try--on" : ""}`} aria-hidden={!visible}>
      <button type="button" className="sticky-try__button" onClick={goToForm} tabIndex={visible ? 0 : -1}>
        <Sparkles size={16} />
        <span><strong>Your birth chart, free</strong><small>About 10 seconds, no sign-up</small></span>
        <ArrowUp size={16} />
      </button>
    </div>
  );
}
