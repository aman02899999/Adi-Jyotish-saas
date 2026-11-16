"use client";

import type { ComponentProps } from "react";
import { Link } from "@/i18n/navigation";
import { trackEvent } from "@/lib/track-event";

/** A link that records which way forward a visitor took. The event carries no personal details. */
export function TrackedLink({ event, eventParams, onClick, ...props }: ComponentProps<typeof Link> & { event: string; eventParams?: Record<string, string | number> }) {
  return <Link {...props} onClick={(clickEvent) => { trackEvent(event, eventParams); onClick?.(clickEvent); }} />;
}
