import "server-only";

import { getAdminIdsWithPermission } from "@/lib/admin-roles";
import { crisisSupportMessage, detectCrisis, type CrisisKind } from "@/lib/crisis";
import { notifyAdmins } from "@/lib/notifications";

type CrisisSurface = { memberId: string; where: string; link?: string };

/** Tells the admins who handle member messages that someone may need a person to reach out.
 * The alert names the member and the place, and never repeats what they wrote: the words stay in
 * the chat or are not stored at all. A failed alert must not break the customer's response. */
export async function flagCrisisToAdmins(kind: CrisisKind, { memberId, where, link }: CrisisSurface) {
  try {
    const adminIds = await getAdminIdsWithPermission("messages");
    await notifyAdmins(adminIds, {
      type: "crisis_flag",
      title: kind === "self_harm" ? "A member may be at risk of self-harm" : "A member wrote about being abused",
      body: `Member ${memberId} wrote something in ${where} that matched our crisis words. They were shown the helpline numbers and no reading was given. Please have a person check in with them.`,
      link: link ?? "/admin/members",
    });
  } catch (error) {
    console.error(`Failed to flag a crisis message from ${where}`, error instanceof Error ? error.message : "unknown error");
  }
}

/** For the reading routes: returns the response to send instead of creating (and charging for) a
 * reading, or null when the question is an ordinary one. The forms already show `error` text. */
export async function crisisResponse(question: string, surface: CrisisSurface): Promise<Response | null> {
  const kind = detectCrisis(question);
  if (!kind) return null;
  await flagCrisisToAdmins(kind, surface);
  return Response.json({ error: crisisSupportMessage(kind), crisis: kind }, { status: 422 });
}
