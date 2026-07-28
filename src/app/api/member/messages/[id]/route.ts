import { and,eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs,messageThreads,threadMessages } from "@/db/schema";
import { getCurrentMember } from "@/lib/member-auth";

export const dynamic="force-dynamic";
function parseId(value:string){const id=Number(value);return Number.isInteger(id)&&id>0?id:null;}

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  const member=await getCurrentMember();if(!member)return Response.json({error:"Member sign-in required."},{status:401});const{id:raw}=await params;const id=parseId(raw);if(!id)return Response.json({error:"Invalid thread id."},{status:400});
  const [thread]=await db.select().from(messageThreads).where(and(eq(messageThreads.id,id),eq(messageThreads.memberId,member.id))).limit(1);if(!thread)return Response.json({error:"Thread not found."},{status:404});if(thread.status==="closed")return Response.json({error:"This conversation is closed. Start a new one if you still need help."},{status:409});
  const body=await request.json() as {message?:string};const text=body.message?.trim().slice(0,3000)??"";if(!text)return Response.json({error:"Write a message before sending."},{status:400});const now=new Date();
  const [message]=await db.insert(threadMessages).values({threadId:id,senderType:"member",senderName:member.name,body:text,readByMember:true,readByAdmin:false}).returning();await db.update(messageThreads).set({lastMessageAt:now,updatedAt:now}).where(eq(messageThreads.id,id));await db.insert(auditLogs).values({adminId:null,adminName:`Member · ${member.name}`.slice(0,120),action:"message.reply_sent_by_member",entityType:"message_thread",entityId:String(id)});return Response.json(message,{status:201});
}

export async function PUT(_:Request,{params}:{params:Promise<{id:string}>}){
  const member=await getCurrentMember();if(!member)return Response.json({error:"Member sign-in required."},{status:401});const{id:raw}=await params;const id=parseId(raw);if(!id)return Response.json({error:"Invalid thread id."},{status:400});const [thread]=await db.select().from(messageThreads).where(and(eq(messageThreads.id,id),eq(messageThreads.memberId,member.id))).limit(1);if(!thread)return Response.json({error:"Thread not found."},{status:404});await db.update(threadMessages).set({readByMember:true}).where(and(eq(threadMessages.threadId,id),eq(threadMessages.readByMember,false)));return Response.json({ok:true,id});
}
