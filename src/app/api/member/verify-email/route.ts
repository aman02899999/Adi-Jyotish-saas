import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { memberUsers } from "@/db/schema";
import { digestToken } from "@/lib/recovery-tokens";
import { getSiteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token")?.trim() ?? "";
  const redirectTo = (status: "verified" | "invalid") => Response.redirect(new URL(`/dashboard?email=${status}`, getSiteUrl()), 302);
  if (!token) return redirectTo("invalid");

  const [member] = await db.select({ id: memberUsers.id }).from(memberUsers)
    .where(and(eq(memberUsers.emailVerificationTokenHash, digestToken(token)), gt(memberUsers.emailVerificationExpiresAt, new Date())))
    .limit(1);
  if (!member) return redirectTo("invalid");

  await db.update(memberUsers).set({ emailVerified: true, emailVerificationTokenHash: null, emailVerificationExpiresAt: null }).where(eq(memberUsers.id, member.id));
  return redirectTo("verified");
}
