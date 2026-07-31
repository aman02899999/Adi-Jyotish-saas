import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firestore";
import { getCurrentAdmin, hasAdminPermission, recordAudit } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request,{params}:{params:Promise<{id:string}>}) {
  const admin=await getCurrentAdmin(); if(!admin)return Response.json({error:"Administrator access required."},{status:401});if(!hasAdminPermission(admin,"messages"))return Response.json({error:"Message permission required."},{status:403});
  const {id}=await params;
  const threadRef=db.collection("messageThreads").doc(id);
  const threadSnap=await threadRef.get();if(!threadSnap.exists)return Response.json({error:"Thread not found."},{status:404});
  const body=await request.json() as {message?:string};const text=body.message?.trim().slice(0,3000)??"";if(!text)return Response.json({error:"Write a message before sending."},{status:400});
  const now=FieldValue.serverTimestamp();
  const messageRef=threadRef.collection("messages").doc();
  await messageRef.set({senderType:"admin",senderName:admin.name,body:text,readByAdmin:true,readByMember:false,createdAt:now});
  await threadRef.update({status:"open",lastMessageAt:now,updatedAt:now});
  await recordAudit(admin,"message.reply_sent","message_thread",id);
  const messageSnap=await messageRef.get();
  const data=messageSnap.data() as {senderType:string;senderName:string;body:string;readByMember:boolean;readByAdmin:boolean;createdAt:FirebaseFirestore.Timestamp};
  return Response.json({id:messageRef.id,threadId:id,senderType:data.senderType,senderName:data.senderName,body:data.body,readByMember:data.readByMember,readByAdmin:data.readByAdmin,createdAt:data.createdAt.toDate()},{status:201});
}

export async function PUT(request:Request,{params}:{params:Promise<{id:string}>}) {
  const admin=await getCurrentAdmin();if(!admin)return Response.json({error:"Administrator access required."},{status:401});if(!hasAdminPermission(admin,"messages"))return Response.json({error:"Message permission required."},{status:403});
  const {id}=await params;
  const threadRef=db.collection("messageThreads").doc(id);
  const threadSnap=await threadRef.get();if(!threadSnap.exists)return Response.json({error:"Thread not found."},{status:404});
  const thread=threadSnap.data() as {status:string};
  const body=await request.json() as {status?:string;markRead?:boolean};
  if(body.markRead){
    const unreadSnap=await threadRef.collection("messages").where("senderType","==","member").where("readByAdmin","==",false).get();
    const batch=db.batch();
    for(const doc of unreadSnap.docs)batch.update(doc.ref,{readByAdmin:true});
    if(unreadSnap.size)await batch.commit();
  }
  let status=thread.status;
  if(body.status){
    if(!["open","closed"].includes(body.status))return Response.json({error:"Invalid thread status."},{status:400});
    status=body.status;
    await threadRef.update({status,updatedAt:FieldValue.serverTimestamp()});
    await recordAudit(admin,"message.thread_status_changed","message_thread",id,{status});
  }
  return Response.json({ok:true,id,status});
}

export async function DELETE(_:Request,{params}:{params:Promise<{id:string}>}) {
  const admin=await getCurrentAdmin();if(!admin)return Response.json({error:"Administrator access required."},{status:401});if(!hasAdminPermission(admin,"messages"))return Response.json({error:"Message permission required."},{status:403});
  const {id}=await params;
  const threadRef=db.collection("messageThreads").doc(id);
  const threadSnap=await threadRef.get();if(!threadSnap.exists)return Response.json({error:"Thread not found."},{status:404});
  const subject=(threadSnap.data() as {subject:string}).subject;
  const messagesSnap=await threadRef.collection("messages").get();
  const batch=db.batch();
  for(const doc of messagesSnap.docs)batch.delete(doc.ref);
  batch.delete(threadRef);
  await batch.commit();
  await recordAudit(admin,"message.thread_deleted","message_thread",id,{subject});
  return Response.json({ok:true,id});
}
