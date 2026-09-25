import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { closePgPool, query } from "@/lib/postgres";

/**
 * Practitioner create / edit / delete on Postgres, through the same functions both admin pages
 * call. Until this port they wrote Firestore unconditionally, so after cutover an admin's new
 * practitioner, edit or deletion would have gone to a database nothing reads. Needs a migrated
 * database and SUPABASE_CUTOVER=true.
 */
const describeCutover = process.env.SUPABASE_DB_URL && process.env.SUPABASE_CUTOVER === "true" ? describe : describe.skip;

vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn, revalidateTag: vi.fn() }));

const { createPractitionerAdmin, deletePractitionerAdmin, getPractitionerById, updatePractitionerAdmin, PractitionerAdminError } = await import("@/lib/scheduling");
const { getPractitionerPortalProfile } = await import("@/lib/practitioner-portal");

const NAME = "Padmin Itest";
const SLUG = "padmin-itest";

async function cleanup() {
  await query(`delete from public.bookings where id like 'padmin\\_itest\\_%'`);
  await query(`delete from public.services where id like 'padmin\\_itest\\_%'`);
  // By email as well as id: "Other Itest" is created with the slug other-itest.
  await query(`delete from public.practitioners where id like 'padmin-itest%' or id like 'padmin\\_itest\\_%' or email like 'padmin-itest%'`);
}

const base = { name: NAME, email: "padmin-itest@example.test", bio: "A long enough biography." };

describeCutover("practitioner management on Postgres", () => {
  beforeEach(cleanup);
  afterAll(async () => {
    await cleanup();
    await closePgPool();
  });

  it("creates a practitioner with starter hours in one step", async () => {
    const created = await createPractitionerAdmin({ ...base, chatRatePerMinute: 40 }, { starterHours: true });
    expect(created).toMatchObject({ id: SLUG, slug: SLUG, email: base.email, chatRatePerMinute: 40, verified: false, isAiPowered: false });
    const { rows } = await query<{ weekday: number }>(`select weekday from public.availability_rules where practitioner_id = $1 order by weekday`, [SLUG]);
    expect(rows.map((row) => row.weekday)).toEqual([1, 2, 3, 4, 5]);
  });

  it("gives a clashing name the next free profile URL", async () => {
    await createPractitionerAdmin(base);
    const second = await createPractitionerAdmin({ ...base, email: "padmin-itest-2@example.test" });
    expect(second.slug).toBe(`${SLUG}-2`);
  });

  it("refuses a duplicate email, whatever its case", async () => {
    await createPractitionerAdmin(base);
    await expect(createPractitionerAdmin({ ...base, email: base.email.toUpperCase() })).rejects.toBeInstanceOf(PractitionerAdminError);
  });

  it("edits only what it is given, and refuses another practitioner's email", async () => {
    await createPractitionerAdmin(base);
    const other = await createPractitionerAdmin({ ...base, name: "Other Itest", email: "padmin-itest-other@example.test" });

    const updated = await updatePractitionerAdmin(SLUG, { chatRatePerMinute: 55, verified: true });
    expect(updated).toMatchObject({ chatRatePerMinute: 55, verified: true, bio: base.bio });
    await expect(updatePractitionerAdmin(SLUG, { email: other.email })).rejects.toThrow("another practitioner");
  });

  it("keeps an AI persona online", async () => {
    await createPractitionerAdmin(base);
    await query(`update public.practitioners set is_ai_powered = true, online = true where id = $1`, [SLUG]);
    expect((await updatePractitionerAdmin(SLUG, { online: false })).online).toBe(true);
  });

  it("deletes an unused practitioner, hours included", async () => {
    await createPractitionerAdmin(base, { starterHours: true });
    await deletePractitionerAdmin(SLUG);
    const { rows } = await query(`select 1 from public.availability_rules where practitioner_id = $1`, [SLUG]);
    expect(rows).toHaveLength(0);
    await expect(deletePractitionerAdmin(SLUG)).rejects.toThrow("not found");
  });

  it("finds a practitioner by id, and nobody for an unknown one", async () => {
    await createPractitionerAdmin(base);
    expect(await getPractitionerById(SLUG)).toMatchObject({ id: SLUG, email: base.email });
    expect(await getPractitionerById("padmin-itest-nobody")).toBeNull();
  });

  it("tells the profile page whether payout details are on file, never what they are", async () => {
    await createPractitionerAdmin(base);
    await query(`update public.practitioners set bank_account_number_enc = 'CIPHERTEXT-ACCOUNT', totp_enabled = true where id = $1`, [SLUG]);

    const profile = await getPractitionerPortalProfile(SLUG);
    expect(profile).toMatchObject({ hasBankAccount: true, hasUpi: false, totpEnabled: true, bio: base.bio });
    expect(JSON.stringify(profile)).not.toContain("CIPHERTEXT");
  });

  it("refuses to delete a practitioner with bookings", async () => {
    await createPractitionerAdmin(base);
    await query(`insert into public.services (id, slug, title, category, description, price, duration) values ('padmin_itest_svc', 'padmin_itest_svc', 'R', 'T', 'd', 100, 30)`);
    await query(
      `insert into public.bookings (id, reference, service_id, service_title, service_price, service_duration, practitioner_id, practitioner_name,
         client_name, client_email, birth_date, birth_time, birth_place, scheduled_at, status, payment_status)
       values ('padmin_itest_b', 'padmin_itest_b', 'padmin_itest_svc', 'R', 100, 30, $1, 'P', 'C', 'c@example.test', '1990-01-01', '10:00', 'Delhi', now(), 'completed', 'paid')`,
      [SLUG],
    );
    await expect(deletePractitionerAdmin(SLUG)).rejects.toThrow("deactivate instead");
    const { rows } = await query(`select 1 from public.practitioners where id = $1`, [SLUG]);
    expect(rows).toHaveLength(1);
  });
});
