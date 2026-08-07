"use client";

import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";

/** The homepage's hero visual: a looping brand video with sound available on tap. Browsers block
 * autoplay-with-audio everywhere without a prior user gesture, so it starts muted (the only way
 * autoplay is reliable at all) and exposes a visible toggle so a visitor can turn sound on with
 * one tap — after that it stays unmuted across loops. The IntersectionObserver is a resume safety
 * net for browsers that pause background video (tab switches, battery-saver throttling, etc.) so
 * it's always playing again by the time the hero scrolls back into view. */
export function HeroVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const tryPlay = () => {
      // Set imperatively, not just via the JSX `muted` prop — React doesn't always sync it to the
      // underlying DOM property in time for autoplay to see it before .play() runs.
      video.muted = muted;
      video.play().catch(() => {
        // Autoplay can still be blocked in rare cases (e.g. data-saver mode) — the poster frame
        // stays visible then, which is a fine fallback for a purely decorative video.
      });
    };

    tryPlay();
    video.addEventListener("loadedmetadata", tryPlay);
    video.addEventListener("canplay", tryPlay);
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) tryPlay();
      },
      { threshold: 0.15 },
    );
    observer.observe(video);
    return () => {
      video.removeEventListener("loadedmetadata", tryPlay);
      video.removeEventListener("canplay", tryPlay);
      observer.disconnect();
    };
  }, [muted]);

  function toggleSound() {
    setMuted((current) => !current);
  }

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
      <button
        type="button"
        className="hero-video-sound"
        onClick={toggleSound}
        aria-label={muted ? "Unmute video" : "Mute video"}
        aria-pressed={!muted}
      >
        {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
      </button>
    </div>
  );
}
