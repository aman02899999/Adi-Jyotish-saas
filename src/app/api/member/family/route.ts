import { addFamilyMember, buildFamilyChart, chartSnapshot, FamilyMemberError, listFamilyMembersWithCharts } from "@/lib/family-members";
import { getCurrentMember } from "@/lib/member-auth";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { asText, readJsonBody } from "@/lib/request-body";

export const dynamic = "force-dynamic";

export async function GET() {
  const member = await getCurrentMember();
  if (!member) return Response.json({ error: "Member sign-in required." }, { status: 401 });

  return Response.json({ familyMembers: await listFamilyMembersWithCharts(member.id) });
}

export async function POST(request: Request) {
  const member = await getCurrentMember();
  if (!member) return Response.json({ error: "Member sign-in required." }, { status: 401 });

  const throttle = await checkRateLimit("family-member-create", `member:${member.id}`, 10, 600);
  if (!throttle.allowed) return rateLimitResponse(throttle.retryAfter);

  const body = (await readJsonBody(request)) as { name?: string; relationship?: string; birthDate?: string; birthTime?: string; birthPlace?: string };
  try {
    const familyMember = await addFamilyMember({
      memberId: member.id,
      name: asText(body.name)?.trim() ?? "",
      relationship: asText(body.relationship)?.trim() ?? "",
      birthDate: asText(body.birthDate)?.trim() ?? "",
      birthTime: asText(body.birthTime)?.trim() ?? "",
      birthPlace: asText(body.birthPlace)?.trim() ?? "",
    });
    const chart = { ...familyMember, chart: chartSnapshot(buildFamilyChart(familyMember)) };
    return Response.json(chart, { status: 201 });
  } catch (error) {
    if (error instanceof FamilyMemberError) return Response.json({ error: error.message }, { status: 400 });
    console.error("Add family member failed", error instanceof Error ? error.message : "unknown error");
    return Response.json({ error: "Could not save this family member. Please try again." }, { status: 502 });
  }
}
