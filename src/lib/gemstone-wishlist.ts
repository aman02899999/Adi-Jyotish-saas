import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firestore";
import { getProductsByIds } from "@/lib/gemstones";
import { createNotification } from "@/lib/notifications";
import { sendEmail, genericNotificationEmailHtml } from "@/lib/email";
import { getSiteUrl } from "@/lib/site-url";

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

/** Event-driven (called right after an admin saves a product price/stock change, not on a
 * schedule): a wishlist entry is worth nothing to a member if the whole reason they saved it —
 * "I'll buy it once it's cheaper / back in stock" — happens silently. collectionGroup query works
 * because every wishlist doc is stored with an explicit productId field, not just as its own doc
 * ID, matching the "variants" collection-group pattern already used for low-stock detection. */
export async function notifyWishlistedMembers(productId: string, productName: string, productSlug: string, trigger: { priceDropped: boolean; backInStock: boolean }) {
  if (!trigger.priceDropped && !trigger.backInStock) return { notified: 0 };

  const snap = await db.collectionGroup("wishlist").where("productId", "==", productId).get();
  if (snap.empty) return { notified: 0 };

  const title = trigger.priceDropped && trigger.backInStock
    ? `${productName} is back in stock at a lower price`
    : trigger.priceDropped
      ? `Price drop: ${productName}`
      : `Back in stock: ${productName}`;
  const productUrl = new URL(`/gemstones/${productSlug}`, getSiteUrl()).toString();

  let notified = 0;
  for (const doc of snap.docs) {
    const memberId = doc.ref.parent.parent?.id;
    if (!memberId) continue;

    await createNotification({
      recipientType: "member",
      recipientId: memberId,
      type: trigger.priceDropped ? "wishlist_price_drop" : "wishlist_back_in_stock",
      title,
      body: `${productName} is on your wishlist — take another look.`,
      link: `/gemstones/${productSlug}`,
    }).catch((error) => console.error("Wishlist notification failed", error));

    const memberSnap = await db.collection("members").doc(memberId).get();
    const member = memberSnap.data() as { email?: string; name?: string } | undefined;
    if (member?.email) {
      await sendEmail({
        to: member.email,
        subject: title,
        html: genericNotificationEmailHtml({
          title,
          name: member.name ?? "there",
          body: `${productName} is on your wishlist and just changed — take another look before it moves again.`,
          ctaLabel: "View product",
          ctaUrl: productUrl,
        }),
      }).catch((error) => console.error("Wishlist email failed", error));
    }
    notified++;
  }
  return { notified };
}
