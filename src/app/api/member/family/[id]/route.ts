import { deleteFamilyMember } from "@/lib/family-members";
import { getCurrentMember } from "@/lib/member-auth";

export const dynamic = "force-dynamic";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const member = await getCurrentMember();
  if (!member) return Response.json({ error: "Member sign-in required." }, { status: 401 });

  const { id } = await params;
  await deleteFamilyMember(member.id, id);
  return Response.json({ ok: true });
}
