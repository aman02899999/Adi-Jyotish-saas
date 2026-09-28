import { expect, request as playwrightRequest, test, type APIRequestContext } from "@playwright/test";

/**
 * One member must never read, change or delete another member's records. Member A (the shared E2E
 * member) creates a family member and a message thread; a second member, B, signed in here, then
 * tries every write it could aim at A's ids, plus A's bookings and invoices where A has any. Each
 * attempt must fail, and A's records must be unchanged afterwards.
 */
const BASE_URL = "http://localhost:3000";
const AUTH_EMULATOR = "http://127.0.0.1:9099";
const HEADERS = { origin: BASE_URL, "content-type": "application/json" };

async function signInSecondMember(): Promise<APIRequestContext> {
  const email = `e2e.member.b.${Date.now()}@adijyotishgurus.test`;
  const signUp = await fetch(`${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=any`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "E2eMemberBPass123!", returnSecureToken: true }),
  });
  const { idToken } = (await signUp.json()) as { idToken: string };
  const context = await playwrightRequest.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { origin: BASE_URL } });
  const login = await context.post("/api/member/login", { data: { idToken } });
  expect(login.ok(), await login.text()).toBe(true);
  return context;
}

test.describe("member isolation", () => {
  test.use({ storageState: "e2e/.auth/member.json" });

  test("a second member cannot touch the first member's records", async ({ request: memberA }) => {
    const family = await memberA.post("/api/member/family", {
      headers: HEADERS,
      data: { name: "Isolation Test Relative", relationship: "Sibling", birthDate: "1994-06-15", birthTime: "07:30", birthPlace: "Delhi, India" },
    });
    expect(family.status(), await family.text()).toBe(201);
    const familyId = ((await family.json()) as { id: string }).id;

    const thread = await memberA.post("/api/member/messages", { headers: HEADERS, data: { subject: "Isolation test", message: "Only I should see this.", category: "general" } });
    expect(thread.ok(), await thread.text()).toBe(true);
    const threadId = ((await thread.json()) as { id: string }).id;

    const bookings = (await (await memberA.get("/api/member/bookings")).json()) as Array<{ id: string }> | { bookings?: Array<{ id: string }> };
    const bookingId = (Array.isArray(bookings) ? bookings : bookings.bookings ?? [])[0]?.id;

    const memberB = await signInSecondMember();
    const attempts: Array<[string, Promise<{ status(): number }>]> = [
      ["delete A's family member", memberB.delete(`/api/member/family/${familyId}`, { headers: HEADERS })],
      ["reply in A's thread", memberB.post(`/api/member/messages/${threadId}`, { headers: HEADERS, data: { message: "B was here" } })],
      ["mark A's thread read", memberB.put(`/api/member/messages/${threadId}`, { headers: HEADERS })],
      ["resolve a prediction on A's thread id", memberB.post(`/api/member/predictions/${threadId}/resolve`, { headers: HEADERS, data: { outcome: "happened" } })],
    ];
    if (bookingId) {
      attempts.push(["cancel A's booking", memberB.put(`/api/member/bookings/${bookingId}`, { headers: HEADERS, data: { action: "cancel" } })]);
      attempts.push(["pay A's booking invoice", memberB.post(`/api/member/invoices/${bookingId}/checkout`, { headers: HEADERS })]);
    }
    for (const [label, attempt] of attempts) {
      const status = (await attempt).status();
      expect(status, label).toBeGreaterThanOrEqual(400);
      expect(status, label).toBeLessThan(500);
    }

    // B sees none of A's records in its own lists.
    const bFamily = (await (await memberB.get("/api/member/family")).json()) as { familyMembers: Array<{ id: string }> };
    expect(bFamily.familyMembers.map((entry) => entry.id)).not.toContain(familyId);
    const bThreads = JSON.stringify(await (await memberB.get("/api/member/messages")).json());
    expect(bThreads).not.toContain(threadId);

    // A's records are intact.
    const aFamily = (await (await memberA.get("/api/member/family")).json()) as { familyMembers: Array<{ id: string }> };
    expect(aFamily.familyMembers.map((entry) => entry.id)).toContain(familyId);
    const aThreads = JSON.stringify(await (await memberA.get("/api/member/messages")).json());
    expect(aThreads).toContain(threadId);
    expect(aThreads).not.toContain("B was here");

    await memberA.delete(`/api/member/family/${familyId}`, { headers: HEADERS });
    await memberB.dispose();
  });
});
