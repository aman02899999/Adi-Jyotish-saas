import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { bucket, db } from "@/lib/firestore";
import { genericNotificationEmailHtml, isEmailConfigured, sendEmail } from "@/lib/email";
import { getAiReadingAnswer, getFaceReadingAnswer, getLalKitabReadingAnswer, getPalmReadingAnswer, getPersonaReadingAnswer, getTarotReadingAnswer, getVastuReadingAnswer, isGeminiConfigured } from "@/lib/gemini";
import { getPersonaById } from "@/lib/ai-personas";
import { buildKundliChart, renderKundliReport } from "@/lib/kundli-engine";
import { buildVarshphalChart, renderVarshphalReport } from "@/lib/varshphal";
import { getSiteUrl } from "@/lib/site-url";
import type { TarotCardDraw } from "@/lib/tarot-deck";

export const AI_READING_PRICE = 149;
export const AI_KUNDLI_PRICE = 499;
export const AI_VARSHPHAL_PRICE = 399;
export const AI_PALM_READING_PRICE = 99;
export const AI_PALM_READING_ORIGINAL_PRICE = 495;
export const AI_TAROT_READING_PRICE = 149;
export const AI_FACE_READING_PRICE = 129;
export const AI_VASTU_READING_PRICE = 249;
export const AI_LAL_KITAB_READING_PRICE = 179;
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

/** Saves the answer and returns the updated reading. Throws if generation fails; the reading stays "paid" so it can be retried.
 * The Kundli report is computed by the real chart engine (no AI); every other reading type calls
 * Gemini (palm/face with an uploaded image, tarot with the drawn spread, vastu/lalkitab/question
 * with free-form text). */
export async function generateReadingAnswer(reading: AiReading): Promise<AiReading> {
  if (reading.status === "answered" && reading.answer) return reading;

  const answer = await (async () => {
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

  const ref = collection.doc(reading.id);
  await ref.update({ status: "answered", answer, answeredAt: FieldValue.serverTimestamp() });
  return toReading(await ref.get());
}

const READING_RESUME: Record<string, { label: string; path: string }> = {
  question: { label: "your question reading", path: "/ask" },
  kundli: { label: "your full Kundli report", path: "/kundli" },
  varshphal: { label: "your Varshphal report", path: "/varshphal" },
  palm: { label: "your Palm Reading", path: "/palm-reading" },
  tarot: { label: "your Tarot Reading", path: "/tarot-reading" },
  face: { label: "your Face Reading", path: "/face-reading" },
  vastu: { label: "your Vastu Consultation", path: "/vastu-consultation" },
  lalkitab: { label: "your Lal Kitab Reading", path: "/lal-kitab-reading" },
};

const PENDING_READING_REMINDER_DELAY_MS = 60 * 60 * 1000;
const PENDING_READING_REMINDER_BATCH = 25;

/** A reading left unpaid (client closed the Razorpay modal, or never opened it) otherwise sits in
 * `pending_payment` forever with no follow-up. Run on a schedule (see the housekeeping cron) to
 * nudge the client back once, an hour after they started — long enough to not feel like spam,
 * short enough that the intent is still fresh. `reminderSentAt` is set unconditionally after an
 * attempt (even on a missing/unconfigured email) so a bad record can't be retried every 15
 * minutes forever. */
export async function sendPendingReadingReminders() {
  if (!isEmailConfigured()) return { sent: 0, skipped: true as const };

  const cutoff = Timestamp.fromMillis(Date.now() - PENDING_READING_REMINDER_DELAY_MS);
  const snap = await collection
    .where("status", "==", "pending_payment")
    .where("reminderSentAt", "==", null)
    .where("createdAt", "<", cutoff)
    .limit(PENDING_READING_REMINDER_BATCH)
    .get();

  let sent = 0;
  for (const doc of snap.docs) {
    const reading = toReading(doc);
    // Personas have no fixed path (each admin-created one lives at its own /ai/{slug}), so their
    // resume link is built from the reading's own personaSlug/personaName instead of the static map.
    const resume = reading.readingType === "persona"
      ? (reading.personaSlug ? { label: `your ${reading.personaName ?? "reading"}`, path: `/ai/${reading.personaSlug}` } : null)
      : READING_RESUME[reading.readingType];
    try {
      if (resume) {
        const memberSnap = await db.collection("members").doc(reading.memberId).get();
        const memberData = memberSnap.data() as { name?: string; email?: string } | undefined;
        if (memberData?.email) {
          const result = await sendEmail({
            to: memberData.email,
            subject: `${resume.label} is waiting for you`,
            html: genericNotificationEmailHtml({
              title: "Your reading is one step away",
              name: memberData.name || "there",
              body: `You started ${resume.label} on Adi Jyotish Guru but didn't finish payment. Complete it now to get your full report.`,
              ctaLabel: "Complete my reading",
              ctaUrl: new URL(resume.path, getSiteUrl()).toString(),
            }),
          });
          if (result.sent) sent += 1;
        }
      }
    } catch (error) {
      console.error(`Failed to send pending-reading reminder for ${doc.id}`, error);
    } finally {
      await doc.ref.update({ reminderSentAt: FieldValue.serverTimestamp() });
    }
  }
  return { sent, skipped: false as const };
}

const UNANSWERED_READING_RETRY_BATCH = 25;

/** A reading that's been paid for (or was free) but never got an answer — most commonly because
 * GEMINI_API_KEY wasn't set, or a transient Gemini API failure — otherwise sits stranded forever:
 * nothing retries it automatically, and the member's only way to get their answer is manually
 * clicking "Check again" on a page they may never revisit. Every reading with status "paid" is
 * by definition unanswered (generateReadingAnswer only ever transitions "paid" -> "answered", and
 * never resets it), so no extra filter is needed to find the backlog. Run on the housekeeping
 * schedule so that fixing a misconfiguration actually clears everyone who paid during the outage,
 * instead of leaving them silently stuck. */
export async function retryUnansweredReadings() {
  const snap = await collection.where("status", "==", "paid").limit(UNANSWERED_READING_RETRY_BATCH).get();

  let answered = 0;
  for (const doc of snap.docs) {
    try {
      const result = await generateReadingAnswer(toReading(doc));
      if (result.status === "answered") answered += 1;
    } catch (error) {
      console.error(`Failed to retry AI reading ${doc.id}:`, error);
    }
  }
  return { attempted: snap.size, answered };
}
