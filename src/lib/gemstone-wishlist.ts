import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { gemstoneWishlist } from "@/db/schema";
import { getProductsByIds } from "@/lib/gemstones";

export async function getWishlistProductIds(memberId: number): Promise<number[]> {
  const rows = await db.select({ productId: gemstoneWishlist.productId }).from(gemstoneWishlist).where(eq(gemstoneWishlist.memberId, memberId));
  return rows.map((row) => row.productId);
}

export async function getWishlistWithProducts(memberId: number) {
  const ids = await getWishlistProductIds(memberId);
  return getProductsByIds(ids);
}

export async function toggleWishlist(memberId: number, productId: number): Promise<{ added: boolean }> {
  const [existing] = await db.select().from(gemstoneWishlist).where(and(eq(gemstoneWishlist.memberId, memberId), eq(gemstoneWishlist.productId, productId))).limit(1);
  if (existing) {
    await db.delete(gemstoneWishlist).where(eq(gemstoneWishlist.id, existing.id));
    return { added: false };
  }
  await db.insert(gemstoneWishlist).values({ memberId, productId }).onConflictDoNothing({ target: [gemstoneWishlist.memberId, gemstoneWishlist.productId] });
  return { added: true };
}
