import { getBookingKundliChart, KundliSummaryError } from "@/lib/practitioner-portal";
import { getCurrentPractitioner } from "@/lib/practitioner-auth";
import { generateKundliPdf } from "@/lib/kundli-pdf";
import { getStudioSettings } from "@/lib/studio-settings";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const practitioner = await getCurrentPractitioner();
  if (!practitioner) return Response.json({ error: "Practitioner sign-in required." }, { status: 401 });

  const { id } = await params;

  try {
    const chart = await getBookingKundliChart(id, practitioner.id);
    const settings = await getStudioSettings();
    const pdfBytes = await generateKundliPdf(chart, {
      reportId: `KUN-${id.slice(0, 8).toUpperCase()}`,
      generatedAt: new Date(),
      studioName: settings.studioName,
      supportEmail: settings.supportEmail,
      attribution: { type: "human", astrologerName: practitioner.name },
    });
    return new Response(Buffer.from(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Kundli-${chart.name.replace(/\s+/g, "-")}.pdf"`,
      },
    });
  } catch (error) {
    if (error instanceof KundliSummaryError) return Response.json({ error: error.message }, { status: 400 });
    return Response.json({ error: "The Kundli PDF could not be generated. Please try again." }, { status: 502 });
  }
}
