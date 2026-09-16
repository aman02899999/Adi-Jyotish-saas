/**
 * Wallet error types, in a module of their own.
 *
 * src/lib/wallet.ts (Firestore) and src/lib/wallet-supabase.ts (Postgres) both
 * throw these, and wallet.ts branches to wallet-supabase.ts — so keeping them
 * here avoids a circular import. wallet.ts re-exports them, so existing imports
 * from "@/lib/wallet" keep working unchanged.
 */

/** Thrown when a wallet cannot cover the requested amount. */
export class InsufficientBalanceError extends Error {}

/** Thrown when a hold id does not exist for the given wallet. */
export class WalletHoldNotFoundError extends Error {}
