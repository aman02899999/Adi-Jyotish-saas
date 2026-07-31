import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firestore";
import { getCurrentMember } from "@/lib/member-auth";

export const dynamic="force-dynamic";

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  const member=await getCurrentMember();if(!member)return Response.json({error:"Member sign-in required."},{status:401});
  const{id}=await params;
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
