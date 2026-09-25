import { getCurrentAdmin, hasAdminPermission, recordAudit } from "@/lib/admin-auth";
import { createPractitionerAdmin, getPractitionerDirectory, PractitionerAdminError } from "@/lib/scheduling";

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

/** The Schedule page's "Add practitioner". Same rules as /api/admin/practitioners — both call
 * createPractitionerAdmin — and the same permission: creating a practitioner sets their rate and
 * verification, which is practitioner management, not scheduling. */
export async function POST(request:Request){
  const admin=await getCurrentAdmin();
  if(!admin)return Response.json({error:"Administrator access required."},{status:401});
  if(!hasAdminPermission(admin,"practitioners"))return Response.json({error:"Practitioners permission required to add a practitioner."},{status:403});
  const body=await request.json() as PractitionerPayload;
  if((body.bio?.trim().length??0)<10)return Response.json({error:"Name, valid email, and biography are required."},{status:400});

  try {
    const created = await createPractitionerAdmin({
      name: body.name ?? "",
      email: body.email ?? "",
      title: body.title?.trim() || "Vedic Astrologer",
      bio: body.bio ?? "",
      specialties: body.specialties?.trim() || "Birth charts",
      languages: body.languages?.trim() || "English, Hindi",
      consultationModes: body.consultationModes?.trim() || "Video, Audio, Chat",
      experienceYears: body.experienceYears,
      verified: body.verified ?? false,
      verificationLevel: body.verificationLevel ?? "reviewed",
      photoUrl: body.photoUrl ?? null,
      online: body.online ?? false,
      chatRatePerMinute: Number(body.chatRatePerMinute) || 15,
      active: body.active ?? true,
      featured: body.featured ?? false,
    }, { starterHours: true });
    await recordAudit(admin,"practitioner.created","practitioner",created.id,{name:created.name,email:created.email});
    const all=await getPractitionerDirectory(false,true);
    return Response.json(all.find(x=>x.id===created.id),{status:201});
  } catch (error) {
    if (error instanceof PractitionerAdminError) return Response.json({error:error.message},{status:error.message.includes("already exists")?409:400});
    throw error;
  }
}
