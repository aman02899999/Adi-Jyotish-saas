"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Search } from "lucide-react";
import { useRouter } from "@/i18n/navigation";

export type QuickNavItem = { label: string; href: string };

/** A real, working "jump to a section" search for the admin/member topbar — filters the portal's
 * own nav items as you type and navigates on select, instead of the decorative, unwired search
 * boxes that used to sit there. Also wires ⌘K/Ctrl+K to focus the input, since the admin topbar
 * already displayed that hint without anything backing it. */
export function QuickNavSearch({ items, placeholder, ariaLabel, showShortcutHint = false }: { items: QuickNavItem[]; placeholder: string; ariaLabel: string; showShortcutHint?: boolean }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const router = useRouter();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const matches = query.trim() ? items.filter((item) => item.label.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8) : [];

  function go(href: string) {
    setQuery("");
    setOpen(false);
    inputRef.current?.blur();
    router.push(href);
  }

  return (
    <div className="quick-nav-search">
      <label>
        <Search size={16} />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(event) => { if (event.key === "Enter" && matches[0]) go(matches[0].href); if (event.key === "Escape") { setQuery(""); setOpen(false); inputRef.current?.blur(); } }}
          placeholder={placeholder}
          aria-label={ariaLabel}
          role="combobox"
          aria-expanded={open && matches.length > 0}
          aria-controls={listId}
          autoComplete="off"
        />
        {showShortcutHint && <kbd>⌘ K</kbd>}
      </label>
      {open && matches.length > 0 && (
        <ul id={listId} className="quick-nav-search__results" role="listbox">
          {matches.map((item) => (
            <li key={item.href} role="option" aria-selected="false">
              <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => go(item.href)}>{item.label}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
