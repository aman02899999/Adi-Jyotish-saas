"use client";

// Browsers only allow *unmuted* autoplay once the visitor has interacted with the page at least
// once (a click, tap, or keypress — scrolling alone never counts, by design, so a site can't blast
// audio on load just because someone scrolled). That interaction unlocks unmuted autoplay for the
// whole domain for the rest of the session, not just the element that was clicked. This module
// mirrors that: the first interaction anywhere on the site flips a shared flag, and every hero
// video already on screen or scrolled into view afterward can start with sound without asking
// again, instead of each one needing its own separate tap-to-unmute.

const STORAGE_KEY = "heroVideoSoundUnlocked";
let unlocked = false;
let initialized = false;
let globalListenerAttached = false;
const listeners = new Set<() => void>();

function readPersisted() {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function persist() {
  try {
    sessionStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // Private browsing / storage disabled — sound simply re-locks next reload, not a hard failure.
  }
}

export function isSoundUnlocked() {
  if (!initialized) {
    unlocked = readPersisted();
    initialized = true;
  }
  return unlocked;
}

export function unlockSound() {
  if (unlocked) return;
  unlocked = true;
  persist();
  listeners.forEach((listener) => listener());
}

export function onSoundUnlocked(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Call once per page; safe to call from every HeroVideo instance since it no-ops after the first. */
export function ensureGlobalUnlockListener() {
  if (globalListenerAttached || typeof window === "undefined") return;
  globalListenerAttached = true;
  const handler = () => unlockSound();
  window.addEventListener("pointerdown", handler, { once: true, passive: true });
  window.addEventListener("keydown", handler, { once: true });
}
