import "server-only";

import { query, queryModel, queryModels, withTransaction } from "@/lib/postgres";
import { rowToCamel } from "@/lib/postgres-mapping";
import { InsufficientBalanceError, WalletHoldNotFoundError } from "@/lib/wallet-errors";

/**
 * Postgres implementation of the wallet ledger.
 *
 * THE IMPORTANT DIFFERENCE. Firestore transactions retry automatically when a
 * document they read changes underneath them, which is what made the original
 * read-balance/write-entry/write-balance sequence safe under concurrency. Postgres
 * gives no such automatic retry, so every mutating operation here takes an
 * explicit row lock:
 *
 *     select ... from public.wallets where id = $1 for update
 *
 * That serializes concurrent operations on the same wallet for the duration of the
 * transaction. Without it, two simultaneous debits both read the same balance and
 * the wallet loses money. This is the single most important thing to preserve when
 * porting any other money-handling module.
 *
 * IDEMPOTENCY. The Firestore version derives the ledger entry's document id from
 * the caller's reference (razorpayPaymentId, referenceId, or
 * `${referenceType}_${referenceId}`) and no-ops if that entry already exists. The
 * same works here because wallet_entries.id is a primary key — the existence check
 * is a plain select inside the locked transaction, and a duplicate insert would
 * raise 23505 even if the check were somehow skipped.
 *
 * All money columns are numeric(14,2), which node-postgres returns as strings.
 * NUMERIC_* below names every one; omitting a column there turns arithmetic into
 * string concatenation rather than failing, which is why it is listed centrally.
 */

export type WalletRow = {
  id: string;
  memberId: string;
  currency: string;
  balance: number;
  createdAt: Date;
  updatedAt: Date;
};

export type WalletEntryRow = {
  id: string;
  walletId: string;
  type: string;
  amount: number;
  balanceAfter: number;
  referenceType: string | null;
  referenceId: string | null;
  razorpayPaymentId: string | null;
  createdAt: Date;
};

