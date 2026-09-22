import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MapPin, Building2 } from "lucide-react";
import {
  LocationValue, LocationSuggestion, formatLocation, fromSuggestion, fetchLocationSuggestions,
} from "@/lib/location";
import { FormSubjectCard } from "@/components/RatingFormParts";
import { useAnchoredPosition } from "@/lib/anchoredDropdown";

/**
 * Where the work happened — one field, however specific the person happens to be.
 *
 * <p><b>One control, not three.</b> Country/state/city dropdowns would mirror our storage into the
 * form and make somebody navigate a hierarchy to say "the Walmart on Ottawa Street". The company is
 * already known by the time this is used, so the question is never "search the map", it is "which
 * of this company's places did you mean", and that is one question.
 *
 * <p><b>Typed text is search input; a selected suggestion is location data.</b> Nothing typed is
 * ever parsed into geography. "Waterlooo" is a query that found nothing, not a city — inventing a
 * normalized place from arbitrary text is how a directory fills up with locations that do not
 * exist.
 *
 * <p><b>Coarse is always a valid answer.</b> Country, province and city each stand on their own;
 * nobody is made to pick a street address to submit a rating. Somebody who only knows the province
 * should be able to say exactly that and stop.
 */
export function LocationField({
  value,
  onChange,
  companyId,
  companyName,
  editing,
  onEditStart,
  onEditDone,
  id = "location",
}: {
  value: LocationValue;
  onChange: (next: LocationValue) => void;
  /** The company this contribution is about; suggestions are its places, not the world's. */
  companyId?: number | null;
  companyName?: string;
  editing: boolean;
  onEditStart: () => void;
  onEditDone: () => void;
  id?: string;
}) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const justSelectedRef = useRef(false);

  const display = formatLocation(value);

  // Opening the editor starts from what is already shown, so correcting a suggestion means editing
  // it rather than retyping it from nothing.
  useEffect(() => {
    if (editing) {
      setQuery(display);
      setOpen(false);
      setActiveIndex(-1);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps

  // One shared implementation, so a list that runs off the edge of the screen is fixed for every
  // control that has one rather than for whichever was reported.
  const style = useAnchoredPosition(containerRef, open, [suggestions.length]);

  useEffect(() => {
    if (!editing) return;
    if (justSelectedRef.current) { justSelectedRef.current = false; return; }
    const q = query.trim();
    if (q.length < 2) { setSuggestions([]); setOpen(false); return; }

    const timer = setTimeout(() => {
      void (async () => {
        const found = await fetchLocationSuggestions(q, {
          companyId, companyName, country: value.country, state: value.state,
        });
        setSuggestions(found);
        setOpen(found.length > 0);
        setActiveIndex(-1);
      })();
    }, 180);  // the corpus query is the cost here, and it is now cached and run in parallel
    return () => clearTimeout(timer);
  }, [query, editing]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (containerRef.current?.contains(t) || dropdownRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const select = (s: LocationSuggestion) => {
    justSelectedRef.current = true;
    const next = fromSuggestion(s);
    onChange(next);
    setQuery(formatLocation(next));
    setSuggestions([]);
    setOpen(false);
    setActiveIndex(-1);
    // Choosing a place answers the question, so the control closes on it. Leaving the editor open
    // invites somebody to keep typing over a selection they have already made, and typed text is
    // never a location.
    onEditDone();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex(i => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex(i => (i - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      select(suggestions[activeIndex]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  /*
    The same card the company field and every other collapsible field on this form use, rather than
    a hand-rolled row that looked almost like them. Three near-identical summaries with three
    slightly different Edit controls is what made one form read as several products.
  */
  return (
    <div ref={containerRef}>
      <label htmlFor={id} className="block text-sm font-semibold text-foreground mb-2">
        Location *
      </label>
      <FormSubjectCard
        layout="inline"
        name={display || "No location set"}
        nameTestId={`${id}-value`}
        logo={<MapPin size={15} aria-hidden="true" className="shrink-0 text-muted-foreground" />}
        editing={editing}
        onEditStart={onEditStart}
        onEditDone={() => {
          /*
            Typed text that names a suggestion exactly is taken as that suggestion.

            Nothing typed is ever parsed into geography - "Waterlooo" is a query that found nothing,
            not a city - but somebody who typed "Toronto, Ontario, Canada" in full and pressed Done
            had it silently thrown away and the old value put back, which reads as the form
            refusing an answer it was showing them. An exact match is not a guess.
          */
          const typed = query.trim().toLowerCase();
          const exact = suggestions.find(s => s.label.trim().toLowerCase() === typed
                                          || (s.detail ?? "").trim().toLowerCase() === typed);
          if (exact) select(exact);
          setOpen(false);
          onEditDone();
        }}
        editLabel="Edit location details"
        doneLabel="Done editing location"
      >
        <input
          ref={inputRef}
          id={id}
          name="location"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls={`${id}-suggestions`}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="City, province, or the workplace itself"
          autoComplete="off"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#2e0562]"
        />
        <p className="text-xs leading-snug text-muted-foreground">
          Pick a suggestion to set the location. Being as specific as you actually know is enough —
          a province on its own is a complete answer.
        </p>
      </FormSubjectCard>

      {open && suggestions.length > 0 && createPortal(
        <div
          ref={dropdownRef}
          style={style}
          className="overflow-hidden rounded-lg border border-border bg-card shadow-lg"
        >
          <ul id={`${id}-suggestions`} role="listbox">
            {suggestions.map((s, i) => (
              <li key={`${s.kind}-${s.label}-${s.detail ?? i}`}>
                <button
                  type="button"
                  role="option"
                  aria-selected={i === activeIndex}
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => select(s)}
                  className={`flex w-full items-start gap-2.5 px-3 py-2.5 text-left ${
                    i === activeIndex ? "bg-muted" : ""
                  }`}
                >
                  {s.kind === "geo"
                    ? <MapPin size={15} aria-hidden="true" className="mt-0.5 shrink-0 text-muted-foreground" />
                    : <Building2 size={15} aria-hidden="true" className="mt-0.5 shrink-0 text-muted-foreground" />}
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-foreground">{s.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {s.kind === "geo" ? "Use this general location" : s.detail}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>,
        document.body,
      )}
    </div>
  );
}
