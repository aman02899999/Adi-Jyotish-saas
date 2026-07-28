import { MemberAppShell } from "@/components/member-app-shell";
import { MemberInbox } from "@/components/member-inbox";
import { getCurrentMember } from "@/lib/member-auth";
import { getMemberInbox } from "@/lib/messaging";

export const dynamic="force-dynamic";

export default async function MemberMessagesPage(){const member=await getCurrentMember();if(!member)return null;const threads=await getMemberInbox(member.id);return <MemberAppShell member={member} active="Messages"><MemberInbox initialThreads={threads}/></MemberAppShell>;}
