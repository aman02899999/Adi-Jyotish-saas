import "server-only";

import { dailyPanchanga, type DailyPanchanga } from "panchanga";
import { REFERENCE_LOCATION } from "@/lib/panchang";

/** Every "muhurat table" on other platforms is a generic daily good/bad list. This instead takes a
 * specific decision (start a business, sign a contract, travel, move house, get married, have a hard
 * conversation) and a date range, then ranks each day with the real Panchang for that day — riktā
 * tithis, weekday rulership, and a short list of classically auspicious nakshatras — so what comes
 * back is "here are your best three days for THIS", not a table the member has to interpret alone. */

// Riktā ("empty") tithis — the 4th, 9th, and 14th of each paksha — classically avoided for
// auspicious beginnings. Tithi.number runs 1..30 across both pakshas, plus 30 = Amavasya.
const RIKTA_TITHIS = new Set([4, 9, 14, 19, 24, 29]);
const AMAVASYA_TITHI = 30;

// A representative (not exhaustive) set of nakshatras classical muhurat texts treat as broadly
// auspicious for beginnings — fixed (dhruva), soft (mridu), and swift (kshipra) natured stars.
const AUSPICIOUS_NAKSHATRAS = new Set([
  "Ashwini", "Rohini", "Mrigashira", "Punarvasu", "Pushya", "Hasta", "Chitra", "Swati", "Anuradha", "Shravana", "Dhanishta", "Revati",
]);

export type DecisionType = "new_venture" | "contract_signing" | "travel" | "house_warming" | "marriage_ceremony" | "important_conversation";

export const DECISION_TYPES: { key: DecisionType; label: string }[] = [
  { key: "new_venture", label: "Starting a new venture or business" },
  { key: "contract_signing", label: "Signing a contract or agreement" },
  { key: "travel", label: "Starting a journey or trip" },
  { key: "house_warming", label: "Moving into a new home" },
  { key: "marriage_ceremony", label: "Marriage or engagement ceremony" },
  { key: "important_conversation", label: "An important conversation or negotiation" },
];

// Vara index: 0=Sunday .. 6=Saturday (matches the panchanga package and JS Date#getDay()).
const DECISION_META: Record<DecisionType, { favorableVaras: number[]; avoidVaras: number[]; varaNote: string }> = {
  new_venture: { favorableVaras: [4, 3], avoidVaras: [2, 6], varaNote: "Thursday and Wednesday favor new beginnings; Tuesday and Saturday are classically avoided for fresh starts." },
  contract_signing: { favorableVaras: [3, 4], avoidVaras: [2], varaNote: "Wednesday (Mercury) and Thursday (Jupiter) favor agreements and clear communication; Tuesday tends to bring friction to negotiations." },
  travel: { favorableVaras: [1, 4, 5], avoidVaras: [2], varaNote: "Monday, Thursday, and Friday are classically favored for setting out; Tuesday is usually avoided for starting a journey." },
  house_warming: { favorableVaras: [1, 4, 5], avoidVaras: [2, 6], varaNote: "Monday, Thursday, and Friday support home and domestic beginnings; Tuesday and Saturday are usually avoided for Griha Pravesh." },
  marriage_ceremony: { favorableVaras: [4, 5], avoidVaras: [2, 6], varaNote: "Thursday and Friday are the classical days for marriage; Tuesday and Saturday are traditionally avoided." },
  important_conversation: { favorableVaras: [3, 0], avoidVaras: [6], varaNote: "Wednesday and Sunday favor clarity and being heard; Saturday tends to invite delay or misunderstanding." },
};

export type MuhurtaDay = {
  date: string;
  dateLabel: string;
  score: number;
  tier: "excellent" | "good" | "workable" | "avoid";
  reasons: string[];
  tithi: string;
  nakshatra: string;
  vara: string;
  abhijitWindow: { start: string; end: string } | null;
  rahuKalaWindow: { start: string; end: string } | null;
};

function dayPanchanga(date: Date): DailyPanchanga {
  return dailyPanchanga(date, REFERENCE_LOCATION);
}

function scoreDay(decisionType: DecisionType, panchang: DailyPanchanga): { score: number; reasons: string[] } {
  const meta = DECISION_META[decisionType];
  let score = 0;
  const reasons: string[] = [];

  if (panchang.tithi.number === AMAVASYA_TITHI) {
    score -= 2;
    reasons.push("Amavasya — classically avoided for new beginnings.");
  } else if (RIKTA_TITHIS.has(panchang.tithi.number)) {
    score -= 2;
    reasons.push(`${panchang.tithi.name} is a riktā (empty) tithi, usually avoided for auspicious starts.`);
  } else {
    score += 1;
  }

  if (meta.favorableVaras.includes(panchang.vara.index)) {
    score += 2;
    reasons.push(`${panchang.vara.name} favors this kind of decision.`);
  } else if (meta.avoidVaras.includes(panchang.vara.index)) {
    score -= 2;
    reasons.push(`${panchang.vara.name} is usually avoided for this kind of decision.`);
  }

  if (AUSPICIOUS_NAKSHATRAS.has(panchang.nakshatra.name)) {
    score += 1;
    reasons.push(`Moon is in ${panchang.nakshatra.name} nakshatra, considered broadly auspicious.`);
  }

  if (panchang.muhurta.abhijit) {
    score += 1;
  }

  return { score, reasons };
}

function tierFromScore(score: number): MuhurtaDay["tier"] {
  if (score >= 4) return "excellent";
  if (score >= 2) return "good";
  if (score >= 0) return "workable";
  return "avoid";
}

export function rankMuhurtaWindows({ decisionType, startDate, endDate }: { decisionType: DecisionType; startDate: string; endDate: string }): MuhurtaDay[] {
  const start = new Date(`${startDate}T12:00:00Z`);
  const end = new Date(`${endDate}T12:00:00Z`);
  const days: MuhurtaDay[] = [];

  for (let cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const panchang = dayPanchanga(cursor);
    const { score, reasons } = scoreDay(decisionType, panchang);
    days.push({
      date: panchang.date,
      dateLabel: new Date(`${panchang.date}T00:00:00Z`).toLocaleDateString("en", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" }),
      score,
      tier: tierFromScore(score),
      reasons,
      tithi: `${panchang.tithi.name} (${panchang.tithi.paksha === "shukla" ? "Shukla" : "Krishna"} Paksha)`,
      nakshatra: panchang.nakshatra.name,
      vara: panchang.vara.name,
      abhijitWindow: panchang.muhurta.abhijit,
      rahuKalaWindow: panchang.muhurta.rahuKala,
    });
  }

  return days.sort((a, b) => b.score - a.score);
}

export function decisionVaraNote(decisionType: DecisionType) {
  return DECISION_META[decisionType].varaNote;
}
