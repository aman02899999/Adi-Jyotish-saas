"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Loader2, MapPin } from "lucide-react";

type PlaceSuggestion = { id: string; label: string; city: string; province: string | null; country: string };

/**
 * Birth-place input backed by /api/geo/places — an India-wide (plus worldwide) offline city
 * database, so typing "Noida" or any of ~3,500 other Indian towns actually finds a match instead
 * of the free-text field silently accepting something the astro engine can't resolve later.
 * Selecting a suggestion sets the field to its exact canonical label, which the server always
 * resolves unambiguously.
 */
export function PlaceAutocomplete({ value, onChange, placeholder = "Start typing a city…", required, id, size = 16, wrapperClassName }: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  id?: string;
  size?: number;
  wrapperClassName?: string;
}) {
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);
  const listboxId = useId();

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  function scheduleSearch(query: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      requestIdRef.current += 1;
      setSuggestions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const requestId = ++requestIdRef.current;
      try {
        const response = await fetch(`/api/geo/places?q=${encodeURIComponent(query)}`);
        const data = await response.json();
        if (requestId !== requestIdRef.current) return;
        setSuggestions(Array.isArray(data.places) ? data.places : []);
      } catch {
        if (requestId === requestIdRef.current) setSuggestions([]);
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    }, 250);
  }

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const next = event.target.value;
    onChange(next);
    setOpen(true);
    setHighlighted(-1);
    scheduleSearch(next);
  }

  function selectSuggestion(suggestion: PlaceSuggestion) {
    onChange(suggestion.label);
    setSuggestions([]);
    setOpen(false);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || !suggestions.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlighted((index) => Math.min(index + 1, suggestions.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlighted((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && highlighted >= 0 && highlighted < suggestions.length) {
      event.preventDefault();
      selectSuggestion(suggestions[highlighted]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className={["place-autocomplete", wrapperClassName].filter(Boolean).join(" ")} ref={containerRef}>
      <MapPin size={size} />
      <input
        id={id}
        required={required}
        value={value}
        onChange={handleChange}
        onFocus={() => value.trim().length >= 2 && setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={open && suggestions.length > 0}
        aria-autocomplete="list"
        aria-controls={listboxId}
      />
      {loading && open && <Loader2 size={14} className="spin place-autocomplete__spinner" />}
      {open && suggestions.length > 0 && (
        <ul className="place-autocomplete__list" role="listbox" id={listboxId}>
          {suggestions.map((suggestion, index) => (
            <li
              key={suggestion.id}
              role="option"
              aria-selected={index === highlighted}
              className={index === highlighted ? "active" : undefined}
              onMouseDown={(event) => { event.preventDefault(); selectSuggestion(suggestion); }}
              onMouseEnter={() => setHighlighted(index)}
            >
              <strong>{suggestion.city}</strong>
              <span>{[suggestion.province, suggestion.country].filter(Boolean).join(", ")}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
