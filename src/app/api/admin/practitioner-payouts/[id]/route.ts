import { getCurrentAdmin, hasAdminPermission, recordAudit } from "@/lib/admin-auth";
import { PayoutError, updatePayoutStatus } from "@/lib/practitioner-portal";
import { createNotification } from "@/lib/notifications";

export const dynamic = "force-dynamic";

function parseId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "billing")) return Response.json({ error: "Billing permission required." }, { status: 403 });

  const id = parseId((await params).id);
  if (!id) return Response.json({ error: "Invalid payout id." }, { status: 400 });

  const body = (await request.json()) as { status?: "approved" | "paid" | "rejected"; adminNotes?: string };
  if (!body.status || !["approved", "paid", "rejected"].includes(body.status)) {
    return Response.json({ error: "Invalid status." }, { status: 400 });
  }

  try {
    const updated = await updatePayoutStatus(id, body.status, admin.id, body.adminNotes);
    await recordAudit(admin, "practitioner_payout.updated", "practitioner_payout", id, { status: body.status });
    await createNotification({
      recipientType: "practitioner",
      recipientId: updated.practitionerId,
      type: "payout.status",
      title: `Payout ${body.status}`,
      body: `Your ₹${updated.amount} payout request is now ${body.status}.`,
      link: "/practitioner/earnings",
    }).catch(() => {});
    return Response.json(updated);
  } catch (error) {
    return Response.json({ error: error instanceof PayoutError ? error.message : "Payout could not be updated." }, { status: 400 });
  }
}
