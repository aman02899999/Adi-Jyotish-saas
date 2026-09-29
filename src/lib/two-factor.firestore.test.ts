import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { generate } from "otplib";

/**
 * Two-factor sign-in on the live Firestore path. Runs against the emulator; see
 * synthetic-reviews.firestore.test.ts for how.
 */
const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST;
const PROJECT = process.env.GCLOUD_PROJECT ?? "demo-jyotish";
if (process.env.REQUIRE_FIRESTORE_EMULATOR === "true" && !EMULATOR) {
  throw new Error("REQUIRE_FIRESTORE_EMULATOR is set but FIRESTORE_EMULATOR_HOST is not — the emulator did not start.");
}
const describeFirestore = EMULATOR ? describe : describe.skip;

const { db } = await import("@/lib/firestore");
const twoFactor = await import("@/lib/two-factor");

async function clearEmulator() {
  const response = await fetch(`http://${EMULATOR}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" });
  if (!response.ok) throw new Error(`Could not clear the emulator: ${response.status}`);
}

const admin = { role: "admin", id: "a1" } as const;
const secret = twoFactor.generateTotpSecret();
const wrong = async () => ((await generate({ secret })) === "000000" ? "111111" : "000000");

describeFirestore("two-factor sign-in on the live Firestore path", () => {
  beforeEach(clearEmulator);
  afterAll(clearEmulator);

  it("locks the account on the tenth wrong code, and then refuses even the right one", async () => {
    for (let i = 1; i < twoFactor.TWO_FACTOR_MAX_FAILURES; i += 1) {
      expect(await twoFactor.checkSignInCode(admin, secret, await wrong())).toEqual({ ok: false, retryAfter: 0 });
    }
    const tenth = await twoFactor.checkSignInCode(admin, secret, await wrong());
    expect(!tenth.ok && tenth.retryAfter).toBeGreaterThan(14 * 60);
    expect((await twoFactor.checkSignInCode(admin, secret, await generate({ secret }))).ok).toBe(false);
    expect(await twoFactor.twoFactorLockSeconds({ role: "member", id: "a1" })).toBe(0);
  });

  // Five at once rather than ten: the emulator serialises contended transactions with backoff,
  // and ten on one document can outrun the default timeout without anything being wrong.
  it("counts every one of several simultaneous wrong codes", { timeout: 20_000 }, async () => {
    await Promise.all(Array.from({ length: 5 }, () => twoFactor.recordTwoFactorFailure(admin)));
    expect((await db.collection("twoFactorFailures").doc("admin:a1").get()).data()?.failures).toBe(5);
    for (let i = 5; i < twoFactor.TWO_FACTOR_MAX_FAILURES; i += 1) await twoFactor.recordTwoFactorFailure(admin);
    expect(await twoFactor.twoFactorLockSeconds(admin)).toBeGreaterThan(0);
  });

  it("clears the count on a correct code, and starts over once the window has passed", async () => {
    for (let i = 1; i < twoFactor.TWO_FACTOR_MAX_FAILURES; i += 1) await twoFactor.recordTwoFactorFailure(admin);
    expect(await twoFactor.checkSignInCode(admin, secret, await generate({ secret }))).toEqual({ ok: true });
    expect((await db.collection("twoFactorFailures").doc("admin:a1").get()).exists).toBe(false);

    for (let i = 1; i < twoFactor.TWO_FACTOR_MAX_FAILURES; i += 1) await twoFactor.recordTwoFactorFailure(admin);
    await db.collection("twoFactorFailures").doc("admin:a1").update({ windowStartedAt: new Date(Date.now() - 16 * 60_000) });
    expect(await twoFactor.recordTwoFactorFailure(admin)).toBe(0);
    expect(await twoFactor.twoFactorLockSeconds(admin)).toBe(0);
    for (let i = 2; i < twoFactor.TWO_FACTOR_MAX_FAILURES; i += 1) expect(await twoFactor.recordTwoFactorFailure(admin)).toBe(0);
    expect(await twoFactor.recordTwoFactorFailure(admin)).toBeGreaterThan(0);
  });

  it("lets a backup code work once, even when it is replayed simultaneously", async () => {
    const { codes, hashed } = twoFactor.generateBackupCodes();
    await db.collection("adminUsers").doc("a1").set({ totpEnabled: true, totpSecret: secret, totpBackupCodes: hashed });
    const results = await Promise.all(Array.from({ length: 5 }, () => twoFactor.consumeBackupCode(admin, codes[0])));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await db.collection("adminUsers").doc("a1").get()).data()?.totpBackupCodes).toHaveLength(hashed.length - 1);
  });
});
