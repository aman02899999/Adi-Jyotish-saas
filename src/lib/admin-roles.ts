import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firestore";
import { ALL_ADMIN_PERMISSIONS, type AdminPermission } from "@/lib/admin-auth";
import {
  deleteRoleInSupabase,
  getAllRolesInSupabase,
  getAdminIdsWithPermissionInSupabase,
  getRoleInSupabase,
  insertRoleInSupabase,
  listRoleSlugsInSupabase,
  roleSlugExistsInSupabase,
  updateRoleInSupabase,
} from "@/lib/admin-roles-supabase";
import { isSupabaseCutoverActive } from "@/lib/supabase-config";

export class RoleError extends Error {}

const SLUG_PATTERN = /^[a-z][a-z0-9_]{1,29}$/;
const VALID_PERMISSIONS = new Set(ALL_ADMIN_PERMISSIONS.map((permission) => permission.key));

export type AdminRoleRow = {
  id: string;
  slug: string;
  name: string;
  isSystem: boolean;
  permissions: AdminPermission[];
  adminCount: number;
};

type AdminRoleDoc = { name: string; isSystem: boolean; permissions: AdminPermission[] };

/** Also caps the requested set to permissions the acting admin actually holds — without this, any
 * admin holding just the "roles" permission could create or edit a role with every permission
 * (including ones like "team" or "roles" itself they were never granted), then use "team" to hand
 * that omnipotent role to any account, bypassing the owner-only role-grant check in
 * admin/team/route.ts entirely (that check only special-cases the literal slug "owner", not any
 * functionally-equivalent custom role). An owner's resolved permission set is already every
 * permission (see getCurrentAdmin), so this never restricts what an owner can grant. */
function sanitizePermissions(input: string[], actingAdminPermissions: AdminPermission[]): AdminPermission[] {
  const unique = Array.from(new Set(input));
  const invalid = unique.filter((permission) => !VALID_PERMISSIONS.has(permission as AdminPermission));
  if (invalid.length) throw new RoleError(`Unknown permission: ${invalid[0]}`);
  const heldSet = new Set(actingAdminPermissions);
  const beyondOwn = unique.filter((permission) => !heldSet.has(permission as AdminPermission));
  if (beyondOwn.length) throw new RoleError(`You can't grant a permission you don't have: ${beyondOwn[0]}`);
  return unique as AdminPermission[];
}

