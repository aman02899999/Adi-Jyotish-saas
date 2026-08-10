import { getCurrentPractitioner } from "@/lib/practitioner-auth";
import { getPractitionerSchedule, ScheduleError, updatePractitionerSchedule } from "@/lib/practitioner-portal";

export const dynamic = "force-dynamic";

export async function GET() {
  const practitioner = await getCurrentPractitioner();
  if (!practitioner) return Response.json({ error: "Practitioner sign-in required." }, { status: 401 });
  return Response.json(await getPractitionerSchedule(practitioner.id));
}

export async function PUT(request: Request) {
  const practitioner = await getCurrentPractitioner();
  if (!practitioner) return Response.json({ error: "Practitioner sign-in required." }, { status: 401 });

  const body = (await request.json()) as {
    rules?: Array<{ weekday: number; startTime: string; endTime: string; active?: boolean }>;
    timeOff?: Array<{ startsAt: string; endsAt: string; reason?: string }>;
  };
  try {
    await updatePractitionerSchedule(practitioner.id, { rules: body.rules ?? [], timeOff: body.timeOff ?? [] });
  } catch (error) {
    if (error instanceof ScheduleError) return Response.json({ error: error.message }, { status: 400 });
    throw error;
  }
  return Response.json(await getPractitionerSchedule(practitioner.id));
}
