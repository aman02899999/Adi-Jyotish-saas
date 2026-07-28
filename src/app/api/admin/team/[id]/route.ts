import { and, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { adminSessions, adminUsers } from "@/db/schema";
import { getCurrentAdmin, hasAdminPermission, recordAudit } from "@/lib/admin-auth";

export const dynamic="force-dynamic";
const roles=["owner","manager","support","analyst"];
function parseId(value:string){const id=Number(value);return Number.isInteger(id)&&id>0?id:null;}

async function ownerCount(){const [row]=await db.select({value:count()}).from(adminUsers).where(and(eq(adminUsers.role,"owner"),eq(adminUsers.active,true)));return Number(row?.value??0);}

export async function PUT(request:Request,{params}:{params:Promise<{id:string}>}){
  const admin=await getCurrentAdmin();if(!admin)return Response.json({error:"Administrator access required."},{status:401});if(!hasAdminPermission(admin,"team"))return Response.json({error:"Owner access required."},{status:403});
  const{id:raw}=await params;const id=parseId(raw);if(!id)return Response.json({error:"Invalid administrator id."},{status:400});const [existing]=await db.select().from(adminUsers).where(eq(adminUsers.id,id)).limit(1);if(!existing)return Response.json({error:"Administrator not found."},{status:404});
  const body=await request.json() as {role?:string;active?:boolean};const role=roles.includes(body.role??"")?body.role!:existing.role;const active=body.active??existing.active;
  if(id===admin.id&&!active)return Response.json({error:"You cannot deactivate your own account."},{status:409});
  if(existing.role==="owner"&&(role!=="owner"||!active)&&await ownerCount()<=1)return Response.json({error:"The workspace must retain at least one active owner."},{status:409});
  const [updated]=await db.update(adminUsers).set({role,active,updatedAt:new Date()}).where(eq(adminUsers.id,id)).returning({id:adminUsers.id,name:adminUsers.name,email:adminUsers.email,role:adminUsers.role,active:adminUsers.active,lastLoginAt:adminUsers.lastLoginAt,createdAt:adminUsers.createdAt});if(!active)await db.delete(adminSessions).where(eq(adminSessions.adminId,id));await recordAudit(admin,"team.updated","administrator",id,{role,active});return Response.json(updated);
}

export async function DELETE(_:Request,{params}:{params:Promise<{id:string}>}){
  const admin=await getCurrentAdmin();if(!admin)return Response.json({error:"Administrator access required."},{status:401});if(!hasAdminPermission(admin,"team"))return Response.json({error:"Owner access required."},{status:403});const{id:raw}=await params;const id=parseId(raw);if(!id)return Response.json({error:"Invalid administrator id."},{status:400});if(id===admin.id)return Response.json({error:"You cannot delete your own account."},{status:409});const [existing]=await db.select().from(adminUsers).where(eq(adminUsers.id,id)).limit(1);if(!existing)return Response.json({error:"Administrator not found."},{status:404});if(existing.role==="owner"&&existing.active&&await ownerCount()<=1)return Response.json({error:"The workspace must retain an active owner."},{status:409});await db.delete(adminUsers).where(eq(adminUsers.id,id));await recordAudit(admin,"team.deleted","administrator",id,{email:existing.email,role:existing.role});return Response.json({ok:true,id});
}
