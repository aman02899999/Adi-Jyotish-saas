import { beforeAll, describe, expect, it } from "vitest";

import { query } from "@/lib/postgres";
import {
  adminUserExistsWithEmailInSupabase,
  countActiveOwnersInSupabase,
  deleteAdminUserInSupabase,
  getAdminUserInSupabase,
  listAdminUsersInSupabase,
  updateAdminUserInSupabase,
} from "@/lib/admin-team-supabase";

/**
 * Integration tests for the administrator team screen's data access. Skipped unless
 * SUPABASE_DB_URL points at a reachable database.
 *
 * The routes themselves are not exercised end to end: getCurrentAdmin calls cookies(),
 * which needs a request context the test runner does not have. The auth-account deletion
 * they also perform is an HTTPS call to GoTrue and is likewise out of reach here.
 */
const describeDb = process.env.SUPABASE_DB_URL ? describe : describe.skip;

const P = "adminteam_itest_";

async function seed(id: string, input: { name: string; email: string; role: string; active?: boolean }) {
  await query(
    `insert into public.admin_users (id, name, email, role, active, created_at, updated_at)
     values ($1, $2, $3, $4, $5, now(), now())`,
    [id, input.name, input.email, input.role, input.active ?? true],
  );
}

describeDb("admin team data access (live database)", () => {
  beforeAll(async () => {
    await query(`delete from public.admin_users where id like 'adminteam\\_itest\\_%'`);
    // Seeded in reverse name order on purpose. Without that, a missing `order by name`
    // is invisible: a sequential scan returns rows in insertion order, which would
    // happen to be name order, and the ordering assertion would pass either way.
    await seed(`${P}w_dee`, { name: `${P}Dee`, email: `${P}dee@example.test`, role: "editor" });
    await seed(`${P}x_cid`, { name: `${P}Cid`, email: `${P}cid@example.test`, role: "owner", active: false });
    await seed(`${P}y_bob`, { name: `${P}Bob`, email: `${P}bob@example.test`, role: "support", active: false });
    await seed(`${P}z_ann`, { name: `${P}Ann`, email: `${P}ann@example.test`, role: "owner" });
  });

  it("lists administrators with the app-shaped fields, by name", async () => {
    const users = await listAdminUsersInSupabase();
    const mine = users.filter((user) => user.id.startsWith(P));
    expect(mine.map((user) => user.name)).toEqual([`${P}Ann`, `${P}Bob`, `${P}Cid`, `${P}Dee`]);

    const ann = mine[0];
    expect(ann).toMatchObject({ id: `${P}z_ann`, email: `${P}ann@example.test`, role: "owner", active: true });
    expect(typeof ann.email).toBe("string");
    expect(ann.createdAt).toBeInstanceOf(Date);
    // Never signed in, so the column really is null rather than an epoch.
    expect(ann.lastLoginAt).toBeNull();
    expect(mine.find((user) => user.id === `${P}y_bob`)?.active).toBe(false);
  });

  it("fetches one administrator, or null", async () => {
    expect(await getAdminUserInSupabase(`${P}w_dee`)).toMatchObject({ name: `${P}Dee`, role: "editor", active: true });
    expect(await getAdminUserInSupabase(`${P}nobody`)).toBeNull();
  });

  it("matches an existing email case-insensitively", async () => {
    expect(await adminUserExistsWithEmailInSupabase(`${P}ANN@example.test`)).toBe(true);
    expect(await adminUserExistsWithEmailInSupabase(`${P}ann@example.test`)).toBe(true);
    expect(await adminUserExistsWithEmailInSupabase(`${P}absent@example.test`)).toBe(false);
  });

  it("counts active owners only", async () => {
    // Ann: owner, active. Cid: owner, deactivated. Dee: active, not an owner.
    //
    // Other test files run in parallel against the same database and also create owner
    // rows, so an absolute count here would be meaningless. What is compared instead is
    // the difference each flip causes: a stable offset cancels out.
    const withAnnActive = await countActiveOwnersInSupabase();
    await query(`update public.admin_users set active = false where id = $1`, [`${P}z_ann`]);
    const withAnnInactive = await countActiveOwnersInSupabase();
    await query(`update public.admin_users set active = true where id = $1`, [`${P}z_ann`]);
    const restored = await countActiveOwnersInSupabase();

    expect(withAnnActive - withAnnInactive).toBe(1);
    expect(restored - withAnnInactive).toBe(1);

    // Flipping a NON-owner's status must not move the count at all. This is what pins the
    // role filter: without it, every active admin would be counted and the owner-only
    // difference above would still come out at 1.
    await query(`update public.admin_users set active = false where id = $1`, [`${P}w_dee`]);
    expect(await countActiveOwnersInSupabase()).toBe(restored);
    await query(`update public.admin_users set active = true where id = $1`, [`${P}w_dee`]);

    // A deactivated owner must not count even though it is still an owner.
    await query(`update public.admin_users set role = 'support' where id = $1`, [`${P}x_cid`]);
    const afterDemotingCid = await countActiveOwnersInSupabase();
    expect(afterDemotingCid).toBe(withAnnActive);
  });

  it("updates role and active together", async () => {
    expect(await updateAdminUserInSupabase(`${P}w_dee`, { role: "support", active: false })).toBe(true);
    expect(await getAdminUserInSupabase(`${P}w_dee`)).toMatchObject({ role: "support", active: false });

    // Both fields move in one statement, so neither is left behind.
    expect(await updateAdminUserInSupabase(`${P}w_dee`, { role: "editor", active: true })).toBe(true);
    expect(await getAdminUserInSupabase(`${P}w_dee`)).toMatchObject({ role: "editor", active: true });

    expect(await updateAdminUserInSupabase(`${P}nobody`, { role: "editor", active: true })).toBe(false);
  });

  it("deletes an administrator and reports whether a row was removed", async () => {
    expect(await deleteAdminUserInSupabase(`${P}y_bob`)).toBe(true);
    expect(await getAdminUserInSupabase(`${P}y_bob`)).toBeNull();
    expect(await deleteAdminUserInSupabase(`${P}y_bob`)).toBe(false);
    expect(await deleteAdminUserInSupabase(`${P}nobody`)).toBe(false);
  });
});
