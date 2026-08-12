import { db } from "@/lib/firestore";
import { AdminSettings } from "@/components/admin-settings";
import { AdminDemoAccounts } from "@/components/admin-demo-accounts";
import { AdminPromoBanner } from "@/components/admin-promo-banner";
import { AdminShell } from "@/components/admin-shell";
import { TwoFactorSettings } from "@/components/two-factor-settings";
import { ALL_ADMIN_PERMISSIONS, hasAdminPermission } from "@/lib/admin-auth";
import { requireAdminPage } from "@/lib/admin-page";
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
  const admin = await requireAdminPage("settings");

  // The "team" tab exposes the full admin roster (names, emails, roles, last login) and pending
  // invites — a role can legitimately hold "settings" without "team" (e.g. a custom role built for
  // studio config only), so that data must only be fetched when the admin actually has "team".
  const canManageTeam = hasAdminPermission(admin, "team");
  // Full role definitions include every permission each role grants — only send that down to
  // admins who can actually act on it, for the same reason the team roster above is gated.
  const canManageRoles = hasAdminPermission(admin, "roles");

  const [settings, usersSnap, invites, roleOptions, initialRoles, promoBanner, selfSnap] = await Promise.all([
    getStudioSettings(),
    canManageTeam ? db.collection("adminUsers").orderBy("name", "asc").get() : Promise.resolve(null),
    canManageTeam ? listPendingAdminInvites() : Promise.resolve([]),
    getAssignableRoleSlugs(),
    canManageRoles ? getAllRolesAdmin() : Promise.resolve([]),
    getPromoBanner(),
    db.collection("adminUsers").doc(admin!.id).get(),
  ]);
  const totpEnabled = selfSnap.data()?.totpEnabled === true;
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
          canManageRoles={canManageRoles}
          canManageTeam={canManageTeam}
        />
        <AdminPromoBanner initial={{ enabled: promoBanner.enabled, message: promoBanner.message, ctaLabel: promoBanner.ctaLabel, ctaHref: promoBanner.ctaHref }} />
        <TwoFactorSettings apiPrefix="/api/admin/2fa" initialEnabled={totpEnabled} description="Two-factor authentication is protecting your sign-in." />
        <AdminDemoAccounts />
      </div>
    </AdminShell>
  );
}
