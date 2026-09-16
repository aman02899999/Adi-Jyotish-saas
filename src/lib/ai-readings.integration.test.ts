import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";


import { closePgPool, query } from "@/lib/postgres";
import { rechargeWallet } from "@/lib/wallet";

// A spy rather than a plain stub: the "notify exactly once when the cap is
// crossed" assertion below has nothing else to observe.
const spies = vi.hoisted(() => ({ notifyAdmins: vi.fn(async () => undefined) }));
vi.mock("@/lib/notifications", () => ({ notifyAdmins: spies.notifyAdmins }));
// unstable_cache needs Next's incremental cache, which does not exist outside a
// Next runtime. The wallet path reads settings.currency off this, so it has to be
// a complete settings object — a bare stub makes wallets.currency null.
vi.mock("@/lib/studio-settings", () => ({
  getStudioSettings: async () => ({
    studioName: "Adi Jyotish Guru",
    supportEmail: "support@adijyotishguru.com",
    timezone: "Asia/Kolkata",
    currency: "INR",
    cancellationHours: 24,
    bookingLeadMinutes: 15,
    replySlaHours: 24,
    gstRate: 18,
    gstin: null,
    updatedAt: new Date().toISOString(),
  }),
}));
vi.mock("@/lib/gemini", () => ({
  isGeminiConfigured: () => true,
  getAiReadingAnswer: async () => "GEMINI ANSWER",
  getPalmReadingAnswer: async () => "PALM ANSWER",
  getTarotReadingAnswer: async () => "TAROT ANSWER",
  getFaceReadingAnswer: async () => "FACE ANSWER",
  getVastuReadingAnswer: async () => "VASTU ANSWER",
  getLalKitabReadingAnswer: async () => "LALKITAB ANSWER",
  getPersonaReadingAnswer: async () => "PERSONA ANSWER",
}));
// The chart engines are pure CPU and already covered elsewhere; replaced so these
// tests exercise the status transitions and the caching, not ephemeris maths.
vi.mock("@/lib/kundli-engine", () => ({ buildKundliChart: () => ({}), renderKundliReport: () => "KUNDLI REPORT" }));
vi.mock("@/lib/varshphal", () => ({ buildVarshphalChart: () => ({}), renderVarshphalReport: () => "VARSHPHAL REPORT" }));

import type { AiReading } from "@/lib/ai-readings";
import {
  attachRazorpayOrderInSupabase,
  markReadingPaidFromWalletInSupabase,
  markReadingPaidViaBypassInSupabase,
} from "@/lib/ai-readings-supabase";
import {
  AI_KUNDLI_PRICE,
  AI_PALM_READING_PRICE,
  AI_READING_PRICE,
  createFreeReading,
  createPendingFaceReading,
  createPendingKundliReport,
  createPendingLalKitabReading,
  createPendingPalmReading,
  createPendingPersonaReading,
  createPendingReading,
  createPendingTarotReading,
  createPendingVastuReading,
  createPendingVarshphalReading,
  FreeReadingAlreadyUsedError,
  generateReadingAnswer,
  getReadingById,
  getReadingsForMember,
  isEligibleForFreeReading,
  markReadingPaid,
  markReadingPaidWithoutCharge,
  payReadingFromWallet,
  reserveReadingId,
} from "@/lib/ai-readings";

/**
 * Integration coverage for the AI-reading money and generation paths. Skipped
 * unless SUPABASE_DB_URL points at a reachable database carrying the schema.
 *
 *   SUPABASE_DB_URL=postgresql://... PGSSLMODE=disable SUPABASE_CUTOVER=true \
 *     npx vitest run src/lib/ai-readings.integration.test.ts
 */
const cutoverActive = Boolean(process.env.SUPABASE_DB_URL) && process.env.SUPABASE_CUTOVER === "true";
const describeCutover = cutoverActive ? describe : describe.skip;

const MEMBER = "member-airead-itest";
const OTHER = "member-airead-itest-other";

const BIRTH = { clientName: "Test Client", birthDate: "1991-03-14", birthTime: "07:45", birthPlace: "Delhi, India" };

