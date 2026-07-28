import { eq } from "drizzle-orm";
import { db } from "@/db";
import { adminInvites } from "@/db/schema";
import { getCurrentAdmin, hasAdminPermission, recordAudit } from "@/lib/admin-auth";

export async function DELETE(_:Request,{params}:{params:Promise<{id:string}>}){const admin=await getCurrentAdmin();if(!admin)return Response.json({error:"Administrator access required."},{status:401});if(!hasAdminPermission(admin,"team"))return Response.json({error:"Owner access required."},{status:403});const{id:raw}=await params;const id=Number(raw);if(!Number.isInteger(id)||id<1)return Response.json({error:"Invalid invitation id."},{status:400});const [deleted]=await db.delete(adminInvites).where(eq(adminInvites.id,id)).returning({id:adminInvites.id,email:adminInvites.email});if(!deleted)return Response.json({error:"Invitation not found."},{status:404});await recordAudit(admin,"team.invite_cancelled","administrator_invite",id,{email:deleted.email});return Response.json({ok:true,id});}
