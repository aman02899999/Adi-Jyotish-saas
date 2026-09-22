import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { query } from "@/lib/postgres";
import { RoleError, createRole, deleteRole, getAdminIdsWithPermission, getAllRolesAdmin, getAssignableRoleSlugs, roleSlugExists, updateRole } from "@/lib/admin-roles";

/**
 * Integration test for the admin-role port. Skipped unless SUPABASE_DB_URL points
 * at a reachable database.
 *
 * The point of most of these is the rules that keep one admin from escalating past
 * their own access, plus the `active` filter that the schema only gained in
 * migration 0010 — before that column existed, every copied admin would have read
 * as inactive and been locked out.
 */
const describeDb = process.env.SUPABASE_DB_URL ? describe : describe.skip;

const P = "roles_itest_";
import type { AdminPermission } from "@/lib/admin-auth";

const ALL: AdminPermission[] = ["overview", "billing", "insights", "reports", "team"];

async function seedRole(slug: string, permissions: string[], extra: { name?: string; isSystem?: boolean } = {}) {
  await query(
    `insert into public.admin_roles (id, slug, name, is_system, permissions)
     values ($1, $1, $2, coalesce($3, false), $4::jsonb)
     on conflict (id) do update set permissions = excluded.permissions, is_system = excluded.is_system, name = excluded.name`,
    [slug, extra.name ?? `Role ${slug}`, extra.isSystem ?? false, JSON.stringify(permissions)],
  );
}

async function seedAdmin(id: string, role: string, active = true) {
  await query(
    `insert into public.admin_users (id, name, email, role, active)
     values ($1, $1, $2, $3, $4)
     on conflict (id) do update set role = excluded.role, active = excluded.active`,
    [id, `${id}@example.test`, role, active],
  );
}

async function cleanup() {
  await query(`delete from public.admin_users where id like $1`, ["roles\_itest\_%"]);
  await query(`delete from public.admin_roles where id like $1`, ["roles\_itest\_%"]);
}

