import { getCurrentAdmin, hasAdminPermission, recordAudit } from "@/lib/admin-auth";
import { deletePractitionerAdmin, getPractitionerDirectory, PractitionerAdminError, updatePractitionerAdmin, type PractitionerProfilePatch } from "@/lib/scheduling";

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

const PROFILE_FIELDS = ["name","email","title","bio","specialties","languages","consultationModes","experienceYears","verified","verificationLevel","photoUrl","chatRatePerMinute","active","featured"] as const;

/**
 * The Schedule page's edit form and its online toggle. Both send the whole profile, so what the
 * admin is allowed to do is decided by what actually changes: going online or offline is
 * scheduling; anything else — rate, verification, email, bio — needs the practitioners permission,
 * the same as /api/admin/practitioners/[id]. Before, the schedule permission alone could do all of it.
 */
export async function PUT(request:Request,{params}:{params:Promise<{id:string}>}){
  const admin=await getCurrentAdmin();
  if(!admin)return Response.json({error:"Administrator access required."},{status:401});
  if(!hasAdminPermission(admin,"schedule")&&!hasAdminPermission(admin,"practitioners"))return Response.json({error:"Scheduling permission required."},{status:403});
  const{id}=await params;
  const body=await request.json() as PractitionerPayload;

  const current=(await getPractitionerDirectory(false,true)).find(x=>x.id===id);
  if(!current)return Response.json({error:"Practitioner not found."},{status:404});

  const patch:PractitionerProfilePatch={};
  for(const field of PROFILE_FIELDS){
    const value=body[field];
    if(value===undefined)continue;
    const stored=(current as Record<string,unknown>)[field]??(field==="photoUrl"?"":undefined);
    if(value!==stored)(patch as Record<string,unknown>)[field]=value;
  }
  if(Object.keys(patch).length&&!hasAdminPermission(admin,"practitioners")){
    return Response.json({error:"Practitioners permission required to edit a practitioner's profile, rate or verification."},{status:403});
  }
  if(typeof body.online==="boolean"&&body.online!==current.online)patch.online=body.online;
  if(patch.bio!==undefined&&patch.bio.trim().length<10)return Response.json({error:"Name, valid email, and biography are required."},{status:400});

  try {
    const updated=await updatePractitionerAdmin(id,patch);
    await recordAudit(admin,"practitioner.updated","practitioner",id,{name:updated.name,active:updated.active,verified:updated.verified,fields:Object.keys(patch)});
  } catch (error) {
    if (error instanceof PractitionerAdminError) return Response.json({error:error.message},{status:error.message.includes("another practitioner")?409:400});
    throw error;
  }
  const all=await getPractitionerDirectory(false,true);
  return Response.json(all.find(x=>x.id===id));
}

export async function DELETE(_:Request,{params}:{params:Promise<{id:string}>}){
  const admin=await getCurrentAdmin();
  if(!admin)return Response.json({error:"Administrator access required."},{status:401});
  if(!hasAdminPermission(admin,"practitioners"))return Response.json({error:"Practitioners permission required to remove a practitioner."},{status:403});
  const{id}=await params;
  try {
    await deletePractitionerAdmin(id);
  } catch (error) {
    if (error instanceof PractitionerAdminError) return Response.json({error:error.message},{status:error.message==="Practitioner not found."?404:409});
    throw error;
  }
  await recordAudit(admin,"practitioner.deleted","practitioner",id,{});
  return Response.json({ok:true,id});
}
