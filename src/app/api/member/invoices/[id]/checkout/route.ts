import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firestore";
import { invoiceFromSnap } from "@/lib/billing";
import { getCurrentMember } from "@/lib/member-auth";
import { getRazorpay, getRazorpayKeyId } from "@/lib/razorpay";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const member = await getCurrentMember();
  if (!member) return Response.json({ error: "Member sign-in required." }, { status: 401 });
  const { id } = await params;

  const snap = await db.collection("invoices").doc(id).get();
  if (!snap.exists) return Response.json({ error: "Invoice not found." }, { status: 404 });
  const invoice = invoiceFromSnap(snap);
  if (invoice.memberId !== member.id && invoice.customerEmail !== member.email) {
    return Response.json({ error: "Invoice not found." }, { status: 404 });
  }
  if (invoice.status === "paid") return Response.json({ error: "This invoice is already paid." }, { status: 409 });
  if (["refunded", "void"].includes(invoice.status)) return Response.json({ error: "This invoice cannot be paid." }, { status: 409 });

  const bookingSnap = await db.collection("bookings").doc(invoice.bookingId).get();
  const booking = bookingSnap.exists ? { id: bookingSnap.id, ...(bookingSnap.data() as { status: string }) } : null;
  if (!booking || booking.status === "cancelled") return Response.json({ error: "Cancelled consultations cannot be paid online." }, { status: 409 });

  const razorpay = getRazorpay();
  if (!razorpay) return Response.json({ error: "Online payments are not configured. You can still pay through the studio." }, { status: 503 });

  const order = await razorpay.orders.create({
    amount: Math.round(invoice.amount * 100),
    currency: invoice.currency,
    receipt: invoice.number,
    notes: {
      invoiceId: invoice.id,
      bookingId: booking.id,
    },
  });
  await db.collection("payments").add({
    invoiceId: invoice.id,
    bookingId: booking.id,
    amount: invoice.amount,
    currency: invoice.currency,
    provider: "razorpay",
    status: "pending",
    providerSessionId: order.id,
    paymentIntentId: null,
    refundId: null,
    paidAt: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return Response.json({
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    key: getRazorpayKeyId(),
  });
}
