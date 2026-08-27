import { logoutRedirect } from "@/lib/logout-redirect";
import { revokeMemberSession } from "@/lib/member-auth";

export const dynamic = "force-dynamic";

export async function POST() {
  await revokeMemberSession();
  return logoutRedirect("/account");
}
