import "server-only";

/**
 * The only AI call left in the platform. Every other tool (horoscope, Kundli report,
 * Kundli matching, Panchang, numerology, gemstone recommender) is a deterministic
 * engine — see astro-engine.ts, ashtakoot.ts, kundli-engine.ts, panchang.ts,
 * numerology.ts, gemstone-recommendations.ts, horoscopes.ts. This one stays on AI
 * because it answers an open-ended, free-form question, which can't be reduced to a
 * template.
 */

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
