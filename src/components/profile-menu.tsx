import { LogOut } from "lucide-react";

/** Click-to-open profile menu for the top-right avatar, shared by the member, practitioner, and admin shells. */
export function ProfileMenu({ initials, name, subtitle, logoutAction }: {
  initials: string;
  name: string;
  subtitle: string;
  logoutAction: string;
}) {
  return (
    <details className="profile-menu">
      <summary className="top-avatar" title={name}>{initials}</summary>
      <div className="profile-menu__panel">
        <div className="profile-menu__identity">
          <span className="top-avatar">{initials}</span>
          <span><strong>{name}</strong><small>{subtitle}</small></span>
        </div>
        <form action={logoutAction} method="post">
          <button type="submit"><LogOut size={14} /> Sign out</button>
        </form>
      </div>
    </details>
  );
}
