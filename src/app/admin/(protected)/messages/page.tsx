import { asc } from "drizzle-orm";
import { db } from "@/db";
import { memberUsers } from "@/db/schema";
import { AdminMessages } from "@/components/admin-messages";
import { AdminShell } from "@/components/admin-shell";
import { getAdminInbox } from "@/lib/messaging";
import { requireAdminPage } from "@/lib/admin-page";

export const dynamic="force-dynamic";

export default async function AdminMessagesPage(){await requireAdminPage("messages");const [threads,members]=await Promise.all([getAdminInbox(),db.select({id:memberUsers.id,name:memberUsers.name,email:memberUsers.email}).from(memberUsers).orderBy(asc(memberUsers.name))]);return <AdminShell active="Messages"><div className="admin-content messages-admin-content"><AdminMessages initialThreads={threads} members={members}/></div></AdminShell>;}
