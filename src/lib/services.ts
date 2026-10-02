import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firestore";
import { isSupabaseCutoverActive } from "@/lib/supabase-config";
import {
  getAllServicesFromSupabase,
  getPublishedServicesFromSupabase,
  seedServiceInSupabase,
} from "@/lib/services-supabase";

export type Service = {
  id: string;
  title: string;
  slug: string;
  category: string;
  description: string;
  price: number;
  duration: number;
  icon: string;
  active: boolean;
  featured: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type NewService = Omit<Service, "id" | "createdAt" | "updatedAt">;

export const starterServices: readonly NewService[] = [
  {
    title: "Birth Chart Reading",
    slug: "birth-chart-reading",
    category: "Foundations",
    description: "A precise interpretation of your natal chart, planetary strengths, and life themes.",
    price: 1499,
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
    price: 299,
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
    price: 799,
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
    price: 2499,
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
    price: 1999,
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

function fromDoc(doc: FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot): Service {
  const data = doc.data() as Omit<Service, "id" | "createdAt" | "updatedAt"> & {
    createdAt?: FirebaseFirestore.Timestamp;
    updatedAt?: FirebaseFirestore.Timestamp;
  };
  return {
    ...data,
    id: doc.id,
    createdAt: data.createdAt?.toDate() ?? new Date(),
    updatedAt: data.updatedAt?.toDate() ?? new Date(),
  };
}

/** Services collection is keyed by slug (stable, human-readable, matches the old unique-slug
 * constraint) rather than an auto-generated ID.
 *
 * Starter services are written once, into an empty catalogue, and never again. This used to run
 * before every catalogue read and re-create any missing starter service. That undid an admin's
 * delete on the next page view, and it cost one Firestore read per starter service on every
 * homepage view. A marker document records that seeding happened, and each server instance checks
 * it only once. */
let seeding: Promise<void> | null = null;

export function seedServices(): Promise<void> {
  seeding ??= seedServicesOnce().catch((error) => {
    // Not remembered, so the next request tries again.
    seeding = null;
    throw error;
  });
  return seeding;
}

async function seedServicesOnce() {
  if (isSupabaseCutoverActive()) {
    for (const service of starterServices) await seedServiceInSupabase(service);
    return;
  }
  const marker = db.collection("siteContent").doc("services-seeded");
  if ((await marker.get()).exists) return;
  const collection = db.collection("services");
  // A catalogue that already has services, including one from before this marker existed, is
  // the admin's; only an empty one gets the starter set.
  if ((await collection.limit(1).get()).empty) {
    const batch = db.batch();
    for (const service of starterServices) {
      batch.set(collection.doc(service.slug), { ...service, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    }
    await batch.commit();
  }
  await marker.set({ seededAt: FieldValue.serverTimestamp() });
}

function seedDefaults() {
  return starterServices.map((service) => ({
    ...service,
    id: service.slug,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
}

export async function getAllServices(): Promise<Service[]> {
  try {
    await seedServices();
    if (isSupabaseCutoverActive()) return await getAllServicesFromSupabase();
    const snap = await db.collection("services").orderBy("featured", "desc").orderBy("title", "asc").get();
    return snap.docs.map(fromDoc);
  } catch (error) {
    // Public catalogue pages must not 500 because Firebase is unavailable, misconfigured,
    // or temporarily unreachable. Seeding writes are also intentionally idempotent, so the
    // fallback below is safe for every public reader.
    console.warn("getAllServices: Firebase unavailable; returning seed defaults.", error);
    return seedDefaults();
  }
}

export async function getPublishedServices(): Promise<Service[]> {
  try {
    await seedServices();
    if (isSupabaseCutoverActive()) return await getPublishedServicesFromSupabase();
    const snap = await db.collection("services").where("active", "==", true).orderBy("featured", "desc").orderBy("title", "asc").get();
    return snap.docs.map(fromDoc);
  } catch (error) {
    console.warn("getPublishedServices: Firebase unavailable; returning starter services.", error);
    return seedDefaults();
  }
}
