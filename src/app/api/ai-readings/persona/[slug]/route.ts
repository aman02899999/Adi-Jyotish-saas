import { attachRazorpayOrder, AI_READING_CURRENCY, createFreeReading, createPendingPersonaReading, FreeReadingAlreadyUsedError, generateReadingAnswer, isEligibleForFreeReading } from "@/lib/ai-readings";
import { getPersonaBySlug } from "@/lib/ai-personas";
import { getCurrentMember } from "@/lib/member-auth";
import { getRazorpay, getRazorpayKeyId } from "@/lib/razorpay";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

type CreatePayload = {
  clientName?: string;
  question?: string;
};

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const member = await getCurrentMember();
  if (!member) return Response.json({ error: "Member sign-in required." }, { status: 401 });

  const throttle = await checkRateLimit("ai-persona-reading-create", `member:${member.id}`, 5, 600);
  if (!throttle.allowed) return rateLimitResponse(throttle.retryAfter);

  const persona = await getPersonaBySlug(slug);
  if (!persona || !persona.active) return Response.json({ error: "This reading is not available." }, { status: 404 });

  const body = (await request.json()) as CreatePayload;
  const clientName = body.clientName?.trim().slice(0, 120) ?? "";
  const question = body.question?.trim().slice(0, 800) ?? "";

  if (!clientName) return Response.json({ error: "Please share your name." }, { status: 400 });
  if (question.length < 8) return Response.json({ error: "Please write a fuller question (at least a sentence)." }, { status: 400 });

  // An always-free persona (price 0) never touches Razorpay or the member's one-time free-reading
  // credit at all — it's simply free, every time, for everyone. Checked first so a studio that
  // hasn't configured Razorpay yet can still run free personas.
  if (persona.price === 0) {
    const reading = await createPendingPersonaReading({
      memberId: member.id, clientName, question,
      personaId: persona.id, personaSlug: persona.slug, personaName: persona.name, price: 0,
    });
    const answered = await generateReadingAnswer(reading).catch(() => reading);
    return Response.json({ free: true, readingId: reading.id, status: answered.status, answer: answered.answer }, { status: 201 });
  }

  // A member's first free question-type reading (see /ask) is a shared allowance across every
  // text-based reading, paid personas included — not a separate free credit per persona.
  if (await isEligibleForFreeReading(member.id)) {
    try {
      const freeReading = await createFreeReading({
        memberId: member.id, clientName, birthDate: "", birthTime: "", birthPlace: "", question,
        persona: { id: persona.id, slug: persona.slug, name: persona.name },
      });
      try {
        const answered = await generateReadingAnswer(freeReading);
        return Response.json({ free: true, readingId: freeReading.id, status: answered.status, answer: answered.answer }, { status: 201 });
      } catch {
        return Response.json({ free: true, readingId: freeReading.id, status: "paid", answer: null }, { status: 201 });
      }
    } catch (error) {
      if (!(error instanceof FreeReadingAlreadyUsedError)) throw error;
    }
  }

  const razorpay = getRazorpay();
  if (!razorpay) return Response.json({ error: "Online payments are not configured." }, { status: 503 });

  const reading = await createPendingPersonaReading({
    memberId: member.id,
    clientName,
    question,
    personaId: persona.id,
    personaSlug: persona.slug,
    personaName: persona.name,
    price: persona.price,
  });

  const order = await razorpay.orders.create({
    amount: reading.price * 100,
    currency: AI_READING_CURRENCY,
    receipt: `persona-reading-${reading.id}-${Date.now()}`,
    notes: { memberId: String(member.id), readingId: String(reading.id) },
  });
  await attachRazorpayOrder(reading.id, order.id);

  return Response.json({ readingId: reading.id, orderId: order.id, amount: order.amount, currency: order.currency, key: getRazorpayKeyId() });
}
