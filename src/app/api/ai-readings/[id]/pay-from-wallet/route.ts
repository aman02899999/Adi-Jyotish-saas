import { getReadingById } from "@/lib/ai-readings";
import { getCurrentMember } from "@/lib/member-auth";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { settleReadingFromWallet } from "@/lib/reading-checkout";

export const dynamic = "force-dynamic";

/**
 * Pays for an already-created reading out of the member's wallet — the wallet counterpart to the
 * Razorpay `verify` route next door, and the single place every paid feature settles from balance.
 *
 * It deliberately acts on an *existing* reading rather than creating and charging in one shot,
 * because that is the shape every reading flow already has: the tarot spread is drawn and shown
 * before payment, palm and face photos are uploaded first, and the Kundli and Varshphal forms
 * collect birth details up front. Settling afterwards means none of that work is repeated when a
 * member tops up and tries again — and it keeps one code path instead of one per flow.
 *
 * Ownership is enforced by fetching the reading scoped to the signed-in member, and the debit
 * itself is idempotent on the reading id, so a double-submit cannot charge twice.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const member = await getCurrentMember();
  if (!member) return Response.json({ error: "Member sign-in required." }, { status: 401 });

  const throttle = await checkRateLimit("wallet-reading-pay", `member:${member.id}`, 20, 600);
  if (!throttle.allowed) return rateLimitResponse(throttle.retryAfter);

  const reading = await getReadingById(id, member.id);
  if (!reading) return Response.json({ error: "Reading not found." }, { status: 404 });

  return settleReadingFromWallet(member, reading);
}
