import { getBookingVarshphalChart, KundliSummaryError } from "@/lib/practitioner-portal";
import { getCurrentPractitioner } from "@/lib/practitioner-auth";
import { generateVarshphalPdf } from "@/lib/varshphal-pdf";
import { getStudioSettings } from "@/lib/studio-settings";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const practitioner = await getCurrentPractitioner();
  if (!practitioner) return Response.json({ error: "Practitioner sign-in required." }, { status: 401 });

  const { id } = await params;

  try {
    const { chart, clientName } = await getBookingVarshphalChart(id, practitioner.id);
    const settings = await getStudioSettings();
    const pdfBytes = await generateVarshphalPdf(chart, clientName, {
      reportId: `VAR-${id.slice(0, 8).toUpperCase()}`,
      generatedAt: new Date(),
      studioName: settings.studioName,
      supportEmail: settings.supportEmail,
      attribution: { type: "human", astrologerName: practitioner.name },
    });
    return new Response(Buffer.from(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Varshphal-${chart.year}-${clientName.replace(/\s+/g, "-")}.pdf"`,
      },
    });
  } catch (error) {
    if (error instanceof KundliSummaryError) return Response.json({ error: error.message }, { status: 400 });
    return Response.json({ error: "The Varshphal PDF could not be generated. Please try again." }, { status: 502 });
  }
}
