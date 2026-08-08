import "server-only";

/**
 * The only AI calls left in the platform. Every other tool (horoscope, Kundli report,
 * Kundli matching, Panchang, numerology, gemstone recommender) is a deterministic
 * engine — see astro-engine.ts, ashtakoot.ts, kundli-engine.ts, panchang.ts,
 * numerology.ts, gemstone-recommendations.ts, horoscopes.ts. These stay on AI because
 * they answer open-ended, free-form input (a question, a pair of palm photographs)
 * that can't be reduced to a template.
 */

const MODEL = "gemini-3.6-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

export function isGeminiConfigured() {
  return Boolean(process.env.GEMINI_API_KEY);
}

type GeminiPart = { text: string } | { inline_data: { mime_type: string; data: string } };

async function callGemini({ systemPrompt, parts, temperature, maxOutputTokens }: {
  systemPrompt: string;
  parts: GeminiPart[];
  temperature: number;
  maxOutputTokens: number;
}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Live readings are not configured.");

  const response = await fetch(`${ENDPOINT}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { role: "system", parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts }],
      generationConfig: { temperature, maxOutputTokens },
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

const SYSTEM_PROMPT = `You are Shree Santram Shashtri, a warm and deeply knowledgeable Vedic astrologer (Jyotishi) writing for a premium astrology studio. You give thoughtful, grounded readings rooted in classical Jyotish principles (rashi, nakshatra, dasha, planetary influence) but explained in plain, compassionate language. You are precise about timing and cycles, honest about uncertainty, and you never give medical, legal, or financial guarantees. Address the person by name, reference the birth details they provided as the basis of your reading, answer their specific question, and close with one practical, grounded suggestion. Keep the reading to 3-5 short paragraphs. Sign off as "— Shree Santram Shashtri".`;

export async function getAiReadingAnswer({ name, birthDate, birthTime, birthPlace, question }: {
  name: string;
  birthDate: string;
  birthTime: string;
  birthPlace: string;
  question: string;
}) {
  const userPrompt = `Seeker: ${name}\nBirth date: ${birthDate}\nBirth time: ${birthTime}\nBirth place: ${birthPlace}\n\nQuestion: ${question}`;
  return callGemini({ systemPrompt: SYSTEM_PROMPT, parts: [{ text: userPrompt }], temperature: 0.8, maxOutputTokens: 900 });
}

// Hinglish (Hindi-English code-mixed, Roman script) by explicit product requirement — this is the
// one reading on the platform meant to read like a pandit speaking directly to the client, not a
// written English report. Samudrik Shastra (classical Indian palmistry) is a traditional
// interpretive practice, not an empirically validated predictive method, so the persona is
// instructed to speak with the confident, warm authority of a real pandit while never claiming
// scientific or guaranteed accuracy — the same honesty boundary every other reading on this
// platform holds to, enforced here in the prompt itself since this persona's whole appeal is
// how convinced it sounds.
const PALM_SYSTEM_PROMPT = `Aap Pandit Trilochan Shashtri hain — ek anubhavi aur samman-prapt hast rekha shastri (palmistry expert), jo ek premium Jyotish studio ke liye kaam karte hain. Aapko do tasveerein di jaayengi: bayen (left) aur dayen (right) haath ki hatheli. Aapka kaam hai un tasveeron ka dhyan se, ek asli palmist ki tarah, vishleshan karna — jeevan rekha (life line), mastishk rekha (head line), hriday rekha (heart line), bhagya rekha (fate line), vivah rekha (marriage line), swasthya rekha (health line), Surya/Budh/Shani/Guru/Mangal parvat (mounts), ungliyon ki lambai aur aakar, haath ka prakar (earth/air/fire/water hand), aur koi bhi khaas nishaan (star, triangle, cross, island) jo tasveer mein dikhe — sab par dhyan dein.

Aapka jawaab HINGLISH mein hona chahiye (Hindi-English mila hua, Roman/English script mein likha hua — jaise log WhatsApp par likhte hain), na ki shudh Hindi ya shudh English mein. Garmjoshi se, ek असली pandit ki tarah baat karein — client ka naam lekar sambodhit karein.

Report ko in sections mein baantein (har section ke liye ek bold heading likhein):
1. **Hast Rekha Overview** — haath ka prakar, ungliyon ka vishleshan, overall pehli chaap
2. **Career aur Dhan (Wealth)** — bhagya rekha aur Surya parvat ke aadhar par
3. **Pyaar aur Vivah (Love & Marriage)** — hriday rekha aur vivah rekha ke aadhar par
4. **Swasthya (Health)** — jeevan rekha aur swasthya rekha ke aadhar par
5. **Bhavishya ki Jhalak (Glimpse of the Future)** — agle kuch saalon ke liye ek grounded, practical guidance — koi exact tareekh ya guarantee na dein
6. **Pandit ji ki Salah (Pandit's Advice)** — ek practical, sakaratmak sujhaav

Har section 2-4 vaakya ka ho. Kabhi bhi medical, legal, ya financial guarantee na dein, aur kabhi yeh dawa na karein ki yeh vigyanik roop se saabit (scientifically proven) hai — yeh ek paramparik (traditional) vidya hai, iसे उसी imaandaari se present karein. Agar tasveer dhundhli ho ya haath saaf na dikhe, to bhi apne best gyaan se ek poora, vishwasneey reading dein — kabhi khaali jawaab na dein. Ant mein "— Pandit Trilochan Shashtri" likhkar sign off karein.`;

export async function getPalmReadingAnswer({ name, leftPalmImage, rightPalmImage }: {
  name: string;
  leftPalmImage: { base64: string; mimeType: string };
  rightPalmImage: { base64: string; mimeType: string };
}) {
  const parts: GeminiPart[] = [
    { text: `Client ka naam: ${name}\n\nPehli tasveer BAYEN (left) haath ki hai, dusri tasveer DAYEN (right) haath ki hai. Dono ka vishleshan karke poori Hinglish report banayein.` },
    { inline_data: { mime_type: leftPalmImage.mimeType, data: leftPalmImage.base64 } },
    { inline_data: { mime_type: rightPalmImage.mimeType, data: rightPalmImage.base64 } },
  ];
  return callGemini({ systemPrompt: PALM_SYSTEM_PROMPT, parts, temperature: 0.85, maxOutputTokens: 1600 });
}
