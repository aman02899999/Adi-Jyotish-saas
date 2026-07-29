import { CircleDollarSign, ReceiptText, Users, Wallet as WalletIcon } from "lucide-react";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPage } from "@/lib/admin-page";
import { getAdminWalletBalances, getAdminWalletLedger, getAdminWalletSummary } from "@/lib/wallet";

export const dynamic = "force-dynamic";

export default async function AdminWalletsPage() {
  await requireAdminPage("billing");
  const [summary, balances, ledger] = await Promise.all([getAdminWalletSummary(), getAdminWalletBalances(), getAdminWalletLedger()]);

  return (
    <AdminShell active="Wallets">
      <div className="admin-content">
        <div className="admin-heading"><div><p>Jyotish / Finance</p><h1>Wallets</h1><span>Reconcile member wallet balances and instant chat charges.</span></div><div><small>Ledger status</small><strong>Live <i /></strong></div></div>

        <section className="finance-stats">
          <article><span><CircleDollarSign size={20} /></span><div><small>Outstanding balance</small><strong>{summary.totalBalance.toLocaleString()}</strong><p>Across all wallets</p></div></article>
          <article><span><Users size={20} /></span><div><small>Active wallets</small><strong>{summary.walletCount}</strong><p>Members with a wallet</p></div></article>
          <article><span><ReceiptText size={20} /></span><div><small>Ledger entries</small><strong>{ledger.length}</strong><p>Most recent shown below</p></div></article>
        </section>

        <section className="admin-table-card">
          <div className="admin-table-header"><div><h2>Member balances</h2><p>Current wallet balance per member.</p></div></div>
          <div className="wallet-table">
            <div className="wallet-table__head"><span>Member</span><span>Balance</span></div>
            {balances.map((wallet) => (
              <div className="wallet-table__row" key={wallet.id}>
                <div className="finance-customer"><strong>{wallet.memberName}</strong><small>{wallet.memberEmail}</small></div>
                <strong>{wallet.currency} {wallet.balance}</strong>
              </div>
            ))}
            {!balances.length && <div className="empty-state"><WalletIcon size={25} /><h3>No wallets yet</h3><p>Balances appear once a member recharges.</p></div>}
          </div>
        </section>

        <section className="admin-table-card">
          <div className="admin-table-header"><div><h2>Ledger</h2><p>Most recent recharge, hold, and release entries.</p></div><span className="finance-live"><i />Live ledger</span></div>
          <div className="wallet-table wallet-table--ledger">
            <div className="wallet-table__head"><span>Member</span><span>Type</span><span>Amount</span><span>Balance after</span><span>Date</span></div>
            {ledger.map((entry) => (
              <div className="wallet-table__row" key={entry.id}>
                <div className="finance-customer"><strong>{entry.memberName}</strong><small>{entry.memberEmail}</small></div>
                <span className="payment-provider">{entry.type}</span>
                <strong>{entry.amount > 0 ? "+" : ""}{entry.currency} {entry.amount}</strong>
                <strong>{entry.currency} {entry.balanceAfter}</strong>
                <div className="finance-date"><strong>{new Date(entry.createdAt).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}</strong><small>{new Date(entry.createdAt).toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" })}</small></div>
              </div>
            ))}
            {!ledger.length && <div className="empty-state"><ReceiptText size={25} /><h3>No wallet activity yet</h3><p>Recharges and chat charges will appear here.</p></div>}
          </div>
        </section>
      </div>
    </AdminShell>
  );
}
