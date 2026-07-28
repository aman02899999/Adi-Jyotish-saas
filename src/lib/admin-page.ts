import "server-only";

import { redirect } from "next/navigation";
import { getCurrentAdmin, hasAdminPermission, type AdminPermission } from "@/lib/admin-auth";

export async function requireAdminPage(permission: AdminPermission) {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/admin/login");
  if (!hasAdminPermission(admin, permission)) redirect("/admin/unauthorized");
  return admin;
}
