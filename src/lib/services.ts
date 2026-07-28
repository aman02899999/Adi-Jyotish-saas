import { db } from "@/db";
import { services, type NewService } from "@/db/schema";
import { asc, desc, eq } from "drizzle-orm";

const starterServices: NewService[] = [
  {
    title: "Birth Chart Reading",
    slug: "birth-chart-reading",
    category: "Foundations",
    description: "A precise interpretation of your natal chart, planetary strengths, and life themes.",
    price: 49,
    duration: 45,
    icon: "orbit",
    active: true,
    featured: true,
  },
  {
    title: "Daily Horoscope",
    slug: "daily-horoscope",
    category: "Guidance",
    description: "Personal daily guidance calculated from your moon sign, current dasha, and transits.",
    price: 12,
    duration: 15,
    icon: "sun",
    active: true,
    featured: false,
  },
  {
    title: "Panchang Consultation",
    slug: "panchang-consultation",
    category: "Timing",
    description: "Choose an auspicious window for the moments that matter, using authentic Vedic timing.",
    price: 35,
    duration: 30,
    icon: "calendar",
    active: true,
    featured: false,
  },
  {
    title: "Relationship Synastry",
    slug: "relationship-synastry",
    category: "Relationships",
    description: "Understand compatibility, emotional patterns, and shared potential through both charts.",
    price: 69,
    duration: 60,
    icon: "heart",
    active: true,
    featured: true,
  },
  {
    title: "Career & Dharma",
    slug: "career-and-dharma",
    category: "Purpose",
    description: "Align your work with your natural strengths, dharma, and the opportunities ahead.",
    price: 59,
    duration: 50,
    icon: "briefcase",
    active: true,
    featured: false,
  },
];

export function toSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 130);
}

export async function seedServices() {
  await db.insert(services).values(starterServices).onConflictDoNothing({ target: services.slug });
}

export async function getAllServices() {
  await seedServices();
  return db.select().from(services).orderBy(desc(services.featured), asc(services.id));
}

export async function getPublishedServices() {
  await seedServices();
  return db
    .select()
    .from(services)
    .where(eq(services.active, true))
    .orderBy(desc(services.featured), asc(services.id));
}
