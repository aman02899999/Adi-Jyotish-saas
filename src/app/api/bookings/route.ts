import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firestore";
import { seedServices } from "@/lib/services";
import { getCurrentAdmin, hasAdminPermission } from "@/lib/admin-auth";
import { getCurrentMember } from "@/lib/member-auth";
import { sendBookingNotification } from "@/lib/messaging";
import { sendEmail, genericNotificationEmailHtml } from "@/lib/email";
import { getSiteUrl } from "@/lib/site-url";
import { getStudioSettings } from "@/lib/studio-settings";
import { ensureInvoiceForBooking } from "@/lib/billing";
import { validateAvailableSlot } from "@/lib/scheduling";
import { getAdminIdsWithPermission } from "@/lib/admin-roles";
import { createNotification, notifyAdmins } from "@/lib/notifications";
import { checkRateLimit, rateLimitResponse, requestIp } from "@/lib/rate-limit";
import { applyDiscount, getMemberDiscountPercent } from "@/lib/subscriptions";

export const dynamic = "force-dynamic";

class SlotUnavailableError extends Error {}

type BookingPayload = {
  serviceId?: string;
  practitionerId?: string;
  bookingDate?: string;
  clientName?: string;
  clientEmail?: string;
  clientPhone?: string;
  birthDate?: string;
  birthTime?: string;
  birthPlace?: string;
  scheduledAt?: string;
  notes?: string;
};

export type BookingRecord = {
  id: string;
  reference: string;
  serviceId: string | null;
  serviceTitle: string;
  servicePrice: number;
  serviceDuration: number;
  practitionerId: string | null;
  practitionerName: string | null;
  clientName: string;
  clientEmail: string;
  clientPhone: string | null;
  birthDate: string;
  birthTime: string;
  birthPlace: string;
  scheduledAt: Date;
  notes: string | null;
  status: string;
  paymentStatus: string;
  kundliSummary: string | null;
  kundliGeneratedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export function bookingFromDoc(doc: FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot): BookingRecord {
  const data = doc.data() as Record<string, unknown>;
  return {
    id: doc.id,
    reference: data.reference as string,
    serviceId: (data.serviceId as string | null) ?? null,
    serviceTitle: data.serviceTitle as string,
    servicePrice: data.servicePrice as number,
    serviceDuration: data.serviceDuration as number,
    practitionerId: (data.practitionerId as string | null) ?? null,
    practitionerName: (data.practitionerName as string | null) ?? null,
    clientName: data.clientName as string,
    clientEmail: data.clientEmail as string,
    clientPhone: (data.clientPhone as string | null) ?? null,
    birthDate: data.birthDate as string,
    birthTime: data.birthTime as string,
    birthPlace: data.birthPlace as string,
    scheduledAt: (data.scheduledAt as FirebaseFirestore.Timestamp).toDate(),
    notes: (data.notes as string | null) ?? null,
    status: data.status as string,
    paymentStatus: data.paymentStatus as string,
    kundliSummary: (data.kundliSummary as string | null) ?? null,
    kundliGeneratedAt: (data.kundliGeneratedAt as FirebaseFirestore.Timestamp | undefined)?.toDate() ?? null,
    createdAt: (data.createdAt as FirebaseFirestore.Timestamp)?.toDate() ?? new Date(),
    updatedAt: (data.updatedAt as FirebaseFirestore.Timestamp)?.toDate() ?? new Date(),
  };
}

function clean(value: string | undefined, limit: number) {
  return value?.trim().slice(0, limit) ?? "";
}

export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "bookings")) return Response.json({ error: "Booking permission required." }, { status: 403 });

  const snap = await db.collection("bookings").orderBy("scheduledAt", "desc").get();
  return Response.json(snap.docs.map(bookingFromDoc));
}

