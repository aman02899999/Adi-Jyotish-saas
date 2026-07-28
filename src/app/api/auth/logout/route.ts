import { NextResponse } from "next/server";
import { getCurrentAdmin, recordAudit, revokeCurrentSession } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const admin = await getCurrentAdmin();
  if (admin) await recordAudit(admin, "auth.logout", "administrator", admin.id);
  await revokeCurrentSession();
  return NextResponse.redirect(new URL("/admin/login", request.url), { status: 303 });
}
