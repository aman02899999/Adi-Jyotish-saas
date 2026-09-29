import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { closePgPool, query } from "@/lib/postgres";

/**
 * Review moderation, member reviews and favourites on Postgres. Until this port every one of them
 * wrote Firestore unconditionally, so after cutover a member's review, an admin's hide or delete,
 * and every favourite would have gone to a database nothing reads — and the profile page's review
 * form, which lists bookings from Firestore, would never have offered a booking to review.
 *
 * Skipped unless SUPABASE_DB_URL points at a migrated database; the route cases also need
 * SUPABASE_CUTOVER=true.
 */
const describeDb = process.env.SUPABASE_DB_URL ? describe : describe.skip;
const describeCutover = process.env.SUPABASE_DB_URL && process.env.SUPABASE_CUTOVER === "true" ? describe : describe.skip;

vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn, revalidateTag: vi.fn() }));
const session = vi.hoisted(() => ({ member: null as null | { id: string; name: string; email: string } }));
vi.mock("@/lib/member-auth", () => ({ getCurrentMember: async () => session.member }));
vi.mock("@/lib/admin-auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin-auth")>()),
  getCurrentAdmin: async () => ({ id: "admin-itest", name: "Admin", email: "admin@example.test", role: "owner", permissions: ["reviews"] }),
  hasAdminPermission: () => true,
  recordAudit: async () => {},
}));

const { deleteReviewInSupabase, insertMemberReviewInSupabase, setReviewStatusInSupabase } = await import("@/lib/practitioners-supabase");
const { getUnreviewedCompletedBookingsInSupabase } = await import("@/lib/bookings-supabase");
const { listFavoritePractitionerIdsInSupabase, toggleFavoriteInSupabase } = await import("@/lib/member-favorites-supabase");

const P = "revfav_itest_";
const PRAC = `${P}prac`;
const OTHER_PRAC = `${P}prac2`;
const MEMBER = `${P}member`;
const EMAIL = `${P}member@example.test`;
const SERVICE = `${P}svc`;

async function cleanup() {
  await query(`delete from public.practitioner_reviews where id like 'revfav\\_itest\\_%'`);
  await query(`delete from public.member_favorites where member_id like 'revfav\\_itest\\_%'`);
  await query(`delete from public.bookings where id like 'revfav\\_itest\\_%'`);
  await query(`delete from public.members where id like 'revfav\\_itest\\_%'`);
  await query(`delete from public.practitioners where id like 'revfav\\_itest\\_%'`);
  await query(`delete from public.services where id like 'revfav\\_itest\\_%'`);
}

async function seed() {
  await cleanup();
  for (const id of [PRAC, OTHER_PRAC]) {
    await query(`insert into public.practitioners (id, name, slug, email, active) values ($1, $1, $1, $2, true)`, [id, `${id}@example.test`]);
  }
  await query(`insert into public.members (id, name, email) values ($1, 'Asha', $2)`, [MEMBER, EMAIL]);
  await query(
    `insert into public.services (id, slug, title, category, description, price, duration) values ($1, $1, 'Reading', 'Test', 'd', 1500, 30)`,
    [SERVICE],
  );
}

let bookingSeq = 0;
async function addBooking(opts: { practitionerId?: string; status?: string; email?: string } = {}) {
  bookingSeq += 1;
  const id = `${P}b${bookingSeq}`;
  await query(
    `insert into public.bookings (id, reference, service_id, service_title, service_price, service_duration, practitioner_id, practitioner_name,
       client_name, client_email, birth_date, birth_time, birth_place, scheduled_at, status, payment_status)
     values ($1, $1, $5, 'Reading', 1500, 30, $2, 'P', 'Asha', $3, '1990-01-01', '10:00', 'Delhi', now() - interval '2 days', $4, 'paid')`,
    [id, opts.practitionerId ?? PRAC, opts.email ?? EMAIL, opts.status ?? "completed", SERVICE],
  );
  return id;
}

