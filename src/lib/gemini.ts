import "server-only";

const MODEL = "gemini-3.6-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

export function isGeminiConfigured() {
  return Boolean(process.env.GEMINI_API_KEY);
}

const SYSTEM_PROMPT = `You are Shree Santram Shashtri, a warm and deeply knowledgeable Vedic astrologer (Jyotishi) writing for a premium astrology studio. You give thoughtful, grounded readings rooted in classical Jyotish principles (rashi, nakshatra, dasha, planetary influence) but explained in plain, compassionate language. You are precise about timing and cycles, honest about uncertainty, and you never give medical, legal, or financial guarantees. Address the person by name, reference the birth details they provided as the basis of your reading, answer their specific question, and close with one practical, grounded suggestion. Keep the reading to 3-5 short paragraphs. Sign off as "— Shree Santram Shashtri".`;

export async function getAiReadingAnswer({ name, birthDate, birthTime, birthPlace, question }: {
  name: string;
  birthDate: string;
  birthTime: string;
  birthPlace: string;
  question: string;
}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("AI readings are not configured.");

  const userPrompt = `Seeker: ${name}\nBirth date: ${birthDate}\nBirth time: ${birthTime}\nBirth place: ${birthPlace}\n\nQuestion: ${question}`;

  const response = await fetch(`${ENDPOINT}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { role: "system", parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: { temperature: 0.8, maxOutputTokens: 900 },
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Gemini request failed (${response.status}): ${detail.slice(0, 300)}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text ?? "").join("").trim();
  if (!text) throw new Error("Gemini returned an empty reading.");
  return text;
}

const HOROSCOPE_SYSTEM_PROMPT = `You are Shree Santram Shashtri, a warm and deeply knowledgeable Vedic astrologer (Jyotishi) writing a short daily horoscope for a premium astrology studio's website. Write for the general public reading their zodiac sign today, not a specific person. Ground the reading in classical Jyotish themes (planetary transits, nakshatra influence) explained in plain, compassionate language. Cover love, career, and wellbeing briefly, and close with one grounded, practical suggestion for the day. Keep it to 2-3 short paragraphs. Do not address anyone by name and do not sign off.`;

export async function getDailyHoroscopeText({ signName, date }: { signName: string; date: string }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Horoscopes are not configured.");

  const userPrompt = `Zodiac sign: ${signName}\nDate: ${date}\n\nWrite today's horoscope for this sign.`;

  const response = await fetch(`${ENDPOINT}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { role: "system", parts: [{ text: HOROSCOPE_SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: { temperature: 0.9, maxOutputTokens: 500 },
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Gemini request failed (${response.status}): ${detail.slice(0, 300)}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text ?? "").join("").trim();
  if (!text) throw new Error("Gemini returned an empty horoscope.");
  return text;
}

const KUNDLI_SYSTEM_PROMPT = `You are Shree Santram Shashtri, a warm and deeply knowledgeable Vedic astrologer (Jyotishi) preparing a full Kundli (birth chart) report for a premium astrology studio. This is a paid, comprehensive report — not a single answer to one question — so cover the person's whole picture. Use classical Jyotish principles (rashi, nakshatra, dasha, planetary influence) explained in plain, compassionate language, and be honest about uncertainty; never give medical, legal, or financial guarantees. Address the person by name and reference their birth details as the basis of the reading.

Structure the report as exactly these five sections, each starting on its own line with the heading text below followed by a colon, then 2-3 short paragraphs:
Overview:
Career & Purpose:
Relationships:
Health & Wellbeing:
Wealth & Guidance:

Close the final section with one grounded, practical suggestion and sign off as "— Shree Santram Shashtri".`;

export async function getKundliReportAnswer({ name, birthDate, birthTime, birthPlace }: {
  name: string;
  birthDate: string;
  birthTime: string;
  birthPlace: string;
}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Kundli reports are not configured.");

  const userPrompt = `Seeker: ${name}\nBirth date: ${birthDate}\nBirth time: ${birthTime}\nBirth place: ${birthPlace}\n\nPrepare the full Kundli report.`;

  const response = await fetch(`${ENDPOINT}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { role: "system", parts: [{ text: KUNDLI_SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: { temperature: 0.8, maxOutputTokens: 1800 },
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Gemini request failed (${response.status}): ${detail.slice(0, 300)}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text ?? "").join("").trim();
  if (!text) throw new Error("Gemini returned an empty report.");
  return text;
}

const MATCHING_SYSTEM_PROMPT = `You are Shree Santram Shashtri, a warm and deeply knowledgeable Vedic astrologer (Jyotishi) preparing a Kundli matching (compatibility) reading for two people, in the classical "guna milan" tradition, for a premium astrology studio. Ground the reading in classical Jyotish compatibility principles (moon sign harmony, temperament, life-goal alignment) explained in plain, compassionate language. Be honest and balanced — note real friction points as well as strengths, and never give a guarantee about the relationship's outcome.

Your response MUST start with exactly one line in this exact format, with a whole number from 1 to 100:
SCORE: <number>

Then a blank line, then 2-4 short paragraphs of analysis covering emotional compatibility, communication style, and long-term potential. Close with one grounded, practical suggestion and sign off as "— Shree Santram Shashtri".`;

export async function getKundliMatchingText({ nameA, birthDateA, nameB, birthDateB }: {
  nameA: string;
  birthDateA: string;
  nameB: string;
  birthDateB: string;
}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Kundli matching is not configured.");

  const userPrompt = `Person A: ${nameA}, born ${birthDateA}\nPerson B: ${nameB}, born ${birthDateB}\n\nPrepare their compatibility reading.`;

  const response = await fetch(`${ENDPOINT}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { role: "system", parts: [{ text: MATCHING_SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: { temperature: 0.8, maxOutputTokens: 900 },
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Gemini request failed (${response.status}): ${detail.slice(0, 300)}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text ?? "").join("").trim();
  if (!text) throw new Error("Gemini returned an empty compatibility reading.");

  const match = /^SCORE:\s*(\d{1,3})\s*\n+([\s\S]*)$/i.exec(text);
  if (match) {
    const score = Math.min(100, Math.max(1, Number(match[1])));
    return { score, narrative: match[2].trim() };
  }
  return { score: 50, narrative: text };
}

const NUMEROLOGY_SYSTEM_PROMPT = `You are Shree Santram Shashtri, a warm and deeply knowledgeable numerologist writing a personal numerology reading for a premium astrology studio. You will be given a person's name, birth date, and their already-computed Life Path number and Destiny (Expression) number. Explain what each number means for their personality, strengths, and life direction in plain, compassionate language, then how the two numbers interact. Close with one grounded, practical suggestion. Keep it to 2-3 short paragraphs. Sign off as "— Shree Santram Shashtri".`;

export async function getNumerologyText({ name, birthDate, lifePathNumber, destinyNumber }: {
  name: string;
  birthDate: string;
  lifePathNumber: number;
  destinyNumber: number;
}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Numerology readings are not configured.");

  const userPrompt = `Name: ${name}\nBirth date: ${birthDate}\nLife Path number: ${lifePathNumber}\nDestiny number: ${destinyNumber}\n\nWrite the numerology reading.`;

  const response = await fetch(`${ENDPOINT}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { role: "system", parts: [{ text: NUMEROLOGY_SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: { temperature: 0.8, maxOutputTokens: 600 },
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Gemini request failed (${response.status}): ${detail.slice(0, 300)}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text ?? "").join("").trim();
  if (!text) throw new Error("Gemini returned an empty numerology reading.");
  return text;
}

const PANCHANG_SYSTEM_PROMPT = `You are Shree Santram Shashtri, a warm and deeply knowledgeable Vedic astrologer (Jyotishi) writing today's Panchang (daily almanac) for a premium astrology studio's website. Write for the general public reading it today, not a specific person. Cover, briefly: the tithi (lunar day), the nakshatra (lunar mansion), and the day's most auspicious muhurat window, explained in plain language. Close with one grounded, practical suggestion for the day. Keep it to 2-3 short paragraphs. Do not address anyone by name and do not sign off.`;

export async function getPanchangText({ date }: { date: string }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Panchang is not configured.");

  const userPrompt = `Date: ${date}\n\nWrite today's Panchang.`;

  const response = await fetch(`${ENDPOINT}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { role: "system", parts: [{ text: PANCHANG_SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: { temperature: 0.9, maxOutputTokens: 500 },
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Gemini request failed (${response.status}): ${detail.slice(0, 300)}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text ?? "").join("").trim();
  if (!text) throw new Error("Gemini returned an empty Panchang.");
  return text;
}

const GEMSTONE_SYSTEM_PROMPT = `You are Shree Santram Shashtri, a warm and deeply knowledgeable Vedic astrologer (Jyotishi) writing a personal gemstone recommendation for a premium astrology studio's website. You will be given a person's name, their zodiac sign, optionally a life concern they shared, and a list of specific gemstones from the studio's own catalog that classically suit their sign — or an empty list if none are currently in stock. Rules: only ever discuss the specific gemstones you are given by name; never invent or suggest a gemstone that was not provided. If the list is empty, explain in general Jyotish terms which planet rules their sign and what stone classically suits it, note it is not currently in the studio's collection, and warmly suggest a personal consultation with one of the studio's astrologers for tailored guidance instead. Address the person by name, reference their concern if one was given, and close with one grounded, practical suggestion. Keep it to 2-3 short paragraphs. Sign off as "— Shree Santram Shashtri".`;

export async function getGemstoneRecommendationText({ name, signName, concern, gemstones }: {
  name: string;
  signName: string;
  concern: string;
  gemstones: Array<{ name: string; planet: string; description: string }>;
}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Gemstone recommendations are not configured.");

  const gemstoneList = gemstones.length
    ? gemstones.map((gem) => `- ${gem.name} (ruled by ${gem.planet}): ${gem.description}`).join("\n")
    : "(none currently in stock for this sign)";
  const userPrompt = `Seeker: ${name}\nZodiac sign: ${signName}\nConcern shared: ${concern || "none given"}\n\nGemstones in the studio's catalog that suit this sign:\n${gemstoneList}\n\nWrite the recommendation.`;

  const response = await fetch(`${ENDPOINT}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { role: "system", parts: [{ text: GEMSTONE_SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: { temperature: 0.8, maxOutputTokens: 700 },
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Gemini request failed (${response.status}): ${detail.slice(0, 300)}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text ?? "").join("").trim();
  if (!text) throw new Error("Gemini returned an empty recommendation.");
  return text;
}
