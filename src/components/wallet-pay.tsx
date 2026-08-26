"use client";

import { useCallback, useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { LoaderCircle, Wallet, WalletMinimal } from "lucide-react";

/**
 * Shared "pay from your wallet" control, used by every paid reading form.
 *
 * A member who already has money on the platform should not be sent through a card checkout to
 * spend it, and — more importantly — should never hit a dead end when their balance is a little
 * short. So this renders one of three states from the same live balance:
 *
 *  - enough money  → a single button that buys the reading outright, no redirect, no card
 *  - short         → what they have, what it costs, and a recharge link pre-filled with the exact
 *                    top-up needed, rather than a bare "payment failed"
 *  - empty wallet  → the same prompt, worded as a first recharge
 *
 * The balance is fetched client-side rather than passed in so that a member who tops up in another
 * tab and comes back sees the real number; `refresh()` re-reads it after a failed attempt.
 */

export type WalletState = { balance: number; currency: string } | null;

/** The 402 body every reading route returns when the wallet cannot cover the purchase. */
export type WalletShortfallResponse = {
  insufficientBalance?: boolean;
  wallet?: { balance: number; price: number; shortfall: number; currency: string };
};

/** Reads the member's balance once on mount, and again whenever `refresh()` is called. */
export function useWalletBalance() {
  const [wallet, setWallet] = useState<WalletState>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/member/wallet");
      if (!response.ok) return;
      const data = (await response.json()) as { balance: number; currency: string };
      setWallet({ balance: data.balance, currency: data.currency });
    } catch {
      // A balance we cannot read just means the wallet option stays hidden — card checkout is
      // still there, so this is never worth interrupting the member over.
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetched inline rather than by calling refresh() here: the state lands in a promise callback,
  // which is what keeps this a subscription to an external system rather than a synchronous
  // setState in an effect body. The `active` flag drops a response that arrives after unmount.
  useEffect(() => {
    let active = true;
    fetch("/api/member/wallet")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { balance: number; currency: string } | null) => {
        if (active && data) setWallet({ balance: data.balance, currency: data.currency });
      })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  return { wallet, loading, refresh };
}

/** Recharge deep-link that pre-fills the amount the member is actually short. */
export function rechargeHref(amount?: number) {
  const rounded = amount && amount > 0 ? Math.ceil(amount / 50) * 50 : 0;
  return rounded > 0 ? `/dashboard/wallet?add=${rounded}` : "/dashboard/wallet";
}

export function WalletPayButton({ wallet, price, currency, busy, disabled, onPay, label }: {
  wallet: WalletState;
  price: number;
  currency: string;
  busy?: boolean;
  disabled?: boolean;
  onPay: () => void;
  label?: string;
}) {
  if (!wallet) return null;
  const shortfall = Math.max(0, price - wallet.balance);

  if (shortfall > 0) {
    return (
      <div className="wallet-pay wallet-pay--short">
        <WalletMinimal size={18} />
        <div>
          <strong>
            {wallet.balance > 0
              ? `Your wallet has ${currency} ${wallet.balance} — ${currency} ${shortfall} short`
              : "Your wallet is empty"}
          </strong>
          <small>This costs {currency} {price}. Add {currency} {shortfall} or more to pay straight from your balance.</small>
        </div>
        <Link href={rechargeHref(shortfall)} className="button button--small">Add {currency} {shortfall}</Link>
      </div>
    );
  }

  return (
    <div className="wallet-pay">
      <Wallet size={18} />
      <div>
        <strong>Pay from wallet</strong>
        <small>Balance {currency} {wallet.balance} — {currency} {price} will be deducted.</small>
      </div>
      <button type="button" className="button button--small" onClick={onPay} disabled={busy || disabled}>
        {busy ? <><LoaderCircle size={15} className="spin" /> Paying…</> : `Pay ${currency} ${price}`}
      </button>
    </div>
  );
}

/**
 * Turns a reading route's response into a human message when the wallet came up short. Returns
 * null for anything else, so callers can fall through to their existing error handling.
 */
export function walletShortfallMessage(data: WalletShortfallResponse): string | null {
  if (!data?.insufficientBalance || !data.wallet) return null;
  const { balance, price, shortfall, currency } = data.wallet;
  return `Your wallet has ${currency} ${balance} and this costs ${currency} ${price}. Add ${currency} ${shortfall} to continue.`;
}
