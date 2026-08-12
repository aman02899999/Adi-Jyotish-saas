"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/** Next.js gives no built-in "navigation is in flight" signal for plain <Link> clicks, so a click
 * on any nav/CTA link to a server-rendered page (most of this app is `dynamic = "force-dynamic"`)
 * can sit for a noticeable moment with zero visual feedback before the new page appears. This
 * shows a top progress bar for that whole window: started on click, cleared once the pathname
 * this navigation was headed to actually commits. */
export function RouteProgress() {
  const pathname = usePathname();
  const [active, setActive] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Reacting to the route actually having committed (an external browser-navigation event), not
    // mirroring a prop into state — this is the one signal that a click-triggered bar should clear.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActive(false);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, [pathname]);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as HTMLElement | null)?.closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || anchor.target === "_blank" || anchor.hasAttribute("download")) return;

      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname) return; // same route (hash links, filters via search params, etc.)

      setActive(true);
      // Safety net in case the destination never actually commits (e.g. a chunk-load failure) —
      // the bar shouldn't spin forever.
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setActive(false), 8000);
    }

    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  if (!active) return null;
  return <div className="route-progress" aria-hidden="true" />;
}
