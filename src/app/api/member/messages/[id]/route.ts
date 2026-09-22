import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firestore";
import { getCurrentMember } from "@/lib/member-auth";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/admin-auth";
import { isSupabaseCutoverActive } from "@/lib/supabase-config";
import {
  createThreadWithMessageInSupabase,
  deleteThreadInSupabase,
  getThreadForAdminInSupabase,
  getThreadForMemberInSupabase,
  markThreadReadByAdminInSupabase,
  markThreadReadByMemberInSupabase,
  replyToThreadInSupabase,
  setThreadStatusInSupabase,
} from "@/lib/messaging-supabase";

export const dynamic="force-dynamic";

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  const member=await getCurrentMember();if(!member)return Response.json({error:"Member sign-in required."},{status:401});
  const throttle=await checkRateLimit("member-message-reply",`member:${member.id}`,20,600);
  if(!throttle.allowed)return rateLimitResponse(throttle.retryAfter);
  const{id}=await params;
  if (isSupabaseCutoverActive()) {
    // Ownership is in the query, so probing another member's thread id returns the
    // same "not found" as a bad id.
    const owned=await getThreadForMemberInSupabase(id,member.id);
    if(!owned)return Response.json({error:"Thread not found."},{status:404});
    if(owned.status==="closed")return Response.json({error:"This conversation is closed. Start a new one if you still need help."},{status:409});
    const body=await request.json() as {message?:string};const text=body.message?.trim().slice(0,3000)??"";if(!text)return Response.json({error:"Write a message before sending."},{status:400});
    // A member reply must NOT reopen a thread an admin closed — reopen is false here.
    const message=await replyToThreadInSupabase({threadId:id,senderType:"member",senderName:member.name,body:text,reopen:false});
    if(!message)return Response.json({error:"Thread not found."},{status:404});
    await recordAudit({ id: null, name: `Member · ${member.name}`.slice(0, 120) },"message.reply_sent_by_member","message_thread",id);
    return Response.json(message,{status:201});
  }
  const threadRef=db.collection("messageThreads").doc(id);
  const threadSnap=await threadRef.get();
  const thread=threadSnap.exists?(threadSnap.data() as {memberId:string;status:string}):null;
  if(!thread||thread.memberId!==member.id)return Response.json({error:"Thread not found."},{status:404});
  if(thread.status==="closed")return Response.json({error:"This conversation is closed. Start a new one if you still need help."},{status:409});
  const body=await request.json() as {message?:string};const text=body.message?.trim().slice(0,3000)??"";if(!text)return Response.json({error:"Write a message before sending."},{status:400});
  const now=FieldValue.serverTimestamp();
  const messageRef=threadRef.collection("messages").doc();
  await messageRef.set({senderType:"member",senderName:member.name,body:text,readByMember:true,readByAdmin:false,createdAt:now});
  await threadRef.update({lastMessageAt:now,updatedAt:now});
  await db.collection("auditLogs").add({adminId:null,adminName:`Member · ${member.name}`.slice(0,120),action:"message.reply_sent_by_member",entityType:"message_thread",entityId:id,details:null,createdAt:now});
  const messageSnap=await messageRef.get();
  const data=messageSnap.data() as {senderType:string;senderName:string;body:string;readByMember:boolean;readByAdmin:boolean;createdAt:FirebaseFirestore.Timestamp};
  return Response.json({id:messageRef.id,threadId:id,senderType:data.senderType,senderName:data.senderName,body:data.body,readByMember:data.readByMember,readByAdmin:data.readByAdmin,createdAt:data.createdAt.toDate()},{status:201});
}

export async function PUT(_:Request,{params}:{params:Promise<{id:string}>}){
  const member=await getCurrentMember();if(!member)return Response.json({error:"Member sign-in required."},{status:401});
  const{id}=await params;
  if (isSupabaseCutoverActive()) {
    const owned=await getThreadForMemberInSupabase(id,member.id);
    if(!owned)return Response.json({error:"Thread not found."},{status:404});
    await markThreadReadByMemberInSupabase(id);
    return Response.json({ok:true,id});
  }
  const threadRef=db.collection("messageThreads").doc(id);
  const threadSnap=await threadRef.get();
  const thread=threadSnap.exists?(threadSnap.data() as {memberId:string}):null;
  if(!thread||thread.memberId!==member.id)return Response.json({error:"Thread not found."},{status:404});
  const unreadSnap=await threadRef.collection("messages").where("readByMember","==",false).get();
  const batch=db.batch();
  for(const doc of unreadSnap.docs)batch.update(doc.ref,{readByMember:true});
  if(unreadSnap.size)await batch.commit();
  return Response.json({ok:true,id});
}
