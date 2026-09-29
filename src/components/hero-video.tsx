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
 * visitor who scrolls straight to a video before clicking anything else.
 *
 * Loading: nothing but the poster is fetched until the video is near the screen AND the page has
 * finished loading, and never on Data Saver or a 2G/3G connection. The homepage carries two of
 * these (about 4 MB together); fetched eagerly they competed with the page's own text, images and
 * scripts, pushing the main content past 11 seconds on a mid-range phone, and every visit spent
 * that bandwidth on the hosting plan whether or not anyone scrolled down to the second one. */

type NetworkInformationLike = { saveData?: boolean; effectiveType?: string };

/** Data Saver, or a connection too slow for a decorative video to be worth its megabytes. */
function prefersPosterOnly() {
  const connection = (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
  return Boolean(connection?.saveData) || /(^|slow-)2g|3g/.test(connection?.effectiveType ?? "");
}
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
  // The <source> elements are only rendered once this is true, so the browser has nothing to
  // download before then.
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || prefersPosterOnly()) return;
    let cancelled = false;
    const start = () => { if (!cancelled) setShouldLoad(true); };
    const whenPageLoaded = () => {
      if (document.readyState === "complete") start();
      else window.addEventListener("load", start, { once: true });
    };
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect();
        whenPageLoaded();
      }
    }, { rootMargin: "300px 0px" });
    observer.observe(video);
    return () => {
      cancelled = true;
      observer.disconnect();
      window.removeEventListener("load", start);
    };
  }, []);

  // Sources added after mount are not picked up until the element is told to reload.
  useEffect(() => {
    if (shouldLoad) videoRef.current?.load();
  }, [shouldLoad]);

  useEffect(() => {
    ensureGlobalUnlockListener();
    return onSoundUnlocked(() => setMuted(false));
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !shouldLoad) return;

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
  }, [muted, shouldLoad]);

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
        muted
        loop
        playsInline
        preload="none"
        aria-hidden="true"
      >
        {shouldLoad && webmSrc && <source src={webmSrc} type="video/webm" />}
        {shouldLoad && <source src={mp4Src} type="video/mp4" />}
      </video>
      {shouldLoad && <button
        type="button"
        className="hero-video-sound"
        onClick={toggleSound}
        aria-label={muted ? `Unmute ${label}` : `Mute ${label}`}
        aria-pressed={!muted}
      >
        {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
      </button>}
    </div>
  );
}