export async function getAllRolesAdmin(): Promise<AdminRoleRow[]> {
  if (isSupabaseCutoverActive()) {
    // Sorted here rather than in SQL: localeCompare and the database collation
    // disagree on accented names, and the admin table is small enough that it
    // does not matter.
    const rows = await getAllRolesInSupabase();
    // The database stores permissions as free text; sanitizePermissions is what
    // guarantees only known values are ever written, so reading them back as
    // AdminPermission is the same trust the Firestore path already takes.
    return rows
      .map((row) => ({ ...row, permissions: row.permissions as AdminPermission[] }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  const [rolesSnap, usersSnap] = await Promise.all([
    db.collection("adminRoles").get(),
    db.collection("adminUsers").select("role").get(),
  ]);

  const countByRole = new Map<string, number>();
  for (const doc of usersSnap.docs) {
    const role = doc.data().role as string | undefined;
    if (!role) continue;
    countByRole.set(role, (countByRole.get(role) ?? 0) + 1);
  }

  return rolesSnap.docs
    .map((doc) => {
      const data = doc.data() as AdminRoleDoc;
      return { id: doc.id, slug: doc.id, name: data.name, isSystem: data.isSystem, permissions: data.permissions ?? [], adminCount: countByRole.get(doc.id) ?? 0 };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function createRole(input: { name: string; slug: string; permissions: string[] }, actingAdminPermissions: AdminPermission[]): Promise<AdminRoleRow> {
  const name = input.name.trim().slice(0, 80);
  const slug = input.slug.trim().toLowerCase().slice(0, 40);
  if (name.length < 2) throw new RoleError("Enter a role name.");
  if (!SLUG_PATTERN.test(slug)) throw new RoleError("Slug must be lowercase letters, numbers, or underscores, starting with a letter.");
  const permissions = sanitizePermissions(input.permissions, actingAdminPermissions);

  if (isSupabaseCutoverActive()) {
    const inserted = await insertRoleInSupabase({ slug, name, permissions });
    if (!inserted) throw new RoleError("A role with that slug already exists.");
    return { id: slug, slug, name, isSystem: false, permissions, adminCount: 0 };
  }

  const ref = db.collection("adminRoles").doc(slug);
  const existing = await ref.get();
  if (existing.exists) throw new RoleError("A role with that slug already exists.");

  await ref.set({ name, isSystem: false, permissions, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  return { id: slug, slug, name, isSystem: false, permissions, adminCount: 0 };
}

export async function updateRole(slug: string, input: { name?: string; permissions?: string[] }, actingAdminRole: string | undefined, actingAdminPermissions: AdminPermission[]): Promise<AdminRoleRow> {
  if (isSupabaseCutoverActive()) {
    const current = await getRoleInSupabase(slug);
    if (!current) throw new RoleError("Role not found.");
    if (slug === "owner" && input.permissions) {
      throw new RoleError("The Owner role always has full access and can't be restricted.");
    }
    if (slug === actingAdminRole && input.permissions) {
      throw new RoleError("You can't change the permissions of your own role. Ask another team member to make this change.");
    }

    let name: string | undefined;
    if (input.name !== undefined) {
      name = input.name.trim().slice(0, 80);
      if (name.length < 2) throw new RoleError("Enter a role name.");
    }
    const permissions = input.permissions === undefined ? undefined : sanitizePermissions(input.permissions, actingAdminPermissions);

    const updated = await updateRoleInSupabase(slug, { name, permissions });
    if (!updated) throw new RoleError("Role not found.");
    return { id: slug, slug, name: updated.name, isSystem: updated.isSystem, permissions: updated.permissions as AdminPermission[], adminCount: updated.adminCount };
  }

  const ref = db.collection("adminRoles").doc(slug);
  const snap = await ref.get();
  if (!snap.exists) throw new RoleError("Role not found.");
  const current = snap.data() as AdminRoleDoc;
  if (slug === "owner" && input.permissions) {
    throw new RoleError("The Owner role always has full access and can't be restricted.");
  }
  // An admin editing the permissions of their own current role could otherwise grant themselves
  // more access (e.g. add "team", then use it to promote their account to owner) — have someone
  // else with the "roles" permission make that change instead.
  if (slug === actingAdminRole && input.permissions) {
    throw new RoleError("You can't change the permissions of your own role. Ask another team member to make this change.");
  }

  const patch: Partial<AdminRoleDoc> & { updatedAt: FirebaseFirestore.FieldValue } = { updatedAt: FieldValue.serverTimestamp() };
  if (input.name !== undefined) {
    const name = input.name.trim().slice(0, 80);
    if (name.length < 2) throw new RoleError("Enter a role name.");
    patch.name = name;
  }
  if (input.permissions !== undefined) {
    // Same "can't grant what you don't have" cap as createRole — otherwise an admin holding only
    // "roles" could edit some *other* non-owner role to add every permission, then hand it out via
    // "team" to escalate past their own access.
    patch.permissions = sanitizePermissions(input.permissions, actingAdminPermissions);
  }

  await ref.update(patch);
  const usersSnap = await db.collection("adminUsers").where("role", "==", slug).select().get();
  return {
    id: slug,
    slug,
    name: patch.name ?? current.name,
    isSystem: current.isSystem,
    permissions: patch.permissions ?? current.permissions,
    adminCount: usersSnap.size,
  };
}

export async function deleteRole(slug: string) {
  if (isSupabaseCutoverActive()) {
    const current = await getRoleInSupabase(slug);
    if (!current) throw new RoleError("Role not found.");
    if (current.isSystem) throw new RoleError("Built-in roles can't be deleted.");

    // The in-use test is part of the delete's predicate, so a team member assigned
    // to this role after the read above still blocks it.
    const outcome = await deleteRoleInSupabase(slug);
    if (outcome.kind === "deleted") return;
    if (outcome.kind === "not_found") throw new RoleError("Role not found.");
    const count = outcome.count;
    throw new RoleError(`${count} team member${count === 1 ? "" : "s"} still ${count === 1 ? "has" : "have"} this role — reassign them first.`);
  }

  const ref = db.collection("adminRoles").doc(slug);
  const snap = await ref.get();
  if (!snap.exists) throw new RoleError("Role not found.");
  const data = snap.data() as AdminRoleDoc;
  if (data.isSystem) throw new RoleError("Built-in roles can't be deleted.");

  const usersSnap = await db.collection("adminUsers").where("role", "==", slug).select().get();
  const count = usersSnap.size;
  if (count > 0) throw new RoleError(`${count} team member${count === 1 ? "" : "s"} still ${count === 1 ? "has" : "have"} this role — reassign them first.`);

  await ref.delete();
}

export async function getAssignableRoleSlugs() {
  if (isSupabaseCutoverActive()) {
    const rows = await listRoleSlugsInSupabase();
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  }

  const snap = await db.collection("adminRoles").get();
  return snap.docs
    .map((doc) => ({ slug: doc.id, name: (doc.data() as AdminRoleDoc).name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function roleSlugExists(slug: string) {
  if (isSupabaseCutoverActive()) return roleSlugExistsInSupabase(slug);
  const snap = await db.collection("adminRoles").doc(slug).get();
  return snap.exists;
}

/** Active admin ids whose role grants the given permission — used to fan out notifications. */
export async function getAdminIdsWithPermission(permission: AdminPermission): Promise<string[]> {
  if (isSupabaseCutoverActive()) return getAdminIdsWithPermissionInSupabase(permission);

  const rolesSnap = await db.collection("adminRoles").where("permissions", "array-contains", permission).select().get();
  const roleSlugs = rolesSnap.docs.map((doc) => doc.id);
  if (!roleSlugs.length) return [];

  // Firestore "in" queries are capped at 30 values; role counts stay well under that in practice.
  const usersSnap = await db.collection("adminUsers").where("active", "==", true).where("role", "in", roleSlugs.slice(0, 30)).select().get();
  return usersSnap.docs.map((doc) => doc.id);
}
