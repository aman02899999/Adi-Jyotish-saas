import { notFound } from "next/navigation";
import { ChatRoom } from "@/components/chat-room";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPage } from "@/lib/admin-page";
import { ChatSessionNotFoundError, getSessionForAdmin, listSessionMessages } from "@/lib/chat";
import { getActiveHold, getOrCreateWallet } from "@/lib/wallet";

export const dynamic = "force-dynamic";
function parseId(value: string) { const id = Number(value); return Number.isInteger(id) && id > 0 ? id : null; }

export default async function AdminChatSessionPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage("messages");
  const { id: raw } = await params;
  const id = parseId(raw);
  if (!id) notFound();

  let session;
  try {
    session = await getSessionForAdmin(id);
  } catch (error) {
    if (error instanceof ChatSessionNotFoundError) notFound();
    throw error;
  }

  const [messages, hold, wallet] = await Promise.all([
    listSessionMessages(id),
    getActiveHold(session.walletHoldId),
    getOrCreateWallet(session.memberId),
  ]);
  const holdMinutes = hold ? Math.max(1, Math.round(hold.amount / session.ratePerMinute)) : 1;

  return (
    <AdminShell active="Chat">
      <div className="admin-content">
        <div className="admin-heading"><div><p>Jyotish / Operations</p><h1>{session.memberName}</h1><span>Replying as {session.practitionerName}.</span></div></div>
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
          senderName={session.practitionerName}
        />
      </div>
    </AdminShell>
  );
}
