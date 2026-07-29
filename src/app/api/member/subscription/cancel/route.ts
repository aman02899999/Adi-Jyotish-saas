import { getCurrentMember } from "@/lib/member-auth";
import { cancelMemberSubscription } from "@/lib/subscriptions";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const member = await getCurrentMember();
  if (!member) return Response.json({ error: "Sign in required." }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { immediately?: boolean };
  try {
    await cancelMemberSubscription(member, Boolean(body.immediately));
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Membership could not be cancelled." }, { status: 400 });
  }
}
