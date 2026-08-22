import type { Metadata } from "next";
import { NotebookPen } from "lucide-react";
import { MemberAppShell } from "@/components/member-app-shell";
import { JournalWidget } from "@/components/journal-widget";
import { getCurrentMember } from "@/lib/member-auth";
import { computeMoodInsight, listJournalEntries } from "@/lib/astro-journal";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Astro Journal" };

export default async function JournalPage() {
  const member = await getCurrentMember();
  if (!member) return null;

  const entries = await listJournalEntries(member.id);
  const insight = computeMoodInsight(entries);

  return (
    <MemberAppShell member={member} active="Journal">
      <div className="dashboard-welcome">
        <div><p><NotebookPen size={14} /> Your mood, over time</p><h1>Astro Journal</h1></div>
      </div>
      <p className="journal-intro">Log a quick mood check-in whenever you like. Once you have a few entries, we&rsquo;ll quietly start comparing them against the Moon&rsquo;s transit through your chart — no pressure, just a mirror.</p>
      <JournalWidget initialEntries={entries} initialInsight={insight} />
    </MemberAppShell>
  );
}
