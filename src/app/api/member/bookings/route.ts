import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { bookings } from "@/db/schema";
import { getCurrentMember } from "@/lib/member-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const member = await getCurrentMember();
  if (!member) return Response.json({ error: "Member sign-in required." }, { status: 401 });
  const rows = await db.select().from(bookings).where(eq(bookings.clientEmail, member.email)).orderBy(desc(bookings.scheduledAt));
  return Response.json(rows);
}
