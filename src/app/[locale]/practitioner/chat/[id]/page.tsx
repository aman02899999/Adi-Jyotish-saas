import { notFound } from "next/navigation";
import { ChatRoom } from "@/components/chat-room";
import { PractitionerChatKundli } from "@/components/practitioner-chat-kundli";
import { PractitionerShell } from "@/components/practitioner-shell";
import { requirePractitionerPage } from "@/lib/practitioner-auth";
import { ChatSessionNotFoundError, getSessionForPractitioner, listSessionMessages } from "@/lib/chat";
import { getActiveHold, getOrCreateWallet } from "@/lib/wallet";

export const dynamic = "force-dynamic";

export default async function PractitionerChatSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const practitioner = await requirePractitionerPage();
  const { id } = await params;

  let session;
  try {
    session = await getSessionForPractitioner(id, practitioner.id);
  } catch (error) {
    if (error instanceof ChatSessionNotFoundError) notFound();
    throw error;
  }

  const [messages, hold, wallet] = await Promise.all([
    listSessionMessages(id),
    getActiveHold(session.memberId, session.walletHoldId),
    getOrCreateWallet(session.memberId),
  ]);
  const holdMinutes = hold ? Math.max(1, Math.round(hold.amount / session.ratePerMinute)) : 1;

  return (
    <PractitionerShell practitioner={practitioner} active="Chat">
      <div className="consultation-heading billing-heading"><div><p>Your workspace</p><h1>{session.memberName}</h1><span>Live instant chat.</span></div></div>
      <div className="chat-with-kundli">
        <ChatRoom
          sessionId={session.id}
          initialMessages={messages.map((message) => ({ ...message, createdAt: message.createdAt.toISOString() }))}
          initialStatus={session.status}
          startedAt={session.startedAt.toISOString()}
          ratePerMinute={session.ratePerMinute}
          currency={wallet.currency}
          holdMinutes={holdMinutes}
          counterpartName={session.memberName}
          viewerRole="practitioner"
          senderName={practitioner.name}
        />
        <PractitionerChatKundli sessionId={session.id} />
      </div>
    </PractitionerShell>
  );
}
