import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { messageThreads, threadMessages } from "@/db/schema";
import { getCurrentAdmin, hasAdminPermission, recordAudit } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
function parseId(value: string) { const id=Number(value); return Number.isInteger(id)&&id>0?id:null; }

export async function POST(request: Request,{params}:{params:Promise<{id:string}>}) {
  const admin=await getCurrentAdmin(); if(!admin)return Response.json({error:"Administrator access required."},{status:401});if(!hasAdminPermission(admin,"messages"))return Response.json({error:"Message permission required."},{status:403});
  const {id:raw}=await params;const id=parseId(raw);if(!id)return Response.json({error:"Invalid thread id."},{status:400});
  const [thread]=await db.select().from(messageThreads).where(eq(messageThreads.id,id)).limit(1);if(!thread)return Response.json({error:"Thread not found."},{status:404});
  const body=await request.json() as {message?:string};const text=body.message?.trim().slice(0,3000)??"";if(!text)return Response.json({error:"Write a message before sending."},{status:400});
  const now=new Date();const [message]=await db.insert(threadMessages).values({threadId:id,senderType:"admin",senderName:admin.name,body:text,readByAdmin:true,readByMember:false}).returning();
  await db.update(messageThreads).set({status:"open",lastMessageAt:now,updatedAt:now}).where(eq(messageThreads.id,id));
  await recordAudit(admin,"message.reply_sent","message_thread",id);
  return Response.json(message,{status:201});
}

export async function PUT(request:Request,{params}:{params:Promise<{id:string}>}) {
  const admin=await getCurrentAdmin();if(!admin)return Response.json({error:"Administrator access required."},{status:401});if(!hasAdminPermission(admin,"messages"))return Response.json({error:"Message permission required."},{status:403});
  const {id:raw}=await params;const id=parseId(raw);if(!id)return Response.json({error:"Invalid thread id."},{status:400});
  const body=await request.json() as {status?:string;markRead?:boolean};
  const [thread]=await db.select().from(messageThreads).where(eq(messageThreads.id,id)).limit(1);if(!thread)return Response.json({error:"Thread not found."},{status:404});
  if(body.markRead)await db.update(threadMessages).set({readByAdmin:true}).where(and(eq(threadMessages.threadId,id),eq(threadMessages.senderType,"member")));
  let status=thread.status;if(body.status){if(!["open","closed"].includes(body.status))return Response.json({error:"Invalid thread status."},{status:400});status=body.status;await db.update(messageThreads).set({status,updatedAt:new Date()}).where(eq(messageThreads.id,id));await recordAudit(admin,"message.thread_status_changed","message_thread",id,{status});}
  return Response.json({ok:true,id,status});
}

export async function DELETE(_:Request,{params}:{params:Promise<{id:string}>}) {
  const admin=await getCurrentAdmin();if(!admin)return Response.json({error:"Administrator access required."},{status:401});if(!hasAdminPermission(admin,"messages"))return Response.json({error:"Message permission required."},{status:403});
  const {id:raw}=await params;const id=parseId(raw);if(!id)return Response.json({error:"Invalid thread id."},{status:400});
  const [deleted]=await db.delete(messageThreads).where(eq(messageThreads.id,id)).returning({id:messageThreads.id,subject:messageThreads.subject});if(!deleted)return Response.json({error:"Thread not found."},{status:404});
  await recordAudit(admin,"message.thread_deleted","message_thread",id,{subject:deleted.subject});return Response.json({ok:true,id});
}
