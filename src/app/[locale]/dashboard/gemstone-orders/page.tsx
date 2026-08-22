import { MemberAppShell } from "@/components/member-app-shell";
import { MemberGemstoneOrders } from "@/components/member-gemstone-orders";
import { getOrdersForMember } from "@/lib/gemstone-orders";
import { getCurrentMember } from "@/lib/member-auth";

export const dynamic = "force-dynamic";

export default async function MemberGemstoneOrdersPage() {
  const member = await getCurrentMember();
  if (!member) return null;
  const orders = await getOrdersForMember(member.id);
  return (
    <MemberAppShell member={member} active="GemOrders">
      <MemberGemstoneOrders orders={orders} />
    </MemberAppShell>
  );
}
