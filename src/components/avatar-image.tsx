"use client";

import { useState, type CSSProperties, type ReactNode } from "react";

/** photoUrl/avatarUrl fields across the app are free-text admin input with no validation, so a
 * stale or mistyped URL renders a broken-image icon instead of the initials/glyph fallback that's
 * already used when no URL is set at all. This treats "failed to load" the same as "no URL". */
export function AvatarImage({ src, alt, fallback, className, style }: { src: string | null | undefined; alt: string; fallback: ReactNode; className?: string; style?: CSSProperties }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) return <>{fallback}</>;
  return <img src={src} alt={alt} className={className} style={style} onError={() => setBroken(true)} />;
}
