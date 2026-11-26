import { useState, useEffect, useRef } from "react";
import { useAnchoredPosition } from "@/lib/anchoredDropdown";
import { createPortal } from "react-dom";
import API_BASE from "@/lib/api";

interface RoleSuggestion {
  title: string;
  normalized: string;
  /*
    The short form, when the title has one. Shown in the row as "CEO (Chief Executive Officer)"
    so an acronym is never lost and the expansion is never a surprise. It is a LABEL only: what
    gets stored on selection is `title`, the extended form, because the match key is computed
    from the stored value and "CEO (Chief Executive Officer)" would expand to the long form
    twice over.
  */
  acronym?: string | null;
  usageCount: number;
}

/** What a row reads. The pair where there is one, the words alone otherwise. */
function rowLabel(s: RoleSuggestion): string {
  return s.acronym ? `${s.acronym} (${s.title})` : s.title;
}

interface Props {
  /** Lets a caller's <label htmlFor> actually point at the input. */
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  name?: string;
  maxLength?: number;
  /*
    Grown rather than copied. PositionEditor's title field had FormTextInput's invalid state and
    the admin fields have their own test ids, and the rule is that a control asking the same
    question gains a prop instead of a second implementation. The red outline itself stays with
    the caller's className, because two Tailwind border classes on one element are decided by
    stylesheet order rather than attribute order.
  */
  invalid?: boolean;
  /** When the visible label sits elsewhere, as it does inside a two-column row. */
  ariaLabel?: string;
  /** So a caller's existing test id survives the swap. */
  testId?: string;
}

/**
 * Typeahead for the job title field.
 *
 * <p>This is the half of role normalization that actually stops the problem. Backfilling history
 * is a one-off; offering the spelling other people already used means the next person picks
 * "Senior Manager" instead of inventing "Snr. Mgr". Free text is still accepted - plenty of real
 * titles are company-specific and won't be in the list - so this nudges rather than constrains.
 *
 * <p>Suggestions arrive already ordered by how many people use each spelling, so the most common
 * one is simply first. The count itself is not shown - the ordering carries it.
 */
