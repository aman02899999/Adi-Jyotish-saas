import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { bucket, db } from "@/lib/firestore";
import { getAiReadingAnswer, getFaceReadingAnswer, getLalKitabReadingAnswer, getPalmReadingAnswer, getPersonaReadingAnswer, getTarotReadingAnswer, getVastuReadingAnswer, isGeminiConfigured } from "@/lib/gemini";
import { getPersonaById } from "@/lib/ai-personas";
import { getAdminIdsWithPermission } from "@/lib/admin-roles";
import { notifyAdmins } from "@/lib/notifications";
import { buildKundliChart, renderKundliReport } from "@/lib/kundli-engine";
import { buildVarshphalChart, renderVarshphalReport } from "@/lib/varshphal";
import type { TarotCardDraw } from "@/lib/tarot-deck";

// Every AI-persona reading (Gemini-backed: Ask Live, Palm, Tarot, Face, Vastu, Lal Kitab) is priced
// on a fixed ₹99–₹999 ladder, ranked by input/output complexity — text-only and single-question
// first, multi-image and multi-section readings last. Kundli/Varshphal are deliberately NOT on this
// ladder: they're computed by the deterministic chart engine (kundli-engine.ts/varshphal.ts), not a
// Gemini persona, so they don't share this "AI practitioner" pricing policy.
export const AI_READING_PRICE = 99; // Ask Live — text-only, single question, fastest turnaround
export const AI_KUNDLI_PRICE = 499;
export const AI_VARSHPHAL_PRICE = 399;
export const AI_PALM_READING_PRICE = 349; // two mandatory photos, deepest multi-section analysis
export const AI_PALM_READING_ORIGINAL_PRICE = 999; // discount anchor, capped at the ₹999 ceiling
export const AI_TAROT_READING_PRICE = 149; // text-only, structured 3-card spread
export const AI_FACE_READING_PRICE = 299; // 1-5 photos, multi-section physiognomy report
export const AI_VASTU_READING_PRICE = 249; // text-only, longest input + 5-section remedy plan
export const AI_LAL_KITAB_READING_PRICE = 179; // text-only, birth details + remedies
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
  tarotCards: TarotCardDraw[] | null;
  faceImagePaths: string[] | null;
  personaId: string | null;
  personaSlug: string | null;
  personaName: string | null;
  year: number | null;
  price: number;
  currency: string;
  status: string;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  answer: string | null;
  answeredAt: Date | null;
  reminderSentAt: Date | null;
  aiAttempts: number;
  lastAiError: string | null;
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
  tarotCards?: TarotCardDraw[] | null;
  faceImagePaths?: string[] | null;
  personaId?: string | null;
  personaSlug?: string | null;
  personaName?: string | null;
  year?: number | null;
  price: number;
  currency: string;
  status: string;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  answer: string | null;
  answeredAt: FirebaseFirestore.Timestamp | null;
  reminderSentAt?: FirebaseFirestore.Timestamp | null;
  aiAttempts?: number;
  lastAiError?: string | null;
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
    tarotCards: data.tarotCards ?? null,
    faceImagePaths: data.faceImagePaths ?? null,
    personaId: data.personaId ?? null,
    personaSlug: data.personaSlug ?? null,
    personaName: data.personaName ?? null,
    year: data.year ?? null,
    price: data.price,
    currency: data.currency,
    status: data.status,
    razorpayOrderId: data.razorpayOrderId ?? null,
    razorpayPaymentId: data.razorpayPaymentId ?? null,
    answer: data.answer ?? null,
    answeredAt: data.answeredAt ? data.answeredAt.toDate() : null,
    reminderSentAt: data.reminderSentAt ? data.reminderSentAt.toDate() : null,
    aiAttempts: data.aiAttempts ?? 0,
    lastAiError: data.lastAiError ?? null,
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
    reminderSentAt: null,
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

