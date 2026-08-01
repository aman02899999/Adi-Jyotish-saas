import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firestore";
import { getAiReadingAnswer, isGeminiConfigured } from "@/lib/gemini";
import { buildKundliChart, renderKundliReport } from "@/lib/kundli-engine";

export const AI_READING_PRICE = 149;
export const AI_KUNDLI_PRICE = 499;
export const AI_READING_CURRENCY = "INR";

export type AiReading = {
  id: string;
  memberId: string;
  readingType: string;
  clientName: string;
  birthDate: string;
  birthTime: string;
  birthPlace: string;
  question: string | null;
  price: number;
  currency: string;
  status: string;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  answer: string | null;
  answeredAt: Date | null;
  createdAt: Date;
};

type AiReadingDoc = {
  memberId: string;
  readingType: string;
  clientName: string;
  birthDate: string;
  birthTime: string;
  birthPlace: string;
  question: string | null;
  price: number;
  currency: string;
  status: string;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  answer: string | null;
  answeredAt: FirebaseFirestore.Timestamp | null;
  createdAt: FirebaseFirestore.Timestamp;
};

const collection = db.collection("aiReadings");

function toReading(doc: FirebaseFirestore.DocumentSnapshot): AiReading {
  const data = doc.data() as AiReadingDoc;
  return {
    id: doc.id,
    memberId: data.memberId,
    readingType: data.readingType,
    clientName: data.clientName,
    birthDate: data.birthDate,
    birthTime: data.birthTime,
    birthPlace: data.birthPlace,
    question: data.question ?? null,
    price: data.price,
    currency: data.currency,
    status: data.status,
    razorpayOrderId: data.razorpayOrderId ?? null,
    razorpayPaymentId: data.razorpayPaymentId ?? null,
    answer: data.answer ?? null,
    answeredAt: data.answeredAt ? data.answeredAt.toDate() : null,
    createdAt: data.createdAt?.toDate() ?? new Date(),
  };
}

export async function createPendingReading({ memberId, clientName, birthDate, birthTime, birthPlace, question }: {
  memberId: string;
  clientName: string;
  birthDate: string;
  birthTime: string;
  birthPlace: string;
  question: string;
}) {
  const ref = await collection.add({
    memberId,
    readingType: "question",
    clientName,
    birthDate,
    birthTime,
    birthPlace,
    question,
    price: AI_READING_PRICE,
    currency: AI_READING_CURRENCY,
    status: "pending_payment",
    razorpayOrderId: null,
    razorpayPaymentId: null,
    answer: null,
    answeredAt: null,
    createdAt: FieldValue.serverTimestamp(),
  });
  return toReading(await ref.get());
}

/** A member's very first question-type reading is free. Checked (and consumed) at creation time, so a second attempt is never free even if the first is still pending. */
export async function isEligibleForFreeReading(memberId: string) {
  const snap = await collection.where("memberId", "==", memberId).where("readingType", "==", "question").limit(1).get();
  return snap.empty;
}

export async function createFreeReading({ memberId, clientName, birthDate, birthTime, birthPlace, question }: {
  memberId: string;
  clientName: string;
  birthDate: string;
  birthTime: string;
  birthPlace: string;
  question: string;
}) {
  const ref = await collection.add({
    memberId,
    readingType: "question",
    clientName,
    birthDate,
    birthTime,
    birthPlace,
    question,
    price: 0,
    currency: AI_READING_CURRENCY,
    status: "paid",
    razorpayOrderId: null,
    razorpayPaymentId: null,
    answer: null,
    answeredAt: null,
    createdAt: FieldValue.serverTimestamp(),
  });
  return toReading(await ref.get());
}

export async function createPendingKundliReport({ memberId, clientName, birthDate, birthTime, birthPlace }: {
  memberId: string;
  clientName: string;
  birthDate: string;
  birthTime: string;
  birthPlace: string;
}) {
  const ref = await collection.add({
    memberId,
    readingType: "kundli",
    clientName,
    birthDate,
    birthTime,
    birthPlace,
    question: null,
    price: AI_KUNDLI_PRICE,
    currency: AI_READING_CURRENCY,
    status: "pending_payment",
    razorpayOrderId: null,
    razorpayPaymentId: null,
    answer: null,
    answeredAt: null,
    createdAt: FieldValue.serverTimestamp(),
  });
  return toReading(await ref.get());
}

export async function attachRazorpayOrder(readingId: string, orderId: string) {
  await collection.doc(readingId).update({ razorpayOrderId: orderId });
}

export async function getReadingById(readingId: string, memberId: string): Promise<AiReading | null> {
  const snap = await collection.doc(readingId).get();
  if (!snap.exists) return null;
  const reading = toReading(snap);
  return reading.memberId === memberId ? reading : null;
}

export async function getReadingsForMember(memberId: string) {
  const snap = await collection.where("memberId", "==", memberId).orderBy("createdAt", "desc").get();
  return snap.docs.map(toReading);
}

/** Marks a reading paid. Idempotent per razorpayPaymentId so a repeated verify call is safe. */
export async function markReadingPaid({ readingId, razorpayPaymentId }: { readingId: string; razorpayPaymentId: string }) {
  const ref = collection.doc(readingId);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const reading = toReading(snap);
  if (reading.status !== "pending_payment") return reading;
  await ref.update({ status: "paid", razorpayPaymentId });
  return toReading(await ref.get());
}

/** Saves the answer and returns the updated reading. Throws if generation fails; the reading stays "paid" so it can be retried.
 * The Kundli report is computed by the real chart engine (no AI); only the free-form question path calls Gemini. */
export async function generateReadingAnswer(reading: AiReading): Promise<AiReading> {
  if (reading.status === "answered" && reading.answer) return reading;

  const answer = reading.readingType === "kundli"
    ? renderKundliReport(buildKundliChart({ name: reading.clientName, birthDate: reading.birthDate, birthTime: reading.birthTime, birthPlace: reading.birthPlace }))
    : await (async () => {
        if (!isGeminiConfigured()) throw new Error("Live readings are not configured yet. Please try again shortly.");
        return getAiReadingAnswer({ name: reading.clientName, birthDate: reading.birthDate, birthTime: reading.birthTime, birthPlace: reading.birthPlace, question: reading.question ?? "" });
      })();

  const ref = collection.doc(reading.id);
  await ref.update({ status: "answered", answer, answeredAt: FieldValue.serverTimestamp() });
  return toReading(await ref.get());
}
