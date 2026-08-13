import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firestore";
import { getCurrentAdmin,hasAdminPermission,recordAudit } from "@/lib/admin-auth";
import { getPractitionerDirectory } from "@/lib/scheduling";

type PractitionerPayload = {
  name?: string;
  email?: string;
  title?: string;
  bio?: string;
  specialties?: string;
  languages?: string;
  consultationModes?: string;
  experienceYears?: number;
  verified?: boolean;
  verificationLevel?: string;
  photoUrl?: string;
  online?: boolean;
  chatRatePerMinute?: number;
  active?: boolean;
  featured?: boolean;
};

export async function PUT(request:Request,{params}:{params:Promise<{id:string}>}){
  const admin=await getCurrentAdmin();
  if(!admin)return Response.json({error:"Administrator access required."},{status:401});
  if(!hasAdminPermission(admin,"schedule"))return Response.json({error:"Scheduling permission required."},{status:403});
  const{id}=await params;
  const body=await request.json() as PractitionerPayload;
  const name=body.name?.trim().slice(0,120)??"";
  const email=body.email?.trim().toLowerCase().slice(0,180)??"";
  const bio=body.bio?.trim().slice(0,1200)??"";
  if(name.length<2||!/^\S+@\S+\.\S+$/.test(email)||bio.length<10)return Response.json({error:"Name, valid email, and biography are required."},{status:400});
  const photoUrl=body.photoUrl?.trim();

  const ref = db.collection("practitioners").doc(id);
  const snap = await ref.get();
  if(!snap.exists)return Response.json({error:"Practitioner not found."},{status:404});

  const emailOwner = await db.collection("practitioners").where("email","==",email).limit(1).get();
  if(!emailOwner.empty && emailOwner.docs[0].id !== id) return Response.json({error:"This email is already in use."},{status:409});

  const patch = {
    name,
    email,
    title:body.title?.trim().slice(0,120)||"Vedic Astrologer",
    bio,
    specialties:body.specialties?.trim().slice(0,500)||"Birth charts",
    languages:body.languages?.trim().slice(0,240)||"English, Hindi",
    consultationModes:body.consultationModes?.trim().slice(0,160)||"Video, Audio, Chat",
    experienceYears:Math.max(0,Number(body.experienceYears)||0),
    verified:body.verified??false,
    verificationLevel:body.verificationLevel?.trim().slice(0,40)||"reviewed",
    photoUrl:photoUrl?photoUrl.slice(0,500):null,
    online:body.online??false,
    chatRatePerMinute:Math.max(1,Number(body.chatRatePerMinute)||15),
    active:body.active??true,
    featured:body.featured??false,
  };
  await ref.update({...patch, updatedAt: FieldValue.serverTimestamp()});
  await recordAudit(admin,"practitioner.updated","practitioner",id,{name,active:patch.active,verified:patch.verified});
  const all=await getPractitionerDirectory(false,true);
  return Response.json(all.find(x=>x.id===id));
}

export async function DELETE(_:Request,{params}:{params:Promise<{id:string}>}){
  const admin=await getCurrentAdmin();
  if(!admin)return Response.json({error:"Administrator access required."},{status:401});
  if(!hasAdminPermission(admin,"schedule"))return Response.json({error:"Scheduling permission required."},{status:403});
  const{id}=await params;
  const ref = db.collection("practitioners").doc(id);
  const snap = await ref.get();
  if(!snap.exists)return Response.json({error:"Practitioner not found."},{status:404});
  const name = snap.data()?.name as string;
  await ref.delete();
  await recordAudit(admin,"practitioner.deleted","practitioner",id,{name});
  return Response.json({ok:true,id});
}
