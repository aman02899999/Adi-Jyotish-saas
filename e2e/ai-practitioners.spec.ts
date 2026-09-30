import { expect, request as playwrightRequest, test, type APIRequestContext } from "@playwright/test";

/**
 * The AI astrologers and the paid AI readings, end to end against e2e/support/mock-gemini.mjs: no
 * Gemini key, no bill, and each stub reply names the persona whose prompt it was sent, so every
 * answer proves the right persona asked. Also covers the two ways a member must never pay for
 * nothing: a chat the AI never answered costs nothing, and a reading that fails for good is
 * refunded to the wallet.
 *
 * Runs as its own freshly registered member so the chat and reading rate limits, and the one-chat-
 * at-a-time lock, are not shared with the other specs.
 */
const BASE_URL = "http://localhost:3000";
const AUTH_EMULATOR = "http://127.0.0.1:9099";
const HEADERS = { origin: BASE_URL, "content-type": "application/json" };
const BIRTH = { clientName: "AI Test Member", birthDate: "1994-06-15", birthTime: "07:45", birthPlace: "Jaipur, Rajasthan, India" };
const QUESTION = "What does this year hold for my career and finances?";

async function newMember(): Promise<{ context: APIRequestContext; email: string }> {
  const email = `e2e.ai.${Date.now()}@adijyotishgurus.test`;
  const signUp = await fetch(`${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=any`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "E2eAiMemberPass123!", returnSecureToken: true }),
  });
  const { idToken } = (await signUp.json()) as { idToken: string };
  const context = await playwrightRequest.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { origin: BASE_URL } });
  const register = await context.post("/api/member/register", { data: { idToken, name: "AI Test Member" } });
  expect(register.ok(), await register.text()).toBe(true);
  return { context, email };
}

async function balanceOf(member: APIRequestContext) {
  return ((await (await member.get("/api/member/wallet")).json()) as { balance: number }).balance;
}

async function waitFor<T>(read: () => Promise<T | null | undefined>, timeoutMs = 15_000): Promise<T | null> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const value = await read();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return null;
}