async function cleanup() {
  await query(`delete from public.ai_readings where member_id like $1`, ["member-airead-itest%"]);
  await query(`delete from public.ai_personas where id like $1`, ["airead-itest-%"]);
  await query(`delete from public.ai_reading_free_claims where id like $1`, ["member-airead-itest%"]);
  await query(`delete from public.wallet_entries where wallet_id like $1`, ["member-airead-itest%"]);
  await query(`delete from public.wallet_holds where wallet_id like $1`, ["member-airead-itest%"]);
  await query(`delete from public.wallets where member_id like $1`, ["member-airead-itest%"]);
  await query(`delete from public.members where id like $1`, ["member-airead-itest%"]);
}

beforeEach(async () => {
  if (!cutoverActive) return;
  await cleanup();
  await query(`insert into public.members (id, name, email) values ($1,$2,$3)`, [MEMBER, "AI Reading Member", `${MEMBER}@example.test`]);
  // ai_readings.persona_id is a real foreign key to ai_personas, so the personas
  // these tests reference have to exist first.
  for (const [id, slug, name] of [
    ["airead-itest-p1", "airead-itest-p1", "Persona One"],
    ["airead-itest-p2", "airead-itest-p2", "Persona Two"],
  ]) {
    await query(
      `insert into public.ai_personas (id, slug, name, system_prompt) values ($1,$2,$3,$4)
       on conflict (id) do nothing`,
      [id, slug, name, "You are a test persona."],
    );
  }
});

afterAll(async () => {
  if (!cutoverActive) return;
  await cleanup();
  await closePgPool();
});

async function warmPool() {
  // getPgPool() opens connections lazily; an unwarmed burst staggers while
  // connecting and never actually overlaps, so a race test would pass either way.
  await Promise.all(Array.from({ length: 10 }, () => query("select 1")));
}

/** Burns one AI attempt: the reading is rewritten as a palm reading with no
 * images, so the engine rejects it and recordFailedAttempt runs. */
const failOnce = async (readingId: string) => {
  const reading = (await getReadingById(readingId, MEMBER))!;
  await expect(generateReadingAnswer({ ...reading, readingType: "palm", leftPalmImagePath: null, rightPalmImagePath: null })).rejects.toThrow();
};

const rawReading = async (id: string) =>
  (await query(`select status, ai_attempts::int as ai_attempts, price, paid_via_bypass, paid_from_wallet, razorpay_payment_id, last_ai_error from public.ai_readings where id = $1`, [id])).rows[0];

describeCutover("free reading claim", () => {
  it("gives the free reading to exactly one concurrent request", async () => {
    await warmPool();
    // isEligibleForFreeReading reads outside any transaction, so all six of these
    // can legitimately reach createFreeReading having each seen "not yet used".
    // The primary key on member_id is the only thing that stops six free readings.
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () => createFreeReading({ ...BIRTH, memberId: MEMBER, question: "Will it rain?" })),
    );

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(5);
    for (const rejection of rejected) {
      expect((rejection as PromiseRejectedResult).reason).toBeInstanceOf(FreeReadingAlreadyUsedError);
    }

    const claims = (await query(`select count(*)::int as n from public.ai_reading_free_claims where id = $1`, [MEMBER])).rows[0].n;
    const readings = (await query(`select count(*)::int as n from public.ai_readings where member_id = $1`, [MEMBER])).rows[0].n;
    expect(claims).toBe(1);
    expect(readings).toBe(1);
  });

  it("is free once and only once across separate calls", async () => {
    await createFreeReading({ ...BIRTH, memberId: MEMBER, question: "one" });
    await expect(createFreeReading({ ...BIRTH, memberId: MEMBER, question: "two" })).rejects.toThrow(FreeReadingAlreadyUsedError);
  });

  it("prices the free reading at zero and starts it paid", async () => {
    const reading = await createFreeReading({ ...BIRTH, memberId: MEMBER, question: "one" });
    expect(reading.price).toBe(0);
    expect(reading.status).toBe("paid");
    expect(reading.readingType).toBe("question");
  });

  it("tags a free persona reading as persona, not question", async () => {
    // The retry route dispatches on readingType, so a mislabelled persona reading
    // would be re-answered by the wrong persona.
    const reading = await createFreeReading({
      ...BIRTH,
      memberId: MEMBER,
      question: "one",
      persona: { id: "airead-itest-p1", slug: "airead-itest-p1", name: "Persona One" },
    });
    expect(reading.readingType).toBe("persona");
    expect(reading.personaSlug).toBe("airead-itest-p1");
  });
});

