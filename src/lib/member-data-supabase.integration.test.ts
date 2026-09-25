import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { closePgPool, query } from "@/lib/postgres";

/**
 * A member's own data on Postgres: their bookings, their next session, their birth profile and
 * their family members. Each of these read or wrote Firestore regardless of the cutover flag, so
 * after cutover a member would have seen none of what they did afterwards. Needs a migrated
 * database and SUPABASE_CUTOVER=true.
 */
const describeCutover = process.env.SUPABASE_DB_URL && process.env.SUPABASE_CUTOVER === "true" ? describe : describe.skip;

vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn, revalidateTag: vi.fn() }));
const session = vi.hoisted(() => ({ member: null as null | Record<string, unknown> }));
vi.mock("@/lib/member-auth", () => ({ getCurrentMember: async () => session.member }));

const { listMemberBookings, getNextMemberBooking } = await import("@/lib/member-bookings");
const { addFamilyMember, deleteFamilyMember, listFamilyMembers, FamilyMemberError } = await import("@/lib/family-members");

const P = "mdata_itest_";
const MEMBER = `${P}member`;
const OTHER = `${P}other`;
const EMAIL = `${P}member@example.test`;

async function cleanup() {
  await query(`delete from public.family_members where member_id like 'mdata\\_itest\\_%'`);
  await query(`delete from public.bookings where id like 'mdata\\_itest\\_%'`);
  await query(`delete from public.members where id like 'mdata\\_itest\\_%'`);
  await query(`delete from public.services where id like 'mdata\\_itest\\_%'`);
  await query(`delete from public.practitioners where id like 'mdata\\_itest\\_%'`);
}

let seq = 0;
async function booking(hoursFromNow: number, status: string, email = EMAIL) {
  seq += 1;
  const id = `${P}b${seq}`;
  await query(
    `insert into public.bookings (id, reference, service_id, service_title, service_price, service_duration, practitioner_id, practitioner_name,
       client_name, client_email, birth_date, birth_time, birth_place, scheduled_at, status, payment_status)
     values ($1, $1, '${P}svc', 'Reading', 1500, 30, '${P}prac', 'P', 'Asha', $2, '1990-01-01', '10:00', 'Delhi', now() + make_interval(hours => $3), $4, 'paid')`,
    [id, email, hoursFromNow, status],
  );
  return id;
}

const family = (name: string, memberId = MEMBER) => ({ memberId, name, relationship: "Sister", birthDate: "1992-03-14", birthTime: "06:30", birthPlace: "Jaipur, India" });

describeCutover("a member's own data on Postgres", () => {
  beforeEach(async () => {
    await cleanup();
    await query(`insert into public.practitioners (id, name, slug, email) values ('${P}prac', 'P', '${P}prac', '${P}prac@example.test')`);
    await query(`insert into public.services (id, slug, title, category, description, price, duration) values ('${P}svc', '${P}svc', 'R', 'T', 'd', 100, 30)`);
    for (const [id, email] of [[MEMBER, EMAIL], [OTHER, `${P}other@example.test`]]) {
      await query(`insert into public.members (id, name, email) values ($1, 'Asha', $2)`, [id, email]);
    }
    session.member = null;
  });
  afterAll(async () => {
    await cleanup();
    await closePgPool();
  });

  describe("bookings", () => {
    it("lists only the member's own, newest appointment first", async () => {
      const past = await booking(-48, "completed");
      const future = await booking(48, "confirmed");
      await booking(24, "confirmed", `${P}someone-else@example.test`);
      expect((await listMemberBookings(EMAIL)).map((b) => b.id)).toEqual([future, past]);
    });

    it("shows the next session, skipping one the member cancelled", async () => {
      await booking(-2, "confirmed");
      await booking(24, "cancelled");
      const next = await booking(48, "confirmed");
      expect((await getNextMemberBooking(EMAIL))?.id).toBe(next);
    });

    it("shows no next session when every upcoming one is cancelled", async () => {
      await booking(24, "cancelled");
      expect(await getNextMemberBooking(EMAIL)).toBeNull();
    });
  });

  describe("birth profile", () => {
    it("saves the member's birth details and marks onboarding complete", async () => {
      session.member = { id: MEMBER, name: "Asha", email: EMAIL, onboardingComplete: true };
      const { PUT } = await import("@/app/api/member/profile/route");
      const response = await PUT(new Request("https://example.test", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone: "+91 98000 00000", birthDate: "1990-05-17", birthTime: "04:45", birthPlace: "Jaipur, India" }),
      }));

      expect(response.status).toBe(200);
      const { rows } = await query(`select phone, birth_date, birth_time, birth_place, onboarding_complete from public.members where id = $1`, [MEMBER]);
      expect(rows[0]).toEqual({ phone: "+91 98000 00000", birth_date: "1990-05-17", birth_time: "04:45", birth_place: "Jaipur, India", onboarding_complete: true });
    });
  });

  describe("family members", () => {
    it("adds, lists in the order added, and deletes", async () => {
      const first = await addFamilyMember(family("Meera"));
      await addFamilyMember(family("Ravi"));
      expect((await listFamilyMembers(MEMBER)).map((f) => f.name)).toEqual(["Meera", "Ravi"]);

      await deleteFamilyMember(MEMBER, first.id);
      expect((await listFamilyMembers(MEMBER)).map((f) => f.name)).toEqual(["Ravi"]);
    });

    it("cannot delete another member's family entry", async () => {
      const theirs = await addFamilyMember(family("Theirs", OTHER));
      await deleteFamilyMember(MEMBER, theirs.id);
      expect(await listFamilyMembers(OTHER)).toHaveLength(1);
    });

    it("stops at twelve, even when adds race", async () => {
      for (let i = 0; i < 10; i += 1) await addFamilyMember(family(`Person ${i}`));
      const results = await Promise.allSettled(Array.from({ length: 5 }, (_, i) => addFamilyMember(family(`Racer ${i}`))));

      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
      expect(results.filter((r) => r.status === "rejected" && r.reason instanceof FamilyMemberError)).toHaveLength(3);
      expect(await listFamilyMembers(MEMBER)).toHaveLength(12);
    });
  });
});
