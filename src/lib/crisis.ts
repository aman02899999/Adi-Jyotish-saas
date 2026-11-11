// Pure text checks and fixed wording, with no database or network access, so every surface
// (reading routes, chat, tests) can share them.
//
// The patterns are deliberately specific phrases, not single words: "die", "kill" and "abuse" on
// their own turn up in ordinary astrology questions ("will my business die?"), and a false alarm
// here refuses a reading the customer came for. A missed phrase is the worse error, so the list
// covers English, Hinglish and Devanagari and should only ever grow.

export type CrisisKind = "self_harm" | "abuse";

const SELF_HARM_PATTERNS: RegExp[] = [
  /suicid/i,
  /\bkill(ing)?\s+my\s?self\b/i,
  /\b(end|ending|finish|take|taking)\s+(my|my\s+own)\s+life\b/i,
  /\b(want|wish|going|plan(ning)?)\s+to\s+die\b/i,
  /\b(do\s?n[o']?t|no\s+longer|not)\s+want\s+to\s+(live|be\s+alive)\b/i,
  /\bno\s+reason\s+to\s+live\b/i,
  /\bself[\s-]?harm/i,
  /\b(hurt|hurting|harm|harming|cut|cutting)\s+my\s?self\b/i,
  /\bmar(na|\s+jana)\s+chah?t[aie]\b/i,
  /\bmar\s+ja+u+n?\b/i,
  /\bjeena\s+(hi\s+)?nahi+n?\s+(hai|chah?t[aie])\b/i,
  /\bjaan\s+de\s+(du+n?|dunga|dungi|dena)\b/i,
  /\bkhud\s?kushi\b/i,
  /\ba+tma?\s?hat+ya\b/i,
  /\bzindagi\s+kha?tam\s+kar/i,
  /आत्महत्या|खुदकुशी|ख़ुदकुशी/,
  /मरना\s+चाहत|मर\s+जाना\s+चाहत|मर\s+जाऊ/,
  /जीना\s+(ही\s+)?नहीं\s+(है|चाहत)/,
  /जान\s+दे\s+(दू|देना)/,
];

const ABUSE_PATTERNS: RegExp[] = [
  /\b(beats?|hits?|slaps?|kicks?|chokes?|rapes?|molests?)\s+me\b/i,
  /\b(being|am|was|been|get|getting|got)\s+(sexually\s+|physically\s+)?(abused|assaulted|molested|raped|beaten)\b/i,
  /\bdomestic\s+(violence|abuse)\b/i,
  /\bsexual(ly)?\s+(abus|assault|harass)/i,
  /\babus(es|ed|ing)\s+me\b/i,
  /\bmujhe?\s+(roz\s+)?(ma+rt[aie]|pi+tt[aie])\b/i,
  /\b(ma+r\s?pi+t|pitai)\s+kart[aie]\b/i,
  /\bbalatkar\b/i,
  /मुझे\s+(रोज़?\s+)?(मारत|पीटत)/,
  /मारपीट|बलात्कार|यौन\s+(शोषण|उत्पीड़न)|घरेलू\s+हिंसा/,
];

/** Returns the kind of crisis the text points to, or null for an ordinary question. Self-harm
 * wins when both match, because its helpline is the more urgent one. */
export function detectCrisis(text: string): CrisisKind | null {
  if (!text) return null;
  if (SELF_HARM_PATTERNS.some((pattern) => pattern.test(text))) return "self_harm";
  if (ABUSE_PATTERNS.some((pattern) => pattern.test(text))) return "abuse";
  return null;
}

export type CrisisHelpline = { name: string; number: string; note: string; for: CrisisKind | "all" };

// Government of India helplines, free to call. Check them once a year; a wrong number here is
// worse than none.
export const CRISIS_HELPLINES: CrisisHelpline[] = [
  { name: "Tele-MANAS mental health helpline", number: "14416", note: "free, 24 hours, Hindi and regional languages", for: "all" },
  { name: "Emergency", number: "112", note: "police, ambulance, immediate danger", for: "all" },
  { name: "Women helpline", number: "181", note: "free, 24 hours", for: "abuse" },
  { name: "Childline", number: "1098", note: "for anyone under 18", for: "abuse" },
];

/** The fixed message shown in place of a reading or an AI chat reply. It is never generated, so
 * it cannot drift into prediction, remedies or selling. English first, then Hinglish. */
export function crisisSupportMessage(kind: CrisisKind, surface: "reading" | "chat" = "reading"): string {
  const lines = CRISIS_HELPLINES.filter((line) => line.for === "all" || line.for === kind)
    .map((line) => `${line.name}: ${line.number} (${line.note})`)
    .join("\n");
  const stopped = surface === "reading"
    ? "What you have written matters more than any reading, so we have stopped here and you have not been charged for this."
    : "What you have written matters more than any reading, so I am stopping the reading here. I am an AI and cannot help with this.";
  const opening = kind === "self_harm"
    ? `${stopped} Astrology cannot help with this, but a trained person can, right now.`
    : `${stopped} You do not deserve to be hurt, and astrology is not the answer to it. Trained people can help.`;
  const hinglish = kind === "self_harm"
    ? "Aap akele nahi hain. Kripya abhi in number par baat karein, ya kisi apne ko bata dein."
    : "Aapki galti nahi hai. Kripya in number par baat karein, ya kisi bharosemand vyakti ko batayein.";
  return `${opening}\n\n${lines}\n\n${hinglish}`;
}
