"use client";

import { FormEvent, useState } from "react";
import { ArrowRight, CalendarDays, Clock3, MapPin, Phone, ShieldCheck } from "lucide-react";
import type { MemberIdentity } from "@/lib/member-auth";

export function MemberOnboardingForm({ member, editing = false }: { member: MemberIdentity; editing?: boolean }) {
  const [birthDate, setBirthDate] = useState(member.birthDate ?? "");
  const [birthTime, setBirthTime] = useState(member.birthTime ?? "");
  const [birthPlace, setBirthPlace] = useState(member.birthPlace ?? "");
  const [phone, setPhone] = useState(member.phone ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const response = await fetch("/api/member/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ birthDate, birthTime, birthPlace, phone }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Your chart details could not be saved.");
      window.location.assign("/dashboard");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
      setSaving(false);
    }
  }

  return (
    <form className="onboarding-form" onSubmit={submit}>
      <label><span>Birth date</span><div><CalendarDays size={17} /><input type="date" required value={birthDate} onChange={(event) => setBirthDate(event.target.value)} /></div></label>
      <label><span>Exact birth time</span><div><Clock3 size={17} /><input type="time" required value={birthTime} onChange={(event) => setBirthTime(event.target.value)} /></div><small>Use the time shown on your birth record whenever possible.</small></label>
      <label className="wide"><span>Birth place</span><div><MapPin size={17} /><input required value={birthPlace} onChange={(event) => setBirthPlace(event.target.value)} placeholder="City, state or region, country" /></div></label>
      <label className="wide"><span>Phone <i>optional</i></span><div><Phone size={17} /><input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="For consultation reminders" /></div></label>
      <div className="onboarding-privacy wide"><ShieldCheck size={19} /><span><strong>Private by design</strong><small>Your natal details are encrypted in transit and never shown publicly.</small></span></div>
      {error && <p className="admin-auth-error wide" role="alert">{error}</p>}
      <button className="button wide" disabled={saving}>{saving ? "Saving your sky…" : editing ? "Save birth profile" : "Create my cosmic dashboard"}<ArrowRight size={16} /></button>
    </form>
  );
}
