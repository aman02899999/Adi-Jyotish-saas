/**
 * Whether two addresses name the same mailbox for ownership checks. Email is matched without regard
 * to case: invoices and bookings store the address as it was typed (an admin may enter
 * "Asha@Example.com"), while sign-in providers report it lowercased, so an exact comparison refused
 * members their own invoices and hid them from their billing page.
 */
export function sameEmail(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}
