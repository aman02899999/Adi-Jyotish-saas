"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Bell, Check } from "lucide-react";

type NotificationItem = { id: number; type: string; title: string; body: string | null; link: string | null; readAt: string | null; createdAt: string };

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function NotificationBell({ apiBase }: { apiBase: "/api/member/notifications" | "/api/admin/notifications" }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  async function load() {
    const response = await fetch(apiBase);
    if (!response.ok) return;
    const data = await response.json();
    setItems(data.items);
    setUnreadCount(data.unreadCount);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function openItem(item: NotificationItem) {
    if (!item.readAt) {
      await fetch(`${apiBase}/${item.id}/read`, { method: "PUT" });
      setItems((current) => current.map((row) => row.id === item.id ? { ...row, readAt: new Date().toISOString() } : row));
      setUnreadCount((count) => Math.max(0, count - 1));
    }
  }

  async function markAllRead() {
    await fetch(`${apiBase}/read-all`, { method: "PUT" });
    setItems((current) => current.map((row) => ({ ...row, readAt: row.readAt ?? new Date().toISOString() })));
    setUnreadCount(0);
  }

  return (
    <div className="notification-bell" ref={rootRef}>
      <button type="button" className="notification-bell__trigger" aria-label="Notifications" onClick={() => setOpen((value) => !value)}>
        <Bell size={18} />
        {unreadCount > 0 && <span className="notification-bell__badge">{unreadCount > 99 ? "99+" : unreadCount}</span>}
      </button>
      {open && (
        <div className="notification-panel">
          <div className="notification-panel__head">
            <strong>Notifications</strong>
            {unreadCount > 0 && <button type="button" onClick={markAllRead}><Check size={12} /> Mark all read</button>}
          </div>
          <div className="notification-panel__list">
            {items.length === 0 && <p className="notification-panel__empty">You&apos;re all caught up.</p>}
            {items.map((item) => {
              const content = (
                <>
                  <div className="notification-panel__dot" data-unread={!item.readAt} />
                  <div>
                    <strong>{item.title}</strong>
                    {item.body && <p>{item.body}</p>}
                    <small>{timeAgo(item.createdAt)}</small>
                  </div>
                </>
              );
              return item.link ? (
                <Link key={item.id} href={item.link} className="notification-panel__item" onClick={() => openItem(item)}>{content}</Link>
              ) : (
                <button key={item.id} type="button" className="notification-panel__item" onClick={() => openItem(item)}>{content}</button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
