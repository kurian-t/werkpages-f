import { useEffect, useRef, useState } from "react";
import API_BASE from "@/lib/api";
import { createPortal } from "react-dom";
import { MapPin, Building2 } from "lucide-react";
import {
  LocationValue, LocationSuggestion, formatLocation, fromSuggestion, fetchLocationSuggestions,
  hasGeography, mergeWidenedSuggestions,
} from "@/lib/location";
import { FormSubjectCard } from "@/components/RatingFormParts";
import { RequiredMark } from "@/components/FormFields";
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
/** Two country names meaning the same place, however they were written. */
function sameCountry(a?: string | null, b?: string | null): boolean {
  return !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * A country the reader named in the query itself.
 *
 * <p>Somebody typing "Toronto, Ontario, Canada" has said which country they mean, and refusing to
 * look there because the field currently holds a UK location is the whole bug. Only the last
 * comma-separated part is considered, which is where a country goes.
 */
function countryNamedIn(query: string): string | null {
  const parts = query.split(",").map((p) => p.trim()).filter(Boolean);
  return parts.length >= 2 ? parts[parts.length - 1] : null;
}

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
  /*
    Which search is the current one.

    Requests are not cancelled and do not finish in order - a US corpus scan can take twenty
    seconds while the next keystroke's Canadian one takes a third of one - so every reply checks
    that it is still the newest before touching the list.
  */
  const latestRef = useRef(0);
  /*
    The reader's own country, used only to widen a search that found nothing - never to overrule
    what they typed or what the field already holds.
  */
  const [geoCountry, setGeoCountry] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/geo`);
        const geo = await res.json();
        if (!cancelled && geo?.country) setGeoCountry(geo.country as string);
      } catch {
        // A widened search is a convenience; failing to learn the country must break nothing.
      }
    })();
    return () => { cancelled = true; };
  }, []);
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

    const seq = ++latestRef.current;
    const timer = setTimeout(() => {
      void (async () => {
        /*
          The country narrows the search, and it must never trap it.

          This passed value.country as a hard filter - the country of the location being EDITED.
          Once a field held "Herne Bay, England, United Kingdom", every later search was confined
          to the UK: typing "Toronto, Ontario" matched nothing, so there was no suggestion to
          pick, so the country could never change. The filter made itself permanent.

          Narrow first, then widen. The current country is still tried first, because "Waterloo"
          under Ontario should not offer Waterloo, Belgium.

          WIDEN ON NO GEOGRAPHY, NOT ON NO RESULTS.

          Widening used to need the list to come back completely empty, which it almost never
          does: searching "kitchener" against the UK returns a London pub called "Lord Kitchener",
          and one irrelevant pub was enough to count as success and cancel the retry. Kitchener,
          Ontario could not be reached at all - the same trap as before, now sprung by a business
          name rather than by an empty list.

          A `geo` row is the answer being asked for here; a `place` is a bonus. So the test is
          whether any geography came back, and the widened results are MERGED rather than
          substituted, because a genuine search for that pub should still find it.
        */
        let found = await fetchLocationSuggestions(q, {
          companyId, companyName, country: value.country, state: value.state,
        });
        // Show what we have straight away. The widening below is an extra round trip, and making
        // the whole list wait for it is what made a search that already had answers feel slow.
        if (seq === latestRef.current && found.length > 0) {
          setSuggestions(found);
          setOpen(true);
          setActiveIndex(-1);
        }

        if (!hasGeography(found)) {
          for (const fallback of [geoCountry, countryNamedIn(q)]) {
            if (!fallback || sameCountry(fallback, value.country)) continue;
            const widened = await fetchLocationSuggestions(q, { companyId, companyName, country: fallback });
            const merged = mergeWidenedSuggestions(found, widened);
            if (merged !== found) { found = merged; break; }
            if (found.length === 0 && widened.length > 0) { found = widened; break; }
          }
        }

        // A reply from a query the user has already typed past must never replace a newer one.
        // US partitions can take twenty seconds, so an abandoned request landing late would
        // overwrite the list somebody was reading.
        if (seq !== latestRef.current) return;

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
        Location <RequiredMark />
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
          {/*
            Required, not decorative.

            The geography rows come from GeoNames under CC BY 4.0, which is attribution-only but
            obliges attribution wherever the data is surfaced, and this list is where it surfaces.
            The building rows come from Overture Places under CDLA-Permissive-2.0. Overture's
            divisions theme was deliberately not used: it is 98.3% OpenStreetMap under ODbL-1.0,
            which would have put share-alike obligations on half the corpus.

            In the dropdown rather than the page footer so it travels with the data: a reader who
            never opens this control is never shown data that needs crediting.
          */}
          <p className="border-t border-border px-3 py-1.5 text-[11px] leading-snug text-muted-foreground">
            Location data from{" "}
            <a href="https://www.geonames.org/" target="_blank" rel="noopener noreferrer"
               className="underline hover:text-foreground">GeoNames</a>
            {" "}(
            <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer"
               className="underline hover:text-foreground">CC BY 4.0</a>
            ) and{" "}
            <a href="https://overturemaps.org/" target="_blank" rel="noopener noreferrer"
               className="underline hover:text-foreground">Overture Maps</a>
          </p>
        </div>,
        document.body,
      )}
    </div>
  );
}
