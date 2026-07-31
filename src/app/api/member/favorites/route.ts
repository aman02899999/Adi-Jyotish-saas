import { db } from "@/lib/firestore";
import { getCurrentMember } from "@/lib/member-auth";
import { getFavoritePractitionerIds } from "@/lib/marketplace";

export async function GET(){const member=await getCurrentMember();if(!member)return Response.json({error:"Member sign-in required."},{status:401});return Response.json({practitionerIds:await getFavoritePractitionerIds(member.id)});}

export async function POST(request:Request){
  const member=await getCurrentMember();
  if(!member)return Response.json({error:"Member sign-in required."},{status:401});
  const body=await request.json() as {practitionerId?:string};
  const practitionerId=body.practitionerId?.trim();
  if(!practitionerId)return Response.json({error:"Invalid practitioner."},{status:400});

  const practitionerSnap = await db.collection("practitioners").doc(practitionerId).get();
  if(!practitionerSnap.exists || practitionerSnap.data()?.active !== true) return Response.json({error:"Practitioner not found."},{status:404});

  const favRef = db.collection("members").doc(member.id).collection("favorites").doc(practitionerId);
  const existing = await favRef.get();
  if(existing.exists){
    await favRef.delete();
    return Response.json({favorited:false});
  }
  await favRef.set({ createdAt: new Date() });
  return Response.json({favorited:true});
}
