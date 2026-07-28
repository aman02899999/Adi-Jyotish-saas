import { createHash } from "node:crypto";
import Link from "next/link";
import { and,eq,gt,isNull } from "drizzle-orm";
import { ArrowLeft,ShieldCheck } from "lucide-react";
import { db } from "@/db";
import { adminInvites } from "@/db/schema";
import { AdminInviteForm } from "@/components/admin-invite-form";
import { BrandMark } from "@/components/brand-mark";

export const dynamic="force-dynamic";
export default async function AdminInvitePage({params}:{params:Promise<{token:string}>}){const{token}=await params;const hash=createHash("sha256").update(token).digest("hex");const[invite]=await db.select().from(adminInvites).where(and(eq(adminInvites.tokenHash,hash),isNull(adminInvites.acceptedAt),gt(adminInvites.expiresAt,new Date()))).limit(1);return <main className="invite-page"><header><BrandMark/><Link href="/"><ArrowLeft size={14}/> Return home</Link></header><section>{invite?<><div className="admin-auth-seal"><ShieldCheck size={23}/></div><p className="eyebrow"><span/> Studio invitation</p><h1>Join the Jyotish<br/><em>operations team.</em></h1><p>Your access has been scoped for your role. Create a secure password to enter the workspace.</p><AdminInviteForm token={token} email={invite.email} role={invite.role}/></>:<div className="expired-invite"><ShieldCheck size={27}/><h1>This invitation<br/><em>is no longer active.</em></h1><p>Ask a workspace owner to send a fresh invitation.</p><Link className="button button--ghost" href="/admin/login">Administrator sign in</Link></div>}</section></main>;}
