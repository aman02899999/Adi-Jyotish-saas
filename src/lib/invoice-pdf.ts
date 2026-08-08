import "server-only";

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { BillingInvoice } from "@/lib/billing";
import type { getStudioSettings } from "@/lib/studio-settings";

type StudioSettings = Awaited<ReturnType<typeof getStudioSettings>>;

const INK = rgb(0.18, 0.16, 0.14);
const MUTED = rgb(0.45, 0.4, 0.36);
const COPPER = rgb(0.663, 0.345, 0.219);

export async function generateInvoicePdf(invoice: BillingInvoice, settings: StudioSettings) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]); // A4
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const { width, height } = page.getSize();
  const left = 56;
  let y = height - 70;

  const text = (value: string, x: number, yPos: number, options: { size?: number; f?: typeof font; color?: ReturnType<typeof rgb> } = {}) => {
    page.drawText(value, { x, y: yPos, size: options.size ?? 10, font: options.f ?? font, color: options.color ?? INK });
  };

  text(settings.studioName, left, y, { size: 20, f: bold, color: COPPER });
  text(`Invoice ${invoice.number}`, width - left - bold.widthOfTextAtSize(`Invoice ${invoice.number}`, 12), y, { size: 12, f: bold });
  y -= 18;
  text(settings.supportEmail, left, y, { size: 9, color: MUTED });
  if (settings.gstin) text(`GSTIN: ${settings.gstin}`, width - left - font.widthOfTextAtSize(`GSTIN: ${settings.gstin}`, 9), y, { size: 9, color: MUTED });

  y -= 40;
  text("Bill to", left, y, { size: 8, color: MUTED });
  text(`Status: ${invoice.status.replace("_", " ").toUpperCase()}`, width - left - 150, y, { size: 8, color: MUTED });
  y -= 15;
  text(invoice.customerName, left, y, { size: 12, f: bold });
  y -= 15;
  text(invoice.customerEmail, left, y, { size: 10, color: MUTED });

  y -= 40;
  page.drawLine({ start: { x: left, y }, end: { x: width - left, y }, thickness: 1, color: rgb(0.85, 0.82, 0.78) });
  y -= 22;
  text("Description", left, y, { size: 9, f: bold, color: MUTED });
  text("Reference", 300, y, { size: 9, f: bold, color: MUTED });
  text("Amount", width - left - 60, y, { size: 9, f: bold, color: MUTED });
  y -= 20;
  text(invoice.description, left, y, { size: 11 });
  text(invoice.bookingReference, 300, y, { size: 10, color: MUTED });
  text(`${invoice.currency} ${invoice.subtotal.toFixed(2)}`, width - left - 60, y, { size: 11 });

  y -= 30;
  page.drawLine({ start: { x: 320, y }, end: { x: width - left, y }, thickness: 0.5, color: rgb(0.88, 0.85, 0.81) });
  y -= 18;
  text("Subtotal", 320, y, { size: 10, color: MUTED });
  text(`${invoice.currency} ${invoice.subtotal.toFixed(2)}`, width - left - 60, y, { size: 10 });
  y -= 16;
  text(`GST (${invoice.taxRate}%)`, 320, y, { size: 10, color: MUTED });
  text(`${invoice.currency} ${invoice.taxAmount.toFixed(2)}`, width - left - 60, y, { size: 10 });
  y -= 18;
  page.drawLine({ start: { x: 320, y }, end: { x: width - left, y }, thickness: 0.5, color: rgb(0.88, 0.85, 0.81) });
  y -= 20;
  text("Total", 320, y, { size: 12, f: bold });
  text(`${invoice.currency} ${invoice.amount.toFixed(2)}`, width - left - 60, y, { size: 12, f: bold, color: COPPER });

  y -= 50;
  page.drawLine({ start: { x: left, y }, end: { x: width - left, y }, thickness: 1, color: rgb(0.85, 0.82, 0.78) });
  y -= 24;
  const meta: Array<[string, string]> = [
    ["Issued", invoice.createdAt.toLocaleDateString("en", { month: "long", day: "numeric", year: "numeric" })],
    ["Consultation", invoice.scheduledAt.toLocaleString("en", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })],
    ["Astrologer", invoice.practitionerName ?? "Jyotish Studio"],
    ["Paid", invoice.paidAt ? invoice.paidAt.toLocaleDateString("en", { month: "long", day: "numeric", year: "numeric" }) : "Not yet paid"],
  ];
  for (const [label, value] of meta) {
    text(label, left, y, { size: 8, color: MUTED });
    text(value, left + 100, y, { size: 10 });
    y -= 18;
  }

  y = 60;
  text(`This invoice was generated securely by ${settings.studioName}. Questions? Contact ${settings.supportEmail}.`, left, y, { size: 8, color: MUTED });

  return doc.save();
}