const review = (bookingId: string) => ({
  practitionerId: PRAC, memberId: MEMBER, bookingId, reviewerName: "Asha",
  rating: 4, clarity: 5, empathy: 4, usefulness: 3, body: "A clear and useful consultation, thank you.", status: "published", source: "member",
});

describeDb("reviews and favourites on Postgres", () => {
  beforeEach(seed);
  afterAll(async () => {
    await cleanup();
    await closePgPool();
  });

  describe("member reviews", () => {
    it("inserts one review per booking, keyed by the booking", async () => {
      const bookingId = await addBooking();
      const created = await insertMemberReviewInSupabase(review(bookingId));
      expect(created).toMatchObject({ id: bookingId, bookingId, practitionerId: PRAC, rating: 4, source: "member" });
      expect(typeof created?.rating).toBe("number");
    });

    it("inserts nothing for a second review of the same booking", async () => {
      const bookingId = await addBooking();
      await insertMemberReviewInSupabase(review(bookingId));
      expect(await insertMemberReviewInSupabase({ ...review(bookingId), rating: 1 })).toBeNull();
      const { rows } = await query(`select rating from public.practitioner_reviews where id = $1`, [bookingId]);
      expect(rows).toEqual([{ rating: 4 }]);
    });

    it("lets exactly one of two racing submits through", async () => {
      const bookingId = await addBooking();
      const results = await Promise.all([insertMemberReviewInSupabase(review(bookingId)), insertMemberReviewInSupabase(review(bookingId))]);
      expect(results.filter(Boolean)).toHaveLength(1);
    });
  });

  describe("moderation", () => {
    it("hides and republishes a review", async () => {
      const bookingId = await addBooking();
      await insertMemberReviewInSupabase(review(bookingId));
      expect(await setReviewStatusInSupabase(bookingId, "hidden")).toMatchObject({ id: bookingId, status: "hidden", practitionerId: PRAC });
      expect(await setReviewStatusInSupabase(bookingId, "published")).toMatchObject({ status: "published" });
    });

    it("reports a missing review rather than pretending", async () => {
      expect(await setReviewStatusInSupabase(`${P}nope`, "hidden")).toBeNull();
      expect(await deleteReviewInSupabase(`${P}nope`)).toBeNull();
    });

    it("deletes a review once and says whose it was", async () => {
      const bookingId = await addBooking();
      await insertMemberReviewInSupabase(review(bookingId));
      expect(await deleteReviewInSupabase(bookingId)).toEqual({ practitionerId: PRAC });
      expect(await deleteReviewInSupabase(bookingId)).toBeNull();
    });
  });

  describe("bookings the review form offers", () => {
    it("offers completed, unreviewed bookings with this practitioner only", async () => {
      const eligible = await addBooking();
      await addBooking({ status: "confirmed" });
      await addBooking({ practitionerId: OTHER_PRAC });
      await addBooking({ email: `${P}someone-else@example.test` });

      const offered = await getUnreviewedCompletedBookingsInSupabase(EMAIL, PRAC);
      expect(offered.map((b) => b.id)).toEqual([eligible]);
      expect(offered[0].scheduledAt).toBeInstanceOf(Date);
    });

    it("stops offering a booking once reviewed, even if the review is hidden", async () => {
      const bookingId = await addBooking();
      await insertMemberReviewInSupabase(review(bookingId));
      await setReviewStatusInSupabase(bookingId, "hidden");
      expect(await getUnreviewedCompletedBookingsInSupabase(EMAIL, PRAC)).toEqual([]);
    });

    it("matches the member's email regardless of case", async () => {
      const bookingId = await addBooking();
      expect((await getUnreviewedCompletedBookingsInSupabase(EMAIL.toUpperCase(), PRAC)).map((b) => b.id)).toEqual([bookingId]);
    });
  });

  describe("favourites", () => {
    it("adds, lists and removes a favourite", async () => {
      expect(await toggleFavoriteInSupabase(MEMBER, PRAC)).toBe(true);
      expect(await listFavoritePractitionerIdsInSupabase(MEMBER)).toEqual([PRAC]);
      expect(await toggleFavoriteInSupabase(MEMBER, PRAC)).toBe(false);
      expect(await listFavoritePractitionerIdsInSupabase(MEMBER)).toEqual([]);
    });

    it("never stores the same favourite twice", async () => {
      await Promise.all([toggleFavoriteInSupabase(MEMBER, PRAC), toggleFavoriteInSupabase(MEMBER, PRAC), toggleFavoriteInSupabase(MEMBER, PRAC)]);
      const { rows } = await query<{ n: number }>(`select count(*)::int as n from public.member_favorites where member_id = $1`, [MEMBER]);
      expect(rows[0].n).toBeLessThanOrEqual(1);
    });
  });

  describeCutover("through the routes, with the cutover on", () => {
    it("a member reviews a completed consultation, once", async () => {
      session.member = { id: MEMBER, name: "Asha", email: EMAIL };
      const bookingId = await addBooking();
      const { POST } = await import("@/app/api/member/reviews/route");
      const submit = () => POST(new Request("https://example.test/api/member/reviews", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9" },
        body: JSON.stringify({ bookingId, rating: 5, clarity: 5, empathy: 4, usefulness: 4, body: "Clear, patient and practical throughout the session." }),
      }));

      expect((await submit()).status).toBe(201);
      expect((await submit()).status).toBe(409);
      const { rows } = await query(`select source, status from public.practitioner_reviews where id = $1`, [bookingId]);
      expect(rows).toEqual([{ source: "member", status: "published" }]);
    });

    it("refuses a review of someone else's booking", async () => {
      session.member = { id: MEMBER, name: "Asha", email: EMAIL };
      const bookingId = await addBooking({ email: `${P}someone-else@example.test` });
      const { POST } = await import("@/app/api/member/reviews/route");
      const response = await POST(new Request("https://example.test/api/member/reviews", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.10" },
        body: JSON.stringify({ bookingId, rating: 5, clarity: 5, empathy: 4, usefulness: 4, body: "Clear, patient and practical throughout the session." }),
      }));
      expect(response.status).toBe(403);
    });

    it("an admin hides and deletes a review", async () => {
      const bookingId = await addBooking();
      await insertMemberReviewInSupabase(review(bookingId));
      const { PUT, DELETE } = await import("@/app/api/admin/reviews/[id]/route");
      const params = { params: Promise.resolve({ id: bookingId }) };

      const hidden = await PUT(new Request("https://example.test", { method: "PUT", body: JSON.stringify({ status: "hidden" }) }), params);
      expect(hidden.status).toBe(200);
      await expect(hidden.json()).resolves.toMatchObject({ status: "hidden" });

      expect((await DELETE(new Request("https://example.test", { method: "DELETE" }), params)).status).toBe(200);
      expect((await DELETE(new Request("https://example.test", { method: "DELETE" }), params)).status).toBe(404);
    });

    it("the profile page's review form reads its bookings from Postgres", async () => {
      const bookingId = await addBooking();
      const { getEligibleReviewBookings, getFavoritePractitionerIds } = await import("@/lib/marketplace");
      expect((await getEligibleReviewBookings(EMAIL, PRAC)).map((b) => b.id)).toEqual([bookingId]);
      await toggleFavoriteInSupabase(MEMBER, PRAC);
      expect(await getFavoritePractitionerIds(MEMBER)).toEqual([PRAC]);
    });

    it("a member toggles a favourite", async () => {
      session.member = { id: MEMBER, name: "Asha", email: EMAIL };
      const { POST, GET } = await import("@/app/api/member/favorites/route");
      const toggle = () => POST(new Request("https://example.test", { method: "POST", body: JSON.stringify({ practitionerId: PRAC }) }));

      await expect((await toggle()).json()).resolves.toEqual({ favorited: true });
      await expect((await GET()).json()).resolves.toEqual({ practitionerIds: [PRAC] });
      await expect((await toggle()).json()).resolves.toEqual({ favorited: false });
    });
  });
});
