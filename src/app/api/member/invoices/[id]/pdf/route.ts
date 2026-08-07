import { getCurrentMember } from "@/lib/member-auth";
import { getMemberBilling } from "@/lib/billing";
import { generateInvoicePdf } from "@/lib/invoice-pdf";
import { getStudioSettings } from "@/lib/studio-settings";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const member = await getCurrentMember();
  if (!member) return Response.json({ error: "Please sign in first." }, { status: 401 });

  const { id } = await params;
  const [settings, rows] = await Promise.all([getStudioSettings(), getMemberBilling(member.id, member.email)]);
  const invoice = rows.find((row) => row.id === id);
  if (!invoice) return Response.json({ error: "Invoice not found." }, { status: 404 });

  const pdfBytes = await generateInvoicePdf(invoice, settings);
  return new Response(Buffer.from(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${invoice.number}.pdf"`,
    },
  });
}