export async function POST(request: Request) {
  const body = (await request.json()) as BookingPayload;
  const [member, settings] = await Promise.all([getCurrentMember(), getStudioSettings()]);

  const throttle = await checkRateLimit("booking-create", member ? `member:${member.id}` : `ip:${requestIp(request)}`, 8, 600);
  if (!throttle.allowed) return rateLimitResponse(throttle.retryAfter);
  const serviceId = body.serviceId?.trim() ?? "";
  const practitionerId = body.practitionerId?.trim() ?? "";
  const bookingDate = body.bookingDate?.trim() ?? "";
  const clientName = member?.name ?? clean(body.clientName, 120);
  const clientEmail = member?.email ?? clean(body.clientEmail, 180).toLowerCase();
  const clientPhone = clean(body.clientPhone, 40);
  const birthDate = clean(body.birthDate, 10);
  const birthTime = clean(body.birthTime, 8);
  const birthPlace = clean(body.birthPlace, 180);
  const notes = clean(body.notes, 1500);
  const scheduledAt = new Date(body.scheduledAt ?? "");

  if (!serviceId) {
    return Response.json({ error: "Please choose a valid reading." }, { status: 400 });
  }
  if (!practitionerId || !/^\d{4}-\d{2}-\d{2}$/.test(bookingDate)) {
    return Response.json({ error: "Choose an available astrologer and time." }, { status: 400 });
  }
  if (!clientName || !/^\S+@\S+\.\S+$/.test(clientEmail)) {
    return Response.json({ error: "A valid name and email are required." }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || !/^\d{2}:\d{2}$/.test(birthTime) || !birthPlace) {
    return Response.json({ error: "Complete birth date, time, and place are required." }, { status: 400 });
  }
  if (Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() < Date.now() + settings.bookingLeadMinutes * 60 * 1000) {
    return Response.json({ error: `Please choose an appointment at least ${settings.bookingLeadMinutes} minutes from now.` }, { status: 400 });
  }

  await seedServices();
  const [serviceSnap, practitionerSnap] = await Promise.all([
    db.collection("services").doc(serviceId).get(),
    db.collection("practitioners").doc(practitionerId).get(),
  ]);
  const service = serviceSnap.exists ? { id: serviceSnap.id, ...(serviceSnap.data() as { title: string; price: number; duration: number; active: boolean }) } : null;
  const practitioner = practitionerSnap.exists ? { id: practitionerSnap.id, ...(practitionerSnap.data() as { name: string; active: boolean }) } : null;
  if (!service || !service.active) return Response.json({ error: "This reading is not currently available." }, { status: 404 });
  if (!practitioner || !practitioner.active) return Response.json({ error: "This astrologer is not currently available." }, { status: 404 });
  const available = await validateAvailableSlot({ date: bookingDate, duration: service.duration, practitionerId, startsAt: scheduledAt });
  if (!available) return Response.json({ error: "This time is no longer available. Choose another open slot." }, { status: 409 });

  const discountPercent = member ? await getMemberDiscountPercent(member.id) : 0;
  const servicePrice = applyDiscount(service.price, discountPercent);

  const dateCode = new Date().toISOString().slice(2, 10).replaceAll("-", "");
  const reference = `JY-${dateCode}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
  const bookingsRef = db.collection("bookings");

  let created: BookingRecord;
  try {
    created = await db.runTransaction(async (tx) => {
      const endsAt = new Date(scheduledAt.getTime() + service.duration * 60000);
      // Firestore can't express "starts + duration > x" server-side, so pull this practitioner's
      // non-cancelled bookings starting before our end time and check overlap client-side. The
      // transaction still guarantees atomicity: if a concurrent booking commits in between, this
      // transaction is retried automatically by the SDK against fresh reads.
      const candidatesSnap = await tx.get(
        bookingsRef.where("practitionerId", "==", practitionerId).where("status", "!=", "cancelled").where("scheduledAt", "<", endsAt),
      );
      const conflict = candidatesSnap.docs.some((doc) => {
        const data = doc.data();
        const bookedStart = (data.scheduledAt as FirebaseFirestore.Timestamp).toDate();
        const bookedEnd = new Date(bookedStart.getTime() + (data.serviceDuration as number) * 60000);
        return bookedEnd > scheduledAt;
      });
      if (conflict) throw new SlotUnavailableError();

      const ref = bookingsRef.doc();
      const now = FieldValue.serverTimestamp();
      tx.set(ref, {
        reference,
        serviceId: service.id,
        serviceTitle: service.title,
        servicePrice,
        serviceDuration: service.duration,
        practitionerId: practitioner.id,
        practitionerName: practitioner.name,
        clientName,
        clientEmail,
        clientPhone: clientPhone || null,
        birthDate,
        birthTime,
        birthPlace,
        scheduledAt,
        notes: notes || null,
        status: "pending",
        paymentStatus: "unpaid",
        kundliSummary: null,
        kundliGeneratedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      return {
        id: ref.id,
        reference,
        serviceId: service.id,
        serviceTitle: service.title,
        servicePrice,
        serviceDuration: service.duration,
        practitionerId: practitioner.id,
        practitionerName: practitioner.name,
        clientName,
        clientEmail,
        clientPhone: clientPhone || null,
        birthDate,
        birthTime,
        birthPlace,
        scheduledAt,
        notes: notes || null,
        status: "pending",
        paymentStatus: "unpaid",
        kundliSummary: null,
        kundliGeneratedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } satisfies BookingRecord;
    });
  } catch (error) {
    if (error instanceof SlotUnavailableError) {
      return Response.json({ error: "This time was just reserved by someone else. Choose another slot." }, { status: 409 });
    }
    console.error("Booking transaction failed", error instanceof Error ? error.message : "unknown error");
    return Response.json({ error: "Booking could not be completed." }, { status: 500 });
  }

  await ensureInvoiceForBooking(created, member?.id);
  getAdminIdsWithPermission("bookings").then((adminIds) => notifyAdmins(adminIds, {
    type: "booking.created",
    title: `New booking · ${created.serviceTitle}`,
    body: `${created.clientName} with ${created.practitionerName} on ${created.scheduledAt.toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "Asia/Kolkata" })}.`,
    link: "/admin/bookings",
  })).catch(() => {});
  if (created.practitionerId) {
    createNotification({
      recipientType: "practitioner",
      recipientId: created.practitionerId,
      type: "booking.created",
      title: `New booking · ${created.serviceTitle}`,
      body: `${created.clientName} on ${created.scheduledAt.toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "Asia/Kolkata" })}.`,
      link: "/practitioner/bookings",
    }).catch(() => {});
  }
  const scheduledLabel = created.scheduledAt.toLocaleString("en", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Kolkata" });
  if (member) {
    await sendBookingNotification({
      memberEmail: member.email,
      bookingId: created.id,
      subject: `${created.serviceTitle} · ${created.reference}`,
      body: `Your consultation with ${created.practitionerName} is reserved for ${scheduledLabel}. We will keep booking and payment updates together in this conversation.`,
    });
  }
  await sendEmail({
    to: clientEmail,
    subject: `Booking confirmed · ${created.reference}`,
    html: genericNotificationEmailHtml({
      title: "Your consultation is booked",
      name: clientName,
      body: `Your ${created.serviceTitle} with ${created.practitionerName} is reserved for ${scheduledLabel}. Reference: ${created.reference}.`,
      ctaLabel: "View your booking",
      ctaUrl: new URL(member ? "/dashboard/consultations" : "/", getSiteUrl()).toString(),
    }),
  }).catch(() => {});
  return Response.json(created, { status: 201 });
}