describeCutover("isEligibleForFreeReading", () => {
  it("is true before any question reading and false after", async () => {
    expect(await isEligibleForFreeReading(MEMBER)).toBe(true);
    await createPendingReading({ ...BIRTH, memberId: MEMBER, question: "q" });
    expect(await isEligibleForFreeReading(MEMBER)).toBe(false);
  });

  it("is not consumed by a reading of another type", async () => {
    await createPendingKundliReport({ ...BIRTH, memberId: MEMBER });
    expect(await isEligibleForFreeReading(MEMBER)).toBe(true);
  });

  it("is per member", async () => {
    await query(`insert into public.members (id, name, email) values ($1,$2,$3)`, [OTHER, "Other", `${OTHER}@example.test`]);
    await createPendingReading({ ...BIRTH, memberId: MEMBER, question: "q" });
    expect(await isEligibleForFreeReading(OTHER)).toBe(true);
  });
});

describeCutover("creation and round-tripping", () => {
  it("stores every reading type with its own price", async () => {
    const cases: Array<[string, Promise<AiReading>]> = [
      ["question", createPendingReading({ ...BIRTH, memberId: MEMBER, question: "q" })],
      ["kundli", createPendingKundliReport({ ...BIRTH, memberId: MEMBER })],
      ["vastu", createPendingVastuReading({ memberId: MEMBER, clientName: "C", question: "q" })],
      ["lalkitab", createPendingLalKitabReading({ ...BIRTH, memberId: MEMBER, question: "q" })],
    ];
    for (const [type, promise] of cases) {
      const reading = await promise;
      expect(reading.readingType).toBe(type);
      expect(reading.status).toBe("pending_payment");
      expect(typeof reading.price).toBe("number");
      expect(reading.currency).toBe("INR");
      expect(reading.aiAttempts).toBe(0);
    }
    expect(AI_READING_PRICE).toBe(99);
    expect(AI_KUNDLI_PRICE).toBe(499);
  });

  it("keeps the varshphal year", async () => {
    const reading = await createPendingVarshphalReading({ ...BIRTH, memberId: MEMBER, year: 2027 });
    expect(reading.year).toBe(2027);
    expect(typeof reading.year).toBe("number");
  });

  it("round-trips the tarot spread through jsonb", async () => {
    const cards = [
      { name: "The Fool", position: "past", reversed: false },
      { name: "The Moon", position: "present", reversed: true },
    ] as never;
    const reading = await createPendingTarotReading({ memberId: MEMBER, clientName: "C", question: "q", cards });
    expect(reading.tarotCards).toEqual(cards);
    expect(await getReadingById(reading.id, MEMBER)).toMatchObject({ tarotCards: cards });
  });

  it("round-trips face image paths through jsonb", async () => {
    const readingId = reserveReadingId();
    const paths = [`face-readings/${MEMBER}/${readingId}/face-0.jpg`, `face-readings/${MEMBER}/${readingId}/face-1.jpg`];
    const reading = await createPendingFaceReading({ readingId, memberId: MEMBER, clientName: "C", faceImagePaths: paths, question: "q" });
    expect(reading.id).toBe(readingId);
    expect(reading.faceImagePaths).toEqual(paths);
    expect(reading.question).toBe("q");
  });

  it("writes a palm reading under its reserved id", async () => {
    const readingId = reserveReadingId();
    const reading = await createPendingPalmReading({
      readingId,
      memberId: MEMBER,
      clientName: "C",
      leftPalmImagePath: `palm-readings/${MEMBER}/${readingId}/left.jpg`,
      rightPalmImagePath: `palm-readings/${MEMBER}/${readingId}/right.jpg`,
    });
    expect(reading.id).toBe(readingId);
    expect(reading.price).toBe(AI_PALM_READING_PRICE);
    expect(reading.leftPalmImagePath).toContain("/left.jpg");
  });

  it("starts a zero-priced persona reading paid, so the retry route accepts it", async () => {
    const free = await createPendingPersonaReading({ memberId: MEMBER, clientName: "C", question: "q", personaId: "airead-itest-p1", personaSlug: "airead-itest-p1", personaName: "P", price: 0 });
    expect(free.status).toBe("paid");
    const paid = await createPendingPersonaReading({ memberId: MEMBER, clientName: "C", question: "q", personaId: "airead-itest-p2", personaSlug: "airead-itest-p2", personaName: "P", price: 199 });
    expect(paid.status).toBe("pending_payment");
  });
});

