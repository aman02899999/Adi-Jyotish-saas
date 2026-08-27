import { attachRazorpayOrder, AI_FACE_READING_PRICE, AI_READING_CURRENCY, createPendingFaceReading, reserveReadingId, uploadFaceImage } from "@/lib/ai-readings";
import { isStorageConfigured } from "@/lib/firestore";
import { getCurrentMember } from "@/lib/member-auth";
import { memberBypassesPayment } from "@/lib/payment-bypass";
import { getRazorpay, getRazorpayKeyId } from "@/lib/razorpay";
import { checkRateLimit, rateLimitResponse, requestIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const MAX_IMAGES = 5;

function readImageFile(file: FormDataEntryValue | null): { buffer: Promise<Buffer>; mimeType: string } | { error: string } {
  if (!(file instanceof File)) return { error: "Please upload a clear photo of your face." };
  if (!ALLOWED_MIME_TYPES.has(file.type)) return { error: "Your photos must be JPEG, PNG, or WebP." };
  if (file.size > MAX_IMAGE_BYTES) return { error: "Each photo must be under 6MB." };
  return { buffer: file.arrayBuffer().then(Buffer.from), mimeType: file.type };
}

export async function POST(request: Request) {
  const member = await getCurrentMember();
  if (!member) return Response.json({ error: "Member sign-in required." }, { status: 401 });

  const throttle = await checkRateLimit("ai-face-reading-create", `member:${member.id}:ip:${requestIp(request)}`, 5, 600);
  if (!throttle.allowed) return rateLimitResponse(throttle.retryAfter);

  // Without a Storage bucket there is nowhere to put the face photographs, and the Admin SDK would
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

  const question = String(form.get("question") ?? "").trim().slice(0, 600);

  const files = form.getAll("faceImages");
  if (files.length === 0) return Response.json({ error: "Please upload at least one photo of your face." }, { status: 400 });
  if (files.length > MAX_IMAGES) return Response.json({ error: `Please upload at most ${MAX_IMAGES} photos.` }, { status: 400 });

  const images: { buffer: Promise<Buffer>; mimeType: string }[] = [];
  for (const file of files) {
    const image = readImageFile(file);
    if ("error" in image) return Response.json({ error: image.error }, { status: 400 });
    images.push(image);
  }

  const readingId = reserveReadingId();
  const faceImagePaths = await Promise.all(images.map(async (image, index) =>
    uploadFaceImage({ memberId: member.id, readingId, index, buffer: await image.buffer, mimeType: image.mimeType }),
  ));

  const reading = await createPendingFaceReading({ readingId, memberId: member.id, clientName, faceImagePaths, question });

  // Card payment is optional: with no Razorpay keys the reading is still created and can be paid
  // from the member's wallet, which is the only way this works on a deployment that has not
  // finished setting up online payments yet.
  // A QA bypass account never gets a card order, so it always settles through the
  // pay-from-wallet route — which recognises the bypass and charges nothing.
  const razorpay = memberBypassesPayment(member) ? null : getRazorpay();

  let order = null;
  if (razorpay) {
    order = await razorpay.orders.create({
      amount: AI_FACE_READING_PRICE * 100,
      currency: AI_READING_CURRENCY,
      receipt: `face-reading-${reading.id}-${Date.now()}`,
      notes: { memberId: String(member.id), readingId: String(reading.id) },
    });
    await attachRazorpayOrder(reading.id, order.id);
  }

  return Response.json({ readingId: reading.id, price: reading.price, currency: reading.currency, orderId: order?.id ?? null, amount: order?.amount ?? null, key: order ? getRazorpayKeyId() : null });
}
