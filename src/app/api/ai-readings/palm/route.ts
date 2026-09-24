import { attachRazorpayOrder, AI_PALM_READING_PRICE, AI_READING_CURRENCY, createPendingPalmReading, reserveReadingId, uploadPalmImage } from "@/lib/ai-readings";
import { isStorageConfigured } from "@/lib/firestore";
import { getCurrentMember } from "@/lib/member-auth";
import { memberBypassesPayment } from "@/lib/payment-bypass";
import { getRazorpay, getRazorpayKeyId } from "@/lib/razorpay";
import { checkRateLimit, rateLimitResponse, requestIp } from "@/lib/rate-limit";
import { PALM_MAX_EDGE, prepareReadingImage } from "@/lib/reading-image";

export const dynamic = "force-dynamic";

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

/** Downscaling happens here, before the photo is stored, rather than on the way out to Gemini.
 * A reading retries up to three times, so resizing at send time would redo the work on every
 * attempt — and the stored copy would stay full-size, paying for bytes nobody reads at that
 * resolution. Doing it once on the way in shrinks the Gemini bill, the Storage bill, and the
 * download on each retry together. */
async function readImageField(form: FormData, field: string): Promise<{ buffer: Buffer; mimeType: string } | { error: string }> {
  const file = form.get(field);
  if (!(file instanceof File)) return { error: `Please upload a clear photo of your ${field.includes("left") ? "left" : "right"} palm.` };
  if (!ALLOWED_MIME_TYPES.has(file.type)) return { error: "Palm photos must be JPEG, PNG, or WebP images." };
  if (file.size > MAX_IMAGE_BYTES) return { error: "Each palm photo must be under 6MB." };

  try {
    const prepared = await prepareReadingImage(Buffer.from(await file.arrayBuffer()), PALM_MAX_EDGE);
    return { buffer: Buffer.from(prepared.base64, "base64"), mimeType: prepared.mimeType };
  } catch {
    // A file can pass the mime-type check and still not decode — a renamed document, a truncated
    // upload. Better a clear message here than a decode failure much later, after payment.
    return { error: "That palm photo could not be read. Please try a different image." };
  }
}

export async function POST(request: Request) {
  const member = await getCurrentMember();
  if (!member) return Response.json({ error: "Member sign-in required." }, { status: 401 });

  const throttle = await checkRateLimit("ai-palm-reading-create", `member:${member.id}:ip:${requestIp(request)}`, 5, 600);
  if (!throttle.allowed) return rateLimitResponse(throttle.retryAfter);

  // Without a Storage bucket there is nowhere to put the palm photographs, and the Admin SDK would
  // otherwise throw a raw bucket error that reaches the member as an unexplained 500.
  if (!isStorageConfigured()) {
    return Response.json({ error: "Photo uploads are not configured on this site yet. Please try one of the other readings, or contact support." }, { status: 503 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Your upload could not be read. Please try again." }, { status: 400 });
  }

  const clientName = String(form.get("clientName") ?? "").trim().slice(0, 120);
  if (!clientName) return Response.json({ error: "Please share your name." }, { status: 400 });

  const [left, right] = await Promise.all([readImageField(form, "leftPalmImage"), readImageField(form, "rightPalmImage")]);
  if ("error" in left) return Response.json({ error: left.error }, { status: 400 });
  if ("error" in right) return Response.json({ error: right.error }, { status: 400 });

  const readingId = reserveReadingId();
  const [leftPalmImagePath, rightPalmImagePath] = await Promise.all([
    uploadPalmImage({ memberId: member.id, readingId, side: "left", buffer: left.buffer, mimeType: left.mimeType }),
    uploadPalmImage({ memberId: member.id, readingId, side: "right", buffer: right.buffer, mimeType: right.mimeType }),
  ]);

  const reading = await createPendingPalmReading({ readingId, memberId: member.id, clientName, leftPalmImagePath, rightPalmImagePath });

  // Card payment is optional: with no Razorpay keys the reading is still created and can be paid
  // from the member's wallet, which is the only way this works on a deployment that has not
  // finished setting up online payments yet.
  // A QA bypass account never gets a card order, so it always settles through the
  // pay-from-wallet route — which recognises the bypass and charges nothing.
  const razorpay = memberBypassesPayment(member) ? null : getRazorpay();

  let order = null;
  if (razorpay) {
    order = await razorpay.orders.create({
      amount: AI_PALM_READING_PRICE * 100,
      currency: AI_READING_CURRENCY,
      receipt: `palm-reading-${reading.id}-${Date.now()}`,
      notes: { memberId: String(member.id), readingId: String(reading.id) },
    });
    await attachRazorpayOrder(reading.id, order.id);
  }

  return Response.json({ readingId: reading.id, price: reading.price, currency: reading.currency, orderId: order?.id ?? null, amount: order?.amount ?? null, key: order ? getRazorpayKeyId() : null });
}
