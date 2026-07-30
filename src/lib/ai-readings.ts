import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { aiReadings, type AiReading } from "@/db/schema";
import { getAiReadingAnswer, getKundliReportAnswer, isGeminiConfigured } from "@/lib/gemini";

export const AI_READING_PRICE = 149;
export const AI_KUNDLI_PRICE = 499;
export const AI_READING_CURRENCY = "INR";

export async function createPendingReading({ memberId, clientName, birthDate, birthTime, birthPlace, question }: {
  memberId: number;
  clientName: string;
  birthDate: string;
  birthTime: string;
  birthPlace: string;
  question: string;
}) {
  const [reading] = await db.insert(aiReadings).values({
    memberId,
    clientName,
    birthDate,
    birthTime,
    birthPlace,
    question,
    price: AI_READING_PRICE,
    currency: AI_READING_CURRENCY,
    status: "pending_payment",
  }).returning();
  return reading;
}

export async function createPendingKundliReport({ memberId, clientName, birthDate, birthTime, birthPlace }: {
  memberId: number;
  clientName: string;
  birthDate: string;
  birthTime: string;
  birthPlace: string;
}) {
  const [reading] = await db.insert(aiReadings).values({
    memberId,
    readingType: "kundli",
    clientName,
    birthDate,
    birthTime,
    birthPlace,
    price: AI_KUNDLI_PRICE,
    currency: AI_READING_CURRENCY,
    status: "pending_payment",
  }).returning();
  return reading;
}

export async function attachRazorpayOrder(readingId: number, orderId: string) {
  await db.update(aiReadings).set({ razorpayOrderId: orderId }).where(eq(aiReadings.id, readingId));
}

export async function getReadingById(readingId: number, memberId: number): Promise<AiReading | null> {
  const [reading] = await db.select().from(aiReadings).where(and(eq(aiReadings.id, readingId), eq(aiReadings.memberId, memberId))).limit(1);
  return reading ?? null;
}

export async function getReadingsForMember(memberId: number) {
  return db.select().from(aiReadings).where(eq(aiReadings.memberId, memberId)).orderBy(desc(aiReadings.createdAt));
}

/** Marks a reading paid. Idempotent per razorpayPaymentId so a repeated verify call is safe. */
export async function markReadingPaid({ readingId, razorpayPaymentId }: { readingId: number; razorpayPaymentId: string }) {
  const [reading] = await db.select().from(aiReadings).where(eq(aiReadings.id, readingId)).limit(1);
  if (!reading) return null;
  if (reading.status !== "pending_payment") return reading;
  const [updated] = await db.update(aiReadings)
    .set({ status: "paid", razorpayPaymentId })
    .where(and(eq(aiReadings.id, readingId), eq(aiReadings.status, "pending_payment")))
    .returning();
  return updated ?? reading;
}

/** Calls the AI, saves the answer, and returns the updated reading. Throws if generation fails; the reading stays "paid" so it can be retried. */
export async function generateReadingAnswer(reading: AiReading): Promise<AiReading> {
  if (reading.status === "answered" && reading.answer) return reading;
  if (!isGeminiConfigured()) throw new Error("AI readings are not configured yet. Please try again shortly.");

  const answer = reading.readingType === "kundli"
    ? await getKundliReportAnswer({ name: reading.clientName, birthDate: reading.birthDate, birthTime: reading.birthTime, birthPlace: reading.birthPlace })
    : await getAiReadingAnswer({ name: reading.clientName, birthDate: reading.birthDate, birthTime: reading.birthTime, birthPlace: reading.birthPlace, question: reading.question ?? "" });

  const [updated] = await db.update(aiReadings)
    .set({ status: "answered", answer, answeredAt: new Date() })
    .where(eq(aiReadings.id, reading.id))
    .returning();
  return updated ?? reading;
}