describeCutover("reads", () => {
  it("returns null for another member's reading", async () => {
    const reading = await createPendingReading({ ...BIRTH, memberId: MEMBER, question: "q" });
    expect(await getReadingById(reading.id, MEMBER)).not.toBeNull();
    expect(await getReadingById(reading.id, OTHER)).toBeNull();
    expect(await getReadingById("airead-itest-ghost", MEMBER)).toBeNull();
  });

  it("stores the razorpay order id on the reading", async () => {
    const reading = await createPendingReading({ ...BIRTH, memberId: MEMBER, question: "q" });
    await attachRazorpayOrderInSupabase(reading.id, "order_itest_1");
    expect((await getReadingById(reading.id, MEMBER))?.razorpayOrderId).toBe("order_itest_1");
  });

  it("lists a member's readings newest first", async () => {
    await query(`insert into public.members (id, name, email) values ($1,$2,$3)`, [OTHER, "Other", `${OTHER}@example.test`]);
    const first = await createPendingReading({ ...BIRTH, memberId: MEMBER, question: "one" });
    await new Promise((resolve) => setTimeout(resolve, 10));
    const second = await createPendingReading({ ...BIRTH, memberId: MEMBER, question: "two" });
    await createPendingReading({ ...BIRTH, memberId: OTHER, question: "other" });

    const rows = await getReadingsForMember(MEMBER);
    expect(rows.map((r) => r.id)).toEqual([second.id, first.id]);
  });
});

describeCutover("markReadingPaid", () => {
  it("moves a pending reading to paid and records the payment id", async () => {
    const reading = await createPendingReading({ ...BIRTH, memberId: MEMBER, question: "q" });
    const paid = await markReadingPaid({ readingId: reading.id, razorpayPaymentId: "pay_airead_itest_1" });
    expect(paid?.status).toBe("paid");
    expect(paid?.razorpayPaymentId).toBe("pay_airead_itest_1");
    expect((await rawReading(reading.id)).status).toBe("paid");
  });

  it("is idempotent: a repeated verify returns the reading, not an error", async () => {
    const reading = await createPendingReading({ ...BIRTH, memberId: MEMBER, question: "q" });
    await markReadingPaid({ readingId: reading.id, razorpayPaymentId: "pay_airead_itest_1" });
    const again = await markReadingPaid({ readingId: reading.id, razorpayPaymentId: "pay_airead_itest_2" });
    expect(again?.status).toBe("paid");
    // The first payment id must survive; the retry must not overwrite it.
    expect(again?.razorpayPaymentId).toBe("pay_airead_itest_1");
  });

  it("returns null for a reading that does not exist", async () => {
    expect(await markReadingPaid({ readingId: "airead-itest-ghost", razorpayPaymentId: "pay_x" })).toBeNull();
  });

  it("does not settle a reading that is already paid", async () => {
    const reading = await createFreeReading({ ...BIRTH, memberId: MEMBER, question: "q" });
    const result = await markReadingPaid({ readingId: reading.id, razorpayPaymentId: "pay_airead_itest_9" });
    expect(result?.status).toBe("paid");
    expect(result?.razorpayPaymentId).toBeNull();
  });
});

describeCutover("markReadingPaidWithoutCharge", () => {
  it("marks paid and flags the row as a bypass, never as revenue", async () => {
    const reading = await createPendingReading({ ...BIRTH, memberId: MEMBER, question: "q" });
    const paid = await markReadingPaidWithoutCharge({ readingId: reading.id, memberId: MEMBER });
    expect(paid?.status).toBe("paid");
    const row = await rawReading(reading.id);
    expect(row.paid_via_bypass).toBe(true);
    expect(row.paid_from_wallet).toBe(false);
    expect(row.razorpay_payment_id).toBeNull();
  });

  it("refuses another member's reading", async () => {
    const reading = await createPendingReading({ ...BIRTH, memberId: MEMBER, question: "q" });
    expect(await markReadingPaidWithoutCharge({ readingId: reading.id, memberId: OTHER })).toBeNull();
    expect((await rawReading(reading.id)).status).toBe("pending_payment");
    expect((await rawReading(reading.id)).paid_via_bypass).toBe(false);
  });
});

