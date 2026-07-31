import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firestore";
import { getStudioSettings } from "@/lib/studio-settings";

export type Practitioner = {
  id: string; // Firestore doc ID == slug
  name: string;
  slug: string;
  email: string;
  title: string;
  bio: string;
  specialties: string;
  languages: string;
  consultationModes: string;
  experienceYears: number;
  verified: boolean;
  verificationLevel: string;
  photoUrl: string | null;
  online: boolean;
  chatRatePerMinute: number;
  active: boolean;
  featured: boolean;
  firebaseUid: string | null;
  hasPortalAccess: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type AvailabilityRule = { id: string; practitionerId: string; weekday: number; startTime: string; endTime: string; active: boolean };
export type PractitionerTimeOff = { id: string; practitionerId: string; startsAt: Date; endsAt: Date; reason: string | null };

const starterPractitioners: Array<Omit<Practitioner, "id" | "firebaseUid" | "hasPortalAccess" | "lastLoginAt" | "createdAt" | "updatedAt" | "online">> = [
  {
    name: "Shree Jagmohan Shashtri Ji",
    slug: "jagmohan-shashtri-ji",
    email: "jagmohan.shashtri@jyotish.studio",
    title: "Senior Vedic Astrologer",
    bio: "With over 44 years of dedicated experience in Vedic Astrology, Shree Jagmohan Shashtri Ji has devoted his life to studying ancient Vedic scriptures and guiding individuals through life's most important decisions. His consultations draw on birth chart analysis, planetary periods, and classical yogas to offer practical guidance and remedies tailored to each person's circumstances. Over four decades he has earned the trust of clients across India and abroad through his deep knowledge, ethical practice, and compassionate approach.",
    specialties: "Vedic Astrology (Jyotish), Kundli Analysis, Horoscope Reading, Career & Business Guidance, Marriage & Relationship Consultation, Kundli Milan, Mangal Dosha, Kaal Sarp Dosha, Shani Sade Sati, Gemstone Recommendations, Vastu Consultation, Numerology",
    languages: "Hindi, Sanskrit",
    consultationModes: "Chat, Audio, Video",
    experienceYears: 44,
    verified: true,
    verificationLevel: "senior-panel",
    photoUrl: "/images/practitioners/jagmohan-shashtri.jpg",
    chatRatePerMinute: 121,
    active: true,
    featured: true,
  },
  {
    name: "Shree Arun Dubey Ji",
    slug: "arun-dubey-ji",
    email: "arun.dubey@jyotish.studio",
    title: "Certified Gemstone & Vedic Astrology Expert",
    bio: "With over 38 years of experience in Vedic Astrology and Gemstone Consultation, Shree Arun Dubey Ji is renowned for helping individuals select authentic gemstones based on detailed astrological analysis. His expertise combines the timeless principles of Vedic astrology with a deep understanding of planetary energies, ensuring every recommendation is tailored to the individual's birth chart and life circumstances. Throughout his distinguished career, he has guided thousands of clients in choosing natural, certified gemstones to complement their spiritual and astrological journey.",
    specialties: "Vedic Gemstone Consultation, Birth Chart (Kundli) Analysis, Planetary Strength Analysis, Certified Natural Gemstone Selection, Navratna Consultation, Rudraksha Recommendation, Career & Business Guidance, Marriage & Relationship Consultation, Shani, Rahu & Ketu Remedies, Gemstone Energization Guidance, Wealth & Prosperity Consultation",
    languages: "Hindi, Sanskrit",
    consultationModes: "Chat, Audio, Video",
    experienceYears: 38,
    verified: true,
    verificationLevel: "senior-panel",
    photoUrl: "/images/practitioners/arun-dubey.jpg",
    chatRatePerMinute: 109,
    active: true,
    featured: true,
  },
  {
    name: "Anika Sharma",
    slug: "anika-sharma",
    email: "anika@jyotish.studio",
    title: "Senior Vedic Astrologer",
    bio: "Anika brings classical Parashari technique into grounded conversations about purpose, timing, and visible growth.",
    specialties: "Birth charts, Career & dharma, Planetary periods",
    languages: "English, Hindi, Sanskrit",
    consultationModes: "Video, Audio, Chat",
    experienceYears: 14,
    verified: true,
    verificationLevel: "senior-panel",
    photoUrl: null,
    chatRatePerMinute: 19,
    active: true,
    featured: true,
  },
  {
    name: "Rohan Mehta",
    slug: "rohan-mehta",
    email: "rohan@jyotish.studio",
    title: "Jyotish Relationship Guide",
    bio: "Rohan specializes in compassionate chart synthesis, partnership patterns, and choosing auspicious moments for change.",
    specialties: "Relationships, Muhurat, Panchang",
    languages: "English, Hindi, Gujarati",
    consultationModes: "Video, Audio, Chat",
    experienceYears: 10,
    verified: true,
    verificationLevel: "verified-panel",
    photoUrl: null,
    chatRatePerMinute: 15,
    active: true,
    featured: false,
  },
];

export async function seedPractitioners() {
  const collection = db.collection("practitioners");
  for (const starter of starterPractitioners) {
    const ref = collection.doc(starter.slug);
    const snap = await ref.get();
    if (!snap.exists) {
      await ref.set({
        ...starter,
        firebaseUid: null,
        online: false,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      await ref.update({
        title: starter.title,
        bio: starter.bio,
        specialties: starter.specialties,
        languages: starter.languages,
        consultationModes: starter.consultationModes,
        experienceYears: starter.experienceYears,
        verified: starter.verified,
        verificationLevel: starter.verificationLevel,
        chatRatePerMinute: starter.chatRatePerMinute,
        featured: starter.featured,
      });
    }

    const rulesSnap = await ref.collection("availabilityRules").limit(1).get();
    if (rulesSnap.empty) {
      const weekdays = starter.featured ? [1, 2, 3, 4, 5] : [2, 3, 4, 5, 6];
      const batch = db.batch();
      for (const weekday of weekdays) {
        batch.set(ref.collection("availabilityRules").doc(), { weekday, startTime: "09:30", endTime: "17:30", active: true });
      }
      await batch.commit();
    }
  }
}

function practitionerFromDoc(doc: FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot): Practitioner {
  const data = doc.data() as Record<string, unknown>;
  return {
    id: doc.id,
    name: data.name as string,
    slug: data.slug as string,
    email: data.email as string,
    title: data.title as string,
    bio: data.bio as string,
    specialties: data.specialties as string,
    languages: data.languages as string,
    consultationModes: data.consultationModes as string,
    experienceYears: data.experienceYears as number,
    verified: data.verified as boolean,
    verificationLevel: data.verificationLevel as string,
    photoUrl: (data.photoUrl as string | null) ?? null,
    online: (data.online as boolean) ?? false,
    chatRatePerMinute: data.chatRatePerMinute as number,
    active: data.active as boolean,
    featured: data.featured as boolean,
    firebaseUid: (data.firebaseUid as string | null) ?? null,
    hasPortalAccess: Boolean(data.firebaseUid),
    lastLoginAt: (data.lastLoginAt as FirebaseFirestore.Timestamp | undefined)?.toDate() ?? null,
    createdAt: (data.createdAt as FirebaseFirestore.Timestamp | undefined)?.toDate() ?? new Date(),
    updatedAt: (data.updatedAt as FirebaseFirestore.Timestamp | undefined)?.toDate() ?? new Date(),
  };
}

export type PractitionerWithSchedule = Practitioner & { rules: AvailabilityRule[]; timeOff: PractitionerTimeOff[] };

export async function getPractitionerDirectory(activeOnly = false): Promise<PractitionerWithSchedule[]> {
  await seedPractitioners();
  const collection = db.collection("practitioners");
  const query = activeOnly ? collection.where("active", "==", true) : collection;
  const snap = await query.orderBy("name", "asc").get();
  if (snap.empty) return [];

  const now = new Date();
  return Promise.all(
    snap.docs.map(async (doc) => {
      const person = practitionerFromDoc(doc);
      const [rulesSnap, timeOffSnap] = await Promise.all([
        doc.ref.collection("availabilityRules").orderBy("weekday", "asc").orderBy("startTime", "asc").get(),
        doc.ref.collection("timeOff").where("endsAt", ">=", now).orderBy("endsAt", "asc").get(),
      ]);
      return {
        ...person,
        rules: rulesSnap.docs.map((r) => ({ id: r.id, practitionerId: doc.id, ...(r.data() as Omit<AvailabilityRule, "id" | "practitionerId">) })),
        timeOff: timeOffSnap.docs.map((t) => {
          const data = t.data();
          return { id: t.id, practitionerId: doc.id, reason: data.reason ?? null, startsAt: (data.startsAt as FirebaseFirestore.Timestamp).toDate(), endsAt: (data.endsAt as FirebaseFirestore.Timestamp).toDate() };
        }),
      };
    }),
  );
}

export function dateInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function civilToUtc(date: string, time: string, timeZone: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const desired = Date.UTC(year, month - 1, day, hour, minute);
  let instant = desired;
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  for (let index = 0; index < 2; index += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(instant)).filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
    const represented = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    instant -= represented - desired;
  }
  return new Date(instant);
}

function minutes(value: string) {
  const [hours, mins] = value.split(":").map(Number);
  return hours * 60 + mins;
}

function timeFromMinutes(value: number) {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

function overlaps(startA: Date, endA: Date, startB: Date, endB: Date) {
  return startA < endB && endA > startB;
}

export type AvailableSlot = {
  practitionerId: string;
  practitionerName: string;
  startsAt: string;
  label: string;
};

type BookingForConflictCheck = { id: string; practitionerId: string | null; status: string; scheduledAt: Date; serviceDuration: number };

export async function getAvailableSlots({ date, duration, practitionerId, excludeBookingId }: { date: string; duration: number; practitionerId?: string; excludeBookingId?: string }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { slots: [] as AvailableSlot[], practitioners: [] as Omit<PractitionerWithSchedule, "rules" | "timeOff">[], timezone: "UTC" };
  const [settings, directory] = await Promise.all([getStudioSettings(), getPractitionerDirectory(true)]);
  const people = practitionerId ? directory.filter((person) => person.id === practitionerId) : directory;
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  const dayStart = civilToUtc(date, "00:00", settings.timezone);
  const dayEnd = civilToUtc(date, "23:59", settings.timezone);

  const bookingsSnap = await db.collection("bookings")
    .where("scheduledAt", ">=", new Date(dayStart.getTime() - 12 * 3600000))
    .where("scheduledAt", "<", new Date(dayEnd.getTime() + 12 * 3600000))
    .get();
  const existingBookings: BookingForConflictCheck[] = bookingsSnap.docs.map((doc) => {
    const data = doc.data();
    return { id: doc.id, practitionerId: data.practitionerId ?? null, status: data.status, scheduledAt: (data.scheduledAt as FirebaseFirestore.Timestamp).toDate(), serviceDuration: data.serviceDuration };
  });

  const slots: AvailableSlot[] = [];
  for (const person of people) {
    const personBookings = existingBookings.filter((booking) => booking.id !== excludeBookingId && booking.practitionerId === person.id && booking.status !== "cancelled");
    const rules = person.rules.filter((rule) => rule.weekday === weekday && rule.active);
    for (const rule of rules) {
      for (let cursor = minutes(rule.startTime); cursor + duration <= minutes(rule.endTime); cursor += 30) {
        const startsAt = civilToUtc(date, timeFromMinutes(cursor), settings.timezone);
        const endsAt = new Date(startsAt.getTime() + duration * 60000);
        if (startsAt.getTime() < Date.now() + settings.bookingLeadMinutes * 60000) continue;
        const blockedByBooking = personBookings.some((booking) => overlaps(startsAt, endsAt, booking.scheduledAt, new Date(booking.scheduledAt.getTime() + booking.serviceDuration * 60000)));
        const blockedByTimeOff = person.timeOff.some((item) => overlaps(startsAt, endsAt, item.startsAt, item.endsAt));
        if (!blockedByBooking && !blockedByTimeOff) {
          slots.push({ practitionerId: person.id, practitionerName: person.name, startsAt: startsAt.toISOString(), label: startsAt.toLocaleTimeString("en", { hour: "numeric", minute: "2-digit", timeZone: settings.timezone }) });
        }
      }
    }
  }
  return { slots: slots.sort((a, b) => a.startsAt.localeCompare(b.startsAt)), practitioners: people.map(({ rules, timeOff, ...person }) => person), timezone: settings.timezone };
}

export async function validateAvailableSlot({ date, duration, practitionerId, startsAt, excludeBookingId }: { date: string; duration: number; practitionerId: string; startsAt: Date; excludeBookingId?: string }) {
  const result = await getAvailableSlots({ date, duration, practitionerId, excludeBookingId });
  return result.slots.find((slot) => slot.practitionerId === practitionerId && slot.startsAt === startsAt.toISOString()) ?? null;
}
