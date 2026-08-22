import { getReadingById } from "@/lib/ai-readings";
import { getCurrentMember } from "@/lib/member-auth";
import { buildKundliChart, KundliEngineError } from "@/lib/kundli-engine";
import { generateKundliPdf } from "@/lib/kundli-pdf";
import { getStudioSettings } from "@/lib/studio-settings";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const member = await getCurrentMember();
  if (!member) return Response.json({ error: "Please sign in first." }, { status: 401 });

  const { id } = await params;
  const reading = await getReadingById(id, member.id);
  if (!reading) return Response.json({ error: "Reading not found." }, { status: 404 });
  if (reading.readingType !== "kundli") return Response.json({ error: "A PDF report is only available for full Kundli reports." }, { status: 400 });
  if (reading.status !== "answered" || !reading.answer) return Response.json({ error: "This report isn't ready yet." }, { status: 409 });

  try {
    const chart = buildKundliChart({ name: reading.clientName, birthDate: reading.birthDate, birthTime: reading.birthTime, birthPlace: reading.birthPlace });
    const settings = await getStudioSettings();
    const pdfBytes = await generateKundliPdf(chart, {
      reportId: `KUN-${id.slice(0, 8).toUpperCase()}`,
      generatedAt: new Date(),
      studioName: settings.studioName,
      supportEmail: settings.supportEmail,
      attribution: { type: "ai", personaName: "Shree Santram Shashtri" },
    });
    return new Response(Buffer.from(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Kundli-${chart.name.replace(/\s+/g, "-")}.pdf"`,
      },
    });
  } catch (error) {
    if (error instanceof KundliEngineError) return Response.json({ error: error.message }, { status: 400 });
    return Response.json({ error: "The Kundli PDF could not be generated." }, { status: 502 });
  }
}
