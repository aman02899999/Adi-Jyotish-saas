import { and, eq, or } from "drizzle-orm";
import { db } from "@/db";
import { bookings, invoices, payments } from "@/db/schema";
import { getCurrentMember } from "@/lib/member-auth";
import { getStripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";
function parseId(value: string) { const id = Number(value); return Number.isInteger(id) && id > 0 ? id : null; }

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const member = await getCurrentMember();
  if (!member) return Response.json({ error: "Member sign-in required." }, { status: 401 });
  const { id: raw } = await params;
  const id = parseId(raw);
  if (!id) return Response.json({ error: "Invalid invoice id." }, { status: 400 });
  const [invoice] = await db.select().from(invoices).where(and(eq(invoices.id, id), or(eq(invoices.memberId, member.id), eq(invoices.customerEmail, member.email)))).limit(1);
  if (!invoice) return Response.json({ error: "Invoice not found." }, { status: 404 });
  if (invoice.status === "paid") return Response.json({ error: "This invoice is already paid." }, { status: 409 });
  if (["refunded", "void"].includes(invoice.status)) return Response.json({ error: "This invoice cannot be paid." }, { status: 409 });
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, invoice.bookingId)).limit(1);
  if (!booking || booking.status === "cancelled") return Response.json({ error: "Cancelled consultations cannot be paid online." }, { status: 409 });
  const stripe = getStripe();
  if (!stripe) return Response.json({ error: "Online payments are not configured. You can still pay through the studio." }, { status: 503 });

  const origin = new URL(request.url).origin;
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    success_url: `${origin}/dashboard/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/dashboard/billing?checkout=cancelled`,
    customer_email: member.email,
    client_reference_id: String(invoice.id),
    line_items: [{ quantity: 1, price_data: { currency: invoice.currency.toLowerCase(), unit_amount: invoice.amount * 100, product_data: { name: invoice.description, description: `Invoice ${invoice.number} · ${booking.reference}` } } }],
    metadata: { invoiceId: String(invoice.id), bookingId: String(booking.id), memberId: String(member.id), invoiceNumber: invoice.number },
    payment_intent_data: { metadata: { invoiceId: String(invoice.id), bookingId: String(booking.id) } },
  });
  if (!session.url) return Response.json({ error: "Checkout could not be started." }, { status: 502 });
  await db.insert(payments).values({ invoiceId: invoice.id, bookingId: booking.id, amount: invoice.amount, currency: invoice.currency, provider: "stripe", status: "pending", providerSessionId: session.id });
  return Response.json({ url: session.url });
}
