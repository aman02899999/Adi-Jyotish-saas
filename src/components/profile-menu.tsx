"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";

/** Click-to-open profile menu for the top-right avatar, shared by the member, practitioner, and admin shells. */
export function ProfileMenu({ initials, name, subtitle, logoutAction, redirectTo }: {
  initials: string;
  name: string;
  subtitle: string;
  logoutAction: string;
  redirectTo: string;
}) {
  const [loggingOut, setLoggingOut] = useState(false);

  async function signOut() {
    setLoggingOut(true);
    try {
      await fetch(logoutAction, { method: "POST" });
    } finally {
      // A hard navigation (not router.push) so every client-held auth/session state is
      // dropped along with the page, not just the visible route.
      window.location.href = redirectTo;
    }
  }

  return (
    <details className="profile-menu">
      <summary className="top-avatar" title={name}>{initials}</summary>
      <div className="profile-menu__panel">
        <div className="profile-menu__identity">
          <span className="top-avatar">{initials}</span>
          <span><strong>{name}</strong><small>{subtitle}</small></span>
        </div>
        <button type="button" onClick={signOut} disabled={loggingOut}>
          <LogOut size={14} /> {loggingOut ? "Signing out…" : "Sign out"}
        </button>
      </div>
    </details>
  );
}
