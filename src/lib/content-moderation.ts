import "server-only";

// Deliberately loose patterns — false positives (flagging something that turns out to be fine)
// just cost an admin a glance; false negatives let the actual abuse (a practitioner routing
// members off-platform to dodge the studio's cut) through silently. So this only ever flags for
// human review — see the callers — it never blocks or auto-hides content itself.
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const PHONE_PATTERN = /(?:\+?\d[\s.-]?){9,}\d/;
const HANDLE_PATTERN = /\b(whatsapp|wa\.me|telegram|t\.me\/|@[a-zA-Z0-9_]{4,})\b/i;

/** Returns a short human-readable reason if `text` looks like it's trying to share off-platform
 * contact info (email, phone number, WhatsApp/Telegram handle) — used on review bodies and
 * practitioner bios, which have no legitimate reason to contain any of these. Returns null when
 * nothing suspicious is found. */
export function scanForContactInfo(text: string): string | null {
  if (EMAIL_PATTERN.test(text)) return "an email address";
  if (PHONE_PATTERN.test(text)) return "a phone number";
  if (HANDLE_PATTERN.test(text)) return "a social/messaging handle";
  return null;
}
