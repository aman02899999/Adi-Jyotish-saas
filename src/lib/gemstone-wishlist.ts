import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firestore";
import { getProductsByIds } from "@/lib/gemstones";

/** Stored as members/{memberId}/wishlist/{productId} — doc ID = productId, so add/remove/exists-check
 * is a single doc read/write instead of a separate uniqueness index. */
function wishlistCol(memberId: string) {
  return db.collection("members").doc(memberId).collection("wishlist");
}

export async function getWishlistProductIds(memberId: string): Promise<string[]> {
  const snap = await wishlistCol(memberId).get();
  return snap.docs.map((doc) => doc.id);
}

export async function getWishlistWithProducts(memberId: string) {
  const ids = await getWishlistProductIds(memberId);
  return getProductsByIds(ids);
}

export async function toggleWishlist(memberId: string, productId: string): Promise<{ added: boolean }> {
  const ref = wishlistCol(memberId).doc(productId);
  const existing = await ref.get();
  if (existing.exists) {
    await ref.delete();
    return { added: false };
  }
  await ref.set({ productId, createdAt: FieldValue.serverTimestamp() });
  return { added: true };
}
