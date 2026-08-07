import { redirect } from "next/navigation";
import { db } from "@/lib/firestore";
import { AdminSettings } from "@/components/admin-settings";
import { AdminDemoAccounts } from "@/components/admin-demo-accounts";
import { AdminPromoBanner } from "@/components/admin-promo-banner";
import { AdminShell } from "@/components/admin-shell";
import { ALL_ADMIN_PERMISSIONS, getCurrentAdmin, hasAdminPermission } from "@/lib/admin-auth";
import { getAllRolesAdmin, getAssignableRoleSlugs } from "@/lib/admin-roles";
import { listPendingAdminInvites } from "@/lib/admin-invites";
import { getPromoBanner } from "@/lib/promo-banner";
import { getStudioSettings } from "@/lib/studio-settings";

export const dynamic = "force-dynamic";

function toDate(value: FirebaseFirestore.Timestamp | Date | undefined | null): Date | null {
  if (!value) return null;
  return value instanceof Date ? value : value.toDate();
}

export default async function AdminSettingsPage() {
  const admin = await getCurrentAdmin();
  if (!hasAdminPermission(admin, "settings")) redirect("/admin/unauthorized");

  // The "team" tab exposes the full admin roster (names, emails, roles, last login) and pending
  // invites — a role can legitimately hold "settings" without "team" (e.g. a custom role built for
  // studio config only), so that data must only be fetched when the admin actually has "team".
  const canManageTeam = hasAdminPermission(admin, "team");

  const [settings, usersSnap, invites, roleOptions, initialRoles, promoBanner] = await Promise.all([
    getStudioSettings(),
    canManageTeam ? db.collection("adminUsers").orderBy("name", "asc").get() : Promise.resolve(null),
    canManageTeam ? listPendingAdminInvites() : Promise.resolve([]),
    getAssignableRoleSlugs(),
    getAllRolesAdmin(),
    getPromoBanner(),
  ]);
  const users = usersSnap
    ? usersSnap.docs.map((doc) => {
        const data = doc.data() as Record<string, unknown>;
        return {
          id: doc.id,
          name: data.name as string,
          email: data.email as string,
          role: data.role as string,
          active: data.active !== false,
          lastLoginAt: toDate(data.lastLoginAt as FirebaseFirestore.Timestamp | undefined),
          createdAt: toDate(data.createdAt as FirebaseFirestore.Timestamp | undefined) ?? new Date(),
        };
      })
    : [];

  return (
    <AdminShell active="Settings">
      <div className="admin-content">
        <div className="admin-heading">
          <div><p>Jyotish / Workspace</p><h1>Settings</h1><span>Configure studio policy, identity, and secure team access.</span></div>
          <div><small>Access level</small><strong>Owner <i /></strong></div>
        </div>
        <AdminSettings
          initialSettings={settings}
          initialUsers={users}
          initialInvites={invites}
          currentAdminId={admin!.id}
          roleOptions={roleOptions}
          initialRoles={initialRoles}
          allPermissions={ALL_ADMIN_PERMISSIONS}
          canManageRoles={hasAdminPermission(admin, "roles")}
          canManageTeam={canManageTeam}
        />
        <AdminPromoBanner initial={{ enabled: promoBanner.enabled, message: promoBanner.message, ctaLabel: promoBanner.ctaLabel, ctaHref: promoBanner.ctaHref }} />
        <AdminDemoAccounts />
      </div>
    </AdminShell>
  );
}
