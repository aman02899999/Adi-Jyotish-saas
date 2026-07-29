import { generateReadingAnswer, getReadingById, markReadingPaid } from "@/lib/ai-readings";
import { getCurrentMember } from "@/lib/member-auth";
import { getRazorpay, verifyRazorpayPaymentSignature } from "@/lib/razorpay";

export const dynamic = "force-dynamic";
function parseId(value: string) { const id = Number(value); return Number.isInteger(id) && id > 0 ? id : null; }

type VerifyPayload = {
  razorpay_order_id?: string;
  razorpay_payment_id?: string;
  razorpay_signature?: string;
};

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const id = parseId(raw);
  if (!id) return Response.json({ error: "Invalid reading id." }, { status: 400 });

  const member = await getCurrentMember();
  if (!member) return Response.json({ error: "Member sign-in required." }, { status: 401 });

  const razorpay = getRazorpay();
  if (!razorpay) return Response.json({ error: "Online payments are not configured." }, { status: 503 });

  const reading = await getReadingById(id, member.id);
  if (!reading) return Response.json({ error: "Reading not found." }, { status: 404 });

  const body = (await request.json()) as VerifyPayload;
  const orderId = body.razorpay_order_id?.trim();
  const paymentId = body.razorpay_payment_id?.trim();
  const signature = body.razorpay_signature?.trim();
  if (!orderId || !paymentId || !signature) return Response.json({ error: "Payment confirmation was incomplete." }, { status: 400 });
  if (orderId !== reading.razorpayOrderId) return Response.json({ error: "This payment does not match this reading." }, { status: 400 });
  if (!verifyRazorpayPaymentSignature(orderId, paymentId, signature)) return Response.json({ error: "Payment signature could not be verified." }, { status: 400 });

  const order = await razorpay.orders.fetch(orderId);
  if (order.notes?.memberId !== String(member.id)) return Response.json({ error: "This payment does not belong to your account." }, { status: 403 });
  if (order.status !== "paid") return Response.json({ error: "Payment has not been confirmed by Razorpay yet." }, { status: 409 });

  const paid = await markReadingPaid({ readingId: id, razorpayPaymentId: paymentId });
  if (!paid) return Response.json({ error: "Reading not found." }, { status: 404 });

  try {
    const answered = await generateReadingAnswer(paid);
    return Response.json({ ok: true, status: answered.status, answer: answered.answer });
  } catch {
    return Response.json({ ok: true, status: "paid", answer: null, message: "Your payment is confirmed. Shree Santram Shashtri is still preparing your reading — check back in a moment or refresh." });
  }
}
