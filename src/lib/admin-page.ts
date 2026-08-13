import "server-only";

import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { getCurrentAdmin, hasAdminPermission, type AdminPermission } from "@/lib/admin-auth";

export async function requireAdminPage(permission: AdminPermission) {
  const admin = await getCurrentAdmin();
  const locale = await getLocale();
  if (!admin) redirect({ href: "/admin/login", locale });
  if (!hasAdminPermission(admin, permission)) redirect({ href: "/admin/unauthorized", locale });
  return admin;
}
