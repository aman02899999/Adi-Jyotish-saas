import { gt } from "drizzle-orm";
import { db } from "@/db";
import { bookings } from "@/db/schema";
import { AdminSchedule } from "@/components/admin-schedule";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPage } from "@/lib/admin-page";
import { getPractitionerDirectory } from "@/lib/scheduling";

export const dynamic="force-dynamic";
export default async function AdminSchedulePage(){await requireAdminPage("schedule");const[people,upcoming]=await Promise.all([getPractitionerDirectory(false),db.select({practitionerId:bookings.practitionerId,status:bookings.status}).from(bookings).where(gt(bookings.scheduledAt,new Date()))]);const counts:Record<number,number>={};for(const booking of upcoming)if(booking.practitionerId&&booking.status!=="cancelled")counts[booking.practitionerId]=(counts[booking.practitionerId]??0)+1;return <AdminShell active="Schedule"><div className="admin-content"><div className="admin-heading"><div><p>Jyotish / Operations</p><h1>Schedule</h1><span>Manage practitioners, working hours, and time away.</span></div><div><small>Availability</small><strong>Live <i/></strong></div></div><AdminSchedule initialPractitioners={people} upcomingCounts={counts}/></div></AdminShell>;}
