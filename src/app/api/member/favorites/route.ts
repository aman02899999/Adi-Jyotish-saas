import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { favoritePractitioners, practitioners } from "@/db/schema";
import { getCurrentMember } from "@/lib/member-auth";
import { getFavoritePractitionerIds } from "@/lib/marketplace";

export async function GET(){const member=await getCurrentMember();if(!member)return Response.json({error:"Member sign-in required."},{status:401});return Response.json({practitionerIds:await getFavoritePractitionerIds(member.id)});}
export async function POST(request:Request){const member=await getCurrentMember();if(!member)return Response.json({error:"Member sign-in required."},{status:401});const body=await request.json() as {practitionerId?:number};const practitionerId=Number(body.practitionerId);if(!Number.isInteger(practitionerId)||practitionerId<1)return Response.json({error:"Invalid practitioner."},{status:400});const[person]=await db.select({id:practitioners.id}).from(practitioners).where(and(eq(practitioners.id,practitionerId),eq(practitioners.active,true))).limit(1);if(!person)return Response.json({error:"Practitioner not found."},{status:404});const[existing]=await db.select().from(favoritePractitioners).where(and(eq(favoritePractitioners.memberId,member.id),eq(favoritePractitioners.practitionerId,practitionerId))).limit(1);if(existing){await db.delete(favoritePractitioners).where(eq(favoritePractitioners.id,existing.id));return Response.json({favorited:false});}await db.insert(favoritePractitioners).values({memberId:member.id,practitionerId});return Response.json({favorited:true});}
