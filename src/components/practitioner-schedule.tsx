"use client";

import { useState } from "react";
import { Check, Plus, Save, Trash2, X } from "lucide-react";

type Rule = { weekday: number; startTime: string; endTime: string; active: boolean };
type TimeOff = { startsAt: string; endsAt: string; reason: string | null };

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function PractitionerSchedule({ initialRules, initialTimeOff }: { initialRules: Rule[]; initialTimeOff: TimeOff[] }) {
  const [rules, setRules] = useState<Rule[]>(() => {
    const byWeekday = new Map(initialRules.map((rule) => [rule.weekday, rule]));
    return WEEKDAYS.map((_, weekday) => byWeekday.get(weekday) ?? { weekday, startTime: "09:30", endTime: "17:30", active: false });
  });
  const [timeOff, setTimeOff] = useState<TimeOff[]>(initialTimeOff);
  const [newOff, setNewOff] = useState({ startsAt: "", endsAt: "", reason: "" });
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  function updateRule(weekday: number, patch: Partial<Rule>) {
    setRules((current) => current.map((rule) => rule.weekday === weekday ? { ...rule, ...patch } : rule));
  }

  function addTimeOff() {
    if (!newOff.startsAt || !newOff.endsAt) return;
    setTimeOff((current) => [...current, { startsAt: new Date(newOff.startsAt).toISOString(), endsAt: new Date(newOff.endsAt).toISOString(), reason: newOff.reason || null }]);
    setNewOff({ startsAt: "", endsAt: "", reason: "" });
  }

  function removeTimeOff(index: number) {
    setTimeOff((current) => current.filter((_, i) => i !== index));
  }

  async function save() {
    setSaving(true);
    const response = await fetch("/api/practitioner/schedule", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rules: rules.filter((rule) => rule.active), timeOff }),
    });
    if (response.ok) setNotice("Schedule saved.");
    else setNotice("Schedule could not be saved.");
    setSaving(false);
  }

  return (
    <>
      <section className="settings-card" style={{ marginBottom: 24 }}>
        <header><div><p>Weekly hours</p><h2>Your availability</h2></div></header>
        <div className="form-options" style={{ padding: "18px 19px", gridTemplateColumns: "1fr" }}>
          {rules.map((rule) => (
            <label key={rule.weekday} style={{ justifyContent: "space-between" }}>
              <span style={{ minWidth: 110 }}><strong>{WEEKDAYS[rule.weekday]}</strong></span>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="time" value={rule.startTime} disabled={!rule.active} onChange={(event) => updateRule(rule.weekday, { startTime: event.target.value })} />
                <span>–</span>
                <input type="time" value={rule.endTime} disabled={!rule.active} onChange={(event) => updateRule(rule.weekday, { endTime: event.target.value })} />
              </span>
              <button type="button" className={`switch ${rule.active ? "on" : ""}`} onClick={() => updateRule(rule.weekday, { active: !rule.active })}><i /></button>
            </label>
          ))}
        </div>
      </section>

      <section className="settings-card">
        <header><div><p>Exceptions</p><h2>Time off</h2></div></header>
        <div style={{ padding: "18px 19px", display: "flex", flexDirection: "column", gap: 12 }}>
          {timeOff.map((block, index) => (
            <div key={index} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 14px", border: "1px solid var(--line)", borderRadius: 10 }}>
              <span style={{ fontSize: 12 }}>{new Date(block.startsAt).toLocaleString("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} → {new Date(block.endsAt).toLocaleString("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}{block.reason ? ` · ${block.reason}` : ""}</span>
              <button type="button" className="danger" onClick={() => removeTimeOff(index)}><Trash2 size={14} /></button>
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input type="datetime-local" value={newOff.startsAt} onChange={(event) => setNewOff({ ...newOff, startsAt: event.target.value })} />
            <input type="datetime-local" value={newOff.endsAt} onChange={(event) => setNewOff({ ...newOff, endsAt: event.target.value })} />
            <input value={newOff.reason} onChange={(event) => setNewOff({ ...newOff, reason: event.target.value })} placeholder="Reason (optional)" style={{ flex: 1, minWidth: 140 }} />
            <button type="button" className="button button--ghost button--small" onClick={addTimeOff}><Plus size={14} /> Add block</button>
          </div>
        </div>
      </section>

      <div className="settings-save" style={{ marginTop: 20 }}>
        <button className="button" disabled={saving} onClick={save}><Save size={15} />{saving ? "Saving…" : "Save schedule"}</button>
      </div>

      {notice && <div className="toast"><Check size={15} />{notice}<button onClick={() => setNotice("")}><X size={14} /></button></div>}
    </>
  );
}
