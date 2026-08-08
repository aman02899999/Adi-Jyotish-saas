import { attachRazorpayOrder, AI_FACE_READING_PRICE, AI_READING_CURRENCY, createPendingFaceReading, reserveReadingId, uploadFaceImage } from "@/lib/ai-readings";
import { getCurrentMember } from "@/lib/member-auth";
import { getRazorpay, getRazorpayKeyId } from "@/lib/razorpay";
import { checkRateLimit, rateLimitResponse, requestIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

async function readImageField(form: FormData, field: string): Promise<{ buffer: Buffer; mimeType: string } | { error: string }> {
  const file = form.get(field);
  if (!(file instanceof File)) return { error: "Please upload a clear photo of your face." };
  if (!ALLOWED_MIME_TYPES.has(file.type)) return { error: "Your photo must be JPEG, PNG, or WebP." };
  if (file.size > MAX_IMAGE_BYTES) return { error: "Your photo must be under 6MB." };
  const buffer = Buffer.from(await file.arrayBuffer());
  return { buffer, mimeType: file.type };
}

export async function POST(request: Request) {
  const member = await getCurrentMember();
  if (!member) return Response.json({ error: "Member sign-in required." }, { status: 401 });

  const throttle = await checkRateLimit("ai-face-reading-create", `member:${member.id}:ip:${requestIp(request)}`, 5, 600);
  if (!throttle.allowed) return rateLimitResponse(throttle.retryAfter);

  const razorpay = getRazorpay();
  if (!razorpay) return Response.json({ error: "Online payments are not configured." }, { status: 503 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Your upload could not be read. Please try again." }, { status: 400 });
  }

  const clientName = String(form.get("clientName") ?? "").trim().slice(0, 120);
  if (!clientName) return Response.json({ error: "Please share your name." }, { status: 400 });

  const image = await readImageField(form, "faceImage");
  if ("error" in image) return Response.json({ error: image.error }, { status: 400 });

  const readingId = reserveReadingId();
  const faceImagePath = await uploadFaceImage({ memberId: member.id, readingId, buffer: image.buffer, mimeType: image.mimeType });

  const reading = await createPendingFaceReading({ readingId, memberId: member.id, clientName, faceImagePath });

  const order = await razorpay.orders.create({
    amount: AI_FACE_READING_PRICE * 100,
    currency: AI_READING_CURRENCY,
    receipt: `face-reading-${reading.id}-${Date.now()}`,
    notes: { memberId: String(member.id), readingId: String(reading.id) },
  });
  await attachRazorpayOrder(reading.id, order.id);

  return Response.json({ readingId: reading.id, orderId: order.id, amount: order.amount, currency: order.currency, key: getRazorpayKeyId() });
}
