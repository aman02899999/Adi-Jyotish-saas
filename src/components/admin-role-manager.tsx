"use client";

import { useState } from "react";
import { Check, Lock, Plus, Save, Trash2, X } from "lucide-react";

export type AdminPermissionOption = { key: string; label: string };
export type RoleRow = { id: number; slug: string; name: string; isSystem: boolean; permissions: string[]; adminCount: number };

export function AdminRoleManager({ initialRoles, allPermissions }: { initialRoles: RoleRow[]; allPermissions: AdminPermissionOption[] }) {
  const [roles, setRoles] = useState(initialRoles);
  const [notice, setNotice] = useState("");
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ name: "", slug: "", permissions: [] as string[] });
  const [saving, setSaving] = useState<number | "new" | null>(null);

  function togglePermission(list: string[], key: string) {
    return list.includes(key) ? list.filter((item) => item !== key) : [...list, key];
  }

  async function createRole(event: React.FormEvent) {
    event.preventDefault();
    setSaving("new");
    const response = await fetch("/api/admin/roles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    const data = await response.json();
    if (response.ok) {
      setRoles((current) => [...current, { ...data, adminCount: 0 }]);
      setDraft({ name: "", slug: "", permissions: [] });
      setCreating(false);
      setNotice("Role created.");
    } else {
      setNotice(data.error || "Role could not be created.");
    }
    setSaving(null);
  }

  async function saveRolePermissions(role: RoleRow) {
    setSaving(role.id);
    const response = await fetch(`/api/admin/roles/${role.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ permissions: role.permissions }),
    });
    const data = await response.json();
    if (response.ok) setNotice("Permissions updated.");
    else setNotice(data.error || "Permissions could not be updated.");
    setSaving(null);
  }

  async function deleteRole(role: RoleRow) {
    if (!window.confirm(`Delete the "${role.name}" role?`)) return;
    const response = await fetch(`/api/admin/roles/${role.id}`, { method: "DELETE" });
    const data = await response.json();
    if (response.ok) {
      setRoles((current) => current.filter((item) => item.id !== role.id));
      setNotice("Role deleted.");
    } else {
      setNotice(data.error || "Role could not be deleted.");
    }
  }

  return (
    <div className="role-manager">
      <div className="admin-table-header">
        <div><h2>Roles &amp; permissions</h2><p>Define exactly what each role in your workspace can access.</p></div>
        <button className="button button--small" onClick={() => setCreating(true)}><Plus size={15} /> New role</button>
      </div>

      <div className="role-grid">
        {roles.map((role) => (
          <article className="role-card" key={role.id}>
            <header>
              <div>
                <strong>{role.name}</strong>
                <small>{role.adminCount} teammate{role.adminCount === 1 ? "" : "s"}{role.isSystem ? " · built-in" : ""}</small>
              </div>
              {role.slug === "owner" ? (
                <span className="role-card__locked"><Lock size={12} /> Always full access</span>
              ) : (
                <div className="role-card__actions">
                  <button className="button button--ghost button--small" disabled={saving === role.id} onClick={() => saveRolePermissions(role)}><Save size={13} /> {saving === role.id ? "Saving…" : "Save"}</button>
                  {!role.isSystem && <button className="danger" disabled={role.adminCount > 0} title={role.adminCount > 0 ? "Reassign teammates before deleting" : "Delete role"} onClick={() => deleteRole(role)}><Trash2 size={14} /></button>}
                </div>
              )}
            </header>
            <div className="role-card__permissions">
              {allPermissions.map((permission) => {
                const checked = role.slug === "owner" || role.permissions.includes(permission.key);
                return (
                  <label key={permission.key} className={checked ? "on" : ""}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={role.slug === "owner"}
                      onChange={() => setRoles((current) => current.map((item) => item.id === role.id ? { ...item, permissions: togglePermission(item.permissions, permission.key) } : item))}
                    />
                    {permission.label}
                  </label>
                );
              })}
            </div>
          </article>
        ))}
      </div>

      {notice && <div className="toast"><Check size={15} />{notice}<button onClick={() => setNotice("")}><X size={14} /></button></div>}

      {creating && (
        <div className="modal-backdrop" onMouseDown={() => setCreating(false)}>
          <section className="admin-modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-header"><div><p>Custom role</p><h2>New role</h2></div><button onClick={() => setCreating(false)}><X size={20} /></button></div>
            <form onSubmit={createRole}>
              <label className="field field--full"><span>Role name</span><input required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="e.g. Finance" /></label>
              <label className="field field--full"><span>Slug</span><input required value={draft.slug} onChange={(event) => setDraft({ ...draft, slug: event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") })} placeholder="e.g. finance" /><small>Lowercase letters, numbers, underscores only.</small></label>
              <div className="field field--full">
                <span>Permissions</span>
                <div className="role-card__permissions">
                  {allPermissions.map((permission) => (
                    <label key={permission.key} className={draft.permissions.includes(permission.key) ? "on" : ""}>
                      <input type="checkbox" checked={draft.permissions.includes(permission.key)} onChange={() => setDraft({ ...draft, permissions: togglePermission(draft.permissions, permission.key) })} />
                      {permission.label}
                    </label>
                  ))}
                </div>
              </div>
              <div className="modal-actions field--full">
                <button type="button" className="button button--ghost" onClick={() => setCreating(false)}>Cancel</button>
                <button className="button" disabled={saving === "new"}>{saving === "new" ? "Creating…" : "Create role"}</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
