import { buildMemberDataExport } from "@/lib/account-deletion";
import { getCurrentMember } from "@/lib/member-auth";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Downloads everything the platform stores about the signed-in member as a JSON file — the
 * "request a copy of your data" right the privacy policy promises, self-service instead of a
 * support email. Rate limited: the export fans out over a dozen collections, so it shouldn't be
 * refreshable in a loop. */
export async function GET() {
  const member = await getCurrentMember();
  if (!member) return Response.json({ error: "Member sign-in required." }, { status: 401 });

  const throttle = await checkRateLimit("member-data-export", member.id, 3, 3600);
  if (!throttle.allowed) return rateLimitResponse(throttle.retryAfter);

  const exportBundle = await buildMemberDataExport(member);
  const body = JSON.stringify(exportBundle, null, 2);
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="adi-jyotish-data-export-${stamp}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
