import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { adminRoles, adminUsers } from "@/db/schema";
import { ALL_ADMIN_PERMISSIONS, type AdminPermission } from "@/lib/admin-auth";

export class RoleError extends Error {}

const SLUG_PATTERN = /^[a-z][a-z0-9_]{1,29}$/;
const VALID_PERMISSIONS = new Set(ALL_ADMIN_PERMISSIONS.map((permission) => permission.key));

function sanitizePermissions(input: string[]): AdminPermission[] {
  const unique = Array.from(new Set(input));
  const invalid = unique.filter((permission) => !VALID_PERMISSIONS.has(permission as AdminPermission));
  if (invalid.length) throw new RoleError(`Unknown permission: ${invalid[0]}`);
  return unique as AdminPermission[];
}

export async function getAllRolesAdmin() {
  const roles = await db.select().from(adminRoles).orderBy(adminRoles.id);
  const counts = await db
    .select({ role: adminUsers.role, count: sql<number>`count(*)::int` })
    .from(adminUsers)
    .groupBy(adminUsers.role);
  const countByRole = new Map(counts.map((row) => [row.role, row.count]));

  return roles.map((role) => ({ ...role, adminCount: countByRole.get(role.slug) ?? 0 }));
}

export async function createRole(input: { name: string; slug: string; permissions: string[] }) {
  const name = input.name.trim().slice(0, 80);
  const slug = input.slug.trim().toLowerCase().slice(0, 40);
  if (name.length < 2) throw new RoleError("Enter a role name.");
  if (!SLUG_PATTERN.test(slug)) throw new RoleError("Slug must be lowercase letters, numbers, or underscores, starting with a letter.");
  const permissions = sanitizePermissions(input.permissions);

  const [existing] = await db.select({ id: adminRoles.id }).from(adminRoles).where(eq(adminRoles.slug, slug)).limit(1);
  if (existing) throw new RoleError("A role with that slug already exists.");

  const [created] = await db.insert(adminRoles).values({ name, slug, isSystem: false, permissions }).returning();
  return created;
}

export async function updateRole(id: number, input: { name?: string; permissions?: string[] }) {
  const [role] = await db.select().from(adminRoles).where(eq(adminRoles.id, id)).limit(1);
  if (!role) throw new RoleError("Role not found.");
  if (role.slug === "owner" && input.permissions) {
    throw new RoleError("The Owner role always has full access and can't be restricted.");
  }

  const patch: Partial<typeof adminRoles.$inferInsert> = { updatedAt: new Date() };
  if (input.name !== undefined) {
    const name = input.name.trim().slice(0, 80);
    if (name.length < 2) throw new RoleError("Enter a role name.");
    patch.name = name;
  }
  if (input.permissions !== undefined) {
    patch.permissions = sanitizePermissions(input.permissions);
  }

  const [updated] = await db.update(adminRoles).set(patch).where(eq(adminRoles.id, id)).returning();
  return updated;
}

export async function deleteRole(id: number) {
  const [role] = await db.select().from(adminRoles).where(eq(adminRoles.id, id)).limit(1);
  if (!role) throw new RoleError("Role not found.");
  if (role.isSystem) throw new RoleError("Built-in roles can't be deleted.");

  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(adminUsers).where(eq(adminUsers.role, role.slug));
  if (count > 0) throw new RoleError(`${count} team member${count === 1 ? "" : "s"} still ${count === 1 ? "has" : "have"} this role — reassign them first.`);

  await db.delete(adminRoles).where(eq(adminRoles.id, id));
}

export async function getAssignableRoleSlugs() {
  const roles = await db.select({ slug: adminRoles.slug, name: adminRoles.name }).from(adminRoles).orderBy(adminRoles.id);
  return roles;
}

export async function roleSlugExists(slug: string) {
  const [row] = await db.select({ id: adminRoles.id }).from(adminRoles).where(eq(adminRoles.slug, slug)).limit(1);
  return Boolean(row);
}

/** Active admin ids whose role grants the given permission — used to fan out notifications. */
export async function getAdminIdsWithPermission(permission: AdminPermission) {
  const rows = await db
    .select({ id: adminUsers.id })
    .from(adminUsers)
    .innerJoin(adminRoles, eq(adminRoles.slug, adminUsers.role))
    .where(and(eq(adminUsers.active, true), sql`${adminRoles.permissions} @> ${JSON.stringify([permission])}::jsonb`));
  return rows.map((row) => row.id);
}
