import { getCurrentAdmin, hasAdminPermission, normalizeEmail, recordAudit } from "@/lib/admin-auth";
import { getStudioSettings, updateStudioSettings } from "@/lib/studio-settings";

export const dynamic = "force-dynamic";
const currencies = ["USD", "EUR", "GBP", "INR", "AUD", "CAD"];

export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  return Response.json(await getStudioSettings());
}

export async function PUT(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "settings")) return Response.json({ error: "Owner access required." }, { status: 403 });

  const body = await request.json() as { studioName?: string; supportEmail?: string; timezone?: string; currency?: string; cancellationHours?: number; bookingLeadMinutes?: number; replySlaHours?: number; gstRate?: number; gstin?: string };
  const studioName = body.studioName?.trim().slice(0, 120) ?? "";
  const supportEmail = normalizeEmail(body.supportEmail ?? "");
  const timezone = body.timezone?.trim().slice(0, 80) ?? "";
  const currency = currencies.includes(body.currency ?? "") ? body.currency! : "USD";
  const cancellationHours = Math.min(168, Math.max(1, Number(body.cancellationHours) || 24));
  const bookingLeadMinutes = Math.min(10080, Math.max(0, Number(body.bookingLeadMinutes) || 0));
  const replySlaHours = Math.min(168, Math.max(1, Number(body.replySlaHours) || 24));
  const gstRate = Math.min(28, Math.max(0, Number(body.gstRate) || 0));
  const gstin = body.gstin?.trim().toUpperCase().slice(0, 20) || null;

  if (studioName.length < 2 || !/^\S+@\S+\.\S+$/.test(supportEmail) || !timezone) {
    return Response.json({ error: "Studio name, support email, and timezone are required." }, { status: 400 });
  }

  const updated = await updateStudioSettings({ studioName, supportEmail, timezone, currency, cancellationHours, bookingLeadMinutes, replySlaHours, gstRate, gstin });
  await recordAudit(admin, "settings.updated", "studio_settings", "main", { currency, cancellationHours, bookingLeadMinutes, replySlaHours, gstRate });
  return Response.json(updated);
}
