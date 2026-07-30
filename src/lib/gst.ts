/** Splits a GST-inclusive total into its pre-tax subtotal and tax amount, rounded to whole currency units. */
export function splitGstInclusive(totalAmount: number, gstRatePercent: number) {
  if (gstRatePercent <= 0) return { subtotal: totalAmount, taxAmount: 0 };
  const subtotal = Math.round(totalAmount / (1 + gstRatePercent / 100));
  return { subtotal, taxAmount: totalAmount - subtotal };
}

/** Adds GST on top of a pre-tax amount, rounded to whole currency units. */
export function addGstExclusive(subtotal: number, gstRatePercent: number) {
  if (gstRatePercent <= 0) return { subtotal, taxAmount: 0, total: subtotal };
  const taxAmount = Math.round((subtotal * gstRatePercent) / 100);
  return { subtotal, taxAmount, total: subtotal + taxAmount };
}