test.describe("AI astrologers and readings", () => {
  test.use({ storageState: "e2e/.auth/admin.json" });

  test("every paid AI path answers in its own persona, charges once, and never charges for nothing", async ({ request: admin }) => {
    test.setTimeout(120_000);
    const { context: member, email } = await newMember();

    // Fund the new member through the admin wallet-credit tool.
    const members = (await (await admin.get("/api/members")).json()) as { members?: Array<{ id: string; email: string }> } | Array<{ id: string; email: string }>;
    const memberId = (Array.isArray(members) ? members : members.members ?? []).find((row) => row.email === email)?.id;
    expect(memberId, "the new member is listed for admins").toBeTruthy();
    const credit = await admin.post("/api/admin/wallets/credit", { headers: HEADERS, data: { memberId, amount: 5000, reason: "E2E AI test credit", requestId: `e2e-ai-${Date.now()}` } });
    expect(credit.ok(), await credit.text()).toBe(true);
    expect(await balanceOf(member)).toBe(5000);

    // Two AI astrologers: a chat answers in that astrologer's own persona and costs its flat price once.
    const practitioners = (await (await admin.get("/api/practitioners")).json()) as { practitioners?: unknown[] } | unknown[];
    const aiOnline = ((Array.isArray(practitioners) ? practitioners : practitioners.practitioners ?? []) as Array<{ id: string; name: string; isAiPowered: boolean; online: boolean; active: boolean }>)
      .filter((person) => person.isAiPowered && person.online && person.active)
      .slice(0, 2);
    expect(aiOnline.length, "at least two AI astrologers are online").toBe(2);

    for (const astrologer of aiOnline) {
      const before = await balanceOf(member);
      const start = await member.post("/api/chat/sessions", { headers: HEADERS, data: { practitionerId: astrologer.id } });
      expect(start.status(), await start.text()).toBe(201);
      const { sessionId, fixedPrice } = (await start.json()) as { sessionId: string; fixedPrice: number };

      const sent = await member.post(`/api/chat/sessions/${sessionId}/messages`, { headers: HEADERS, data: { body: QUESTION } });
      expect(sent.status(), await sent.text()).toBe(201);
      const reply = await waitFor(async () => {
        const view = (await (await member.get(`/api/chat/sessions/${sessionId}`)).json()) as { messages: Array<{ senderType: string; body: string }> };
        return view.messages.find((message) => message.senderType === "practitioner");
      });
      expect(reply?.body, `${astrologer.name} replied in their own persona`).toBe(`E2E stub reply from ${astrologer.name}.`);

      const ended = await member.post(`/api/chat/sessions/${sessionId}/end`, { headers: HEADERS });
      expect(((await ended.json()) as { capturedAmount: number }).capturedAmount).toBe(fixedPrice);
      expect(before - (await balanceOf(member))).toBe(fixedPrice);
    }

    // A chat the AI never answered costs nothing.
    {
      const before = await balanceOf(member);
      const start = await member.post("/api/chat/sessions", { headers: HEADERS, data: { practitionerId: aiOnline[0].id } });
      const { sessionId } = (await start.json()) as { sessionId: string };
      await member.post(`/api/chat/sessions/${sessionId}/messages`, { headers: HEADERS, data: { body: `FORCE_GEMINI_FAILURE ${QUESTION}` } });
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const ended = await member.post(`/api/chat/sessions/${sessionId}/end`, { headers: HEADERS });
      expect(((await ended.json()) as { capturedAmount: number }).capturedAmount).toBe(0);
      expect(await balanceOf(member)).toBe(before);
    }

    // The four text readings, each paid from the wallet and answered by its own named persona.
    const readings: Array<[string, string, Record<string, unknown>, string]> = [
      ["Ask a question", "/api/ai-readings", { ...BIRTH, question: QUESTION }, "Shree Santram Shashtri"],
      ["Tarot", "/api/ai-readings/tarot", { clientName: BIRTH.clientName, question: QUESTION }, "Tarot Mystic Divya"],
      ["Vastu", "/api/ai-readings/vastu", { clientName: BIRTH.clientName, question: "My main door faces south-west and the kitchen is in the north-east. What should I change?" }, "Vastu Shastri Ramesh Chaturvedi"],
      ["Lal Kitab", "/api/ai-readings/lal-kitab", { ...BIRTH, question: QUESTION }, "Pandit Girish Trivedi"],
    ];
    for (const [label, route, body, persona] of readings) {
      const created = await member.post(route, { headers: HEADERS, data: body });
      expect(created.ok(), `${label}: ${await created.text()}`).toBe(true);
      const { readingId } = (await created.json()) as { readingId: string };
      const before = await balanceOf(member);
      const paid = await member.post(`/api/ai-readings/${readingId}/pay-from-wallet`, { headers: HEADERS });
      expect(paid.ok(), `${label}: ${await paid.text()}`).toBe(true);
      const { answer } = (await paid.json()) as { answer: string | null };
      expect(answer, `${label} is answered by ${persona}`).toBe(`E2E stub reply from ${persona}.`);
      expect(before - (await balanceOf(member)), `${label} is charged once`).toBeGreaterThan(0);
    }

    // A reading that fails for good is refunded to the wallet it was paid from.
    {
      const created = await member.post("/api/ai-readings", { headers: HEADERS, data: { ...BIRTH, question: `FORCE_GEMINI_FAILURE ${QUESTION}` } });
      expect(created.ok(), await created.text()).toBe(true);
      const { readingId } = (await created.json()) as { readingId: string };
      const before = await balanceOf(member);
      await member.post(`/api/ai-readings/${readingId}/pay-from-wallet`, { headers: HEADERS });
      expect(await balanceOf(member)).toBeLessThan(before);
      // The payment is attempt one; two retries reach the three-attempt cap.
      for (let attempt = 0; attempt < 2; attempt += 1) await member.post(`/api/ai-readings/${readingId}/retry`, { headers: HEADERS });
      const reading = await waitFor(async () => {
        const view = (await (await member.get(`/api/ai-readings/${readingId}`)).json()) as { reading?: { status: string } };
        return view.reading?.status === "failed" ? view.reading : null;
      });
      expect(reading?.status).toBe("failed");
      expect(await balanceOf(member), "the failed reading was refunded in full").toBe(before);
    }

    await member.dispose();
  });
});
