"use client";

import { useEffect, useRef } from "react";

/** The homepage's hero visual: a looping brand video. Autoplay/loop/muted/playsInline covers the
 * common case with no JS at all; the IntersectionObserver here is a resume safety net for browsers
 * that pause background video (tab switches, battery-saver throttling, etc.) so it's always
 * playing again by the time the hero scrolls back into view. */
export function HeroVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const tryPlay = () => {
      video.play().catch(() => {
        // Autoplay can still be blocked in rare cases (e.g. data-saver mode) — the poster frame
        // stays visible then, which is a fine fallback for a purely decorative video.
      });
    };

    tryPlay();
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) tryPlay();
      },
      { threshold: 0.15 },
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="hero-video-frame">
      <video
        ref={videoRef}
        className="hero-video"
        poster="/images/homepage-hero-poster.jpg"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        aria-hidden="true"
      >
        <source src="/videos/homepage-hero.webm" type="video/webm" />
        <source src="/videos/homepage-hero.mp4" type="video/mp4" />
      </video>
    </div>
  );
}
