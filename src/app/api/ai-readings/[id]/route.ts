import { getReadingById } from "@/lib/ai-readings";
import { getCurrentMember } from "@/lib/member-auth";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const member = await getCurrentMember();
  if (!member) return Response.json({ error: "Member sign-in required." }, { status: 401 });

  const reading = await getReadingById(id, member.id);
  if (!reading) return Response.json({ error: "Reading not found." }, { status: 404 });
  return Response.json({ reading });
}
