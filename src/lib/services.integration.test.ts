import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { query } from "@/lib/postgres";
import {
  countBookingsForServiceInSupabase,
  createServiceInSupabase,
  deleteServiceInSupabase,
  getAllServicesFromSupabase,
  getPublishedServicesFromSupabase,
  getServiceByIdInSupabase,
  seedServiceInSupabase,
  updateServiceInSupabase,
} from "@/lib/services-supabase";

/**
 * Integration tests for the service catalogue's data access. Skipped unless
 * SUPABASE_DB_URL points at a reachable database.
 *
 * The catalogue is shared with the seeded starter services and with other test files, so
 * every assertion here is scoped to this file's own rows. Asserting on the whole table
 * would make these fail for reasons that have nothing to do with the code under test.
 */
const describeDb = process.env.SUPABASE_DB_URL ? describe : describe.skip;

const P = "svc_itest_";

async function seedService(slug: string, input: { title: string; featured?: boolean; active?: boolean; price?: number }) {
  await seedServiceInSupabase({
    slug,
    title: input.title,
    category: "Test",
    description: "test service",
    price: input.price ?? 100,
    duration: 30,
    icon: "sparkles",
    active: input.active ?? true,
    featured: input.featured ?? false,
  });
}

/** Everything this file owns, in one place, so the assertions below can filter to it. */
const MINE = [`${P}aaa`, `${P}bbb`, `${P}ccc`, `${P}ddd`, `${P}booked`];

