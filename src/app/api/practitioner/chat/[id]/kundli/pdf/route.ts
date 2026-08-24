import { db } from "@/lib/firestore";
import { getChatMemberKundliChart, KundliSummaryError } from "@/lib/practitioner-portal";
import { getCurrentPractitioner } from "@/lib/practitioner-auth";
import { generateKundliPdf } from "@/lib/kundli-pdf";
import { getStudioSettings } from "@/lib/studio-settings";
import type { PdfAttribution } from "@/lib/report-writer";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const practitioner = await getCurrentPractitioner();
  if (!practitioner) return Response.json({ error: "Practitioner sign-in required." }, { status: 401 });

  const { id } = await params;

  try {
    const chart = await getChatMemberKundliChart(id, practitioner.id);
    const settings = await getStudioSettings();
    // Most of the 30+ marketplace practitioners are AI-powered (see isAiPowered in scheduling.ts) —
    // attributing this PDF to them as a human astrologer would misrepresent who actually generated
    // it, even though the chart data itself is always the same deterministic engine either way.
    const practitionerSnap = await db.collection("practitioners").doc(practitioner.id).get();
    const isAiPowered = Boolean((practitionerSnap.data() as { isAiPowered?: boolean } | undefined)?.isAiPowered);
    const attribution: PdfAttribution = isAiPowered ? { type: "ai", personaName: practitioner.name } : { type: "human", astrologerName: practitioner.name };
    const pdfBytes = await generateKundliPdf(chart, {
      reportId: `KUN-${id.slice(0, 8).toUpperCase()}`,
      generatedAt: new Date(),
      studioName: settings.studioName,
      supportEmail: settings.supportEmail,
      attribution,
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