describeCutover("payReadingFromWallet", () => {
  it("debits the wallet by the reading price and flags the source", async () => {
    await query(`insert into public.members (id, name, email) values ($1,$2,$3)`, [OTHER, "Other", `${OTHER}@example.test`]);
    await rechargeWallet({ memberId: MEMBER, amount: 1000, razorpayPaymentId: "pay_airead_itest_recharge" });
    const reading = await createPendingReading({ ...BIRTH, memberId: MEMBER, question: "q" });

    const paid = await payReadingFromWallet({ readingId: reading.id, memberId: MEMBER });
    expect(paid?.status).toBe("paid");

    const row = await rawReading(reading.id);
    expect(row.paid_from_wallet).toBe(true);
    expect(row.paid_via_bypass).toBe(false);

    const balance = Number((await query(`select balance from public.wallets where id = $1`, [MEMBER])).rows[0].balance);
    expect(balance).toBe(1000 - AI_READING_PRICE);
  });

  it("takes no money for a reading that belongs to someone else", async () => {
    await rechargeWallet({ memberId: MEMBER, amount: 1000, razorpayPaymentId: "pay_airead_itest_recharge" });
    const reading = await createPendingReading({ ...BIRTH, memberId: MEMBER, question: "q" });

    expect(await payReadingFromWallet({ readingId: reading.id, memberId: OTHER })).toBeNull();
    expect((await rawReading(reading.id)).status).toBe("pending_payment");
    const balance = Number((await query(`select balance from public.wallets where id = $1`, [MEMBER])).rows[0].balance);
    expect(balance).toBe(1000);
  });

  it("will not flip a capped-out reading back to paid, even called directly", async () => {
    // Callers pre-check status === "pending_payment", so this guard only bites when
    // the attempt cap is crossed between the caller's read and this write. Without
    // it a reading the member has permanently failed would be served as paid.
    const reading = await createPendingReading({ ...BIRTH, memberId: MEMBER, question: "q" });
    await markReadingPaid({ readingId: reading.id, razorpayPaymentId: "pay_airead_itest_cap" });
    await failOnce(reading.id);
    await failOnce(reading.id);
    await failOnce(reading.id);
    expect((await getReadingById(reading.id, MEMBER))?.status).toBe("failed");

    for (const settle of [
      () => markReadingPaidViaBypassInSupabase(reading.id, MEMBER),
      () => markReadingPaidFromWalletInSupabase(reading.id, MEMBER),
    ]) {
      const outcome = await settle();
      expect(outcome.kind).toBe("already_settled");
      expect((await getReadingById(reading.id, MEMBER))?.status).toBe("failed");
    }
  });

  it("does not debit twice for an already-settled reading", async () => {
    await rechargeWallet({ memberId: MEMBER, amount: 1000, razorpayPaymentId: "pay_airead_itest_recharge" });
    const reading = await createPendingReading({ ...BIRTH, memberId: MEMBER, question: "q" });
    await payReadingFromWallet({ readingId: reading.id, memberId: MEMBER });
    await payReadingFromWallet({ readingId: reading.id, memberId: MEMBER });

    const balance = Number((await query(`select balance from public.wallets where id = $1`, [MEMBER])).rows[0].balance);
    expect(balance).toBe(1000 - AI_READING_PRICE);
  });
});

