import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import API_BASE from "@/lib/api";

interface Suggestion {
  name: string;
  /**
   * The company's identity. Absent for a suggestion that has no companies row yet, and absent
   * entirely from the Clearbit-proxied results, which are external names we have never stored.
   */
  id?: number;
  domain?: string;   // present when sourced from Clearbit proxy
  logoUrl?: string;  // present when sourced from DB fallback
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSuggestionSelect?: (name: string, logoUrl: string | undefined) => void;
  /**
   * The selected company's ID, or undefined when the text no longer corresponds to a selection.
   *
   * Kept as its own callback rather than folded into onSuggestionSelect because the *clearing*
   * matters as much as the setting. Pick "Crumbl" (id 42), then type two more characters, and a
   * parent holding a stale 42 would file the manager under the wrong company - a silent
   * mis-attribution that looks exactly like correct behaviour. Fired with undefined on every
   * manual edit and on clear, so the ID cannot outlive the text it belongs to.
   */
  onCompanyIdChange?: (id: number | undefined) => void;
  onClear?: () => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  name?: string;
}

const LOGO_DEV_TOKEN = "pk_MXSjJV-uTC6-L5D_FbXZUA";

function suggestionLogoUrl(s: Suggestion): string | undefined {
  if (s.domain) return `https://img.logo.dev/${s.domain}?token=${LOGO_DEV_TOKEN}`;
  return s.logoUrl;
}

export function CompanyAutocomplete({ value, onChange, onSuggestionSelect, onCompanyIdChange, onClear, placeholder, className, autoFocus, name }: Props) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLUListElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const justSelectedRef = useRef(false);

  // Compute fixed-position dropdown coordinates from the container's viewport rect.
  // This makes the dropdown escape any overflow:hidden/auto ancestor (e.g. modal scroll containers).
  useEffect(() => {
    if (!open || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setDropdownStyle({
      position: "fixed",
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
      zIndex: 9999,
    });
  }, [open, suggestions]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = value.trim();
    if (trimmed.length < 1) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      if (justSelectedRef.current) {
        justSelectedRef.current = false;
        return;
      }
      try {
        const res = await fetch(
          `${API_BASE}/api/companies/suggest?query=${encodeURIComponent(trimmed)}`
        );
        if (!res.ok) return;
        const data: Suggestion[] = await res.json();
        const results = data.slice(0, 6);
        setSuggestions(results);
        setOpen(results.length > 0);
        setActiveIndex(-1);
      } catch {
        // suggest unavailable - free-text still works
      }
    }, 300);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [value]);

  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      const inContainer = containerRef.current?.contains(target);
      const inDropdown = dropdownRef.current?.contains(target);
      if (!inContainer && !inDropdown) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  const select = (s: Suggestion) => {
    justSelectedRef.current = true;
    onChange(s.name);
    setSelectedDomain(s.domain ?? null);
    // Undefined for an external (Clearbit) name or one with no companies row: the write path then
    // falls back to creating, which is correct, because there is nothing here to select.
    onCompanyIdChange?.(s.id);
    setOpen(false);
    setSuggestions([]);
    if (onSuggestionSelect) {
      const logoUrl = suggestionLogoUrl(s);
      onSuggestionSelect(s.name, logoUrl);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex(i => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex(i => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      select(suggestions[activeIndex]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  // Creating a company becomes a deliberate choice rather than a side effect of typing.
  // Someone who means "Crumbl" and types "Crumbl Cookies" should see Crumbl offered first; the
  // create row is still there, one click away, so nothing is blocked - it just stops being the
  // default outcome of not recognising a name.
  const typed = value.trim();
  const exactMatch = suggestions.some(s => s.name.trim().toLowerCase() === typed.toLowerCase());
  const showCreateRow = typed.length >= 2 && !exactMatch && suggestions.length > 0;

  const chooseCreate = () => {
    justSelectedRef.current = true;
    // No company row is being selected, so no identity travels with this. The write path creates.
    onCompanyIdChange?.(undefined);
    setSelectedDomain(null);
    setOpen(false);
    setSuggestions([]);
  };

  const hasClearButton = !!onClear && value.length > 0;
  const inputLogoUrl = selectedDomain ? `https://img.logo.dev/${selectedDomain}?token=${LOGO_DEV_TOKEN}` : null;

  const dropdown = open ? (
    <ul
      ref={dropdownRef}
      role="listbox"
      style={dropdownStyle}
      className="rounded-lg border border-border bg-background shadow-lg overflow-hidden"
    >
      {suggestions.map((s, i) => {
        const logo = suggestionLogoUrl(s);
        return (
          <li
            role="option"
            aria-selected={i === activeIndex}
            key={s.domain ?? s.name}
            onPointerDown={e => { e.preventDefault(); select(s); }}
            style={i === activeIndex ? { backgroundColor: '#d5cde0' } : undefined}
            className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer text-sm transition-colors ${
              i === activeIndex ? "" : "hover:bg-[#d5cde0]"
            }`}
          >
            {logo && (
              <img
                src={logo}
                alt=""
                className="h-5 w-5 rounded object-contain flex-shrink-0"
                onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            )}
            <span className="truncate text-foreground">{s.name}</span>
            {s.domain && (
              <span className="ml-auto text-xs text-muted-foreground shrink-0">{s.domain}</span>
            )}
          </li>
        );
      })}
      {showCreateRow && (
        <li
          role="option"
          aria-selected={false}
          onPointerDown={e => { e.preventDefault(); chooseCreate(); }}
          className="flex items-start gap-2 border-t border-border px-3 py-2 cursor-pointer text-sm text-muted-foreground transition-colors hover:bg-[#d5cde0] hover:text-foreground"
        >
          <span className="text-base leading-none shrink-0">+</span>
          {/* Wraps rather than truncates: the whole point of this row is to show the user the
              exact name they are about to create, and "Crum..." does not do that. */}
          <span className="min-w-0 break-words">Not listed? Add <span className="font-medium text-foreground">{typed}</span></span>
        </li>
      )}
    </ul>
  ) : null;

  return (
    <div ref={containerRef} className="relative">
      {inputLogoUrl && (
        <img
          src={inputLogoUrl}
          alt=""
          className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 rounded object-contain pointer-events-none z-10"
          onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
        />
      )}
      <input
        type="text"
        name={name}
        value={value}
        onChange={e => {
          setSelectedDomain(null);
          // Typing invalidates the selection. Same lifecycle as the logo above it.
          onCompanyIdChange?.(undefined);
          onChange(e.target.value);
        }}
        onKeyDown={handleKeyDown}
        onFocus={() => { if (suggestions.length > 0) setOpen(true); }}
        placeholder={placeholder}
        autoFocus={autoFocus}
        maxLength={100}
        className={`${className ?? ""} ${hasClearButton ? "pr-8" : ""} ${inputLogoUrl ? "pl-8" : ""}`}
      />
      {hasClearButton && (
        <button
          type="button"
          onClick={() => { setSelectedDomain(null); onCompanyIdChange?.(undefined); onClear!(); }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          tabIndex={-1}
        >
          <X size={14} />
        </button>
      )}
      {typeof document !== "undefined" && dropdown && createPortal(dropdown, document.body)}
    </div>
  );
}
