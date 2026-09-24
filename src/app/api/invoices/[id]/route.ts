import { getCurrentAdmin, hasAdminPermission, recordAudit } from "@/lib/admin-auth";
import { sendBookingNotification } from "@/lib/messaging";
import {
  InvoiceConflictError,
  InvoiceNotFoundError,
  changeInvoiceOpenState,
  getInvoiceById,
  getInvoiceDetail,
  markInvoicePaid,
  refundInvoice,
} from "@/lib/invoice-actions";

export const dynamic = "force-dynamic";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "billing")) return Response.json({ error: "Billing permission required." }, { status: 403 });
  const { id } = await params;
  const body = await request.json() as { action?: string };
  if (!["mark_paid", "refund", "void", "reopen"].includes(body.action ?? "")) return Response.json({ error: "Unknown invoice action." }, { status: 400 });

  try {
    if (body.action === "mark_paid") await markInvoicePaid(id);
    if (body.action === "void") await changeInvoiceOpenState(id, "open", "void");
    if (body.action === "reopen") await changeInvoiceOpenState(id, "void", "open");
    if (body.action === "refund") await refundInvoice(id);
  } catch (error) {
    if (error instanceof InvoiceNotFoundError) return Response.json({ error: error.message }, { status: 404 });
    if (error instanceof InvoiceConflictError) return Response.json({ error: error.message }, { status: 409 });
    console.error("Invoice action failed", error instanceof Error ? error.message : "unknown error");
    return Response.json({ error: "Invoice action could not be completed." }, { status: 500 });
  }

  const detail = await getInvoiceDetail(id);
  if (!detail) {
    // getInvoiceDetail returns null for a missing invoice and for an invoice whose
    // booking is gone; the two used to produce different messages, so work out
    // which one happened. This only runs on the error path.
    const invoiceStillThere = await getInvoiceById(id);
    return Response.json({ error: invoiceStillThere ? "Booking not found." : "Invoice not found." }, { status: 404 });
  }
  const { invoice, booking, payments: paymentRows } = detail;

  if (body.action === "mark_paid") {
    await sendBookingNotification({ memberEmail: invoice.customerEmail, bookingId: booking && invoice.bookingId, subject: `${invoice.description} · ${booking.reference}`, body: `Payment received for invoice ${invoice.number}. Amount: ${invoice.currency} ${invoice.amount}. Thank you—your receipt is now available in Billing.` });
    await recordAudit(admin, "invoice.marked_paid", "invoice", invoice.number, { amount: invoice.amount, currency: invoice.currency, provider: "manual" });
  } else if (body.action === "refund") {
    const payment = paymentRows[0];
    await sendBookingNotification({ memberEmail: invoice.customerEmail, bookingId: invoice.bookingId, subject: `${invoice.description} · ${booking.reference}`, body: invoice.status === "refunded" ? `Invoice ${invoice.number} has been refunded in full. Your payment provider may take several days to display the funds.` : `A refund for invoice ${invoice.number} is being processed.` });
    await recordAudit(admin, "invoice.refunded", "invoice", invoice.number, { provider: payment?.provider, refundId: payment?.refundId, status: invoice.status });
  } else {
    await recordAudit(admin, body.action === "void" ? "invoice.voided" : "invoice.reopened", "invoice", invoice.number);
  }

  return Response.json({ ...invoice, bookingReference: booking.reference, scheduledAt: booking.scheduledAt, bookingStatus: booking.status, practitionerName: booking.practitionerName, payments: paymentRows });
}
