import { createHash, timingSafeEqual } from "node:crypto";

import { sendDueBookingReminders } from "@/lib/booking-reminders";

export const dynamic = "force-dynamic";

/**
 * Sends due pre-session reminders. Called every 15 minutes by the scheduled
 * workflow (.github/workflows/cron.yml) with `Authorization: Bearer $CRON_SECRET`.
 *
 * GET, as Vercel Cron calls it, so the same secret works if the schedule ever
 * moves there; it also keeps the route out of the CSRF check in proxy.ts, which
 * only guards unsafe methods and would refuse a header-less server-to-server POST.
 * Running it twice is harmless: each booking is claimed before it is sent.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  // A short or missing secret is a misconfiguration, not a reason to run open.
  if (secret.length < 16) {
    return Response.json({ error: "Reminders are not configured." }, { status: 503 });
  }
  const header = request.headers.get("authorization") ?? "";
  // Hash both sides so the comparison is constant-time whatever length was sent.
  const digest = (value: string) => createHash("sha256").update(value).digest();
  if (!timingSafeEqual(digest(header), digest(`Bearer ${secret}`))) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const result = await sendDueBookingReminders();
    return Response.json(result);
  } catch (error) {
    console.error("Booking reminder run failed", error instanceof Error ? error.message : "unknown error");
    return Response.json({ error: "Reminder run failed." }, { status: 500 });
  }
}
