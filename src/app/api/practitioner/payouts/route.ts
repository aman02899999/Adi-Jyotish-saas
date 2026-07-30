import { getCurrentPractitioner } from "@/lib/practitioner-auth";
import { getPractitionerPayouts, PayoutError, requestPayout } from "@/lib/practitioner-portal";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { getAdminIdsWithPermission } from "@/lib/admin-roles";
import { notifyAdmins } from "@/lib/notifications";

export const dynamic = "force-dynamic";

export async function GET() {
  const practitioner = await getCurrentPractitioner();
  if (!practitioner) return Response.json({ error: "Practitioner sign-in required." }, { status: 401 });
  return Response.json(await getPractitionerPayouts(practitioner.id));
}

export async function POST(request: Request) {
  const practitioner = await getCurrentPractitioner();
  if (!practitioner) return Response.json({ error: "Practitioner sign-in required." }, { status: 401 });

  const throttle = await checkRateLimit("payout-request", `practitioner:${practitioner.id}`, 5, 3600);
  if (!throttle.allowed) return rateLimitResponse(throttle.retryAfter);

  const body = (await request.json()) as { amount?: number; notes?: string };
  try {
    const payout = await requestPayout(practitioner.id, Math.round(Number(body.amount)), body.notes);
    const adminIds = await getAdminIdsWithPermission("billing");
    await notifyAdmins(adminIds, {
      type: "payout.requested",
      title: `Payout request from ${practitioner.name}`,
      body: `₹${payout.amount} requested.`,
      link: "/admin/billing",
    }).catch(() => {});
    return Response.json(payout, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof PayoutError ? error.message : "Payout could not be requested." }, { status: 400 });
  }
}
