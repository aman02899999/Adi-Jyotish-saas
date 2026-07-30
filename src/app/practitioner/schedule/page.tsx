import { PractitionerShell } from "@/components/practitioner-shell";
import { PractitionerSchedule } from "@/components/practitioner-schedule";
import { requirePractitionerPage } from "@/lib/practitioner-auth";
import { getPractitionerSchedule } from "@/lib/practitioner-portal";

export const dynamic = "force-dynamic";

export default async function PractitionerSchedulePage() {
  const practitioner = await requirePractitionerPage();
  const { rules, timeOff } = await getPractitionerSchedule(practitioner.id);

  return (
    <PractitionerShell practitioner={practitioner} active="Schedule">
      <div className="consultation-heading billing-heading"><div><p>Your workspace</p><h1>Schedule</h1><span>Set your weekly hours and block out time off.</span></div></div>
      <PractitionerSchedule
        initialRules={rules.map((rule) => ({ weekday: rule.weekday, startTime: rule.startTime, endTime: rule.endTime, active: rule.active }))}
        initialTimeOff={timeOff.map((block) => ({ startsAt: block.startsAt.toString(), endsAt: block.endsAt.toString(), reason: block.reason }))}
      />
    </PractitionerShell>
  );
}
