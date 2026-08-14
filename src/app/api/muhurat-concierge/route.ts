import { DECISION_TYPES, decisionVaraNote, rankMuhurtaWindows, type DecisionType } from "@/lib/muhurat-concierge";
import { checkRateLimit, rateLimitResponse, requestIp } from "@/lib/rate-limit";
import { REFERENCE_LOCATION_LABEL } from "@/lib/panchang";

export const dynamic = "force-dynamic";

const DECISION_KEYS = new Set(DECISION_TYPES.map((option) => option.key));
const MAX_RANGE_DAYS = 45;

type Payload = { decisionType?: string; startDate?: string; endDate?: string };

export async function POST(request: Request) {
  const ip = requestIp(request);
  const throttle = await checkRateLimit("muhurat-concierge", `ip:${ip}`, 10, 3600);
  if (!throttle.allowed) return rateLimitResponse(throttle.retryAfter);

  const body = (await request.json()) as Payload;
  const decisionType = body.decisionType ?? "";
  const startDate = body.startDate?.trim() ?? "";
  const endDate = body.endDate?.trim() ?? "";

  if (!DECISION_KEYS.has(decisionType as DecisionType)) {
    return Response.json({ error: "Please choose what you're planning for." }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return Response.json({ error: "Please choose a valid date range." }, { status: 400 });
  }

  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return Response.json({ error: "Please choose a valid date range." }, { status: 400 });
  }
  if (start < today) {
    return Response.json({ error: "Please choose a start date today or later." }, { status: 400 });
  }
  const spanDays = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  if (spanDays > MAX_RANGE_DAYS) {
    return Response.json({ error: `Please choose a range of ${MAX_RANGE_DAYS} days or fewer.` }, { status: 400 });
  }

  const typedDecision = decisionType as DecisionType;
  const days = rankMuhurtaWindows({ decisionType: typedDecision, startDate, endDate });
  return Response.json({
    days,
    varaNote: decisionVaraNote(typedDecision),
    referenceLocationLabel: REFERENCE_LOCATION_LABEL,
  }, { status: 200 });
}
