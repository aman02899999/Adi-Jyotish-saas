import { getCurrentMember } from "@/lib/member-auth";
import { checkRateLimit, rateLimitResponse, requestIp } from "@/lib/rate-limit";
import { GiftCardError, redeemGiftCard } from "@/lib/gift-cards";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const member = await getCurrentMember();
  if (!member) return Response.json({ error: "Please sign in to claim this gift." }, { status: 401 });

  const ip = requestIp(request);
  const throttle = await checkRateLimit("gift-redeem", `ip:${ip}`, 20, 3600);
  if (!throttle.allowed) return rateLimitResponse(throttle.retryAfter);

  const body = (await request.json()) as { code?: string };
  const code = body.code?.trim();
  if (!code) return Response.json({ error: "Please enter a gift code." }, { status: 400 });

  try {
    const gift = await redeemGiftCard({ code, memberId: member.id });
    return Response.json({ ok: true, amount: gift.amount, currency: gift.currency });
  } catch (error) {
    if (error instanceof GiftCardError) return Response.json({ error: error.message }, { status: 400 });
    console.error("Gift redemption failed", error instanceof Error ? error.message : "unknown error");
    return Response.json({ error: "This gift could not be redeemed. Please try again shortly." }, { status: 502 });
  }
}
