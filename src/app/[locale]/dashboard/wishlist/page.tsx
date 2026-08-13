import { MemberAppShell } from "@/components/member-app-shell";
import { MemberWishlist } from "@/components/member-wishlist";
import { getWishlistWithProducts } from "@/lib/gemstone-wishlist";
import { getCurrentMember } from "@/lib/member-auth";

export const dynamic = "force-dynamic";

export default async function MemberWishlistPage() {
  const member = await getCurrentMember();
  if (!member) return null;
  const products = await getWishlistWithProducts(member.id);
  return (
    <MemberAppShell member={member} active="Wishlist">
      <MemberWishlist products={products} />
    </MemberAppShell>
  );
}
