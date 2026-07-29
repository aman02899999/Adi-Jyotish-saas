import { and,asc,eq,gt,isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { adminInvites,adminUsers } from "@/db/schema";
import { AdminSettings } from "@/components/admin-settings";
import { AdminShell } from "@/components/admin-shell";
import { ALL_ADMIN_PERMISSIONS,getCurrentAdmin,hasAdminPermission } from "@/lib/admin-auth";
import { getAllRolesAdmin,getAssignableRoleSlugs } from "@/lib/admin-roles";
import { getStudioSettings } from "@/lib/studio-settings";

export const dynamic="force-dynamic";
export default async function AdminSettingsPage(){const admin=await getCurrentAdmin();if(!hasAdminPermission(admin,"settings"))redirect("/admin/unauthorized");const[settings,users,invites,roleOptions,initialRoles,[currentAdminRow]]=await Promise.all([getStudioSettings(),db.select({id:adminUsers.id,name:adminUsers.name,email:adminUsers.email,role:adminUsers.role,active:adminUsers.active,lastLoginAt:adminUsers.lastLoginAt,createdAt:adminUsers.createdAt}).from(adminUsers).orderBy(asc(adminUsers.name)),db.select({id:adminInvites.id,email:adminInvites.email,role:adminInvites.role,expiresAt:adminInvites.expiresAt,createdAt:adminInvites.createdAt}).from(adminInvites).where(and(isNull(adminInvites.acceptedAt),gt(adminInvites.expiresAt,new Date()))).orderBy(asc(adminInvites.createdAt)),getAssignableRoleSlugs(),getAllRolesAdmin(),db.select({totpEnabled:adminUsers.totpEnabled}).from(adminUsers).where(eq(adminUsers.id,admin!.id))]);return <AdminShell active="Settings"><div className="admin-content"><div className="admin-heading"><div><p>Jyotish / Workspace</p><h1>Settings</h1><span>Configure studio policy, identity, and secure team access.</span></div><div><small>Access level</small><strong>Owner <i/></strong></div></div><AdminSettings initialSettings={settings} initialUsers={users} initialInvites={invites} currentAdminId={admin!.id} roleOptions={roleOptions} initialRoles={initialRoles} allPermissions={ALL_ADMIN_PERMISSIONS} canManageRoles={hasAdminPermission(admin,"roles")} twoFactorEnabled={currentAdminRow?.totpEnabled??false}/></div></AdminShell>;}
