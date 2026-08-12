"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Gift } from "lucide-react";
import { ShareButtons } from "@/components/share-buttons";

/** Shown on every paid AI-reading's result screen — the one moment a client is most satisfied and
 * most likely to tell someone. Shares the public persona page (not the private answer itself) and
 * links to the referral program, which is otherwise only visible inside the logged-in dashboard. */
export function ReadingShareNudge({ path, shareTitle, shareText }: {
  path: string;
  shareTitle: string;
  shareText: string;
}) {
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    Promise.resolve().then(() => setOrigin(window.location.origin));
  }, []);
  const url = origin ? `${origin}${path}` : path;

  return (
    <div className="reading-share-nudge">
      <p className="reading-share-nudge__label">Know someone who&rsquo;d love this?</p>
      <ShareButtons url={url} title={shareTitle} text={shareText} />
      <Link href="/dashboard/referrals" className="reading-share-nudge__referral">
        <Gift size={14} /> Invite a friend, earn ₹150 wallet credit
      </Link>
    </div>
  );
}
