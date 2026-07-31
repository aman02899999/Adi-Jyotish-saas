import { db } from "@/lib/firestore";
import { getCurrentAdmin, hasAdminPermission, recordAudit } from "@/lib/admin-auth";
import { PayoutError, updatePayoutStatus } from "@/lib/practitioner-portal";
import { createNotification } from "@/lib/notifications";
import { sendEmail, genericNotificationEmailHtml } from "@/lib/email";
import { getSiteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "billing")) return Response.json({ error: "Billing permission required." }, { status: 403 });

  const id = (await params).id;
  if (!id) return Response.json({ error: "Invalid payout id." }, { status: 400 });

  const body = (await request.json()) as { status?: "approved" | "paid" | "rejected"; adminNotes?: string; transactionRef?: string };
  if (!body.status || !["approved", "paid", "rejected"].includes(body.status)) {
    return Response.json({ error: "Invalid status." }, { status: 400 });
  }

  try {
    const updated = await updatePayoutStatus(id, body.status, admin.id, body.adminNotes, body.transactionRef);
    await recordAudit(admin, "practitioner_payout.updated", "practitioner_payout", id, { status: body.status });
    await createNotification({
      recipientType: "practitioner",
      recipientId: updated.practitionerId,
      type: "payout.status",
      title: `Payout ${body.status}`,
      body: `Your ₹${updated.amount} payout request is now ${body.status}.`,
      link: "/practitioner/earnings",
    }).catch(() => {});

    const practitionerSnap = await db.collection("practitioners").doc(updated.practitionerId).get();
    const practitioner = practitionerSnap.exists ? (practitionerSnap.data() as { name: string; email: string }) : null;
    if (practitioner) {
      const statusCopy = body.status === "paid" ? `has been paid${updated.transactionRef ? ` (ref: ${updated.transactionRef})` : ""}.` : body.status === "approved" ? "was approved and will be paid soon." : "was rejected.";
      await sendEmail({
        to: practitioner.email,
        subject: `Payout ${body.status} · ₹${updated.amount}`,
        html: genericNotificationEmailHtml({
          title: `Payout ${body.status}`,
          name: practitioner.name,
          body: `Your ₹${updated.amount} payout request ${statusCopy}`,
          ctaLabel: "View earnings",
          ctaUrl: new URL("/practitioner/earnings", getSiteUrl()).toString(),
        }),
      }).catch(() => {});
    }

    return Response.json(updated);
  } catch (error) {
    return Response.json({ error: error instanceof PayoutError ? error.message : "Payout could not be updated." }, { status: 400 });
  }
}
