"use client";

import { Realtime } from "ably";

export function createChatRealtimeClient(sessionId: string) {
  return new Realtime({
    authUrl: "/api/ably/auth",
    authParams: { sessionId },
    autoConnect: true,
  });
}
