import { listMembersForAdmin } from "@/lib/admin-directory";
import { AdminMessages } from "@/components/admin-messages";
import { AdminShell } from "@/components/admin-shell";
import { getAdminInbox } from "@/lib/messaging";
import { requireAdminPage } from "@/lib/admin-page";

export const dynamic="force-dynamic";

export default async function AdminMessagesPage(){
  await requireAdminPage("messages");
  const [threads,memberRows]=await Promise.all([getAdminInbox(),listMembersForAdmin()]);
  const members=memberRows.map(({id,name,email})=>({id,name,email}));
  return <AdminShell active="Messages"><div className="admin-content messages-admin-content"><AdminMessages initialThreads={threads} members={members}/></div></AdminShell>;
}
