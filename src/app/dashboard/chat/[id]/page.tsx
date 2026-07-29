import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { db } from "@/db";
import { practitioners } from "@/db/schema";
import { ChatRoom } from "@/components/chat-room";
import { MemberAppShell } from "@/components/member-app-shell";
import { ChatSessionNotFoundError, getSessionOr404, listSessionMessages } from "@/lib/chat";
import { getCurrentMember } from "@/lib/member-auth";
import { getActiveHold, getOrCreateWallet } from "@/lib/wallet";

export const dynamic = "force-dynamic";
function parseId(value: string) { const id = Number(value); return Number.isInteger(id) && id > 0 ? id : null; }

export default async function MemberChatPage({ params }: { params: Promise<{ id: string }> }) {
  const member = await getCurrentMember();
  if (!member) redirect("/account");
  const { id: raw } = await params;
  const id = parseId(raw);
  if (!id) notFound();

  let session;
  try {
    session = await getSessionOr404(id);
  } catch (error) {
    if (error instanceof ChatSessionNotFoundError) notFound();
    throw error;
  }
  if (session.memberId !== member.id) notFound();

  const [practitioner, messages, hold, wallet] = await Promise.all([
    db.select().from(practitioners).where(eq(practitioners.id, session.practitionerId)).limit(1).then((rows) => rows[0]),
    listSessionMessages(id),
    getActiveHold(session.walletHoldId),
    getOrCreateWallet(member.id),
  ]);
  const holdMinutes = hold ? Math.max(1, Math.round(hold.amount / session.ratePerMinute)) : 1;

  return (
    <MemberAppShell member={member} active="Wallet">
      <div className="consultation-heading billing-heading"><div><p>Instant chat</p><h1>{practitioner?.name ?? "Practitioner"}</h1><span>Metered by the minute from your wallet balance.</span></div></div>
      <ChatRoom
        sessionId={session.id}
        initialMessages={messages.map((message) => ({ ...message, createdAt: message.createdAt.toISOString() }))}
        initialStatus={session.status}
        startedAt={session.startedAt.toISOString()}
        ratePerMinute={session.ratePerMinute}
        currency={wallet.currency}
        holdMinutes={holdMinutes}
        counterpartName={practitioner?.name ?? "Practitioner"}
        viewerRole="member"
        senderName={member.name}
      />
    </MemberAppShell>
  );
}
