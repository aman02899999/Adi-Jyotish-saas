import { Gift } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { MemberAppShell } from "@/components/member-app-shell";
import { MemberWallet } from "@/components/member-wallet";
import { getCurrentMember } from "@/lib/member-auth";
import { isRazorpayConfigured } from "@/lib/razorpay";
import { getOrCreateWallet, getWalletHistory } from "@/lib/wallet";

export const dynamic = "force-dynamic";

export default async function MemberWalletPage() {
  const member = await getCurrentMember();
  if (!member) return null;
  const wallet = await getOrCreateWallet(member.id);
  const entries = await getWalletHistory(wallet.id);
  return (
    <MemberAppShell member={member} active="Wallet">
      <MemberWallet balance={wallet.balance} currency={wallet.currency} entries={entries} onlinePaymentsAvailable={isRazorpayConfigured()} member={{ name: member.name, email: member.email }} />
      <Link href="/gift" className="wallet-gift-link"><Gift size={15} /> Recharging for someone else? Send them a gift instead.</Link>
    </MemberAppShell>
  );
}
