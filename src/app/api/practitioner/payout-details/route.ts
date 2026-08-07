import { requirePractitionerPage } from "@/lib/practitioner-auth";
import { PayoutError, updatePractitionerPayoutDetails } from "@/lib/practitioner-portal";
import { isPayoutEncryptionConfigured } from "@/lib/payout-crypto";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const practitioner = await requirePractitionerPage();
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
