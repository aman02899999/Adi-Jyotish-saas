import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { closePgPool, query } from "@/lib/postgres";

// practitioner-auth imports the locale-aware redirect for its page guard; none of it runs here.
vi.mock("@/i18n/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next-intl/server", () => ({ getLocale: async () => "en" }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: vi.fn(), delete: vi.fn() }) }));
const { hasPractitionerForUid } = await import("@/lib/practitioner-auth");

/**
 * The practitioner sign-in routes ask hasPractitionerForUid before deciding to demand a 2FA code.
 * It used to read Firestore whatever the cutover flag said, so after cutover a practitioner linked
 * in Postgres looked like "no such practitioner" and was never challenged. Needs a migrated
 * database and SUPABASE_CUTOVER=true.
 */
const describeCutover = process.env.SUPABASE_DB_URL && process.env.SUPABASE_CUTOVER === "true" ? describe : describe.skip;

const ID = "pauth_itest_prac";
const UID = "pauth-itest-uid";

describeCutover("practitioner 2FA gate lookup under cutover", () => {
  beforeAll(async () => {
    await query(`delete from public.practitioners where id = $1`, [ID]);
    await query(
      `insert into public.practitioners (id, name, slug, email, active, firebase_uid) values ($1, $1, $1, $2, false, $3)`,
      [ID, `${ID}@example.test`, UID],
    );
  });
  afterAll(async () => {
    await query(`delete from public.practitioners where id = $1`, [ID]);
    await closePgPool();
  });

  it("finds a practitioner linked only in Postgres", async () => {
    expect(await hasPractitionerForUid(UID)).toBe(true);
  });

  it("still finds a deactivated one, so the 2FA challenge is never skipped for them", async () => {
    // The row above is inserted inactive on purpose.
    expect(await hasPractitionerForUid(UID)).toBe(true);
  });

  it("finds nobody for an unlinked uid", async () => {
    expect(await hasPractitionerForUid("pauth-itest-nobody")).toBe(false);
  });
});
