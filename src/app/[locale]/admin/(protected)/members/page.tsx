import { listMembersForAdmin } from "@/lib/admin-directory";
import { AdminMembers } from "@/components/admin-members";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPage } from "@/lib/admin-page";

export const dynamic = "force-dynamic";

export default async function AdminMembersPage() {
  await requireAdminPage("members_view");
  const rows = await listMembersForAdmin();
  return <AdminShell active="Members"><div className="admin-content"><div className="admin-heading"><div><p>Jyotish / Relationships</p><h1>Members</h1><span>Manage customer access, profiles, and membership plans.</span></div><div><small>Directory status</small><strong>Live <i/></strong></div></div><AdminMembers initialMembers={rows}/></div></AdminShell>;
}
