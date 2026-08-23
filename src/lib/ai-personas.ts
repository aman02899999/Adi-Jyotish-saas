import "server-only";

import { unstable_cache } from "next/cache";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firestore";

export class AiPersonaError extends Error {}

export type AiPersona = {
  id: string;
  slug: string;
  name: string;
  title: string;
  avatarUrl: string | null;
  description: string;
  systemPrompt: string;
  sampleQuestions: string[];
  price: number;
  currency: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type AiPersonaDoc = {
  slug: string;
  name: string;
  title: string;
  avatarUrl: string | null;
  description: string;
  systemPrompt: string;
  sampleQuestions: string[];
  price: number;
  currency: string;
  active: boolean;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
};

const collection = db.collection("aiPersonas");

function toSlug(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 80);
}

function toPersona(doc: FirebaseFirestore.DocumentSnapshot): AiPersona {
  const data = doc.data() as AiPersonaDoc;
  return {
    id: doc.id,
    slug: data.slug,
    name: data.name,
    title: data.title,
    avatarUrl: data.avatarUrl ?? null,
    description: data.description,
    systemPrompt: data.systemPrompt,
    sampleQuestions: data.sampleQuestions ?? [],
    price: data.price,
    currency: data.currency,
    active: data.active,
    createdAt: data.createdAt?.toDate() ?? new Date(),
    updatedAt: data.updatedAt?.toDate() ?? new Date(),
  };
}

export async function getAllPersonasAdmin(): Promise<AiPersona[]> {
  const snap = await collection.orderBy("createdAt", "desc").get();
  return snap.docs.map(toPersona);
}

// Same list for every visitor (no auth check) — cached instead of read fresh on every request.
// Falls back to an empty list instead of crashing the page (or the credential-less `next build`
// static-generation pass).
export const getActivePersonas = unstable_cache(
  async () => {
    try {
      const snap = await collection.where("active", "==", true).get();
      return snap.docs.map(toPersona).sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      console.error("getActivePersonas: falling back to empty list —", error);
      return [] as AiPersona[];
    }
  },
  ["active-ai-personas"],
  { tags: ["active-ai-personas"], revalidate: 300 },
);

export async function getPersonaBySlug(slug: string): Promise<AiPersona | null> {
  const doc = await collection.doc(slug).get();
  if (!doc.exists) return null;
  return toPersona(doc);
}

export async function getPersonaById(id: string): Promise<AiPersona | null> {
  const doc = await collection.doc(id).get();
  if (!doc.exists) return null;
  return toPersona(doc);
}

type PersonaInput = {
  name: string;
  title: string;
  avatarUrl: string | null;
  description: string;
  systemPrompt: string;
  sampleQuestions: string[];
  price: number;
  currency: string;
  active: boolean;
};

function validate(input: Partial<PersonaInput>) {
  if (input.name !== undefined && input.name.trim().length < 2) throw new AiPersonaError("Enter the persona's name.");
  if (input.title !== undefined && input.title.trim().length < 2) throw new AiPersonaError("Enter a short title for the persona.");
  if (input.description !== undefined && input.description.trim().length < 10) throw new AiPersonaError("Write a longer description (at least 10 characters).");
  if (input.systemPrompt !== undefined && input.systemPrompt.trim().length < 40) {
    throw new AiPersonaError("The persona instructions need to be detailed enough to guide the AI (at least 40 characters) — describe their voice, expertise, and how to structure an answer.");
  }
  if (input.price !== undefined && (!Number.isFinite(input.price) || input.price < 0)) throw new AiPersonaError("Enter a valid price.");
}

export async function createPersona(input: PersonaInput): Promise<AiPersona> {
  validate(input);
  const base = toSlug(input.name) || "persona";
  let slug = base;
  for (let attempt = 0; (await collection.doc(slug).get()).exists; attempt += 1) {
    slug = `${base}-${attempt + 2}`;
    if (attempt > 20) throw new AiPersonaError("Could not generate a unique URL — try a different name.");
  }

  const doc: Omit<AiPersonaDoc, "createdAt" | "updatedAt"> = {
    slug,
    name: input.name.trim().slice(0, 120),
    title: input.title.trim().slice(0, 160),
    avatarUrl: input.avatarUrl?.trim() || null,
    description: input.description.trim().slice(0, 500),
    systemPrompt: input.systemPrompt.trim().slice(0, 6000),
    sampleQuestions: input.sampleQuestions.map((q) => q.trim()).filter(Boolean).slice(0, 6),
    price: Math.max(0, Math.round(Number(input.price) || 0)),
    currency: input.currency || "INR",
    active: input.active,
  };
  const ref = collection.doc(slug);
  await ref.set({ ...doc, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  return toPersona(await ref.get());
}

export async function updatePersona(id: string, patch: Partial<PersonaInput>): Promise<AiPersona> {
  const ref = collection.doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new AiPersonaError("Persona not found.");
  validate(patch);

  const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (patch.name !== undefined) update.name = patch.name.trim().slice(0, 120);
  if (patch.title !== undefined) update.title = patch.title.trim().slice(0, 160);
  if (patch.avatarUrl !== undefined) update.avatarUrl = patch.avatarUrl?.trim() || null;
  if (patch.description !== undefined) update.description = patch.description.trim().slice(0, 500);
  if (patch.systemPrompt !== undefined) update.systemPrompt = patch.systemPrompt.trim().slice(0, 6000);
  if (patch.sampleQuestions !== undefined) update.sampleQuestions = patch.sampleQuestions.map((q) => q.trim()).filter(Boolean).slice(0, 6);
  if (patch.price !== undefined) update.price = Math.max(0, Math.round(Number(patch.price) || 0));
  if (patch.currency !== undefined) update.currency = patch.currency;
  if (patch.active !== undefined) update.active = patch.active;

  await ref.update(update);
  return toPersona(await ref.get());
}

/** Hard-deletes only if the persona has never been read against (no readings on record) — once
 * real paid readings point at this persona id, deactivate instead so that history stays intact. */
export async function deletePersona(id: string) {
  const ref = collection.doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new AiPersonaError("Persona not found.");

  const readings = await db.collection("aiReadings").where("personaId", "==", id).limit(1).get();
  if (!readings.empty) throw new AiPersonaError("This persona has readings on record — deactivate instead of deleting.");

  await ref.delete();
}
