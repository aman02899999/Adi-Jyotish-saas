"use client";

import { useEffect, useRef } from "react";
import { animate, useInView, useMotionValue, useMotionValueEvent } from "motion/react";

/** Counts up from 0 to `value` once it scrolls into view. Renders the resting value up front so
 * there's no layout shift or blank state before the observer fires or for reduced-motion users. */
export function StatCounter({ value, decimals = 0, suffix = "" }: { value: number; decimals?: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const count = useMotionValue(0);

  useEffect(() => {
    if (!inView) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      count.set(value);
      return;
    }
    const controls = animate(count, value, { duration: 1.3, ease: [0.16, 1, 0.3, 1] });
    return () => controls.stop();
  }, [inView, value, count]);

  useMotionValueEvent(count, "change", (latest) => {
    if (ref.current) ref.current.textContent = `${latest.toFixed(decimals)}${suffix}`;
  });

  return <span ref={ref}>{(0).toFixed(decimals)}{suffix}</span>;
}