describeDb("service catalogue (live database)", () => {
  beforeAll(async () => {
    await query(`delete from public.bookings where id like 'svc\\_itest\\_%'`);
    await query(`delete from public.services where id like 'svc\\_itest\\_%'`);
    await query(`delete from public.practitioners where id like 'svc\\_itest\\_%'`);

    await query(
      `insert into public.practitioners (id, name, slug, email, created_at, updated_at)
       values ($1, 'Svc practitioner', $1, $2, now(), now())`,
      [`${P}prac`, `${P}prac@example.test`],
    );

    // Inserted in an order that is neither the featured order nor the title order, so a
    // missing `order by` cannot hide behind insertion order.
    await seedService(`${P}ccc`, { title: `${P}Charlie`, featured: false });
    await seedService(`${P}aaa`, { title: `${P}Alpha`, featured: true });
    await seedService(`${P}ddd`, { title: `${P}Delta`, featured: false, active: false });
    await seedService(`${P}bbb`, { title: `${P}Bravo`, featured: true });
    await seedService(`${P}booked`, { title: `${P}Booked`, featured: false });
  });

  afterAll(async () => {
    // A booking holds a foreign key to its service, so it has to go first or an unrelated
    // file's cleanup of this table would fail.
    await query(`delete from public.bookings where id like 'svc\\_itest\\_%'`);
    await query(`delete from public.services where id like 'svc\\_itest\\_%'`);
    await query(`delete from public.practitioners where id like 'svc\\_itest\\_%'`);
  });

  const mine = <T extends { id: string }>(rows: T[]) => rows.filter((row) => row.id.startsWith(P));

  it("returns featured services first, then by title", async () => {
    const ordered = mine(await getAllServicesFromSupabase()).map((row) => row.title);
    expect(ordered).toEqual([`${P}Alpha`, `${P}Bravo`, `${P}Booked`, `${P}Charlie`, `${P}Delta`]);
  });

  it("returns prices as numbers, not the strings node-postgres gives back", async () => {
    await query(`update public.services set price = 1499.5 where id = $1`, [`${P}aaa`]);
    const row = mine(await getAllServicesFromSupabase()).find((r) => r.id === `${P}aaa`);

    // Against a string this would be "1499.5" and every discount calculation would
    // concatenate instead of multiplying.
    expect(typeof row?.price).toBe("number");
    expect(row?.price).toBe(1499.5);
    expect(typeof row?.duration).toBe("number");
    expect(row?.createdAt).toBeInstanceOf(Date);
  });

  it("lists only published services", async () => {
    const published = mine(await getPublishedServicesFromSupabase()).map((row) => row.id);
    expect(published).toContain(`${P}aaa`);
    // Seeded with active: false.
    expect(published).not.toContain(`${P}ddd`);
  });

  it("seeds idempotently — the second run adds nothing", async () => {
    const again = await seedServiceInSupabase({
      slug: `${P}aaa`, title: "Should not overwrite", category: "Test",
      description: "nope", price: 1, duration: 30,
    });
    expect(again).toBe(false);

    const row = await getServiceByIdInSupabase(`${P}aaa`);
    expect(row?.title).toBe(`${P}Alpha`);
    expect(row?.price).toBe(1499.5);
  });

  it("creates a service keyed by its slug", async () => {
    expect(await createServiceInSupabase({
      slug: `${P}new`, title: `${P}New`, category: "Test", description: "d", price: 250, duration: 20,
    })).toBe(true);

    const row = await getServiceByIdInSupabase(`${P}new`);
    expect(row).toMatchObject({ id: `${P}new`, slug: `${P}new`, title: `${P}New`, price: 250, duration: 20, icon: "sparkles", active: true, featured: false });
  });

  it("updates every catalogue field in one write", async () => {
    expect(await updateServiceInSupabase(`${P}bbb`, {
      title: `${P}Bravo Edited`, category: "Edited", description: "edited",
      price: 3000, duration: 90, icon: "star", active: false, featured: false,
    })).toBe(true);

    const row = await getServiceByIdInSupabase(`${P}bbb`);
    expect(row).toMatchObject({
      title: `${P}Bravo Edited`, category: "Edited", price: 3000, duration: 90,
      icon: "star", active: false, featured: false,
    });
    // It left the featured list and the published list.
    expect(mine(await getPublishedServicesFromSupabase()).map((r) => r.id)).not.toContain(`${P}bbb`);

    expect(await updateServiceInSupabase(`${P}nope`, {
      title: "x", category: "x", description: "x", price: 1, duration: 5, icon: "x", active: true, featured: false,
    })).toBe(false);
  });

  it("counts the bookings that reference a service", async () => {
    expect(await countBookingsForServiceInSupabase(`${P}booked`)).toBe(0);

    await query(
      `insert into public.bookings
         (id, reference, service_id, service_title, practitioner_id, practitioner_name,
          client_name, client_email, scheduled_at, created_at, updated_at)
       values ($1, $1, $2, 'Booked', $3, 'Svc practitioner', 'Client', $4, now(), now(), now())`,
      [`${P}bk`, `${P}booked`, `${P}prac`, `${P}client@example.test`],
    );
    expect(await countBookingsForServiceInSupabase(`${P}booked`)).toBe(1);
    expect(await countBookingsForServiceInSupabase(`${P}aaa`)).toBe(0);
  });

  it("cannot delete a service that bookings still reference", async () => {
    // This is the constraint that makes the route's guard necessary rather than
    // decorative: the delete really does fail, and without the count check it would
    // surface as a 500 instead of a 409 telling the admin to deactivate instead.
    await expect(deleteServiceInSupabase(`${P}booked`)).rejects.toMatchObject({ code: "23503" });

    // The service is still there, and the count still reports why.
    expect(await getServiceByIdInSupabase(`${P}booked`)).not.toBeNull();
    expect(await countBookingsForServiceInSupabase(`${P}booked`)).toBe(1);

    await query(`delete from public.bookings where id = $1`, [`${P}bk`]);
    expect(await deleteServiceInSupabase(`${P}booked`)).toBe(true);
    expect(await getServiceByIdInSupabase(`${P}booked`)).toBeNull();
    expect(await deleteServiceInSupabase(`${P}booked`)).toBe(false);
  });
});
