import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firestore";
import { getAdminIdsWithPermission } from "@/lib/admin-roles";
import { notifyAdmins } from "@/lib/notifications";

const BOOKING_MILESTONES = [100, 250, 500, 1000, 2500, 5000, 10000];

function isAlreadyExists(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code: unknown }).code === 6);
}

export type Milestone = { id: string; type: "bookings"; value: number; achievedAt: Date };

/** Called after a booking transitions to "completed" (see /api/bookings/[id]). Recomputes the
 * same completed-bookings count already shown publicly as stats.consultationsDelivered
 * (getHomepageStats) — when it lands exactly on a round number, records a one-time shareable
 * milestone card and pings admins with the link, instead of someone having to notice "we hit
 * 500 bookings" and make a graphic by hand. doc.create() on a milestone-value-keyed ID makes the
 * "was this already claimed" check atomic — two bookings completing in the same instant can't
 * both create the same milestone. */
export async function checkBookingCompletionMilestone() {
  const countSnap = await db.collection("bookings").where("status", "==", "completed").count().get();
  const total = countSnap.data().count;
  if (!BOOKING_MILESTONES.includes(total)) return null;

  const id = `bookings-${total}`;
  const ref = db.collection("milestones").doc(id);
  try {
    await ref.create({ type: "bookings", value: total, achievedAt: FieldValue.serverTimestamp() });
  } catch (error) {
    if (isAlreadyExists(error)) return null;
    throw error;
  }

  const adminIds = await getAdminIdsWithPermission("settings");
  if (adminIds.length) {
    await notifyAdmins(adminIds, {
      type: "milestone_reached",
      title: `Milestone: ${total} consultations delivered`,
      body: "A shareable card is ready to post.",
      link: `/milestone/${id}`,
    }).catch((error) => console.error("Milestone notification failed", error));
  }
  return id;
}

export async function getMilestone(id: string): Promise<Milestone | null> {
  const snap = await db.collection("milestones").doc(id).get();
  if (!snap.exists) return null;
  const data = snap.data() as { type: "bookings"; value: number; achievedAt?: FirebaseFirestore.Timestamp };
  return { id, type: data.type, value: data.value, achievedAt: data.achievedAt?.toDate() ?? new Date() };
}
