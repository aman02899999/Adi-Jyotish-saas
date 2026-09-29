import { getCurrentAdmin, hasAdminPermission, recordAudit } from "@/lib/admin-auth";
import { createNotification } from "@/lib/notifications";
import { readJsonBody } from "@/lib/request-body";
import { AdminCreditError, creditWalletByAdmin, parseAdminCredit } from "@/lib/wallet-admin";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "billing")) return Response.json({ error: "Billing permission required." }, { status: 403 });

  try {
    const input = parseAdminCredit((await readJsonBody(request)) as Record<string, unknown>);
    const { wallet, member } = await creditWalletByAdmin(input);
    await recordAudit(admin, "wallet.credited", "wallet", input.memberId, { amount: input.amount, reason: input.reason, requestId: input.requestId });
    await createNotification({
      recipientType: "member",
      recipientId: input.memberId,
      type: "wallet.credited",
      title: `${wallet.currency} ${input.amount} added to your wallet`,
      body: input.reason,
      link: "/dashboard/wallet",
    }).catch(() => {});
    return Response.json({ wallet, member });
  } catch (error) {
    if (error instanceof AdminCreditError) return Response.json({ error: error.message }, { status: 400 });
    console.error("Admin wallet credit failed", error);
    return Response.json({ error: "The wallet could not be credited." }, { status: 500 });
  }
}
