import { db } from "@/lib/firestore";
import { getCurrentAdmin,hasAdminPermission,recordAudit } from "@/lib/admin-auth";
import { getPractitionerDirectory } from "@/lib/scheduling";
import { isSupabaseCutoverActive } from "@/lib/supabase-config";
import { getPractitionerAvailabilityInSupabase } from "@/lib/practitioners-supabase";
import { replacePortalScheduleInSupabase } from "@/lib/practitioner-portal-supabase";

export async function PUT(request:Request,{params}:{params:Promise<{id:string}>}){
  const admin=await getCurrentAdmin();
  if(!admin)return Response.json({error:"Administrator access required."},{status:401});
  if(!hasAdminPermission(admin,"schedule"))return Response.json({error:"Scheduling permission required."},{status:403});
  const{id}=await params;
  const cutover = isSupabaseCutoverActive();
  if (cutover) {
    const exists = await getPractitionerAvailabilityInSupabase(id);
    if(!exists)return Response.json({error:"Practitioner not found."},{status:404});
  } else {
    const snap = await db.collection("practitioners").doc(id).get();
    if(!snap.exists)return Response.json({error:"Practitioner not found."},{status:404});
  }

  const body=await request.json() as {rules?:Array<{weekday:number;startTime:string;endTime:string;active?:boolean}>;timeOff?:Array<{startsAt:string;endsAt:string;reason?:string}>};
  const rules=(body.rules??[]).filter(rule=>Number.isInteger(rule.weekday)&&rule.weekday>=0&&rule.weekday<=6&&/^\d{2}:\d{2}$/.test(rule.startTime)&&/^\d{2}:\d{2}$/.test(rule.endTime)&&rule.startTime<rule.endTime);
  const timeOff=(body.timeOff??[]).map(item=>({startsAt:new Date(item.startsAt),endsAt:new Date(item.endsAt),reason:item.reason?.trim().slice(0,180)||null})).filter(item=>!Number.isNaN(item.startsAt.getTime())&&!Number.isNaN(item.endsAt.getTime())&&item.startsAt<item.endsAt);

  if (cutover) {
    // One transaction, under a per-practitioner advisory lock: a double-click or the
    // page open in two tabs would otherwise let both saves delete what they see and
    // then both insert, committing two disjoint rule sets.
    await replacePortalScheduleInSupabase(
      id,
      rules.map((rule) => ({ ...rule, active: rule.active ?? true })),
      timeOff,
    );
  } else {
    const ref = db.collection("practitioners").doc(id);
    const rulesCol = ref.collection("availabilityRules");
    const timeOffCol = ref.collection("timeOff");
    const [existingRules, existingTimeOff] = await Promise.all([rulesCol.get(), timeOffCol.get()]);

    const batch = db.batch();
    for (const doc of existingRules.docs) batch.delete(doc.ref);
    for (const doc of existingTimeOff.docs) batch.delete(doc.ref);
    for (const rule of rules) batch.set(rulesCol.doc(), { ...rule, active: rule.active ?? true });
    for (const item of timeOff) batch.set(timeOffCol.doc(), item);
    await batch.commit();
  }

  await recordAudit(admin,"practitioner.schedule_updated","practitioner",id,{weeklyRules:rules.length,timeOffBlocks:timeOff.length});
  const all=await getPractitionerDirectory(false,true);
  return Response.json(all.find(item=>item.id===id));
}
