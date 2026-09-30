// E2E only, loaded into the dev server through NODE_OPTIONS by playwright.config.ts. It stands in
// for Gemini so the AI astrologers and readings run end to end in CI without an API key or a bill:
// requests to generativelanguage.googleapis.com never leave the process. The reply names the
// persona whose system prompt was sent, so a test can prove each request carried the right one.
// Photos sent with the request are counted in the reply, so a palm or face test can prove they
// arrived. A message containing FORCE_GEMINI_FAILURE gets a 503, to drive the failure and refund
// paths.
const realFetch = globalThis.fetch;

function personaName(system) {
  return system.match(/naam "([^"]+)"/)?.[1] // AI astrologer chats
    ?? system.match(/^(?:You are|Aap) (.+?)(?:,| hain| —)/)?.[1] // named reading personas
    ?? "an unknown persona";
}

globalThis.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input?.url ?? String(input);
  if (!url.includes("generativelanguage.googleapis.com")) return realFetch(input, init);
  const body = JSON.parse(init?.body ?? "{}");
  const system = body.systemInstruction?.parts?.map((part) => part.text).join(" ") ?? "";
  const parts = body.contents?.flatMap((content) => content.parts ?? []) ?? [];
  const userText = parts.map((part) => part.text ?? "").join(" ");
  const images = parts.filter((part) => part.inline_data ?? part.inlineData).length;
  if (userText.includes("FORCE_GEMINI_FAILURE")) return new Response("stubbed outage", { status: 503 });
  // The admin "test key" check sends no system prompt and expects a short OK.
  const text = !system ? "OK" : `E2E stub reply from ${personaName(system)}${images ? ` (${images} photo${images > 1 ? "s" : ""})` : ""}.`;
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200, headers: { "content-type": "application/json" } });
};
