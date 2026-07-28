import { getCurrentAdmin, hasAdminPermission } from "@/lib/admin-auth";
import { getAdminBilling } from "@/lib/billing";
import { isRazorpayConfigured } from "@/lib/razorpay";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "billing")) return Response.json({ error: "Billing permission required." }, { status: 403 });
  return Response.json({ invoices: await getAdminBilling(), razorpayConfigured: isRazorpayConfigured() });
}
