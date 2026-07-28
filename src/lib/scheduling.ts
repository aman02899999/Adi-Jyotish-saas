import "server-only";

import { and, asc, count, eq, gte, lt } from "drizzle-orm";
import { db } from "@/db";
import { availabilityRules, bookings, practitioners, practitionerTimeOff } from "@/db/schema";
import { getStudioSettings } from "@/lib/studio-settings";

const starterPractitioners = [
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
    active: true,
    featured: false,
  },
];

export async function seedPractitioners() {
  await db.insert(practitioners).values(starterPractitioners).onConflictDoNothing({ target: practitioners.slug });
  for (const starter of starterPractitioners) {
    await db.update(practitioners).set({
      title: starter.title,
      bio: starter.bio,
      specialties: starter.specialties,
      languages: starter.languages,
      consultationModes: starter.consultationModes,
      experienceYears: starter.experienceYears,
      verified: starter.verified,
      verificationLevel: starter.verificationLevel,
      featured: starter.featured,
    }).where(eq(practitioners.slug, starter.slug));
  }
  const rows = await db.select().from(practitioners).orderBy(asc(practitioners.id));
  for (const practitioner of rows) {
    const [existing] = await db.select({ value: count() }).from(availabilityRules).where(eq(availabilityRules.practitionerId, practitioner.id));
    if (Number(existing?.value ?? 0) === 0) {
      const weekdays = practitioner.featured ? [1, 2, 3, 4, 5] : [2, 3, 4, 5, 6];
      await db.insert(availabilityRules).values(weekdays.map((weekday) => ({ practitionerId: practitioner.id, weekday, startTime: "09:30", endTime: "17:30", active: true })));
    }
  }
}

export function dateInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function civilToUtc(date: string, time: string, timeZone: string) {
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
  practitionerId: number;
  practitionerName: string;
  startsAt: string;
  label: string;
};

export async function getPractitionerDirectory(activeOnly = false) {
  await seedPractitioners();
  const people = activeOnly
    ? await db.select().from(practitioners).where(eq(practitioners.active, true)).orderBy(asc(practitioners.name))
    : await db.select().from(practitioners).orderBy(asc(practitioners.name));
  if (!people.length) return [];
  const rules = await db.select().from(availabilityRules).orderBy(asc(availabilityRules.weekday), asc(availabilityRules.startTime));
  const timeOff = await db.select().from(practitionerTimeOff).where(gte(practitionerTimeOff.endsAt, new Date())).orderBy(asc(practitionerTimeOff.startsAt));
  return people.map((person) => ({ ...person, rules: rules.filter((rule) => rule.practitionerId === person.id), timeOff: timeOff.filter((item) => item.practitionerId === person.id) }));
}

export async function getAvailableSlots({ date, duration, practitionerId, excludeBookingId }: { date: string; duration: number; practitionerId?: number; excludeBookingId?: number }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { slots: [] as AvailableSlot[], practitioners: [], timezone: "UTC" };
  const [settings, directory] = await Promise.all([getStudioSettings(), getPractitionerDirectory(true)]);
  const people = practitionerId ? directory.filter((person) => person.id === practitionerId) : directory;
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  const dayStart = civilToUtc(date, "00:00", settings.timezone);
  const dayEnd = civilToUtc(date, "23:59", settings.timezone);
  const existingBookings = await db.select().from(bookings).where(and(gte(bookings.scheduledAt, new Date(dayStart.getTime() - 12 * 3600000)), lt(bookings.scheduledAt, new Date(dayEnd.getTime() + 12 * 3600000))));
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

export async function validateAvailableSlot({ date, duration, practitionerId, startsAt, excludeBookingId }: { date: string; duration: number; practitionerId: number; startsAt: Date; excludeBookingId?: number }) {
  const result = await getAvailableSlots({ date, duration, practitionerId, excludeBookingId });
  return result.slots.find((slot) => slot.practitionerId === practitionerId && slot.startsAt === startsAt.toISOString()) ?? null;
}
