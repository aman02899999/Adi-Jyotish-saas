import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firestore";
import { getCurrentMember } from "@/lib/member-auth";
import { getMemberInbox } from "@/lib/messaging";

export const dynamic = "force-dynamic";

export async function GET(){const member=await getCurrentMember();if(!member)return Response.json({error:"Member sign-in required."},{status:401});return Response.json(await getMemberInbox(member.id));}

export async function POST(request:Request){
  const member=await getCurrentMember();if(!member)return Response.json({error:"Member sign-in required."},{status:401});
  const body=await request.json() as {subject?:string;message?:string;category?:string};const subject=body.subject?.trim().slice(0,160)??"";const text=body.message?.trim().slice(0,3000)??"";const category=["support","booking","billing","general"].includes(body.category??"")?body.category!:"support";
  if(!subject||!text)return Response.json({error:"Subject and message are required."},{status:400});
  const now=FieldValue.serverTimestamp();
  const threadRef=db.collection("messageThreads").doc();
  await threadRef.set({memberId:member.id,bookingId:null,subject,category,status:"open",lastMessageAt:now,createdAt:now,updatedAt:now});
  const messageRef=threadRef.collection("messages").doc();
  await messageRef.set({senderType:"member",senderName:member.name,body:text,readByMember:true,readByAdmin:false,createdAt:now});
  await db.collection("auditLogs").add({adminId:null,adminName:`Member · ${member.name}`.slice(0,120),action:"message.thread_created_by_member",entityType:"message_thread",entityId:threadRef.id,details:JSON.stringify({category}),createdAt:now});
  const [threadSnap,messageSnap]=await Promise.all([threadRef.get(),messageRef.get()]);
  const threadData=threadSnap.data() as {subject:string;category:string;status:string;lastMessageAt:FirebaseFirestore.Timestamp;createdAt:FirebaseFirestore.Timestamp;updatedAt:FirebaseFirestore.Timestamp};
  const messageData=messageSnap.data() as {senderType:string;senderName:string;body:string;readByMember:boolean;readByAdmin:boolean;createdAt:FirebaseFirestore.Timestamp};
  const created={
    id:threadRef.id,memberId:member.id,bookingId:null,subject:threadData.subject,category:threadData.category,status:threadData.status,
    lastMessageAt:threadData.lastMessageAt.toDate(),createdAt:threadData.createdAt.toDate(),updatedAt:threadData.updatedAt.toDate(),
    memberName:member.name,memberEmail:member.email,
    messages:[{id:messageRef.id,threadId:threadRef.id,senderType:messageData.senderType,senderName:messageData.senderName,body:messageData.body,readByMember:messageData.readByMember,readByAdmin:messageData.readByAdmin,createdAt:messageData.createdAt.toDate()}],
  };
  return Response.json(created,{status:201});
}
