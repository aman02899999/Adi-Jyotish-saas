import { getCurrentMember } from "@/lib/member-auth";
import { getOrCreateWallet } from "@/lib/wallet";

export const dynamic = "force-dynamic";

/**
 * The member's own wallet balance, for any client that needs to decide whether to offer "pay from
 * wallet" before the member commits to a purchase. Reading a balance is cheap and the wallet is
 * created on first read, so a member who has never recharged gets a well-formed zero rather than
 * a 404 the caller has to special-case.
 */
export async function GET() {
  const member = await getCurrentMember();
  if (!member) return Response.json({ error: "Member sign-in required." }, { status: 401 });

  const wallet = await getOrCreateWallet(member.id);
  return Response.json({ balance: wallet.balance, currency: wallet.currency });
}
