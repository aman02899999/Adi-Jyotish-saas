import "server-only";

import { Rest } from "ably";

let rest: Rest | null = null;

export function isAblyConfigured() {
  return Boolean(process.env.ABLY_API_KEY);
}

export function getAbly() {
  if (!isAblyConfigured()) return null;
  if (!rest) rest = new Rest({ key: process.env.ABLY_API_KEY! });
  return rest;
}

export function chatChannelName(sessionId: string) {
  return `chat-${sessionId}`;
}

export async function publishChatEvent(sessionId: string, event: string, payload: unknown) {
  const client = getAbly();
  if (!client) return;
  await client.channels.get(chatChannelName(sessionId)).publish(event, payload);
}
