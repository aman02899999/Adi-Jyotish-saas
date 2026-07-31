import { db } from "@/lib/firestore";
import { getCurrentMember } from "@/lib/member-auth";
import { bookingFromDoc } from "@/app/api/bookings/route";

export const dynamic = "force-dynamic";

export async function GET() {
  const member = await getCurrentMember();
  if (!member) return Response.json({ error: "Member sign-in required." }, { status: 401 });
  const snap = await db.collection("bookings").where("clientEmail", "==", member.email).orderBy("scheduledAt", "desc").get();
  return Response.json(snap.docs.map(bookingFromDoc));
}
