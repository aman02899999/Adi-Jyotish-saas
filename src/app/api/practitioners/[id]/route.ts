import { eq } from "drizzle-orm";
import { db } from "@/db";
import { practitioners } from "@/db/schema";
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

function idOf(value:string){const id=Number(value);return Number.isInteger(id)&&id>0?id:null;}

export async function PUT(request:Request,{params}:{params:Promise<{id:string}>}){
  const admin=await getCurrentAdmin();
  if(!admin)return Response.json({error:"Administrator access required."},{status:401});
  if(!hasAdminPermission(admin,"schedule"))return Response.json({error:"Scheduling permission required."},{status:403});
  const{id:raw}=await params;
  const id=idOf(raw);
  if(!id)return Response.json({error:"Invalid practitioner id."},{status:400});
  const body=await request.json() as PractitionerPayload;
  const name=body.name?.trim().slice(0,120)??"";
  const email=body.email?.trim().toLowerCase().slice(0,180)??"";
  const bio=body.bio?.trim().slice(0,1200)??"";
  if(name.length<2||!/^\S+@\S+\.\S+$/.test(email)||bio.length<10)return Response.json({error:"Name, valid email, and biography are required."},{status:400});
  const photoUrl=body.photoUrl?.trim();
  try{
    const[updated]=await db.update(practitioners).set({
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
      updatedAt:new Date(),
    }).where(eq(practitioners.id,id)).returning();
    if(!updated)return Response.json({error:"Practitioner not found."},{status:404});
    await recordAudit(admin,"practitioner.updated","practitioner",id,{name,active:updated.active,verified:updated.verified});
    const all=await getPractitionerDirectory(false);
    return Response.json(all.find(x=>x.id===id));
  }catch{
    return Response.json({error:"This email is already in use."},{status:409});
  }
}

export async function DELETE(_:Request,{params}:{params:Promise<{id:string}>}){const admin=await getCurrentAdmin();if(!admin)return Response.json({error:"Administrator access required."},{status:401});if(!hasAdminPermission(admin,"schedule"))return Response.json({error:"Scheduling permission required."},{status:403});const{id:raw}=await params;const id=idOf(raw);if(!id)return Response.json({error:"Invalid practitioner id."},{status:400});const[deleted]=await db.delete(practitioners).where(eq(practitioners.id,id)).returning({id:practitioners.id,name:practitioners.name});if(!deleted)return Response.json({error:"Practitioner not found."},{status:404});await recordAudit(admin,"practitioner.deleted","practitioner",id,{name:deleted.name});return Response.json({ok:true,id});}
