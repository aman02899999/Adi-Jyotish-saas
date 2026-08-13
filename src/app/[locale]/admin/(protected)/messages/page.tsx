import { db } from "@/lib/firestore";
import { AdminMessages } from "@/components/admin-messages";
import { AdminShell } from "@/components/admin-shell";
import { getAdminInbox } from "@/lib/messaging";
import { requireAdminPage } from "@/lib/admin-page";

export const dynamic="force-dynamic";

export default async function AdminMessagesPage(){
  await requireAdminPage("messages");
  const [threads,membersSnap]=await Promise.all([getAdminInbox(),db.collection("members").orderBy("name","asc").get()]);
  const members=membersSnap.docs.map((doc)=>({id:doc.id,name:doc.data().name as string,email:doc.data().email as string}));
  return <AdminShell active="Messages"><div className="admin-content messages-admin-content"><AdminMessages initialThreads={threads} members={members}/></div></AdminShell>;
}
