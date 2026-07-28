import { db } from "@/db";
import { auditLogs, messageThreads, threadMessages } from "@/db/schema";
import { getCurrentMember } from "@/lib/member-auth";
import { getMemberInbox } from "@/lib/messaging";

export const dynamic = "force-dynamic";

export async function GET(){const member=await getCurrentMember();if(!member)return Response.json({error:"Member sign-in required."},{status:401});return Response.json(await getMemberInbox(member.id));}

export async function POST(request:Request){
  const member=await getCurrentMember();if(!member)return Response.json({error:"Member sign-in required."},{status:401});
  const body=await request.json() as {subject?:string;message?:string;category?:string};const subject=body.subject?.trim().slice(0,160)??"";const text=body.message?.trim().slice(0,3000)??"";const category=["support","booking","billing","general"].includes(body.category??"")?body.category!:"support";
  if(!subject||!text)return Response.json({error:"Subject and message are required."},{status:400});const now=new Date();
  const created=await db.transaction(async tx=>{const [thread]=await tx.insert(messageThreads).values({memberId:member.id,subject,category,status:"open",lastMessageAt:now}).returning();const [message]=await tx.insert(threadMessages).values({threadId:thread.id,senderType:"member",senderName:member.name,body:text,readByMember:true,readByAdmin:false}).returning();await tx.insert(auditLogs).values({adminId:null,adminName:`Member · ${member.name}`.slice(0,120),action:"message.thread_created_by_member",entityType:"message_thread",entityId:String(thread.id),details:JSON.stringify({category})});return {...thread,memberName:member.name,memberEmail:member.email,messages:[message]};});
  return Response.json(created,{status:201});
}
