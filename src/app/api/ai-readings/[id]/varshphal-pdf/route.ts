import { getReadingById } from "@/lib/ai-readings";
import { getCurrentMember } from "@/lib/member-auth";
import { buildVarshphalChart, VarshphalError } from "@/lib/varshphal";
import { generateVarshphalPdf } from "@/lib/varshphal-pdf";
import { getStudioSettings } from "@/lib/studio-settings";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const member = await getCurrentMember();
  if (!member) return Response.json({ error: "Please sign in first." }, { status: 401 });

  const { id } = await params;
  const reading = await getReadingById(id, member.id);
  if (!reading) return Response.json({ error: "Reading not found." }, { status: 404 });
  if (reading.readingType !== "varshphal") return Response.json({ error: "A PDF report is only available for Varshphal reports." }, { status: 400 });
  if (reading.status !== "answered" || !reading.answer) return Response.json({ error: "This report isn't ready yet." }, { status: 409 });
  if (!reading.year) return Response.json({ error: "This reading is missing its target year." }, { status: 400 });

  try {
    const chart = buildVarshphalChart({ birthDate: reading.birthDate, birthTime: reading.birthTime, birthPlace: reading.birthPlace, year: reading.year });
    const settings = await getStudioSettings();
    const pdfBytes = await generateVarshphalPdf(chart, reading.clientName, {
      reportId: `VAR-${id.slice(0, 8).toUpperCase()}`,
      generatedAt: new Date(),
      studioName: settings.studioName,
      supportEmail: settings.supportEmail,
      attribution: { type: "ai", personaName: "Adi Jyotish Guru" },
    });
    return new Response(Buffer.from(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Varshphal-${reading.year}-${reading.clientName.replace(/\s+/g, "-")}.pdf"`,
      },
    });
  } catch (error) {
    if (error instanceof VarshphalError) return Response.json({ error: error.message }, { status: 400 });
    return Response.json({ error: "The Varshphal PDF could not be generated." }, { status: 502 });
  }
}
