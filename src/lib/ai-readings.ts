import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { bucket, db } from "@/lib/firestore";
import { getAiReadingAnswer, getPalmReadingAnswer, isGeminiConfigured } from "@/lib/gemini";
import { buildKundliChart, renderKundliReport } from "@/lib/kundli-engine";

export const AI_READING_PRICE = 149;
export const AI_KUNDLI_PRICE = 499;
export const AI_PALM_READING_PRICE = 99;
export const AI_PALM_READING_ORIGINAL_PRICE = 495;
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
  leftPalmImagePath: string | null;
  rightPalmImagePath: string | null;
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
  leftPalmImagePath?: string | null;
  rightPalmImagePath?: string | null;
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
    leftPalmImagePath: data.leftPalmImagePath ?? null,
    rightPalmImagePath: data.rightPalmImagePath ?? null,
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

export class FreeReadingAlreadyUsedError extends Error {}
const freeReadingClaims = db.collection("aiReadingFreeClaims");

function isAlreadyExists(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code: unknown }).code === 6);
}

export async function createFreeReading({ memberId, clientName, birthDate, birthTime, birthPlace, question }: {
  memberId: string;
  clientName: string;
  birthDate: string;
  birthTime: string;
  birthPlace: string;
  question: string;
}) {
  // isEligibleForFreeReading (the caller's check) reads outside any transaction, so two concurrent
  // requests (double submit, duplicate tab) could both see "not yet used" and both land here.
  // create() atomically fails if this doc already exists, so only the first actually gets through.
  try {
    await freeReadingClaims.doc(memberId).create({ createdAt: FieldValue.serverTimestamp() });
  } catch (error) {
    if (isAlreadyExists(error)) throw new FreeReadingAlreadyUsedError("Your free reading has already been used.");
    throw error;
  }

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

/** Palm images are uploaded to a private Storage bucket (never a public URL) and only ever read
 * back server-side via the Admin SDK — see downloadPalmImage below — to hand to Gemini. Path is
 * scoped under the member's own id so a leaked reading id alone can't be used to guess another
 * member's image path. */
export async function uploadPalmImage({ memberId, readingId, side, buffer, mimeType }: {
  memberId: string;
  readingId: string;
  side: "left" | "right";
  buffer: Buffer;
  mimeType: string;
}) {
  const extension = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
  const path = `palm-readings/${memberId}/${readingId}/${side}.${extension}`;
  await bucket().file(path).save(buffer, { metadata: { contentType: mimeType } });
  return path;
}

async function downloadPalmImage(path: string): Promise<{ base64: string; mimeType: string }> {
  const file = bucket().file(path);
  const [buffer] = await file.download();
  const [metadata] = await file.getMetadata();
  return { base64: buffer.toString("base64"), mimeType: metadata.contentType || "image/jpeg" };
}

/** Reserves a Firestore doc id before the doc is written — the palm-reading upload route needs a
 * reading id to build the Storage path (palm-readings/{memberId}/{readingId}/...) for the two
 * images it's about to upload, before there's a reading doc to attach those paths to. */
export function reservePalmReadingId() {
  return collection.doc().id;
}

export async function createPendingPalmReading({ readingId, memberId, clientName, leftPalmImagePath, rightPalmImagePath }: {
  readingId: string;
  memberId: string;
  clientName: string;
  leftPalmImagePath: string;
  rightPalmImagePath: string;
}) {
  const ref = collection.doc(readingId);
  await ref.set({
    memberId,
    readingType: "palm",
    clientName,
    birthDate: "",
    birthTime: "",
    birthPlace: "",
    question: null,
    leftPalmImagePath,
    rightPalmImagePath,
    price: AI_PALM_READING_PRICE,
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
 * The Kundli report is computed by the real chart engine (no AI); the free-form question and palm
 * reading paths call Gemini (the latter with the two uploaded palm images as vision input). */
export async function generateReadingAnswer(reading: AiReading): Promise<AiReading> {
  if (reading.status === "answered" && reading.answer) return reading;

  const answer = await (async () => {
    if (reading.readingType === "kundli") {
      return renderKundliReport(buildKundliChart({ name: reading.clientName, birthDate: reading.birthDate, birthTime: reading.birthTime, birthPlace: reading.birthPlace }));
    }
    if (!isGeminiConfigured()) throw new Error("Live readings are not configured yet. Please try again shortly.");
    if (reading.readingType === "palm") {
      if (!reading.leftPalmImagePath || !reading.rightPalmImagePath) throw new Error("Palm images are missing for this reading.");
      const [leftPalmImage, rightPalmImage] = await Promise.all([
        downloadPalmImage(reading.leftPalmImagePath),
        downloadPalmImage(reading.rightPalmImagePath),
      ]);
      return getPalmReadingAnswer({ name: reading.clientName, leftPalmImage, rightPalmImage });
    }
    return getAiReadingAnswer({ name: reading.clientName, birthDate: reading.birthDate, birthTime: reading.birthTime, birthPlace: reading.birthPlace, question: reading.question ?? "" });
  })();

  const ref = collection.doc(reading.id);
  await ref.update({ status: "answered", answer, answeredAt: FieldValue.serverTimestamp() });
  return toReading(await ref.get());
}