export async function createFreeReading({ memberId, clientName, birthDate, birthTime, birthPlace, question, persona }: {
  memberId: string;
  clientName: string;
  birthDate: string;
  birthTime: string;
  birthPlace: string;
  question: string;
  persona?: { id: string; slug: string; name: string };
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
    // Tagging this correctly (rather than always "question") matters beyond display: a later
    // retry (see the [id]/retry route) re-reads this doc and dispatches on readingType — a
    // persona reading mislabeled "question" would silently answer as Shree Santram Shashtri
    // instead of the persona the member actually asked.
    readingType: persona ? "persona" : "question",
    clientName,
    birthDate,
    birthTime,
    birthPlace,
    question,
    personaId: persona?.id ?? null,
    personaSlug: persona?.slug ?? null,
    personaName: persona?.name ?? null,
    price: 0,
    currency: AI_READING_CURRENCY,
    status: "paid",
    razorpayOrderId: null,
    razorpayPaymentId: null,
    answer: null,
    answeredAt: null,
    reminderSentAt: null,
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
    reminderSentAt: null,
    createdAt: FieldValue.serverTimestamp(),
  });
  return toReading(await ref.get());
}

export async function createPendingVarshphalReading({ memberId, clientName, birthDate, birthTime, birthPlace, year }: {
  memberId: string;
  clientName: string;
  birthDate: string;
  birthTime: string;
  birthPlace: string;
  year: number;
}) {
  const ref = await collection.add({
    memberId,
    readingType: "varshphal",
    clientName,
    birthDate,
    birthTime,
    birthPlace,
    question: null,
    year,
    price: AI_VARSHPHAL_PRICE,
    currency: AI_READING_CURRENCY,
    status: "pending_payment",
    razorpayOrderId: null,
    razorpayPaymentId: null,
    answer: null,
    answeredAt: null,
    reminderSentAt: null,
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

/** Same private-bucket, server-only-read pattern as uploadPalmImage/downloadPalmImage above, for
 * the 1-5 face photos the face-reading route uploads (different angles/expressions of the same
 * person) — index keeps each photo's path unique within the reading. */
export async function uploadFaceImage({ memberId, readingId, index, buffer, mimeType }: {
  memberId: string;
  readingId: string;
  index: number;
  buffer: Buffer;
  mimeType: string;
}) {
  const extension = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
  const path = `face-readings/${memberId}/${readingId}/face-${index}.${extension}`;
  await bucket().file(path).save(buffer, { metadata: { contentType: mimeType } });
  return path;
}

async function downloadFaceImages(paths: string[]): Promise<{ base64: string; mimeType: string }[]> {
  return Promise.all(paths.map(async (path) => {
    const file = bucket().file(path);
    const [buffer] = await file.download();
    const [metadata] = await file.getMetadata();
    return { base64: buffer.toString("base64"), mimeType: metadata.contentType || "image/jpeg" };
  }));
}

/** Reserves a Firestore doc id before the doc is written — the palm/face-reading upload routes
 * need a reading id to build the Storage path (e.g. palm-readings/{memberId}/{readingId}/...) for
 * the image(s) they're about to upload, before there's a reading doc to attach those paths to. */
export function reserveReadingId() {
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
    reminderSentAt: null,
    createdAt: FieldValue.serverTimestamp(),
  });
  return toReading(await ref.get());
}

export async function createPendingTarotReading({ memberId, clientName, question, cards }: {
  memberId: string;
  clientName: string;
  question: string;
  cards: TarotCardDraw[];
}) {
  const ref = await collection.add({
    memberId,
    readingType: "tarot",
    clientName,
    birthDate: "",
    birthTime: "",
    birthPlace: "",
    question,
    tarotCards: cards,
    price: AI_TAROT_READING_PRICE,
    currency: AI_READING_CURRENCY,
    status: "pending_payment",
    razorpayOrderId: null,
    razorpayPaymentId: null,
    answer: null,
    answeredAt: null,
    reminderSentAt: null,
    createdAt: FieldValue.serverTimestamp(),
  });
  return toReading(await ref.get());
}

export async function createPendingFaceReading({ readingId, memberId, clientName, faceImagePaths, question }: {
  readingId: string;
  memberId: string;
  clientName: string;
  faceImagePaths: string[];
  question: string;
}) {
  const ref = collection.doc(readingId);
  await ref.set({
    memberId,
    readingType: "face",
    clientName,
    birthDate: "",
    birthTime: "",
    birthPlace: "",
    question: question || null,
    faceImagePaths,
    price: AI_FACE_READING_PRICE,
    currency: AI_READING_CURRENCY,
    status: "pending_payment",
    razorpayOrderId: null,
    razorpayPaymentId: null,
    answer: null,
    answeredAt: null,
    reminderSentAt: null,
    createdAt: FieldValue.serverTimestamp(),
  });
  return toReading(await ref.get());
}

export async function createPendingVastuReading({ memberId, clientName, question }: {
  memberId: string;
  clientName: string;
  question: string;
}) {
  const ref = await collection.add({
    memberId,
    readingType: "vastu",
    clientName,
    birthDate: "",
    birthTime: "",
    birthPlace: "",
    question,
    price: AI_VASTU_READING_PRICE,
    currency: AI_READING_CURRENCY,
    status: "pending_payment",
    razorpayOrderId: null,
    razorpayPaymentId: null,
    answer: null,
    answeredAt: null,
    reminderSentAt: null,
    createdAt: FieldValue.serverTimestamp(),
  });
  return toReading(await ref.get());
}

export async function createPendingLalKitabReading({ memberId, clientName, birthDate, birthTime, birthPlace, question }: {
  memberId: string;
  clientName: string;
  birthDate: string;
  birthTime: string;
  birthPlace: string;
  question: string;
}) {
  const ref = await collection.add({
    memberId,
    readingType: "lalkitab",
    clientName,
    birthDate,
    birthTime,
    birthPlace,
    question,
    price: AI_LAL_KITAB_READING_PRICE,
    currency: AI_READING_CURRENCY,
    status: "pending_payment",
    razorpayOrderId: null,
    razorpayPaymentId: null,
    answer: null,
    answeredAt: null,
    reminderSentAt: null,
    createdAt: FieldValue.serverTimestamp(),
  });
  return toReading(await ref.get());
}

export async function createPendingPersonaReading({ memberId, clientName, question, personaId, personaSlug, personaName, price }: {
  memberId: string;
  clientName: string;
  question: string;
  personaId: string;
  personaSlug: string;
  personaName: string;
  price: number;
}) {
  const ref = await collection.add({
    memberId,
    readingType: "persona",
    clientName,
    birthDate: "",
    birthTime: "",
    birthPlace: "",
    question,
    personaId,
    personaSlug,
    personaName,
    price,
    currency: AI_READING_CURRENCY,
    // A price-0 persona has no payment step, so there's nothing to be "pending" on — starting it
    // at "paid" (like createFreeReading does) matters beyond display: the retry route rejects
    // "pending_payment" readings with "This reading has not been paid for yet", which would
    // wrongly block a member from retrying a free reading that failed to generate the first time.
    status: price === 0 ? "paid" : "pending_payment",
    razorpayOrderId: null,
    razorpayPaymentId: null,
    answer: null,
    answeredAt: null,
    reminderSentAt: null,
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

const MAX_AI_ATTEMPTS = 3;
const PERMANENT_FAILURE_MESSAGE = "This reading could not be generated after several attempts. Our team has been notified — please contact support for a refund or a manually prepared reading.";

/** A paid-but-permanently-broken reading (bad image, Gemini quota, whatever) used to sit in "paid"
 * forever and get a fresh Gemini call every single time the 15-minute housekeeping cron's
 * retryUnansweredReadings() swept past it — real, uncapped, recurring API spend for a reading that
 * was never going to succeed. aiAttempts now caps that at MAX_AI_ATTEMPTS: past the cap the reading
 * moves to a terminal "failed" status (which the cron's `status == "paid"` query no longer
 * matches, so it stops being picked up at all) and an admin is notified once instead of the cron
 * quietly retrying it forever.
 *
 * Runs as a Firestore transaction rather than a plain read-then-write: the cron sweep, a member's
 * manual retry, and the post-payment verify route can all call this for the same reading at
 * nearly the same time, and a non-transactional increment let concurrent calls read the same
 * stale aiAttempts and both write back the same value — silently letting a reading exceed
 * MAX_AI_ATTEMPTS. The transaction also checks the live status (not the possibly-stale `reading`
 * argument) so a reading that another concurrent call already flipped to "failed" is left alone
 * instead of notifying admins a second time. */
async function recordFailedAttempt(reading: AiReading, error: unknown) {
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 500);
  const ref = collection.doc(reading.id);

  const { attempts, shouldNotify } = await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    const data = snap.data() as AiReadingDoc | undefined;
    if (data?.status === "failed") return { attempts: data.aiAttempts ?? MAX_AI_ATTEMPTS, shouldNotify: false };

    const next = (data?.aiAttempts ?? 0) + 1;
    const crossesCap = next >= MAX_AI_ATTEMPTS;
    transaction.update(ref, crossesCap ? { status: "failed", aiAttempts: next, lastAiError: message } : { aiAttempts: next, lastAiError: message });
    return { attempts: next, shouldNotify: crossesCap };
  });

  if (!shouldNotify) return;
  const adminIds = await getAdminIdsWithPermission("insights");
  await notifyAdmins(adminIds, {
    type: "ai_reading_failed",
    title: `AI reading permanently failed: ${reading.readingType}`,
    body: `${reading.clientName}'s ${reading.readingType} reading failed ${attempts} times and stopped retrying. Last error: ${message}`,
    link: "/admin/insights",
  }).catch((notifyError) => console.error("Failed to notify admins of a permanently failed AI reading", notifyError));
}

/** Saves the answer and returns the updated reading. Throws if generation fails; the reading stays
 * "paid" (and eligible for one more attempt) until it hits MAX_AI_ATTEMPTS, at which point it
 * becomes permanently "failed" and stops being retried automatically or manually.
 * The Kundli report is computed by the real chart engine (no AI); every other reading type calls
 * Gemini (palm/face with an uploaded image, tarot with the drawn spread, vastu/lalkitab/question
 * with free-form text). */
export async function generateReadingAnswer(reading: AiReading): Promise<AiReading> {
  if (reading.status === "answered" && reading.answer) return reading;
  if (reading.status === "failed") throw new Error(PERMANENT_FAILURE_MESSAGE);

  let answer: string;
  try {
    answer = await (async () => {
      if (reading.readingType === "kundli") {
        return renderKundliReport(buildKundliChart({ name: reading.clientName, birthDate: reading.birthDate, birthTime: reading.birthTime, birthPlace: reading.birthPlace }));
      }
      if (reading.readingType === "varshphal") {
        if (!reading.year) throw new Error("This reading is missing its target year.");
        const chart = buildVarshphalChart({ birthDate: reading.birthDate, birthTime: reading.birthTime, birthPlace: reading.birthPlace, year: reading.year });
        return renderVarshphalReport(chart, reading.clientName);
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
      if (reading.readingType === "tarot") {
        if (!reading.tarotCards || reading.tarotCards.length === 0) throw new Error("Tarot cards are missing for this reading.");
        return getTarotReadingAnswer({ name: reading.clientName, question: reading.question ?? "", cards: reading.tarotCards });
      }
      if (reading.readingType === "face") {
        if (!reading.faceImagePaths || reading.faceImagePaths.length === 0) throw new Error("Face photo is missing for this reading.");
        const faceImages = await downloadFaceImages(reading.faceImagePaths);
        return getFaceReadingAnswer({ name: reading.clientName, question: reading.question ?? "", faceImages });
      }
      if (reading.readingType === "vastu") {
        return getVastuReadingAnswer({ name: reading.clientName, question: reading.question ?? "" });
      }
      if (reading.readingType === "lalkitab") {
        return getLalKitabReadingAnswer({ name: reading.clientName, birthDate: reading.birthDate, birthTime: reading.birthTime, birthPlace: reading.birthPlace, question: reading.question ?? "" });
      }
      if (reading.readingType === "persona") {
        if (!reading.personaId) throw new Error("This reading is missing its persona.");
        const persona = await getPersonaById(reading.personaId);
        if (!persona) throw new Error("This persona is no longer available.");
        return getPersonaReadingAnswer({ systemPrompt: persona.systemPrompt, name: reading.clientName, question: reading.question ?? "" });
      }
      return getAiReadingAnswer({ name: reading.clientName, birthDate: reading.birthDate, birthTime: reading.birthTime, birthPlace: reading.birthPlace, question: reading.question ?? "" });
    })();
  } catch (error) {
    await recordFailedAttempt(reading, error);
    throw error;
  }

  const ref = collection.doc(reading.id);
  await ref.update({ status: "answered", answer, answeredAt: FieldValue.serverTimestamp() });
  return toReading(await ref.get());
}
