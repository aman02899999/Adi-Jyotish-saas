"use client";

import PusherClient from "pusher-js";

let client: PusherClient | null | undefined;

export function isPusherClientConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_PUSHER_KEY && process.env.NEXT_PUBLIC_PUSHER_CLUSTER);
}

export function getPusherClient() {
  if (client !== undefined) return client;
  const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
  const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
  client = key && cluster ? new PusherClient(key, { cluster, authEndpoint: "/api/pusher/auth" }) : null;
  return client;
}
