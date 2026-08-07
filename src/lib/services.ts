import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firestore";

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

const starterServices: NewService[] = [
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
 * constraint) rather than an auto-generated ID. */
export async function seedServices() {
  const collection = db.collection("services");
  for (const service of starterServices) {
    const ref = collection.doc(service.slug);
    const snap = await ref.get();
    if (!snap.exists) {
      await ref.set({ ...service, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    }
  }
}

export async function getAllServices(): Promise<Service[]> {
  await seedServices();
  const snap = await db.collection("services").orderBy("featured", "desc").orderBy("title", "asc").get();
  return snap.docs.map(fromDoc);
}

export async function getPublishedServices(): Promise<Service[]> {
  await seedServices();
  const snap = await db.collection("services").where("active", "==", true).orderBy("featured", "desc").orderBy("title", "asc").get();
  return snap.docs.map(fromDoc);
}
