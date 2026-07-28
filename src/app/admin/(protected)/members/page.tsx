import { asc } from "drizzle-orm";
import { db } from "@/db";
import { memberUsers } from "@/db/schema";
import { AdminMembers } from "@/components/admin-members";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPage } from "@/lib/admin-page";

export const dynamic = "force-dynamic";

export default async function AdminMembersPage() {
  await requireAdminPage("members_view");
  const rows = await db.select({
    id:memberUsers.id,name:memberUsers.name,email:memberUsers.email,phone:memberUsers.phone,
    birthDate:memberUsers.birthDate,birthTime:memberUsers.birthTime,birthPlace:memberUsers.birthPlace,
    plan:memberUsers.plan,onboardingComplete:memberUsers.onboardingComplete,active:memberUsers.active,
    lastLoginAt:memberUsers.lastLoginAt,createdAt:memberUsers.createdAt,updatedAt:memberUsers.updatedAt,
  }).from(memberUsers).orderBy(asc(memberUsers.name));
  return <AdminShell active="Members"><div className="admin-content"><div className="admin-heading"><div><p>Jyotish / Relationships</p><h1>Members</h1><span>Manage customer access, profiles, and membership plans.</span></div><div><small>Directory status</small><strong>Live <i/></strong></div></div><AdminMembers initialMembers={rows}/></div></AdminShell>;
}
