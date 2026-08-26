import { logoutRedirect } from "@/lib/logout-redirect";
import { getCurrentAdmin, recordAudit, revokeCurrentSession } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function POST() {
  const admin = await getCurrentAdmin();
  if (admin) await recordAudit(admin, "auth.logout", "administrator", admin.id);
  await revokeCurrentSession();
  return logoutRedirect("/admin/login");
}
