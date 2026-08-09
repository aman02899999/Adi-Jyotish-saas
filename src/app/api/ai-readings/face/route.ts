import { attachRazorpayOrder, AI_FACE_READING_PRICE, AI_READING_CURRENCY, createPendingFaceReading, reserveReadingId, uploadFaceImage } from "@/lib/ai-readings";
import { getCurrentMember } from "@/lib/member-auth";
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

  const order = await razorpay.orders.create({
    amount: AI_FACE_READING_PRICE * 100,
    currency: AI_READING_CURRENCY,
    receipt: `face-reading-${reading.id}-${Date.now()}`,
    notes: { memberId: String(member.id), readingId: String(reading.id) },
  });
  await attachRazorpayOrder(reading.id, order.id);

  return Response.json({ readingId: reading.id, orderId: order.id, amount: order.amount, currency: order.currency, key: getRazorpayKeyId() });
}
