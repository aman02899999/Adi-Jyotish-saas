import { db } from "@/lib/firestore";
import { getCurrentAdmin, hasAdminPermission, recordAudit } from "@/lib/admin-auth";
import { parseReportRange } from "@/lib/analytics";
import { bookingFromDoc } from "@/app/api/bookings/route";

export const dynamic = "force-dynamic";

function csvCell(value: string | number | Date | null) {
  let text = value instanceof Date ? value.toISOString() : String(value ?? "");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"','""')}"`;
}

export async function GET(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "reports")) return Response.json({ error: "Report permission required." }, { status: 403 });
  const url = new URL(request.url);
  const range = parseReportRange(url.searchParams.get("range") ?? undefined);
  const days = range === "30d" ? 30 : range === "90d" ? 90 : range === "365d" ? 365 : null;
  const query = days
    ? db.collection("bookings").where("createdAt", ">=", new Date(Date.now() - days * 86400000))
    : db.collection("bookings");
  const snap = await query.get();
  const rows = snap.docs.map(bookingFromDoc);
  const headers = ["Reference","Created","Appointment","Customer","Email","Service","Price USD","Booking status","Payment status"];
  const lines = [headers.map(csvCell).join(","),...rows.map(row=>[
    row.reference,row.createdAt,row.scheduledAt,row.clientName,row.clientEmail,row.serviceTitle,row.servicePrice,row.status,row.paymentStatus,
  ].map(csvCell).join(","))];
  await recordAudit(admin,"report.exported","booking_report",range,{rows:rows.length});
  return new Response(`﻿${lines.join("\r\n")}`,{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":`attachment; filename="jyotish-bookings-${range}.csv"`,"Cache-Control":"no-store"}});
}
