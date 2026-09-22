import "server-only";

import { randomUUID } from "node:crypto";

import { query, queryModel, queryModels } from "@/lib/postgres";
import type { TarotCardDraw } from "@/lib/tarot-deck";

/**
 * Data access for AI readings. Pricing constants, the Gemini dispatch, the chart
 * engines and the Storage calls all stay in ai-readings.ts; this file only moves
 * rows, so the two providers cannot drift on money or on wording.
 */

export type AiReadingRow = {
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
  paidViaBypass: boolean;
  paidFromWallet: boolean;
};

/** Everything a caller can supply when creating a reading. Anything left out
 * takes the column default, which matches what the Firestore documents omitted. */
export type AiReadingInsert = {
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
  year?: number | null;
  personaId?: string | null;
  personaSlug?: string | null;
  personaName?: string | null;
  leftPalmImagePath?: string | null;
  rightPalmImagePath?: string | null;
  tarotCards?: TarotCardDraw[] | null;
  faceImagePaths?: string[] | null;
};

const READING_COLUMNS = `
  id, member_id, reading_type, client_name, birth_date, birth_time, birth_place, question,
  left_palm_image_path, right_palm_image_path, tarot_cards, face_image_paths, persona_id,
  persona_slug, persona_name, year::int as year, price, currency, status, razorpay_order_id,
  razorpay_payment_id, answer, answered_at, reminder_sent_at, ai_attempts::int as ai_attempts,
  last_ai_error, created_at, paid_via_bypass, paid_from_wallet`;

/** price is numeric(14,2), which node-postgres returns as a string; without this
 * it reaches debitWallet as a string and the wallet maths concatenates. */
const READING_NUMERIC_COLUMNS = ["price"] as const;

/** The id is always supplied: `ai_readings.id` is a text primary key with no
 * default, because copied rows carry their verbatim Firestore document id. The
 * Firestore SDK generated ids for new documents, so an insert that omits the
 * column fails with 23502 rather than inventing one.
 *
 * tarot_cards and face_image_paths are jsonb. node-postgres parses jsonb on the
 * way out, but needs an explicit string on the way in. */
function insertReadingSql() {
  const columns = [
    "id",
    "member_id", "reading_type", "client_name", "birth_date", "birth_time", "birth_place",
    "question", "price", "currency", "status", "year", "persona_id", "persona_slug",
    "persona_name", "left_palm_image_path", "right_palm_image_path", "tarot_cards", "face_image_paths",
  ];
  const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");
  return `insert into public.ai_readings (${columns.join(", ")})
          values (${placeholders})
          returning ${READING_COLUMNS}`;
}

function insertReadingParams(values: AiReadingInsert, id: string) {
  return [
    id,
    values.memberId,
    values.readingType,
    values.clientName,
    values.birthDate,
    values.birthTime,
    values.birthPlace,
    values.question,
    values.price,
    values.currency,
    values.status,
    values.year ?? null,
    values.personaId ?? null,
    values.personaSlug ?? null,
    values.personaName ?? null,
    values.leftPalmImagePath ?? null,
    values.rightPalmImagePath ?? null,
    values.tarotCards ? JSON.stringify(values.tarotCards) : null,
    values.faceImagePaths ? JSON.stringify(values.faceImagePaths) : null,
  ];
}

/** Palm and face readings reserve their id first, because the upload route needs
 * a reading id to build the Storage path before the row exists; everything else
 * takes a fresh one. */
export async function insertReadingWithIdInSupabase(id: string, values: AiReadingInsert): Promise<AiReadingRow> {
  const row = await queryModel<AiReadingRow>(insertReadingSql(), insertReadingParams(values, id), READING_NUMERIC_COLUMNS);
  if (!row) throw new Error("Failed to create the reading.");
  return row;
}

export async function insertReadingInSupabase(values: AiReadingInsert): Promise<AiReadingRow> {
  return insertReadingWithIdInSupabase(randomUUID(), values);
}

export async function hasQuestionReadingInSupabase(memberId: string): Promise<boolean> {
  const result = await query(
    `select 1 from public.ai_readings where member_id = $1 and reading_type = 'question' limit 1`,
    [memberId],
  );
  return result.rows.length > 0;
}

/** The free reading is once-per-member, and the caller's eligibility check reads
 * outside any transaction — so two concurrent requests can both see "not yet used"
 * and both arrive here. The primary key on member_id is the claim: exactly one
 * insert wins and the other gets zero rows back. Same guarantee Firestore's
 * `create()` gave, without needing a transaction. */
export async function claimFreeReadingInSupabase(memberId: string): Promise<boolean> {
  const result = await query(
    `insert into public.ai_reading_free_claims (id) values ($1) on conflict (id) do nothing`,
    [memberId],
  );
  return result.rowCount === 1;
}

export async function attachRazorpayOrderInSupabase(readingId: string, orderId: string): Promise<void> {
  await query(`update public.ai_readings set razorpay_order_id = $2 where id = $1`, [readingId, orderId]);
}

export async function getReadingByIdInSupabase(readingId: string): Promise<AiReadingRow | null> {
  return queryModel<AiReadingRow>(
    `select ${READING_COLUMNS} from public.ai_readings where id = $1`,
    [readingId],
    READING_NUMERIC_COLUMNS,
  );
}

