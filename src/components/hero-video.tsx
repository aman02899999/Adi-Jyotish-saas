"use client";

import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { ensureGlobalUnlockListener, isSoundUnlocked, onSoundUnlocked, unlockSound } from "@/lib/media-unlock";

/** A looping hero video used across the site (homepage brand video, the daily-horoscope banner,
 * and any future hero-video section) with one shared behavior: it plays while its section is on
 * screen and pauses the moment it scrolls out of view, and it starts with sound automatically once
 * the visitor has interacted with the page at all this session — browsers block unmuted autoplay
 * before that unconditionally, so starting muted is the only way autoplay is reliable on first
 * load. The visible tap-to-unmute button is both the manual override and the fallback for a
 * visitor who scrolls straight to a video before clicking anything else. */
export function HeroVideo({
  posterSrc,
  mp4Src,
  webmSrc,
  label,
  fill = false,
}: {
  posterSrc: string;
  mp4Src: string;
  webmSrc?: string;
  /** Used in the sound-toggle button's accessible name, e.g. "brand video" or "daily horoscope video". */
  label: string;
  /** true: absolutely fill a position:relative parent that already defines its own aspect ratio
   * (e.g. the horoscope banner). false (default): the video owns its own aspect-ratio frame, as on
   * the homepage hero. */
  fill?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(() => !isSoundUnlocked());

  useEffect(() => {
    ensureGlobalUnlockListener();
    return onSoundUnlocked(() => setMuted(false));
  }, []);

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
        const entry = entries[0];
        if (!entry) return;
        if (entry.isIntersecting) tryPlay();
        else video.pause();
      },
      { threshold: 0.35 },
    );
    observer.observe(video);
    return () => {
      video.removeEventListener("loadedmetadata", tryPlay);
      video.removeEventListener("canplay", tryPlay);
      observer.disconnect();
    };
  }, [muted]);

  function toggleSound() {
    setMuted((current) => {
      const next = !current;
      if (!next) unlockSound(); // turning sound on is itself a user gesture — unlock every other hero video too
      return next;
    });
  }

  return (
    <div className={fill ? "hero-video-frame hero-video-frame--fill" : "hero-video-frame"}>
      <video
        ref={videoRef}
        className={fill ? "hero-video hero-video--cover" : "hero-video"}
        poster={posterSrc}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        aria-hidden="true"
      >
        {webmSrc && <source src={webmSrc} type="video/webm" />}
        <source src={mp4Src} type="video/mp4" />
      </video>
      <button
        type="button"
        className="hero-video-sound"
        onClick={toggleSound}
        aria-label={muted ? `Unmute ${label}` : `Mute ${label}`}
        aria-pressed={!muted}
      >
        {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
      </button>
    </div>
  );
}
