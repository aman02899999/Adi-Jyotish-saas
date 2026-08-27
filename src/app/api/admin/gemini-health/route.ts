import { getCurrentAdmin, hasAdminPermission } from "@/lib/admin-auth";
import { checkGeminiHealth } from "@/lib/gemini";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Answers "is the Gemini key I just set actually working?" — the one question the AI Personas
 * banner cannot answer, because it only checks whether the variable is present.
 *
 * POST rather than GET because it makes a real outbound call, and it is behind the same admin
 * permission as the personas it diagnoses. Rate limited because each call costs a request against
 * the account's Gemini quota, however small.
 */
export async function POST() {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "ai_personas")) return Response.json({ error: "AI personas permission required." }, { status: 403 });

  const throttle = await checkRateLimit("admin-gemini-health", `admin:${admin.id}`, 10, 300);
  if (!throttle.allowed) return rateLimitResponse(throttle.retryAfter);

  return Response.json(await checkGeminiHealth());
}
