import { getBookingKundliSummary, KundliSummaryError } from "@/lib/practitioner-portal";
import { getCurrentPractitioner } from "@/lib/practitioner-auth";

export const dynamic = "force-dynamic";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const practitioner = await getCurrentPractitioner();
  if (!practitioner) return Response.json({ error: "Practitioner sign-in required." }, { status: 401 });

  const { id } = await params;

  try {
    const booking = await getBookingKundliSummary(id, practitioner.id);
    return Response.json({ kundliSummary: booking.kundliSummary, kundliGeneratedAt: booking.kundliGeneratedAt });
  } catch (error) {
    if (error instanceof KundliSummaryError) return Response.json({ error: error.message }, { status: 400 });
    return Response.json({ error: "The Kundli summary could not be generated. Please try again." }, { status: 502 });
  }
}
