import { getStudioSettings } from "@/lib/studio-settings";
import { getSiteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

// RFC 9116 responsible-disclosure file — lets security researchers report a vulnerability
// privately instead of filing it as a public GitHub issue or posting it publicly.
export async function GET() {
  const settings = await getStudioSettings();
  const site = getSiteUrl();
  const expires = new Date();
  expires.setFullYear(expires.getFullYear() + 1);

  const body = [
    `Contact: mailto:${settings.supportEmail}`,
    `Expires: ${expires.toISOString()}`,
    `Canonical: ${new URL("/.well-known/security.txt", site).toString()}`,
    "Preferred-Languages: en",
  ].join("\n");

  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
