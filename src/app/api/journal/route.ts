import { getCurrentMember } from "@/lib/member-auth";
import { computeMoodInsight, listJournalEntries, logJournalEntry, MOODS, type Mood } from "@/lib/astro-journal";

export const dynamic = "force-dynamic";

export async function GET() {
  const member = await getCurrentMember();
  if (!member) return Response.json({ error: "Please sign in." }, { status: 401 });

  const entries = await listJournalEntries(member.id);
  return Response.json({ entries, insight: computeMoodInsight(entries) });
}

export async function POST(request: Request) {
  const member = await getCurrentMember();
  if (!member) return Response.json({ error: "Please sign in." }, { status: 401 });

  const body = (await request.json()) as { mood?: string; note?: string };
  if (!body.mood || !MOODS.includes(body.mood as Mood)) {
    return Response.json({ error: "Please choose a valid mood." }, { status: 400 });
  }

  const entry = await logJournalEntry({ memberId: member.id, member, mood: body.mood as Mood, note: (body.note ?? "").trim() });
  const entries = await listJournalEntries(member.id);
  return Response.json({ entry, entries, insight: computeMoodInsight(entries) }, { status: 201 });
}