export async function getReadingsForMemberInSupabase(memberId: string): Promise<AiReadingRow[]> {
  return queryModels<AiReadingRow>(
    `select ${READING_COLUMNS} from public.ai_readings where member_id = $1 order by created_at desc`,
    [memberId],
    READING_NUMERIC_COLUMNS,
  );
}

export type ReadingPaymentOutcome =
  | { kind: "not_found" }
  | { kind: "not_yours" }
  | { kind: "already_settled"; reading: AiReadingRow }
  | { kind: "paid"; reading: AiReadingRow };

/** One conditional update, so "was it still unpaid" and "mark it paid" cannot be
 * separated by a concurrent call. rowCount 0 is resolved afterwards into the three
 * reasons it could have happened, because the Firestore path returned a different
 * value for each and the callers branch on them. */
async function settleReading(
  sql: string,
  params: readonly unknown[],
  options: { checkOwnership: boolean; readingId: string; memberId?: string },
): Promise<ReadingPaymentOutcome> {
  const updated = await queryModel<AiReadingRow>(sql, params, READING_NUMERIC_COLUMNS);
  if (updated) return { kind: "paid", reading: updated };

  const existing = await getReadingByIdInSupabase(options.readingId);
  if (!existing) return { kind: "not_found" };
  if (options.checkOwnership && existing.memberId !== options.memberId) return { kind: "not_yours" };
  return { kind: "already_settled", reading: existing };
}

export async function markReadingPaidInSupabase(readingId: string, razorpayPaymentId: string): Promise<ReadingPaymentOutcome> {
  return settleReading(
    `update public.ai_readings
        set status = 'paid', razorpay_payment_id = $2
      where id = $1 and status = 'pending_payment'
      returning ${READING_COLUMNS}`,
    [readingId, razorpayPaymentId],
    { checkOwnership: false, readingId },
  );
}

export async function markReadingPaidViaBypassInSupabase(readingId: string, memberId: string): Promise<ReadingPaymentOutcome> {
  return settleReading(
    `update public.ai_readings
        set status = 'paid', paid_via_bypass = true
      where id = $1 and member_id = $2 and status = 'pending_payment'
      returning ${READING_COLUMNS}`,
    [readingId, memberId],
    { checkOwnership: true, readingId, memberId },
  );
}

export async function markReadingPaidFromWalletInSupabase(readingId: string, memberId: string): Promise<ReadingPaymentOutcome> {
  return settleReading(
    `update public.ai_readings
        set status = 'paid', paid_from_wallet = true
      where id = $1 and member_id = $2 and status = 'pending_payment'
      returning ${READING_COLUMNS}`,
    [readingId, memberId],
    { checkOwnership: true, readingId, memberId },
  );
}

export type FailedAttemptOutcome = { attempts: number; shouldNotify: boolean };

/** Increments the attempt counter and flips the reading to "failed" in one
 * statement. The Firestore path needed a transaction because a read-then-increment
 * let two concurrent retries write back the same stale value and slip past the
 * cap; `ai_attempts = ai_attempts + 1` cannot. The SET list reads the OLD row and
 * RETURNING reads the NEW one, so `crossed_cap` is true only for the request that
 * actually crossed it — which is what keeps the admin notification to one. */
export async function recordFailedAttemptInSupabase(
  readingId: string,
  message: string,
  maxAttempts: number,
): Promise<FailedAttemptOutcome> {
  const updated = await queryModel<{ attempts: number; crossedCap: boolean }>(
    `update public.ai_readings
        set ai_attempts = ai_attempts + 1,
            last_ai_error = $2,
            status = case when ai_attempts + 1 >= $3 then 'failed' else status end
      where id = $1 and status <> 'failed'
      returning ai_attempts::int as attempts, (status = 'failed') as crossed_cap`,
    [readingId, message, maxAttempts],
    ["attempts"],
  );
  if (updated) return { attempts: updated.attempts, shouldNotify: updated.crossedCap };

  // Zero rows means the reading was already terminal (or is gone). Either way the
  // counter is not advanced and nobody is notified a second time, which is exactly
  // what the Firestore transaction's early return did.
  const existing = await queryModel<{ aiAttempts: number | null }>(
    `select ai_attempts::int as ai_attempts from public.ai_readings where id = $1`,
    [readingId],
    ["aiAttempts"],
  );
  return { attempts: existing?.aiAttempts ?? maxAttempts, shouldNotify: false };
}

export async function saveReadingAnswerInSupabase(readingId: string, answer: string): Promise<AiReadingRow | null> {
  return queryModel<AiReadingRow>(
    `update public.ai_readings
        set status = 'answered', answer = $2, answered_at = now()
      where id = $1
      returning ${READING_COLUMNS}`,
    [readingId, answer],
    READING_NUMERIC_COLUMNS,
  );
}

/** The Firestore path reserved an id from an unwritten document; here the id is
 * just a uuid the caller supplies to insertReadingWithIdInSupabase. */
export function reserveReadingIdInSupabase(): string {
  return randomUUID();
}
