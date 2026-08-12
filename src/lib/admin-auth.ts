import "server-only";

import { cookies } from "next/headers";
import { getAuth } from "firebase-admin/auth";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firestore";

const COOKIE_NAME = "jyotish_admin_session";
const SESSION_DAYS = 7;
const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;

export type AdminIdentity = {
  id: string;
  name: string;
  email: string;
  role: string;
  permissions: AdminPermission[];
};

export type AdminPermission =
  | "overview" | "services" | "members_view" | "members_manage"
  | "bookings" | "schedule" | "billing" | "plans" | "reviews" | "messages" | "insights" | "reports"
  | "activity" | "settings" | "team" | "gemstones" | "roles" | "practitioners" | "ai_personas" | "website";

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
  { key: "practitioners", label: "Practitioners" },
  { key: "ai_personas", label: "AI personas" },
  { key: "website", label: "Website content" },
];

/** Permissions are resolved once when the admin identity is loaded (see getCurrentAdmin), so this stays a synchronous, allocation-free check at every call site. */
export function hasAdminPermission(admin: AdminIdentity | null, permission: AdminPermission) {
  return Boolean(admin && admin.permissions.includes(permission));
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase().slice(0, 180);
}

type AdminDoc = {
  name: string;
  email: string;
  role: string;
  active: boolean;
};

export async function getAdminCount() {
  const snap = await db.collection("adminUsers").count().get();
  return snap.data().count;
}

/** Verifies a client-obtained Firebase ID token and creates a session cookie. The admin's
 * Firestore profile document must already exist (created at invite-acceptance time). */
export async function createAdminSession(idToken: string) {
  const decoded = await getAuth().verifyIdToken(idToken, true);
  await db.collection("adminUsers").doc(decoded.uid).update({ lastLoginAt: FieldValue.serverTimestamp() });

  const sessionCookie = await getAuth().createSessionCookie(idToken, { expiresIn: SESSION_MS });
  const store = await cookies();
  store.set(COOKIE_NAME, sessionCookie, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MS / 1000,
  });

  return decoded.uid;
}

export async function getCurrentAdmin(): Promise<AdminIdentity | null> {
  const cookie = (await cookies()).get(COOKIE_NAME)?.value;
  if (!cookie) return null;

  let uid: string;
  try {
    uid = (await getAuth().verifySessionCookie(cookie, true)).uid;
  } catch {
    return null;
  }

  const snap = await db.collection("adminUsers").doc(uid).get();
  if (!snap.exists) return null;
  const data = snap.data() as AdminDoc;
  if (!data.active) return null;

  const roleSnap = await db.collection("adminRoles").doc(data.role).get();
  // The Owner role is meant to always have full access (see updateRole's "can't be restricted"
  // guard in admin-roles.ts) — but its permissions array is only written once at bootstrap
  // (auth/setup/route.ts), so any permission key added after an owner account already existed
  // would silently lock that owner out of the new admin pages. Resolving it to the live
  // ALL_ADMIN_PERMISSIONS list here keeps the invariant true regardless of when it was added.
  const permissions = data.role === "owner" && roleSnap.exists && roleSnap.data()?.isSystem
    ? ALL_ADMIN_PERMISSIONS.map((permission) => permission.key)
    : (roleSnap.exists ? (roleSnap.data()?.permissions as AdminPermission[] | undefined) : undefined) ?? [];

  return { id: uid, name: data.name, email: data.email, role: data.role, permissions };
}

export async function revokeCurrentSession() {
  const store = await cookies();
  const cookie = store.get(COOKIE_NAME)?.value;
  if (cookie) {
    try {
      const decoded = await getAuth().verifySessionCookie(cookie);
      await getAuth().revokeRefreshTokens(decoded.uid);
    } catch {
      // Cookie already invalid/expired — nothing to revoke.
    }
  }
  store.set(COOKIE_NAME, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
}

export async function recordAudit(
  admin: Pick<AdminIdentity, "id" | "name">,
  action: string,
  entityType: string,
  entityId?: string | number,
  details?: Record<string, unknown>,
) {
  await db.collection("auditLogs").add({
    adminId: admin.id,
    adminName: admin.name,
    action: action.slice(0, 80),
    entityType: entityType.slice(0, 50),
    entityId: entityId === undefined ? null : String(entityId).slice(0, 80),
    details: details ? JSON.stringify(details).slice(0, 4000) : null,
    createdAt: FieldValue.serverTimestamp(),
  });
}