describeDb("admin roles (live database)", () => {
  beforeEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
  });

  it("creates a role and refuses a second one on the same slug", async () => {
    const created = await createRole({ name: "Finance", slug: `${P}finance`, permissions: ["billing"] }, ALL);
    expect(created).toMatchObject({ slug: `${P}finance`, name: "Finance", isSystem: false, permissions: ["billing"], adminCount: 0 });

    await expect(createRole({ name: "Finance again", slug: `${P}finance`, permissions: ["billing"] }, ALL)).rejects.toThrow(RoleError);
  });

  it("rejects a permission that does not exist", async () => {
    await expect(createRole({ name: "Bad", slug: `${P}bad`, permissions: ["not_a_permission"] }, ALL)).rejects.toThrow(/Unknown permission/);
  });

  it("refuses to grant a permission the acting admin does not hold", async () => {
    // The escalation this blocks: an admin holding only "roles" creating a role with
    // every permission, then handing it out via "team".
    await expect(createRole({ name: "Sneaky", slug: `${P}sneaky`, permissions: ["billing", "team"] }, ["billing"])).rejects.toThrow(/can't grant a permission you don't have/);
  });

  it("counts admins per role and sorts by name, not by slug", async () => {
    await seedRole(`${P}zzz`, ["billing"], { name: "Alpha role" });
    await seedRole(`${P}aaa`, ["billing"], { name: "Zebra role" });
    await seedAdmin(`${P}u1`, `${P}zzz`);
    await seedAdmin(`${P}u2`, `${P}zzz`);
    await seedAdmin(`${P}u3`, `${P}aaa`);

    const rows = await getAllRolesAdmin();
    const ours = rows.filter((r) => r.slug.startsWith(P));
    expect(ours.map((r) => r.name)).toEqual(["Alpha role", "Zebra role"]);
    expect(ours.map((r) => r.adminCount)).toEqual([2, 1]);
  });

  it("still lists a role nobody has been assigned yet", async () => {
    // An inner join between roles and admins would make an unassigned role vanish
    // from the admin screen the moment its last member is reassigned.
    await seedRole(`${P}empty`, ["billing"], { name: "Unassigned" });
    const rows = await getAllRolesAdmin();
    const found = rows.find((r) => r.slug === `${P}empty`);
    expect(found).toBeDefined();
    expect(found?.adminCount).toBe(0);
  });

  it("refuses to restrict the owner role", async () => {
    const preExisting = (await query(`select id from public.admin_roles where id = $1`, ["owner"])).rows.length > 0;
    if (!preExisting) await seedRole("owner", ALL, { name: "Owner", isSystem: true });
    try {
      await expect(updateRole("owner", { permissions: ["billing"] }, "someotherrole", ALL)).rejects.toThrow(/Owner role always has full access/);
    } finally {
      if (!preExisting) await query(`delete from public.admin_roles where id = $1`, ["owner"]);
    }
  });

  it("refuses to let an admin change their own role's permissions", async () => {
    await seedRole(`${P}mine`, ["billing"]);
    await expect(updateRole(`${P}mine`, { permissions: ["billing", "team"] }, `${P}mine`, ALL)).rejects.toThrow(/your own role/);
  });

  it("keeps permissions when the patch only renames", async () => {
    await seedRole(`${P}rename`, ["billing", "insights"]);
    const updated = await updateRole(`${P}rename`, { name: "Renamed" }, "someoneelse", ALL);
    expect(updated.name).toBe("Renamed");
    expect(updated.permissions).toEqual(["billing", "insights"]);
  });

  it("keeps the name when the patch only changes permissions", async () => {
    await seedRole(`${P}permsonly`, ["billing"], { name: "Keep this name" });
    const updated = await updateRole(`${P}permsonly`, { permissions: ["insights"] }, "someoneelse", ALL);
    expect(updated.permissions).toEqual(["insights"]);
    expect(updated.name).toBe("Keep this name");
  });

  it("applies the same grant cap to an update as to a create", async () => {
    await seedRole(`${P}other`, ["billing"]);
    await expect(updateRole(`${P}other`, { permissions: ["billing", "team"] }, "someoneelse", ["billing"])).rejects.toThrow(/can't grant a permission you don't have/);
  });

  it("refuses to delete a built-in role", async () => {
    await seedRole(`${P}builtin`, ["billing"], { isSystem: true });
    await expect(deleteRole(`${P}builtin`)).rejects.toThrow(/Built-in roles/);
  });

  it("refuses to delete a role still assigned, naming the count", async () => {
    await seedRole(`${P}busy`, ["billing"]);
    await seedAdmin(`${P}a`, `${P}busy`);
    await seedAdmin(`${P}b`, `${P}busy`);

    await expect(deleteRole(`${P}busy`)).rejects.toThrow(/2 team members still have this role/);
    expect(await roleSlugExists(`${P}busy`)).toBe(true);
  });

  it("deletes an unassigned role", async () => {
    await seedRole(`${P}free`, ["billing"]);
    await deleteRole(`${P}free`);
    expect(await roleSlugExists(`${P}free`)).toBe(false);
  });

  it("lists assignable roles sorted by name", async () => {
    await seedRole(`${P}l1`, ["billing"], { name: "Beta" });
    await seedRole(`${P}l2`, ["billing"], { name: "Alpha" });
    const ours = (await getAssignableRoleSlugs()).filter((r) => r.slug.startsWith(P));
    expect(ours.map((r) => r.name)).toEqual(["Alpha", "Beta"]);
  });

  it("only fans a permission out to admins who are active AND hold a role granting it", async () => {
    await seedRole(`${P}granting`, ["insights"]);
    await seedRole(`${P}notgranting`, ["billing"]);

    await seedAdmin(`${P}yes`, `${P}granting`, true);
    await seedAdmin(`${P}deactivated`, `${P}granting`, false);
    await seedAdmin(`${P}wrongrole`, `${P}notgranting`, true);

    const ids = await getAdminIdsWithPermission("insights");
    expect(ids).toContain(`${P}yes`);
    expect(ids).not.toContain(`${P}deactivated`);
    expect(ids).not.toContain(`${P}wrongrole`);
  });

  it("is not limited to thirty roles the way the Firestore `in` filter was", async () => {
    // Firestore capped an `in` filter at 30 values and the old code sliced the role
    // list to fit, so an admin whose role sorted past 30 silently stopped receiving
    // notifications. There is no such limit here; this pins that.
    for (let i = 0; i < 35; i += 1) {
      await seedRole(`${P}many${String(i).padStart(2, "0")}`, ["reports"]);
    }
    await seedAdmin(`${P}last`, `${P}many34`);

    const ids = await getAdminIdsWithPermission("reports");
    expect(ids).toContain(`${P}last`);
  });
});
