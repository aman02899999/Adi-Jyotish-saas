import { getCurrentMember } from "@/lib/member-auth";
import { getPlanById } from "@/lib/plans";
import { startSubscriptionCheckout } from "@/lib/subscriptions";

export const dynamic = "force-dynamic";

type CheckoutPayload = { planId?: number; interval?: "monthly" | "yearly" };

export async function POST(request: Request) {
  const member = await getCurrentMember();
  if (!member) return Response.json({ error: "Sign in to choose a membership plan." }, { status: 401 });

  const body = (await request.json()) as CheckoutPayload;
  const planId = Number(body.planId);
  const interval = body.interval === "yearly" ? "yearly" : "monthly";
  if (!Number.isInteger(planId) || planId <= 0) return Response.json({ error: "Invalid plan." }, { status: 400 });

  const plan = await getPlanById(planId);
  if (!plan || !plan.active) return Response.json({ error: "This plan is no longer available." }, { status: 404 });

  try {
    const result = await startSubscriptionCheckout(member, plan, interval);
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Subscription could not be started." }, { status: 400 });
  }
}
