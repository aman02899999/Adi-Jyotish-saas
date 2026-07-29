import { generateReadingAnswer, getReadingById } from "@/lib/ai-readings";
import { getCurrentMember } from "@/lib/member-auth";

export const dynamic = "force-dynamic";
function parseId(value: string) { const id = Number(value); return Number.isInteger(id) && id > 0 ? id : null; }

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const id = parseId(raw);
  if (!id) return Response.json({ error: "Invalid reading id." }, { status: 400 });

  const member = await getCurrentMember();
  if (!member) return Response.json({ error: "Member sign-in required." }, { status: 401 });

  const reading = await getReadingById(id, member.id);
  if (!reading) return Response.json({ error: "Reading not found." }, { status: 404 });
  if (reading.status === "pending_payment") return Response.json({ error: "This reading has not been paid for yet." }, { status: 409 });

  try {
    const answered = await generateReadingAnswer(reading);
    return Response.json({ ok: true, status: answered.status, answer: answered.answer });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "The reading could not be generated. Please try again." }, { status: 502 });
  }
}
