import { useEffect, useRef, useState } from "react";
import API_BASE from "@/lib/api";
import { createPortal } from "react-dom";
import { MapPin, Building2 } from "lucide-react";
import {
  LocationValue, LocationSuggestion, formatLocation, fromSuggestion, fetchLocationSuggestions,
  mergeWidenedSuggestions, fromManualText, preferCountry } from "@/lib/location";
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
export function LocationField({
  value,
  onChange,
  companyId,
  companyName,
  editing,
  onEditStart,
  onEditDone,
  id = "location",
  error,
  heading,
  labelHidden,
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
  /**
   * Why the form will not accept what is here, shown under the field.
   *
   * <p>The label has always carried a required asterisk; nothing enforced it, because the location
   * is separate state and the draft validator cannot see it. A promise on screen with no
   * enforcement behind it is worse than no marker at all.
   */
  error?: string;
  /**
   * Ask the question as a section heading instead of a field label.
   *
   * <p>Set it on a form where the location is its own question sitting beside other questions of
   * equal weight - the workplace rating pairs it with "When did you work here?", which is a 22px
   * h2, so a 14px "Location" label beside it read as a sub-detail of the dates rather than a
   * question in its own right.
   *
   * <p>Left unset elsewhere on purpose. In ManagerFormFields the location sits next to a
   * {@code text-sm font-semibold} company label, and in the admin editor among small inputs;
   * promoting it there would be louder than everything around it. Hence a prop rather than
   * changing the shared default - same control, two weights of question.
   *
   * <p>Still rendered as a {@code <label htmlFor>}, not an {@code <h2>}: it is visually a heading
   * but it is genuinely the input's label, and turning it into a heading would leave the field
   * unlabelled for a screen reader to gain nothing.
   */
  heading?: string;
  /**
   * Hide the label VISUALLY, for a caller whose surrounding text already asks the question.
   *
   * <p>The search form reads "… at <company> in <location>", so a "Location *" label above the
   * control repeats the word the sentence has already said and implies a required field in a form
   * that has no required location.
   *
   * <p>Hidden with sr-only rather than removed: it is still the input's label, and deleting it
   * would leave the control unnamed for anybody using a screen reader. A prop here rather than a
   * second component, because that is how the two location fields drifted apart last time.
   */
  labelHidden?: boolean;
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
        /*
          ONE REQUEST, WORLDWIDE. The location being edited is never a filter on its replacement.

          THE INVARIANT: an existing location must never prevent somebody searching for or
          selecting a different one.

          value.country and value.state used to be sent as hard filters, and a filter makes itself
          permanent - a field holding "London, Ontario" could only ever find Canadian places, so
          the country could not be changed from inside the field that held it. Three separate
          symptoms, all this one cause: "United Kingdom" offered a freight company in Montreal,
          "London, England" offered England in ARKANSAS, and a saved UK location could not be moved
          to Toronto.

          Two earlier attempts fixed it conditionally - widen when nothing came back, then widen
          when no GEOGRAPHY came back - and each condition failed on a case nobody had thought of:
          a pub called "Lord Kitchener" counted as success, and so did England, Arkansas. A
          condition that decides in advance whether the narrow answer was good enough will always
          have another case.

          So there is no narrow answer and no second request. The corpus is worldwide and local,
          measured at roughly 35ms, so one unrestricted query is cheaper than the two this
          replaces. The country returns as a RANKING preference below, where it can order the list
          but can never remove anything from it.
        */
        const found = preferCountry(
          await fetchLocationSuggestions(q, { companyId, companyName }),
          value.country,
        );

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
      <label
        htmlFor={id}
        className={labelHidden
          ? "sr-only"
          : heading
          // Matched to WorkTimelineFields' heading, so the two questions on this step are the
          // same size. If that one changes, this has to change with it.
          ? "block text-[22px] font-semibold text-foreground mb-2"
          : "block text-sm font-semibold text-foreground mb-2"}
      >
        {heading ?? "Location"} {labelHidden ? null : <RequiredMark />}
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
          const raw = query.trim();
          const typed = raw.toLowerCase();
          const exact = suggestions.find(s => s.label.trim().toLowerCase() === typed
                                          || (s.detail ?? "").trim().toLowerCase() === typed);
          if (exact) {
            select(exact);
          } else if (raw && raw !== formatLocation(value).trim()) {
            /*
              AN ANSWER THE CORPUS COULD NOT OFFER IS STILL AN ANSWER.

              Location is mandatory; choosing a suggestion is not. A workplace the corpus has never
              held, a query it answers with nothing, or a corpus that is simply unreachable must
              never be the reason somebody cannot say where they worked. Until now anything that
              did not match a suggestion was discarded and the previous value restored - and since
              the field no longer arrives prepopulated, "the previous value" is usually nothing at
              all, so the answer vanished and Next stayed disabled with no way to satisfy it.

              NOTHING IS INFERRED FROM THE TEXT. fromManualText keeps the string as written and
              marks it unverified; it does not parse a city out of it or attach a corpus identity.
              That rule - typed text is not normalized geography - is the one worth keeping, and
              accepting an answer was never the same thing as corroborating it.
            */
            onChange(fromManualText(raw));
          }
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

      {/* Outside the card, so it is visible whether the field is open or collapsed. */}
      {error && <p className="mt-2 text-sm text-red-500" data-testid={`${id}-error`}>{error}</p>}

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
