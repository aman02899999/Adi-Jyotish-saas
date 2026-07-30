import "server-only";

import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { adminRoles, adminSessions, adminUsers, auditLogs } from "@/db/schema";

const COOKIE_NAME = "jyotish_admin_session";
const SESSION_DAYS = 7;

export type AdminIdentity = {
  id: number;
  name: string;
  email: string;
  role: string;
  permissions: AdminPermission[];
};

export type AdminPermission =
  | "overview" | "services" | "members_view" | "members_manage"
  | "bookings" | "schedule" | "billing" | "plans" | "reviews" | "messages" | "insights" | "reports"
  | "activity" | "settings" | "team" | "gemstones" | "roles";

export const ALL_ADMIN_PERMISSIONS: { key: AdminPermission; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "services", label: "Services" },
  { key: "members_view", label: "View members" },
  { key: "members_manage", label: "Manage members" },
  { key: "bookings", label: "Bookings" },
  { key: "schedule", label: "Schedule" },
  { key: "billing", label: "Billing" },
  { key: "plans", label: "Plans" },
  { key: "reviews", label: "Reviews" },
  { key: "messages", label: "Messages" },
  { key: "insights", label: "Insights" },
  { key: "reports", label: "Reports" },
  { key: "activity", label: "Activity log" },
  { key: "settings", label: "Settings" },
  { key: "team", label: "Team" },
  { key: "gemstones", label: "Gemstones" },
  { key: "roles", label: "Roles & permissions" },
];

/** Permissions are resolved once when the admin identity is loaded (see getCurrentAdmin), so this stays a synchronous, allocation-free check at every call site. */
export function hasAdminPermission(admin: AdminIdentity | null, permission: AdminPermission) {
  return Boolean(admin && admin.permissions.includes(permission));
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase().slice(0, 180);
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const digest = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${digest}`;
}

const dummyPasswordSalt = "65d7d561afd944c6d8de8a4ea3e09f04";
const dummyPasswordHash = `${dummyPasswordSalt}:${scryptSync("jyotish-invalid-account", dummyPasswordSalt, 64).toString("hex")}`;

export function verifyPassword(password: string, stored?: string | null) {
  const [salt, digest] = (stored || dummyPasswordHash).split(":");
  if (!salt || !digest || digest.length !== 128) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(digest, "hex");
  return expected.length === candidate.length && timingSafeEqual(candidate, expected);
}

function tokenDigest(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function getAdminCount() {
  const [result] = await db.select({ count: sql<number>`count(*)::int` }).from(adminUsers);
  return result?.count ?? 0;
}

export async function createAdminSession(adminId: number) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await db.delete(adminSessions).where(lt(adminSessions.expiresAt, new Date()));
  await db.insert(adminSessions).values({ adminId, tokenHash: tokenDigest(token), expiresAt });

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function getCurrentAdmin(): Promise<AdminIdentity | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const [row] = await db
    .select({
      id: adminUsers.id,
      name: adminUsers.name,
      email: adminUsers.email,
      role: adminUsers.role,
      permissions: adminRoles.permissions,
    })
    .from(adminSessions)
    .innerJoin(adminUsers, eq(adminSessions.adminId, adminUsers.id))
    .leftJoin(adminRoles, eq(adminRoles.slug, adminUsers.role))
    .where(and(
      eq(adminSessions.tokenHash, tokenDigest(token)),
      gt(adminSessions.expiresAt, new Date()),
      eq(adminUsers.active, true),
    ))
    .limit(1);

  if (!row) return null;
  return { ...row, permissions: (row.permissions as AdminPermission[] | null) ?? [] };
}

export async function revokeCurrentSession() {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (token) await db.delete(adminSessions).where(eq(adminSessions.tokenHash, tokenDigest(token)));
  store.set(COOKIE_NAME, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
}

export async function recordAudit(
  admin: Pick<AdminIdentity, "id" | "name">,
  action: string,
  entityType: string,
  entityId?: string | number,
  details?: Record<string, unknown>,
) {
  await db.insert(auditLogs).values({
    adminId: admin.id,
    adminName: admin.name,
    action: action.slice(0, 80),
    entityType: entityType.slice(0, 50),
    entityId: entityId === undefined ? null : String(entityId).slice(0, 80),
    details: details ? JSON.stringify(details).slice(0, 4000) : null,
  });
}