export function RoleAutocomplete({ id, value, onChange, placeholder, className, name, maxLength, invalid = false, ariaLabel, testId }: Props) {
  const [suggestions, setSuggestions] = useState<RoleSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLUListElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const justSelectedRef = useRef(false);
  /*
    Whether the person has actually typed in this field.

    A pre-filled field is not a question. The review form opens with the manager's current role
    already in the box, and fetching on every change of `value` meant that arriving counted as
    typing: the list opened on its own, and because it is portalled and anchored under the input it
    covered the controls beneath - "Done editing" among them, which simply could not be clicked.

    So suggestions follow a keystroke, never a mount.
  */
  const userTypedRef = useRef(false);

  // One shared implementation, so a list running off the edge of the screen is fixed for every
  // control that has one rather than for whichever was reported.
  const dropdownStyle = useAnchoredPosition(containerRef, open, [suggestions.length], 60);

  useEffect(() => {
    if (justSelectedRef.current) {
      justSelectedRef.current = false;
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);

    // Not typed in yet: no request, no list. Checked before the query length so that opening a
    // field with a long value stays as silent as opening an empty one.
    if (!userTypedRef.current) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

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
        /*
          OPENED WHENEVER THERE IS SOMETHING TO SHOW, AND THE ADD ROW IS SOMETHING TO SHOW.

          This read `useful.length > 0`, so a title nobody has used produced no dropdown at all,
          and "Not listed? Add ..." lives inside that dropdown. The one affordance for adding an
          unknown title was reachable only when the title was already known. CompanyAutocomplete
          had the identical defect and had it fixed; this is the same fix, and the two should be
          one component (see the design doc, D14).

          AND ONLY WHILE THE FIELD STILL HAS FOCUS. This runs after the debounce, by which time
          the person may have moved on. Opening regardless floats a portalled list over whatever
          they moved to, which on the add-manager form means two open listboxes and a swallowed
          click.
        */
        const stillFocused = containerRef.current?.contains(document.activeElement);
        setOpen(stillFocused ? useful.length > 0 || query.length >= 2 : false);
        setActiveIndex(-1);
      } catch {
        // Suggestions are a convenience - a failure here must never block typing a title.
        setSuggestions([]);
        setOpen(false);
      }
    }, 120);  // the endpoint answers in single-digit milliseconds; the wait was almost entirely this timer

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value]);

  useEffect(() => {
    const onDocumentClick = (event: MouseEvent) => {
      const target = event.target as Node;
      // The list is portalled to document.body, so it is NOT inside containerRef. Without
      // checking it too, clicking a suggestion closed the list on mousedown and unmounted the
      // button before its click could fire - the dropdown looked unselectable.
      if (containerRef.current?.contains(target) || dropdownRef.current?.contains(target)) return;
      setOpen(false);
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

  const typed = value.trim();
  /*
    Offered when there is something to create with and no exact match already listed. Mirrors
    CompanyAutocomplete's rule, deliberately: a person who types a title we do not hold must be
    told it will be used, not left looking at an empty field wondering what it wants.
  */
  const exactMatch = suggestions.some((s) => s.title.toLowerCase() === typed.toLowerCase());
  const showCreateRow = typed.length >= 2 && !exactMatch;
  /* The create row is the last option, so the keyboard can reach it like any other. */
  const optionCount = suggestions.length + (showCreateRow ? 1 : 0);

  const chooseCreate = () => {
    justSelectedRef.current = true;
    setOpen(false);
    setSuggestions([]);
    setActiveIndex(-1);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || optionCount === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => (i + 1) % optionCount);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => (i <= 0 ? optionCount - 1 : i - 1));
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      if (activeIndex < suggestions.length) select(suggestions[activeIndex]);
      else chooseCreate();
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <input
        id={id}
        type="text"
        name={name}
        value={value}
        onChange={(e) => {
          userTypedRef.current = true;
          onChange(e.target.value);
        }}
        onKeyDown={onKeyDown}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        placeholder={placeholder}
        maxLength={maxLength}
        className={className}
        autoComplete="off"
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        data-testid={testId}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls="role-suggestions"
      />
      {open &&
        (suggestions.length > 0 || showCreateRow) &&
        createPortal(
          <ul
            ref={dropdownRef}
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
                  /*
                    The SAME highlight the company list uses, down to the hex and the mechanism.
                    This was `bg-muted`, a grey, while CompanyAutocomplete marked its rows in the
                    brand lavender, so the two dropdowns on one form highlighted differently. The
                    colour is an inline style rather than a class for the reason the company list
                    already had it that way: it does not depend on Tailwind having generated a
                    bare `bg-[#d5cde0]` rule from some other file that happens to mention it.
                  */
                  style={index === activeIndex ? { backgroundColor: "#d5cde0" } : undefined}
                  className={`block w-full truncate px-3 py-2 text-left text-sm transition-colors ${
                    index === activeIndex ? "text-foreground" : "text-foreground hover:bg-[#d5cde0]"
                  }`}
                >
                  {rowLabel(suggestion)}
                </button>
              </li>
            ))}
            {showCreateRow && (
              <li>
                <button
                  type="button"
                  role="option"
                  aria-selected={activeIndex === suggestions.length}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={chooseCreate}
                  onMouseEnter={() => setActiveIndex(suggestions.length)}
                  style={activeIndex === suggestions.length ? { backgroundColor: "#d5cde0" } : undefined}
                  className={`flex w-full items-start gap-2 border-t border-border px-3 py-2 text-left text-sm transition-colors ${
                    activeIndex === suggestions.length
                      ? "text-foreground"
                      : "text-muted-foreground hover:bg-[#d5cde0] hover:text-foreground"
                  }`}
                >
                  <span className="shrink-0 text-base leading-none">+</span>
                  {/* Wraps rather than truncates: the point of this row is to show the exact
                      words about to be used, and "Princip..." does not do that. */}
                  <span className="min-w-0 break-words">
                    Not listed? Add <span className="font-medium text-foreground">{typed}</span>
                  </span>
                </button>
              </li>
            )}
          </ul>,
          document.body,
        )}
    </div>
  );
}
