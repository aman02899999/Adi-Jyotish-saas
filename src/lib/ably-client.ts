"use client";

import { Realtime } from "ably";

export function createChatRealtimeClient(sessionId: number) {
  return new Realtime({
    authUrl: "/api/ably/auth",
    authParams: { sessionId: String(sessionId) },
    autoConnect: true,
  });
}
