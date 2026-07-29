import "server-only";

import Pusher from "pusher";

let pusher: Pusher | null = null;

export function isPusherConfigured() {
  return Boolean(
    process.env.PUSHER_APP_ID &&
    process.env.PUSHER_KEY &&
    process.env.PUSHER_SECRET &&
    process.env.PUSHER_CLUSTER
  );
}

export function getPusher() {
  if (!isPusherConfigured()) return null;
  if (!pusher) {
    pusher = new Pusher({
      appId: process.env.PUSHER_APP_ID!,
      key: process.env.PUSHER_KEY!,
      secret: process.env.PUSHER_SECRET!,
      cluster: process.env.PUSHER_CLUSTER!,
      useTLS: true,
    });
  }
  return pusher;
}

export function chatChannelName(sessionId: number) {
  return `private-chat-${sessionId}`;
}

export async function publishChatEvent(sessionId: number, event: string, payload: unknown) {
  const client = getPusher();
  if (!client) return;
  await client.trigger(chatChannelName(sessionId), event, payload);
}
