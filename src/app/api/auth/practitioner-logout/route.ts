import { logoutRedirect } from "@/lib/logout-redirect";
import { revokePractitionerSession } from "@/lib/practitioner-auth";

export const dynamic = "force-dynamic";

export async function POST() {
  await revokePractitionerSession();
  return logoutRedirect("/practitioner/login");
}
