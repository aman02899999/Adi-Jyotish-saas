import { createHash, randomBytes } from "node:crypto";
import { and, asc, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { adminInvites, adminUsers } from "@/db/schema";
import { getCurrentAdmin, hasAdminPermission, normalizeEmail, recordAudit } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
const roles = ["manager", "support", "analyst"];

export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "team")) return Response.json({ error: "Owner access required." }, { status: 403 });
  const [users, invites] = await Promise.all([
    db.select({ id:adminUsers.id,name:adminUsers.name,email:adminUsers.email,role:adminUsers.role,active:adminUsers.active,lastLoginAt:adminUsers.lastLoginAt,createdAt:adminUsers.createdAt }).from(adminUsers).orderBy(asc(adminUsers.name)),
    db.select({ id:adminInvites.id,email:adminInvites.email,role:adminInvites.role,expiresAt:adminInvites.expiresAt,createdAt:adminInvites.createdAt }).from(adminInvites).where(and(isNull(adminInvites.acceptedAt),gt(adminInvites.expiresAt,new Date()))).orderBy(asc(adminInvites.createdAt)),
  ]);
  return Response.json({ users, invites });
}

export async function POST(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "team")) return Response.json({ error: "Owner access required." }, { status: 403 });
  const body = await request.json() as { email?: string; role?: string };
  const email = normalizeEmail(body.email ?? "");
  const role = roles.includes(body.role ?? "") ? body.role! : "support";
  if (!/^\S+@\S+\.\S+$/.test(email)) return Response.json({ error: "Enter a valid team email." }, { status: 400 });
  const [existing] = await db.select({id:adminUsers.id}).from(adminUsers).where(eq(adminUsers.email,email)).limit(1);
  if (existing) return Response.json({ error: "This person already has an administrator account." }, { status: 409 });
  await db.delete(adminInvites).where(eq(adminInvites.email,email));
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now()+7*24*60*60*1000);
  const [invite] = await db.insert(adminInvites).values({email,role,tokenHash,invitedBy:admin.id,expiresAt}).returning({id:adminInvites.id,email:adminInvites.email,role:adminInvites.role,expiresAt:adminInvites.expiresAt,createdAt:adminInvites.createdAt});
  await recordAudit(admin,"team.invited","administrator_invite",invite.id,{email,role});
  return Response.json({...invite,invitePath:`/admin/invite/${token}`},{status:201});
}
