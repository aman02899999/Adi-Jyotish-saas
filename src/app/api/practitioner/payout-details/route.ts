import { getCurrentPractitioner } from "@/lib/practitioner-auth";
import { PayoutError, updatePractitionerPayoutDetails } from "@/lib/practitioner-portal";
import { isPayoutEncryptionConfigured } from "@/lib/payout-crypto";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  // requirePractitionerPage() calls Next's redirect() on failure, which is for page components,
  // not a JSON API route — an unauthenticated call here would return a 307 redirect instead of
  // the {error} JSON + 401 every other practitioner route returns, breaking client error handling.
  const practitioner = await getCurrentPractitioner();
  if (!practitioner) return Response.json({ error: "Practitioner sign-in required." }, { status: 401 });
  if (!isPayoutEncryptionConfigured()) {
    return Response.json({ error: "Payout details cannot be saved yet — the studio hasn't configured secure storage for bank details." }, { status: 503 });
  }

  const body = (await request.json()) as { bankAccountName?: string; bankAccountNumber?: string; bankIfsc?: string; upiId?: string };
  try {
    await updatePractitionerPayoutDetails(practitioner.id, {
      bankAccountName: body.bankAccountName ?? "",
      bankAccountNumber: body.bankAccountNumber ?? "",
      bankIfsc: body.bankIfsc ?? "",
      upiId: body.upiId ?? "",
    });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof PayoutError ? error.message : "Payout details could not be saved." }, { status: 400 });
  }
}
