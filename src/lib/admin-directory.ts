import "server-only";

import { db } from "@/lib/firestore";
import { isSupabaseCutoverActive } from "@/lib/supabase-config";
import { listMembersInSupabase, type MemberAdminRow } from "@/lib/member-admin-supabase";
import { listAdminUsersInSupabase, type AdminUserRow } from "@/lib/admin-team-supabase";
import { query, queryModels } from "@/lib/postgres";

/**
 * The reads behind the admin workspace pages, from whichever provider is live. The Members,
 * Messages, Activity, Schedule and Settings pages each queried Firestore directly, while the API
 * routes beside them had been ported, so after cutover an admin would have been looking at a
 * frozen copy of the data every action they took was changing.
 */

function toDate(value: FirebaseFirestore.Timestamp | Date | undefined | null): Date | null {
  if (!value) return null;
  return value instanceof Date ? value : value.toDate();
}

export async function listMembersForAdmin(): Promise<MemberAdminRow[]> {
  if (isSupabaseCutoverActive()) return listMembersInSupabase();
  const snap = await db.collection("members").orderBy("name", "asc").get();
  return snap.docs.map((doc) => {
    const data = doc.data() as Record<string, unknown>;
    return {
      id: doc.id,
      name: data.name as string,
      email: data.email as string,
      phone: (data.phone as string | null) ?? null,
      birthDate: (data.birthDate as string | null) ?? null,
      birthTime: (data.birthTime as string | null) ?? null,
      birthPlace: (data.birthPlace as string | null) ?? null,
      plan: (data.plan as string) ?? "member",
      onboardingComplete: Boolean(data.onboardingComplete),
      // A Firestore document with no `active` field is active; the Postgres column is
      // not null default true, so reading it directly is the same rule.
      active: data.active !== false,
      lastLoginAt: toDate(data.lastLoginAt as FirebaseFirestore.Timestamp | undefined),
      createdAt: toDate(data.createdAt as FirebaseFirestore.Timestamp | undefined) ?? new Date(),
      updatedAt: toDate(data.updatedAt as FirebaseFirestore.Timestamp | undefined) ?? new Date(),
    };
  });
}

/** `active` mirrors the sign-in gate in admin-auth.ts, which refuses any admin whose record lacks
 * it: the Settings page used to show such an account as active while it could not sign in. */
export async function listAdminUsersForAdmin(): Promise<AdminUserRow[]> {
  if (isSupabaseCutoverActive()) return listAdminUsersInSupabase();
  const usersSnap = await db.collection("adminUsers").get();
  return usersSnap.docs
    .map((doc) => {
      const data = doc.data() as { name: string; email: string; role: string; active?: boolean; lastLoginAt?: FirebaseFirestore.Timestamp | null; createdAt?: FirebaseFirestore.Timestamp };
      return { id: doc.id, name: data.name, email: data.email, role: data.role, active: data.active === true, lastLoginAt: data.lastLoginAt ? data.lastLoginAt.toDate() : null, createdAt: data.createdAt ? data.createdAt.toDate() : new Date() };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function isAdminTotpEnabled(adminId: string): Promise<boolean> {
  if (isSupabaseCutoverActive()) {
    const { rows } = await query<{ totp_enabled: boolean }>(`select totp_enabled from public.admin_users where id = $1`, [adminId]);
    return rows[0]?.totp_enabled === true;
  }
  return (await db.collection("adminUsers").doc(adminId).get()).data()?.totpEnabled === true;
}

export type AuditEntry = {
  id: string;
  adminId: string | null;
  adminName: string;
  action: string;
  entityType: string;
  entityId: string | null;
  details: string | null;
  createdAt: Date;
};

export async function listRecentAuditEntries(limit = 150): Promise<AuditEntry[]> {
  if (isSupabaseCutoverActive()) {
    const rows = await queryModels<AuditEntry>(
      `select id, admin_id, admin_name, coalesce(action, '') as action, coalesce(entity_type, '') as entity_type, entity_id, details, created_at
         from public.audit_logs order by created_at desc limit $1`,
      [limit],
    );
    return rows;
  }
  const snap = await db.collection("auditLogs").orderBy("createdAt", "desc").limit(limit).get();
  return snap.docs.map((doc) => {
    const data = doc.data() as Omit<AuditEntry, "id" | "createdAt"> & { createdAt?: FirebaseFirestore.Timestamp };
    return { id: doc.id, adminId: data.adminId ?? null, adminName: data.adminName, action: data.action, entityType: data.entityType, entityId: data.entityId ?? null, details: data.details ?? null, createdAt: data.createdAt?.toDate() ?? new Date() };
  });
}

/** Upcoming, non-cancelled bookings per practitioner, for the Schedule page's counts. */
export async function countUpcomingBookingsByPractitioner(now = new Date()): Promise<Record<string, number>> {
  if (isSupabaseCutoverActive()) {
    const { rows } = await query<{ practitioner_id: string; n: number }>(
      `select practitioner_id, count(*)::int as n from public.bookings
        where scheduled_at > $1 and status <> 'cancelled' and practitioner_id is not null
        group by practitioner_id`,
      [now],
    );
    return Object.fromEntries(rows.map((row) => [row.practitioner_id, row.n]));
  }
  const snap = await db.collection("bookings").where("scheduledAt", ">", now).get();
  const counts: Record<string, number> = {};
  for (const doc of snap.docs) {
    const data = doc.data() as { practitionerId?: string; status?: string };
    if (data.practitionerId && data.status !== "cancelled") counts[data.practitionerId] = (counts[data.practitionerId] ?? 0) + 1;
  }
  return counts;
}

/** Cancels a pending admin invitation. The cancelled invite's email, or null if there was none. */
export async function deleteAdminInviteById(id: string): Promise<{ email: string } | null> {
  if (isSupabaseCutoverActive()) {
    const { rows } = await query<{ email: string }>(`delete from public.admin_invites where id = $1 returning email::text as email`, [id]);
    return rows[0] ?? null;
  }
  const ref = db.collection("adminInvites").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return null;
  await ref.delete();
  return { email: (snap.data() as { email: string }).email };
}