export type WalletHoldRow = {
  id: string;
  walletId: string;
  amount: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

type RawWalletRow = Omit<WalletRow, "balance"> & { balance: number | string | null };
type RawEntryRow = Omit<WalletEntryRow, "amount" | "balanceAfter"> & {
  amount: number | string | null;
  balanceAfter: number | string | null;
};
type RawHoldRow = Omit<WalletHoldRow, "amount"> & { amount: number | string | null };

const WALLET_NUMERIC = ["balance"] as const;
const ENTRY_NUMERIC = ["amount", "balanceAfter"] as const;
const HOLD_NUMERIC = ["amount"] as const;

/**
 * What `client.query` actually returns for a wallet_holds row: snake_case keys and
 * numeric as a string. queryModel() applies rowToCamel on our behalf, but reads
 * issued through a transaction client do not, so they must go through mapHoldRow().
 * Typing the client read as RawHoldRow would compile and silently produce
 * `walletId: undefined`.
 */
type SqlHoldRow = {
  id: string;
  wallet_id: string;
  amount: number | string | null;
  status: string;
  created_at: Date;
  updated_at: Date;
};

function mapHoldRow(row: SqlHoldRow): WalletHoldRow {
  return rowToCamel<WalletHoldRow>(row, HOLD_NUMERIC);
}

/** Row lock + read of a hold, for use inside an open transaction. */
function lockHold(client: import("pg").PoolClient, memberId: string, holdId: string) {
  return client.query<SqlHoldRow>(
    `select id, wallet_id, amount, status, created_at, updated_at
       from public.wallet_holds where wallet_id = $1 and id = $2 for update`,
    [memberId, holdId],
  );
}

function num(value: number | string | null | undefined, fallback = 0): number {
  if (value === null || value === undefined) return fallback;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isNaN(n) ? fallback : n;
}

/**
 * Returns the member's wallet, creating it on first use.
 *
 * `on conflict do nothing` replaces Firestore's create-and-catch-already-exists:
 * same outcome, but the race between two concurrent first requests is closed by
 * the primary key rather than by catching the right error code.
 */
export async function getOrCreateWalletInSupabase(memberId: string, currency: string): Promise<WalletRow> {
  await query(
    `insert into public.wallets (id, member_id, currency, balance, created_at, updated_at)
     values ($1, $1, $2, 0, now(), now())
     on conflict (id) do nothing`,
    [memberId, currency],
  );
  const row = await queryModel<RawWalletRow>(
    `select id, member_id, currency, balance, created_at, updated_at from public.wallets where id = $1`,
    [memberId],
    WALLET_NUMERIC,
  );
  if (!row) throw new Error("Wallet not found.");
  return { ...row, balance: num(row.balance) };
}

export async function getWalletHistoryFromSupabase(walletId: string): Promise<WalletEntryRow[]> {
  const rows = await queryModels<RawEntryRow>(
    `select id, wallet_id, type, amount, balance_after, reference_type, reference_id,
            razorpay_payment_id, created_at
       from public.wallet_entries
      where wallet_id = $1
      order by created_at desc`,
    [walletId],
    ENTRY_NUMERIC,
  );
  return rows.map((r) => ({ ...r, amount: num(r.amount), balanceAfter: num(r.balanceAfter) }));
}

export async function getHoldFromSupabase(memberId: string, holdId: string): Promise<WalletHoldRow | null> {
  const row = await queryModel<RawHoldRow>(
    `select id, wallet_id, amount, status, created_at, updated_at
       from public.wallet_holds
      where wallet_id = $1 and id = $2`,
    [memberId, holdId],
    HOLD_NUMERIC,
  );
  return row ? { ...row, amount: num(row.amount) } : null;
}

export type CreditInput = {
  memberId: string;
  /** Deterministic idempotency key — becomes the ledger entry's primary key. */
  entryId: string;
  type: string;
  amount: number;
  referenceType: string | null;
  referenceId: string | null;
  razorpayPaymentId: string | null;
  currency: string;
};

/**
 * Credits a wallet. Idempotent per entryId.
 *
 * Covers both recharges (entryId = razorpayPaymentId) and bonuses (entryId =
 * referenceId); the only difference between them is which key the caller chooses,
 * so the ledger write is the same code either way.
 */
export async function creditWalletInSupabase(input: CreditInput): Promise<WalletRow> {
  await getOrCreateWalletInSupabase(input.memberId, input.currency);

  return withTransaction(async (client) => {
    // Row lock: held until commit, so a concurrent credit cannot read a stale balance.
    const wallet = await client.query<RawWalletRow>(
      `select id, member_id, currency, balance, created_at, updated_at
         from public.wallets where id = $1 for update`,
      [input.memberId],
    );
    if (!wallet.rowCount) throw new Error("Wallet not found.");
    const current = { ...wallet.rows[0]!, balance: num(wallet.rows[0]!.balance) };

    const existing = await client.query(`select 1 from public.wallet_entries where id = $1`, [input.entryId]);
    if (existing.rowCount) return current; // already processed — idempotent no-op

    const balanceAfter = current.balance + input.amount;
    await client.query(
      `insert into public.wallet_entries
         (id, wallet_id, type, amount, balance_after, reference_type, reference_id, razorpay_payment_id, created_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,now())`,
      [input.entryId, input.memberId, input.type, input.amount, balanceAfter, input.referenceType, input.referenceId, input.razorpayPaymentId],
    );
    await client.query(`update public.wallets set balance = $2, updated_at = now() where id = $1`, [input.memberId, balanceAfter]);
    return { ...current, balance: balanceAfter };
  });
}

export type DebitInput = {
  memberId: string;
  entryId: string;
  type: string;
  amount: number;
  referenceType: string;
  referenceId: string;
  currency: string;
};

/** Debits a wallet outright. Idempotent per entryId; throws InsufficientBalanceError. */
export async function debitWalletInSupabase(input: DebitInput): Promise<WalletRow> {
  await getOrCreateWalletInSupabase(input.memberId, input.currency);

  return withTransaction(async (client) => {
    const wallet = await client.query<RawWalletRow>(
      `select id, member_id, currency, balance, created_at, updated_at
         from public.wallets where id = $1 for update`,
      [input.memberId],
    );
    if (!wallet.rowCount) throw new Error("Wallet not found.");
    const current = { ...wallet.rows[0]!, balance: num(wallet.rows[0]!.balance) };

    const existing = await client.query(`select 1 from public.wallet_entries where id = $1`, [input.entryId]);
    if (existing.rowCount) return current; // already paid for this exact thing

    // Re-checked under the lock: a quote taken before this call can go stale.
    if (current.balance < input.amount) {
      throw new InsufficientBalanceError("Your wallet balance is too low for this purchase.");
    }

    const balanceAfter = current.balance - input.amount;
    await client.query(
      `insert into public.wallet_entries
         (id, wallet_id, type, amount, balance_after, reference_type, reference_id, razorpay_payment_id, created_at)
       values ($1,$2,$3,$4,$5,$6,$7,null,now())`,
      // Stored negative, matching the Firestore ledger, so the history sums to the balance.
      [input.entryId, input.memberId, input.type, -input.amount, balanceAfter, input.referenceType, input.referenceId],
    );
    await client.query(`update public.wallets set balance = $2, updated_at = now() where id = $1`, [input.memberId, balanceAfter]);
    return { ...current, balance: balanceAfter };
  });
}

/** Reserves funds. Generated ids: a hold has no natural idempotency key. */
export async function createHoldInSupabase(memberId: string, amount: number, referenceType: string, currency: string): Promise<WalletHoldRow> {
  await getOrCreateWalletInSupabase(memberId, currency);

  return withTransaction(async (client) => {
    const wallet = await client.query<RawWalletRow>(
      `select balance from public.wallets where id = $1 for update`,
      [memberId],
    );
    if (!wallet.rowCount) throw new Error("Wallet not found.");
    const balance = num(wallet.rows[0]!.balance);
    if (balance < amount) throw new InsufficientBalanceError("Your wallet balance is too low to start this session.");

    const holdId = await client.query<{ id: string }>(`select gen_random_uuid()::text as id`);
    const entryId = await client.query<{ id: string }>(`select gen_random_uuid()::text as id`);
    const balanceAfter = balance - amount;

    await client.query(
      `insert into public.wallet_holds (id, wallet_id, amount, status, created_at, updated_at)
       values ($1,$2,$3,'active',now(),now())`,
      [holdId.rows[0]!.id, memberId, amount],
    );
    await client.query(
      `insert into public.wallet_entries
         (id, wallet_id, type, amount, balance_after, reference_type, reference_id, razorpay_payment_id, created_at)
       values ($1,$2,'hold',$3,$4,$5,$6,null,now())`,
      [entryId.rows[0]!.id, memberId, -amount, balanceAfter, referenceType, holdId.rows[0]!.id],
    );
    await client.query(`update public.wallets set balance = $2, updated_at = now() where id = $1`, [memberId, balanceAfter]);

    // Read back through the SAME client. getHoldFromSupabase() uses the pool, which
    // is a different connection and cannot see this transaction's uncommitted row.
    const created = await client.query<SqlHoldRow>(
      `select id, wallet_id, amount, status, created_at, updated_at
         from public.wallet_holds where wallet_id = $1 and id = $2`,
      [memberId, holdId.rows[0]!.id],
    );
    if (!created.rowCount) throw new Error("Hold was created but could not be read back.");
    return mapHoldRow(created.rows[0]!);
  });
}

/** Settles a hold: keeps capturedAmount, refunds the remainder. Idempotent per hold status. */
export async function captureHoldInSupabase(
  memberId: string,
  holdId: string,
  capturedAmount: number,
  referenceType: string,
): Promise<WalletHoldRow> {
  return withTransaction(async (client) => {
    // Lock the hold first so two concurrent settlements cannot both see 'active'.
    const hold = await lockHold(client, memberId, holdId);
    if (!hold.rowCount) throw new WalletHoldNotFoundError("Wallet hold not found.");
    const current = mapHoldRow(hold.rows[0]!);
    if (current.status !== "active") return current; // already settled — idempotent no-op

    const wallet = await client.query<RawWalletRow>(
      `select balance from public.wallets where id = $1 for update`,
      [memberId],
    );
    if (!wallet.rowCount) throw new Error("Wallet not found.");
    const balance = num(wallet.rows[0]!.balance);

    const clampedCapture = Math.max(0, Math.min(capturedAmount, current.amount));
    const refund = current.amount - clampedCapture;

    if (refund > 0) {
      const entryId = await client.query<{ id: string }>(`select gen_random_uuid()::text as id`);
      const balanceAfter = balance + refund;
      await client.query(
        `insert into public.wallet_entries
           (id, wallet_id, type, amount, balance_after, reference_type, reference_id, razorpay_payment_id, created_at)
         values ($1,$2,'release',$3,$4,$5,$6,null,now())`,
        [entryId.rows[0]!.id, memberId, refund, balanceAfter, referenceType, holdId],
      );
      await client.query(`update public.wallets set balance = $2, updated_at = now() where id = $1`, [memberId, balanceAfter]);
    }
    await client.query(`update public.wallet_holds set status = 'captured', updated_at = now() where id = $1`, [holdId]);
    return { ...current, status: "captured" };
  });
}

/** Releases a hold in full. Idempotent per hold status. */
export async function releaseHoldInSupabase(memberId: string, holdId: string, referenceType: string): Promise<WalletHoldRow> {
  return withTransaction(async (client) => {
    const hold = await lockHold(client, memberId, holdId);
    if (!hold.rowCount) throw new WalletHoldNotFoundError("Wallet hold not found.");
    const current = mapHoldRow(hold.rows[0]!);
    if (current.status !== "active") return current;

    const wallet = await client.query<RawWalletRow>(
      `select balance from public.wallets where id = $1 for update`,
      [memberId],
    );
    if (!wallet.rowCount) throw new Error("Wallet not found.");
    const balanceAfter = num(wallet.rows[0]!.balance) + current.amount;

    const entryId = await client.query<{ id: string }>(`select gen_random_uuid()::text as id`);
    await client.query(
      `insert into public.wallet_entries
         (id, wallet_id, type, amount, balance_after, reference_type, reference_id, razorpay_payment_id, created_at)
       values ($1,$2,'release',$3,$4,$5,$6,null,now())`,
      [entryId.rows[0]!.id, memberId, current.amount, balanceAfter, referenceType, holdId],
    );
    await client.query(`update public.wallets set balance = $2, updated_at = now() where id = $1`, [memberId, balanceAfter]);
    await client.query(`update public.wallet_holds set status = 'released', updated_at = now() where id = $1`, [holdId]);
    return { ...current, status: "released" };
  });
}

export async function getAdminWalletSummaryFromSupabase(): Promise<{ totalBalance: number; walletCount: number }> {
  // A plain aggregate. The Firestore equivalent needed an explicit aggregate query
  // and returned 0 rather than failing when unsupported.
  const row = await queryModel<{ total: string | number | null; n: number }>(
    `select coalesce(sum(balance), 0) as total, count(*)::int as n from public.wallets`,
  );
  return { totalBalance: num(row?.total ?? 0), walletCount: row?.n ?? 0 };
}

export type LedgerRow = WalletEntryRow & { memberName: string; memberEmail: string; currency: string };

/**
 * Admin ledger.
 *
 * This is materially simpler than the Firestore version, which needed
 * collectionGroup("entries") plus a deployed fieldOverride index — and silently
 * returned an empty ledger when that index was missing, which is how the Wallets
 * admin page used to go blank. A join cannot have a missing index in that sense:
 * the worst case is a slow query, not a silent empty result.
 */
export async function getAdminWalletLedgerFromSupabase(limit = 200): Promise<LedgerRow[]> {
  const rows = await queryModels<RawEntryRow & { memberName: string | null; memberEmail: string | null; currency: string | null }>(
    `select e.id, e.wallet_id, e.type, e.amount, e.balance_after, e.reference_type, e.reference_id,
            e.razorpay_payment_id, e.created_at,
            m.name as member_name, m.email as member_email, w.currency
       from public.wallet_entries e
       join public.wallets w on w.id = e.wallet_id
       left join public.members m on m.id = w.member_id
      order by e.created_at desc
      limit $1`,
    [limit],
    ENTRY_NUMERIC,
  );
  return rows.map((r) => ({
    id: r.id,
    walletId: r.walletId,
    type: r.type,
    amount: num(r.amount),
    balanceAfter: num(r.balanceAfter),
    referenceType: r.referenceType,
    referenceId: r.referenceId,
    razorpayPaymentId: r.razorpayPaymentId,
    createdAt: r.createdAt,
    memberName: r.memberName ?? "Unknown member",
    memberEmail: r.memberEmail ?? "",
    currency: r.currency ?? "INR",
  }));
}

export type BalanceRow = WalletRow & { memberName: string; memberEmail: string };

export async function getAdminWalletBalancesFromSupabase(): Promise<BalanceRow[]> {
  const rows = await queryModels<RawWalletRow & { memberName: string | null; memberEmail: string | null }>(
    `select w.id, w.member_id, w.currency, w.balance, w.created_at, w.updated_at,
            m.name as member_name, m.email as member_email
       from public.wallets w
       left join public.members m on m.id = w.member_id
      order by w.balance desc`,
    [],
    WALLET_NUMERIC,
  );
  return rows.map((r) => ({
    id: r.id,
    memberId: r.memberId,
    currency: r.currency,
    balance: num(r.balance),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    memberName: r.memberName ?? "Unknown member",
    memberEmail: r.memberEmail ?? "",
  }));
}

/**
 * Reads a member's wallet balance without creating the wallet.
 *
 * The member-deletion guard needs this, and getOrCreateWalletInSupabase is wrong there:
 * a member who has never used the wallet has no row, and materialising one just to find
 * out it holds nothing would leave an empty wallet behind for an account about to be
 * deleted. Returns 0 when there is no wallet.
 *
 * `balance` is numeric, which node-postgres returns as a string, so it is cast rather
 * than coerced after the fact.
 */
export async function getWalletBalanceInSupabase(memberId: string): Promise<number> {
  const result = await query<{ balance: number }>(
    `select coalesce(sum(balance), 0)::float8 as balance from public.wallets where id = $1`,
    [memberId],
  );
  return Number(result.rows[0]?.balance ?? 0);
}
