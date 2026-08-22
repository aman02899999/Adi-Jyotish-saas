/** New/unreviewed practitioners are discounted to encourage first bookings; once a practitioner
 * has enough published reviews to establish trust, they charge their full listed rate. Used by
 * both the marketplace display price (marketplace.ts) and the actual instant-chat charge
 * (chat.ts) so what's shown on a practitioner's card is exactly what gets billed. */
export function reviewDiscountPercent(reviewCount: number): number {
  if (reviewCount === 0) return 30;
  if (reviewCount < 10) return 20;
  if (reviewCount < 25) return 10;
  return 0;
}
