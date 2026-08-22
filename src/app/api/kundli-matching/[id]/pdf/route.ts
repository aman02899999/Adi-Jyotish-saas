import { getKundliMatchById } from "@/lib/kundli-matching";
import { getCurrentMember } from "@/lib/member-auth";
import { generateMatchingPdf } from "@/lib/matching-pdf";
import { getStudioSettings } from "@/lib/studio-settings";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const member = await getCurrentMember();
  if (!member) return Response.json({ error: "Please sign in first." }, { status: 401 });

  const { id } = await params;
  const match = await getKundliMatchById(id, member.id);
  if (!match) return Response.json({ error: "Match not found." }, { status: 404 });

  const settings = await getStudioSettings();
  const pdfBytes = await generateMatchingPdf(
    match.record,
    match.result,
    { moonARashi: match.moonARashi, moonANakshatra: match.moonANakshatra, moonBRashi: match.moonBRashi, moonBNakshatra: match.moonBNakshatra },
    {
      reportId: `MAT-${id.slice(0, 8).toUpperCase()}`,
      generatedAt: new Date(),
      studioName: settings.studioName,
      supportEmail: settings.supportEmail,
      attribution: { type: "ai", personaName: "Adi Jyotish Guru" },
    },
  );
  return new Response(Buffer.from(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Compatibility-${match.record.nameA.replace(/\s+/g, "-")}-${match.record.nameB.replace(/\s+/g, "-")}.pdf"`,
    },
  });
}
