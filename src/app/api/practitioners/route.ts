import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firestore";
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

export async function GET(){const admin=await getCurrentAdmin();if(!admin)return Response.json({error:"Administrator access required."},{status:401});if(!hasAdminPermission(admin,"schedule"))return Response.json({error:"Scheduling permission required."},{status:403});return Response.json(await getPractitionerDirectory(false,true));}

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

  const existing = await db.collection("practitioners").where("email","==",email).limit(1).get();
  if(!existing.empty) return Response.json({error:"A practitioner with this email already exists."},{status:409});

  const slug = `${toSlug(name)}-${Date.now().toString(36).slice(-4)}`;
  const ref = db.collection("practitioners").doc(slug);
  await ref.set({
    name,
    slug,
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
    firebaseUid:null,
    createdAt:FieldValue.serverTimestamp(),
    updatedAt:FieldValue.serverTimestamp(),
  });
  const batch = db.batch();
  for (const weekday of [1,2,3,4,5]) {
    batch.set(ref.collection("availabilityRules").doc(), { weekday, startTime: "09:30", endTime: "17:30", active: true });
  }
  await batch.commit();

  await recordAudit(admin,"practitioner.created","practitioner",slug,{name,email});
  const all=await getPractitionerDirectory(false,true);
  return Response.json(all.find(x=>x.id===slug),{status:201});
}
