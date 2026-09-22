import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { query } from "@/lib/postgres";
import { ALL_ADMIN_PERMISSIONS, getAdminCount, recordAudit, resolveAdminPermissions } from "@/lib/admin-auth";
import { getActiveAdminInSupabase, touchAdminLastLoginInSupabase } from "@/lib/admin-auth-supabase";

/**
 * The permission resolver is pure, so its tests run without a database. The data
 * access is skipped unless SUPABASE_DB_URL points at a reachable database.
 *
 * getCurrentAdmin itself needs a request context (next/headers), so the active
 * check it depends on is asserted against the data-access function that folds it
 * into the query — which is the part that would silently lock every admin out if
 * it regressed.
 */
const describeDb = process.env.SUPABASE_DB_URL ? describe : describe.skip;

const P = "adminauth_itest_";

async function seedAdmin(id: string, opts: { role?: string; active?: boolean; email?: string } = {}) {
  await query(
    `insert into public.admin_users (id, name, email, role, active) values ($1,$2,$3,$4,$5)
     on conflict (id) do update set role = excluded.role, active = excluded.active`,
    [id, `Admin ${id}`, opts.email ?? `${id}@example.test`, opts.role ?? "viewer", opts.active ?? true],
  );
}

async function cleanup() {
  await query(`delete from public.audit_logs where admin_id like $1`, [`${P}%`]);
  await query(`delete from public.admin_users where id like $1`, [`${P}%`]);
  await query(`delete from public.admin_roles where id like $1`, [`${P}%`]);
}

describe("resolveAdminPermissions", () => {
  it("gives a system owner role every permission, not just the stored ones", async () => {
    // The stored array is written once at bootstrap, so a permission added later
    // would silently lock an existing owner out of the new page.
    const resolved = resolveAdminPermissions("owner", { isSystem: true, permissions: ["overview"] });
    expect(resolved).toEqual(ALL_ADMIN_PERMISSIONS.map((p) => p.key));
  });

  it("does not expand a non-system role that happens to be called owner", async () => {
    const resolved = resolveAdminPermissions("owner", { isSystem: false, permissions: ["overview", "billing"] });
    expect(resolved).toEqual(["overview", "billing"]);
  });

  it("uses the stored permissions for an ordinary role", async () => {
    expect(resolveAdminPermissions("editor", { isSystem: false, permissions: ["website", "services"] })).toEqual(["website", "services"]);
  });

  it("grants nothing when the role row is missing", async () => {
    expect(resolveAdminPermissions("ghost", null)).toEqual([]);
  });

  it("grants nothing to a system role that is not owner", async () => {
    expect(resolveAdminPermissions("support", { isSystem: true, permissions: ["messages"] })).toEqual(["messages"]);
  });
});

describeDb("admin auth data access (live database)", () => {
  beforeEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
  });

  it("returns an active admin with their email as text", async () => {
    await seedAdmin(`${P}live`, { role: "editor", email: `${P}Live@Example.TEST` });
    const admin = await getActiveAdminInSupabase(`${P}live`);
    expect(admin).not.toBeNull();
    expect(admin?.role).toBe("editor");
    expect(admin?.email).toBeTypeOf("string");
  });

  it("returns null for a deactivated account", async () => {
    // This is the sign-in gate. admin_users.active did not exist in the schema until
    // migration 0010; without it every copied admin reads as inactive and is locked
    // out with no error anywhere.
    await seedAdmin(`${P}off`, { active: false });
    expect(await getActiveAdminInSupabase(`${P}off`)).toBeNull();
  });

  it("returns null for an account that does not exist", async () => {
    expect(await getActiveAdminInSupabase(`${P}nobody`)).toBeNull();
  });

  it("stamps the last login", async () => {
    await seedAdmin(`${P}stamp`);
    const before = await query(`select last_login_at from public.admin_users where id = $1`, [`${P}stamp`]);
    expect(before.rows[0]?.last_login_at).toBeNull();

    await touchAdminLastLoginInSupabase(`${P}stamp`);

    const after = await query(`select last_login_at from public.admin_users where id = $1`, [`${P}stamp`]);
    expect(after.rows[0]?.last_login_at).toBeInstanceOf(Date);
  });

  it("counts admins, including the ones this test adds", async () => {
    const before = await getAdminCount();
    await seedAdmin(`${P}c1`);
    await seedAdmin(`${P}c2`);
    expect(await getAdminCount()).toBe(before + 2);
  });

  it("writes an audit entry with the caller's truncation applied", async () => {
    await seedAdmin(`${P}auditor`);

    await recordAudit(
      { id: `${P}auditor`, name: "Auditor" },
      "x".repeat(200),
      "y".repeat(100),
      12345,
      { note: "z".repeat(5000) },
    );

    const { rows } = await query<{ action: string; entity_type: string; entity_id: string; details: string; admin_id: string }>(
      `select action, entity_type, entity_id, details, admin_id from public.audit_logs where admin_id = $1`,
      [`${P}auditor`],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.action).toHaveLength(80);
    expect(rows[0]?.entity_type).toHaveLength(50);
    expect(rows[0]?.entity_id).toBe("12345");
    expect(rows[0]?.details).toHaveLength(4000);
  });

  it("stores a null entity id and details when neither is given", async () => {
    await seedAdmin(`${P}auditor2`);
    await recordAudit({ id: `${P}auditor2`, name: "Auditor" }, "signed_in", "session");

    const { rows } = await query<{ entity_id: string | null; details: string | null }>(
      `select entity_id, details from public.audit_logs where admin_id = $1`,
      [`${P}auditor2`],
    );
    expect(rows[0]).toMatchObject({ entity_id: null, details: null });
  });
});
