"use client";

import { FormEvent, useState, useSyncExternalStore } from "react";
import { ArrowRight, CalendarDays, Clock3, Phone, ShieldCheck } from "lucide-react";
import type { MemberIdentity } from "@/lib/member-auth";
import { PlaceAutocomplete } from "@/components/place-autocomplete";
import { FREE_CHART_BIRTH_KEY } from "@/components/free-chart-teaser";

type Prefill = { birthDate?: string; birthTime?: string; birthPlace?: string; timeUnknown?: boolean };

const noSubscription = () => () => {};
function readFreeChart() {
  try { return sessionStorage.getItem(FREE_CHART_BIRTH_KEY); } catch { return null; /* private mode: the form simply starts empty */ }
}

/**
 * "Save my chart free" on the homepage sends a visitor here through sign-up. The birth details
 * they already typed for the free chart are waiting in this tab, so they are not asked twice.
 * The stored value is read after hydration (the server has no sessionStorage) and the fields are
 * remounted with it, which keeps the first client render identical to the server's.
 */
export function MemberOnboardingForm({ member, editing = false }: { member: MemberIdentity; editing?: boolean }) {
  const stored = useSyncExternalStore(noSubscription, readFreeChart, () => null);
  let prefill: Prefill | null = null;
  if (stored && !editing && !member.birthDate) {
    try { prefill = JSON.parse(stored) as Prefill; } catch { prefill = null; }
  }
  return <OnboardingFields key={prefill?.birthDate ? "from-free-chart" : "blank"} member={member} editing={editing} prefill={prefill?.birthDate ? prefill : null} />;
}

function OnboardingFields({ member, editing, prefill }: { member: MemberIdentity; editing: boolean; prefill: Prefill | null }) {
  const [birthDate, setBirthDate] = useState(prefill?.birthDate ?? member.birthDate ?? "");
  // An unknown birth time is left blank on purpose: the profile needs the real one.
  const [birthTime, setBirthTime] = useState((prefill && !prefill.timeUnknown ? prefill.birthTime : undefined) ?? member.birthTime ?? "");
  const [birthPlace, setBirthPlace] = useState(prefill?.birthPlace ?? member.birthPlace ?? "");
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
      <label className="wide"><span>Birth place</span><PlaceAutocomplete size={17} required value={birthPlace} onChange={setBirthPlace} placeholder="Start typing a city — e.g. Noida, Mumbai, Jaipur…" /></label>
      <label className="wide"><span>Phone <i>optional</i></span><div><Phone size={17} /><input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="So your astrologer can reach you" /></div></label>
      <div className="onboarding-privacy wide"><ShieldCheck size={19} /><span><strong>Private by design</strong><small>Your natal details are encrypted in transit and never shown publicly.</small></span></div>
      {error && <p className="admin-auth-error wide" role="alert">{error}</p>}
      <button className="button wide" disabled={saving}>{saving ? "Saving your sky…" : editing ? "Save birth profile" : "Create my cosmic dashboard"}<ArrowRight size={16} /></button>
    </form>
  );
}
