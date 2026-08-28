import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import API_BASE from "@/lib/api";

interface RoleSuggestion {
  title: string;
  normalized: string;
  managerCount: number;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  name?: string;
  maxLength?: number;
}

/**
 * Typeahead for the job title field.
 *
 * <p>This is the half of role normalization that actually stops the problem. Backfilling history
 * is a one-off; offering the spelling other people already used means the next person picks
 * "Senior Manager" instead of inventing "Snr. Mgr". Free text is still accepted — plenty of real
 * titles are company-specific and won't be in the list — so this nudges rather than constrains.
 *
 * <p>Suggestions arrive already ordered by how many people use each spelling, so the most common
 * one is simply first. The count itself is not shown — the ordering carries it.
 */
export function RoleAutocomplete({ value, onChange, placeholder, className, name, maxLength }: Props) {
  const [suggestions, setSuggestions] = useState<RoleSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const justSelectedRef = useRef(false);

  // Position the dropdown from the input's viewport rect so it escapes any overflow:hidden
  // ancestor — the add-manager form is inside a scrolling card.
  useEffect(() => {
    if (!open || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setDropdownStyle({
      position: "fixed",
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
      zIndex: 60,
    });
  }, [open, suggestions.length]);

  useEffect(() => {
    if (justSelectedRef.current) {
      justSelectedRef.current = false;
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const query = value.trim();
    if (query.length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `${API_BASE}/api/roles/suggest?query=${encodeURIComponent(query)}`,
        );
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as RoleSuggestion[];
        // A suggestion identical to what has already been typed is noise.
        const useful = data.filter(
          (s) => s.title.toLowerCase() !== query.toLowerCase(),
        );
        setSuggestions(useful);
        setOpen(useful.length > 0);
        setActiveIndex(-1);
      } catch {
        // Suggestions are a convenience — a failure here must never block typing a title.
        setSuggestions([]);
        setOpen(false);
      }
    }, 200);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value]);

  useEffect(() => {
    const onDocumentClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocumentClick);
    return () => document.removeEventListener("mousedown", onDocumentClick);
  }, []);

  const select = (suggestion: RoleSuggestion) => {
    justSelectedRef.current = true;
    onChange(suggestion.title);
    setOpen(false);
    setSuggestions([]);
    setActiveIndex(-1);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => (i + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      select(suggestions[activeIndex]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        placeholder={placeholder}
        maxLength={maxLength}
        className={className}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls="role-suggestions"
      />
      {open &&
        suggestions.length > 0 &&
        createPortal(
          <ul
            id="role-suggestions"
            role="listbox"
            style={dropdownStyle}
            className="max-h-60 overflow-auto rounded-lg border border-border bg-card py-1 shadow-lg"
          >
            {suggestions.map((suggestion, index) => (
              <li key={suggestion.normalized}>
                <button
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => select(suggestion)}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={`block w-full truncate px-3 py-2 text-left text-sm transition-colors ${
                    index === activeIndex ? "bg-muted text-foreground" : "text-foreground hover:bg-muted"
                  }`}
                >
                  {suggestion.title}
                </button>
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </div>
  );
}
