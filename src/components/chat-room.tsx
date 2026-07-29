"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, Clock3, MessageCircle, Send, ShieldCheck, X } from "lucide-react";
import { createChatRealtimeClient } from "@/lib/ably-client";

export type ChatMessageRow = { id: number; sessionId: number; senderType: string; senderName: string; body: string; createdAt: string | Date };

export function ChatRoom({ sessionId, initialMessages, initialStatus, startedAt, ratePerMinute, currency, holdMinutes, counterpartName, viewerRole, senderName }: {
  sessionId: number;
  initialMessages: ChatMessageRow[];
  initialStatus: string;
  startedAt: string;
  ratePerMinute: number;
  currency: string;
  holdMinutes: number;
  counterpartName: string;
  viewerRole: "member" | "practitioner";
  senderName: string;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [status, setStatus] = useState(initialStatus);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [ending, setEnding] = useState(false);
  const [notice, setNotice] = useState("");
  const [elapsedSeconds, setElapsedSeconds] = useState(() => Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)));
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (status !== "active") return;
    const timer = setInterval(() => setElapsedSeconds((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [status]);

  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }); }, [messages]);

  useEffect(() => {
    if (status !== "active") return;

    let pollTimer: ReturnType<typeof setInterval> | null = null;
    function startPolling() {
      if (pollTimer) return;
      pollTimer = setInterval(async () => {
        const response = await fetch(`/api/chat/sessions/${sessionId}`);
        if (!response.ok) return;
        const data = await response.json();
        setMessages(data.messages);
        setStatus(data.session.status);
      }, 4000);
    }

    const client = createChatRealtimeClient(sessionId);
    client.connection.on("failed", startPolling);
    client.connection.on("suspended", startPolling);
    client.connection.on("disconnected", startPolling);
    const channel = client.channels.get(`chat-${sessionId}`);
    channel.subscribe("message", (message) => {
      const data = message.data as ChatMessageRow;
      setMessages((current) => current.some((item) => item.id === data.id) ? current : [...current, data]);
    });
    channel.subscribe("session-ended", () => setStatus("ended"));

    return () => {
      if (pollTimer) clearInterval(pollTimer);
      client.close();
    };
  }, [sessionId, status]);

  async function send(event: FormEvent) {
    event.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setText("");
    const response = await fetch(`/api/chat/sessions/${sessionId}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }) });
    const data = await response.json();
    if (response.ok) {
      setMessages((current) => current.some((item) => item.id === data.id) ? current : [...current, data]);
    } else {
      setNotice(data.error || "Message could not be sent.");
      if (response.status === 409) setStatus("ended");
    }
    setSending(false);
  }

  async function endChat() {
    if (!window.confirm("End this chat now?")) return;
    setEnding(true);
    const response = await fetch(`/api/chat/sessions/${sessionId}/end`, { method: "POST" });
    if (response.ok) setStatus("ended");
    else setNotice("Chat could not be ended.");
    setEnding(false);
  }

  const elapsedMinutes = Math.max(1, Math.ceil(elapsedSeconds / 60));
  const estimatedCost = Math.min(elapsedMinutes, holdMinutes) * ratePerMinute;

  return (
    <section className="chat-room">
      <header className="chat-room__header">
        <div><MessageCircle size={18} /><div><strong>{counterpartName}</strong><small>{status === "active" ? "Live instant chat" : "Chat ended"}</small></div></div>
        <div className="chat-room__meter"><Clock3 size={13} /><span>{String(Math.floor(elapsedSeconds / 60)).padStart(2, "0")}:{String(elapsedSeconds % 60).padStart(2, "0")}</span><b>·</b><span>{currency} {estimatedCost} of {currency} {ratePerMinute * holdMinutes} held</span></div>
      </header>
      <div className="chat-room__list" ref={listRef}>
        {messages.map((message) => (
          <div key={message.id} className={`chat-bubble chat-bubble--${message.senderType === "system" ? "system" : (message.senderName === senderName ? "self" : "other")}`}>
            {message.senderType !== "system" && <small>{message.senderName}</small>}
            <p>{message.body}</p>
          </div>
        ))}
      </div>
      {status === "active" ? (
        <form className="chat-room__composer" onSubmit={send}>
          <input value={text} onChange={(event) => setText(event.target.value)} placeholder="Type a message…" maxLength={2000} disabled={sending} />
          <button type="submit" disabled={sending || !text.trim()} aria-label="Send"><Send size={16} /></button>
          <button type="button" className="chat-room__end" onClick={endChat} disabled={ending}>{ending ? "Ending…" : "End chat"}</button>
        </form>
      ) : (
        <div className="chat-room__ended"><ShieldCheck size={18} /><div><strong>This chat has ended.</strong><small>{viewerRole === "member" ? <Link href="/dashboard/wallet">View wallet activity</Link> : "Session closed."}</small></div></div>
      )}
      {notice && <div className="toast"><Check size={15} />{notice}<button onClick={() => setNotice("")}><X size={14} /></button></div>}
    </section>
  );
}