describeCutover("failed-attempt cap", () => {
  /** Drives the private counter through the public path: a kundli generation that
   * fails. The engine is mocked to succeed, so fail it by handing the reading
   * impossible birth data instead of reaching into the module. */
  it("caps retries at three and notifies on the crossing call only", async () => {
    const reading = await createPendingReading({ ...BIRTH, memberId: MEMBER, question: "q" });
    await markReadingPaid({ readingId: reading.id, razorpayPaymentId: "pay_airead_itest_1" });

    await failOnce(reading.id);
    expect(await rawReading(reading.id)).toMatchObject({ ai_attempts: 1, status: "paid" });
    await failOnce(reading.id);
    expect(await rawReading(reading.id)).toMatchObject({ ai_attempts: 2, status: "paid" });
    await failOnce(reading.id);
    expect(await rawReading(reading.id)).toMatchObject({ ai_attempts: 3, status: "failed" });
    expect((await rawReading(reading.id)).last_ai_error).toContain("Palm images are missing");

    // A fourth attempt must not advance the counter or notify a second time.
    await failOnce(reading.id);
    expect(await rawReading(reading.id)).toMatchObject({ ai_attempts: 3, status: "failed" });
  });

  it("never lets concurrent retries slip past the cap", async () => {
    await warmPool();
    const reading = await createPendingReading({ ...BIRTH, memberId: MEMBER, question: "q" });
    await markReadingPaid({ readingId: reading.id, razorpayPaymentId: "pay_airead_itest_1" });

    // A read-then-increment would let several of these read the same stale count
    // and write back the same value, quietly exceeding the cap and spending
    // uncapped Gemini quota on a reading that was never going to succeed.
    await Promise.allSettled(Array.from({ length: 8 }, () => failOnce(reading.id)));

    const row = await rawReading(reading.id);
    expect(row.ai_attempts).toBe(3);
    expect(row.status).toBe("failed");
  });

  it("notifies admins on the crossing call only, never twice", async () => {
    // shouldNotify comes out of the same statement that increments the counter, so
    // this is what proves RETURNING reports the crossing rather than the new state.
    const notify = spies.notifyAdmins;
    notify.mockClear();

    const reading = await createPendingReading({ ...BIRTH, memberId: MEMBER, question: "q" });
    await markReadingPaid({ readingId: reading.id, razorpayPaymentId: "pay_airead_itest_1" });

    await failOnce(reading.id);
    await failOnce(reading.id);
    expect(notify).not.toHaveBeenCalled();

    await failOnce(reading.id);
    expect(notify).toHaveBeenCalledTimes(1);

    await failOnce(reading.id);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("throws rather than fabricating an answer for a reading that no longer exists", async () => {
    // generateReadingAnswer takes the reading as an argument, so a stale object for
    // a deleted row reaches the save and updates nothing. Firestore's update()
    // throws there; the port must too instead of returning a made-up "answered".
    const reading = await createPendingReading({ ...BIRTH, memberId: MEMBER, question: "q" });
    await markReadingPaid({ readingId: reading.id, razorpayPaymentId: "pay_airead_itest_gone" });
    await query(`delete from public.ai_readings where id = $1`, [reading.id]);

    await expect(generateReadingAnswer(reading)).rejects.toThrow("Reading no longer exists.");
  });

  it("refuses to regenerate a permanently failed reading", async () => {
    const reading = await createPendingReading({ ...BIRTH, memberId: MEMBER, question: "q" });
    await query(`update public.ai_readings set status = 'failed' where id = $1`, [reading.id]);
    await expect(generateReadingAnswer((await getReadingById(reading.id, MEMBER))!)).rejects.toThrow(
      "This reading could not be generated after several attempts",
    );
  });
});

describeCutover("generateReadingAnswer", () => {
  it("saves the answer and moves the reading to answered", async () => {
    const reading = await createPendingKundliReport({ ...BIRTH, memberId: MEMBER });
    await markReadingPaid({ readingId: reading.id, razorpayPaymentId: "pay_airead_itest_1" });

    const answered = await generateReadingAnswer((await getReadingById(reading.id, MEMBER))!);
    expect(answered.status).toBe("answered");
    expect(answered.answer).toBe("KUNDLI REPORT");
    expect(answered.answeredAt).toBeInstanceOf(Date);

    const stored = await getReadingById(reading.id, MEMBER);
    expect(stored?.status).toBe("answered");
    expect(stored?.answer).toBe("KUNDLI REPORT");
  });

  it("returns an already-answered reading without regenerating", async () => {
    const reading = await createPendingKundliReport({ ...BIRTH, memberId: MEMBER });
    await markReadingPaid({ readingId: reading.id, razorpayPaymentId: "pay_airead_itest_1" });
    const first = await generateReadingAnswer((await getReadingById(reading.id, MEMBER))!);
    const second = await generateReadingAnswer(first);
    expect(second.answer).toBe("KUNDLI REPORT");
  });

  it("dispatches a varshphal reading to the solar-return engine", async () => {
    const reading = await createPendingVarshphalReading({ ...BIRTH, memberId: MEMBER, year: 2027 });
    await markReadingPaid({ readingId: reading.id, razorpayPaymentId: "pay_airead_itest_1" });
    const answered = await generateReadingAnswer((await getReadingById(reading.id, MEMBER))!);
    expect(answered.answer).toBe("VARSHPHAL REPORT");
  });
});
