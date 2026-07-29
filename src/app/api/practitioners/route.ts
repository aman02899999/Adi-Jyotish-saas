import { db } from "@/db";
import { availabilityRules, practitioners } from "@/db/schema";
import { getCurrentAdmin, hasAdminPermission, recordAudit } from "@/lib/admin-auth";
import { getPractitionerDirectory } from "@/lib/scheduling";
import { toSlug } from "@/lib/services";

export const dynamic = "force-dynamic";

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

export async function GET(){const admin=await getCurrentAdmin();if(!admin)return Response.json({error:"Administrator access required."},{status:401});if(!hasAdminPermission(admin,"schedule"))return Response.json({error:"Scheduling permission required."},{status:403});return Response.json(await getPractitionerDirectory(false));}

export async function POST(request:Request){
  const admin=await getCurrentAdmin();
  if(!admin)return Response.json({error:"Administrator access required."},{status:401});
  if(!hasAdminPermission(admin,"schedule"))return Response.json({error:"Scheduling permission required."},{status:403});
  const body=await request.json() as PractitionerPayload;
  const name=body.name?.trim().slice(0,120)??"";
  const email=body.email?.trim().toLowerCase().slice(0,180)??"";
  const bio=body.bio?.trim().slice(0,1200)??"";
  if(name.length<2||!/^\S+@\S+\.\S+$/.test(email)||bio.length<10)return Response.json({error:"Name, valid email, and biography are required."},{status:400});
  const photoUrl=body.photoUrl?.trim();
  try{
    const [created]=await db.insert(practitioners).values({
      name,
      email,
      slug:`${toSlug(name)}-${Date.now().toString(36).slice(-4)}`,
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
    }).returning();
    await db.insert(availabilityRules).values([1,2,3,4,5].map(weekday=>({practitionerId:created.id,weekday,startTime:"09:30",endTime:"17:30",active:true})));
    await recordAudit(admin,"practitioner.created","practitioner",created.id,{name,email});
    const all=await getPractitionerDirectory(false);
    return Response.json(all.find(x=>x.id===created.id),{status:201});
  }catch{
    return Response.json({error:"A practitioner with this email already exists."},{status:409});
  }
}
