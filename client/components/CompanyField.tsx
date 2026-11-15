import { useState, useEffect } from "react";
import API_BASE from "@/lib/api";
import { CompanyLogoImg } from "@/components/ManagerCard";
import { CompanyAutocomplete } from "@/components/CompanyAutocomplete";
import { FormSubjectCard } from "@/components/RatingFormParts";
import { RequiredMark } from "@/components/FormFields";

/*
  COMPANY NAME -> DOMAIN, REMEMBERED.

  The lookup that draws a typed company's logo is a network round trip behind a debounce, so on
  every refresh and every step back the employer appeared as a grey initial and then turned into
  its logo a third of a second later. A company's domain does not change while somebody fills in a
  form, and it rarely changes at all.

  Two layers, because they fix different halves of the delay:

    - the Map makes a second lookup in the same session free, which is what "back" hits
    - localStorage makes the FIRST lookup after a refresh free, which is what a reload hits

  Capped and oldest-out, so a long session of typing company names cannot grow without bound.
  Every storage access is wrapped: a private window, full storage or blocked site data must cost a
  logo, never a render.
*/
const DOMAIN_CACHE_KEY = "company-domain-cache-v1";
const DOMAIN_CACHE_MAX = 200;
const domainCache = new Map<string, string>(readDomainCache());

function readDomainCache(): Array<[string, string]> {
  try {
    const raw = localStorage.getItem(DOMAIN_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed.filter(e => Array.isArray(e) && e.length === 2) : [];
  } catch {
    return [];
  }
}

function rememberDomain(name: string, domain: string) {
  domainCache.delete(name);
  domainCache.set(name, domain);
  while (domainCache.size > DOMAIN_CACHE_MAX) {
    domainCache.delete(domainCache.keys().next().value as string);
  }
  try {
    localStorage.setItem(DOMAIN_CACHE_KEY, JSON.stringify([...domainCache]));
  } catch {
    // Out of space or blocked. The in-memory half still works for this session.
  }
}

/**
 * Choosing a company, wherever a form asks for one.
 *
 * This shape was hand-rolled on five forms: a card showing the logo and the name with an "Edit
 * details" pencil, swapping in place for a picker with "Done editing" underneath. Five copies of
 * one interaction, and every one of them had to be fixed separately - the logo missing from a
 * pre-filled field, the card unmounting when you backspaced to a single character, picking a
 * suggestion closing the editor before you could look at it. Each was reported as a bug on one
 * form while the identical bug sat in the other four.
 *
 * So the interaction lives here once. A caller supplies the value and is told when it changes;
 * everything about how choosing a company looks and behaves is this component's business.
 *
 * The rules it owns, each of which was a bug at some point:
 *
 *  - the editing state is internal, so no caller can forget to close it or close it too eagerly;
 *  - the card stays mounted for the whole edit regardless of what the value is mid-typing, so the
 *    control never changes shape under the cursor;
 *  - picking a suggestion fills the field and leaves the editor open, because choosing and
 *    finishing are separate decisions;
 *  - the value is committed whether or not "Done editing" is clicked - the button tidies the view,
 *    it is not a save.
 */
export function CompanyField({
  value,
  onChange,
  onCompanyIdChange,
  onSuggestionSelect,
  onSuggestionPicked,
  logoUrl,
  logoUrlFor,
  initialDomain,
  initialBrandfetchIconUrl,
  label = "Company",
  required = true,
  placeholder = "e.g. Acme Corp",
  hint,
  inputClassName,
}: {
  value: string;
  onChange: (value: string) => void;
  onCompanyIdChange?: (id: number | undefined) => void;
  onSuggestionSelect?: (name: string, logoUrl: string | undefined) => void;
  onSuggestionPicked?: (s: { id?: number; name: string; slug?: string; logoUrl?: string }) => void;
  /** A logo already known for this company, e.g. one stored on the manager row. */
  logoUrl?: string;
  /**
   * The company name {@link logoUrl} belongs to.
   *
   * A caller's stored logo is for the company it loaded. Once the reader types a different one the
   * two no longer match, and passing it through put Google's mark next to the word "Facebook".
   * When the value has moved on the logo is resolved from the name instead.
   */
  logoUrlFor?: string;
  /** The identity of the company already in the field, so it renders a logo on open. */
  initialDomain?: string | null;
  initialBrandfetchIconUrl?: string | null;
  label?: string | null;
  required?: boolean;
  placeholder?: string;
  /** Rendered under the field - a length warning, a duplicate-role notice. */
  hint?: React.ReactNode;
  inputClassName?: string;
}) {
  /*
    The label has to name the input, not merely sit above it.

    Without htmlFor/id a screen reader announces an unlabelled text box, and clicking the label
    focuses nothing - the same defect this codebase has had to fix on the account modal and the
    career-role selector. Fixing it here fixes it for every form that asks for a company.
  */
  const fieldId = "company-field";
  const [editing, setEditing] = useState(false);
  /*
    True while the reader is part-way through typing a name into the bare picker.

    Without it, the second keystroke in an empty field pushed the value past the length threshold
    below, the field re-rendered as a card, and because no edit was in progress the card showed its
    *summary* - so the input the person was typing into vanished mid-word and took the caret with
    it. It looked like a company being auto-selected.

    Cleared by picking a suggestion, which is what settles a value.
  */
  const [typing, setTyping] = useState(false);

  const settled = value.trim().length > 1;
  /*
    Presented as a card once there is a company to show, and while an edit is in progress.

    Two guards, each for a bug this caused.

    `editing` keeps the card up for the whole edit: keyed on length alone, backspacing to one
    character dropped below the threshold and unmounted the card mid-edit, taking "Done editing"
    with it.

    `!typing` keeps it *down* while somebody is filling an empty field: the second keystroke would
    otherwise flip a bare input into a summary card and swallow the caret.

    Length decides how a settled, idle field presents. It decides nothing while a person is busy.
  */
  const asCard = editing || (settled && !typing);

  /*
    Whether the supplied logo is still about the company on screen. Without a name to compare
    against, a supplied logo is assumed to be for the initial value and dropped as soon as the
    reader changes it.
  */
  const norm = (v?: string) => (v ?? "").trim().toLowerCase();
  const logoBelongsToValue =
    !!logoUrl && (logoUrlFor ? norm(logoUrlFor) === norm(value) : true);

  /*
    The logo of the suggestion picked in THIS field, remembered here.

    The collapsed card showed only what the caller passed down. A caller holding the pick in its
    own state but not threading it back - AddBoss and AddInterview both - collapsed to a logo
    GUESSED from the company name, because CompanyLogoImg falls back to buildLogoDevUrl(name).

    That guess is not a near miss. companyLogoDomain("Lime") is "lime.com"; the Lime people
    actually pick from the dropdown is "li.me". So choosing Lime showed the right mark, and
    clicking "Done editing" replaced it with an unrelated company's - and no amount of re-editing
    could stick, because the pick was never what the card read.

    Owned here rather than by the callers: five of them had to wire this correctly and most did
    not. A field that asks the question owns the answer it displays.
  */
  const [picked, setPicked] = useState<{ name: string; logoUrl?: string; domain?: string; brandfetchIconUrl?: string } | null>(null);
  const pickedBelongsToValue = !!picked && norm(picked.name) === norm(value);

  /*
    THE MARK FOR A NAME SOMEBODY TYPED RATHER THAN PICKED.

    Only a pick from the dropdown carried a logo, so typing "MSN" in full - which the suggestions
    themselves encourage, since the right name is right there - settled to a grey "M" for a company
    this product holds, with a domain, and had just drawn correctly in the list one line above.

    This is a LOOKUP, not a guess. It asks the same endpoint the dropdown uses and accepts only an
    exact name match, then uses that company's stored domain. Guessing a domain from a name is
    precisely what this codebase refuses to do, because `companyLogoDomain("Lime")` is "lime.com"
    while the real Lime is "li.me" - a confident, wrong logo.

    It never touches identity. The hook's rule is that typing clears the company id, and that rule
    is what stops a rating landing on the wrong employer; this only decides which picture to draw.
  */
  const [resolved, setResolved] = useState<{ name: string; domain: string } | null>(null);
  const typedName = value.trim();
  /*
    RESOLVED EVEN WHEN A CALLER SUPPLIED A LOGO, because a supplied logo can be wrong.

    This used to skip the lookup whenever any logo was handed down. The review form on a manager
    profile passes `managers.company_logo_url`, and for a company with no domain that column holds
    a GUESS - img.logo.dev/halversonlogistics.com - which 404s. The field then had a broken URL,
    no domain to fall back to, and drew the initial, while the identical field on the add form drew
    the real mark. Same question, two answers, depending on which page you were on.

    `logoCandidates` tries the stored URL first and the domain second, so resolving the domain here
    costs nothing when the supplied logo works and repairs the field when it does not. The only
    case still skipped is a pick made in this field, which already carries its own domain.
  */
  const needsLookup = !!typedName && !pickedBelongsToValue;

  useEffect(() => {
    if (!needsLookup) return;

    /*
      A cache hit is applied in the same tick: no debounce, no request, no flash of the initial.
      This is the path a refresh and a step back take, which is where the delay was visible.
    */
    const cached = domainCache.get(norm(typedName));
    if (cached) {
      setResolved(prev =>
        prev && norm(prev.name) === norm(typedName) ? prev : { name: typedName, domain: cached });
      return;
    }

    let cancelled = false;
    // Debounced, because a miss only happens while somebody is still typing the name.
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `${API_BASE}/api/companies/suggest?query=${encodeURIComponent(typedName)}`,
        );
        if (!res.ok) return;
        const list: Array<{ name?: string; domain?: string }> = await res.json();
        const exact = list.find(c => norm(c.name) === norm(typedName) && !!c.domain);
        if (exact?.domain) {
          // Remembered even if this field has since moved on: the next one asking pays nothing.
          rememberDomain(norm(typedName), exact.domain);
          if (!cancelled) setResolved({ name: typedName, domain: exact.domain });
        }
      } catch {
        // A logo is not worth an error state. The initial is a fine answer.
      }
    }, 350);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [typedName, needsLookup]);

  const resolvedDomain =
    resolved && norm(resolved.name) === norm(value) ? resolved.domain : undefined;

  const shownLogoUrl = pickedBelongsToValue
    ? picked!.logoUrl
    : (logoBelongsToValue ? logoUrl : undefined);

  /*
    THE LOGO THE EDITOR MAY SHOW, which is a STRICTER question than the one the card answers.

    The card tolerates a supplied logo with no name attached: logoBelongsToValue falls back to
    true when a caller passes logoUrl without logoUrlFor, on the reasoning that it must be for
    the value the field opened with. That is survivable on a collapsed card, which the caller
    only sees for a settled value.

    It is not survivable inside the editor, which is where somebody TYPES. Handing the input that
    same logo kept Lime's mark on screen while the field read "Something Else Entirely" - a
    regression this file's own test caught, and the exact failure the staleness checks exist to
    prevent. So the editor takes a logo only when something SAYS which company it belongs to:
    this field's own pick, or a caller that named it.
  */
  const editorLogoUrl = pickedBelongsToValue
    ? picked!.logoUrl
    : picked
      /*
        THIS FIELD HAS SEEN A PICK AND THE VALUE HAS MOVED OFF IT, so whatever the caller is still
        holding is about the company that was there before.
        That is not hypothetical. ManagerFormFields passes logoUrlFor={companyName}, the LIVE
        value, so the staleness check compares the name against itself and always answers "it
        belongs" - measured: value "Something Else Entirely" with logoUrl still pointing at li.me.
        The caller's own pick history is the thing that can tell, so it decides here rather than
        the caller's word.
      */
      ? undefined
      : ((logoUrlFor && norm(logoUrlFor) === norm(value)) ? logoUrl : undefined);

  const picker = (
    <CompanyAutocomplete
      /*
        So opening the editor does not change what is on screen, where we can prove the mark is
        still about the company whose name is in the box.
      */
      logoUrl={editorLogoUrl}
      value={value}
      onChange={(v) => { setTyping(true); onChange(v); }}
      onCompanyIdChange={onCompanyIdChange}
      onSuggestionSelect={(name, logo) => {
        setTyping(false);
        setPicked({ name, logoUrl: logo });
        onSuggestionSelect?.(name, logo);
      }}
      /*
        THE PICK THIS FIELD ALREADY REMEMBERS, handed to the input when an edit opens.

        These forwarded the CALLER's props only, so the identity this component keeps in `picked`
        - the real domain and the resolved icon of the suggestion chosen here - never reached the
        input. Opening the editor therefore threw it away and the mark fell back to whatever could
        be guessed from the name, which for Lime is lime.com rather than li.me.

        Owned here for the same reason the card's logo is: a field that asks the question owns the
        answer it displays, and five callers wiring this correctly was the arrangement that did
        not work.
      */
      /*
        THE RESOLVED DOMAIN COUNTS HERE TOO.

        The editor is stricter than the card on purpose: it only shows a mark when something NAMES
        the company it belongs to, because this is where somebody types and a logo that outlives
        its name is how "Something Else Entirely" kept wearing Lime's.

        A domain this field looked up for an exact name match meets that bar - it is about the
        value on screen by construction, and `resolvedDomain` already drops it the moment the name
        moves. Leaving it out meant pressing Edit on a typed company blanked its logo, which is the
        opposite of the "opening the editor does not change what is on screen" rule above.
      */
      initialDomain={
        pickedBelongsToValue
          ? (picked!.domain ?? undefined)
          : resolvedDomain
            ?? ((logoUrlFor && norm(logoUrlFor) === norm(value)) ? initialDomain : undefined)
      }
      initialBrandfetchIconUrl={
        pickedBelongsToValue
          ? (picked!.brandfetchIconUrl ?? undefined)
          : ((logoUrlFor && norm(logoUrlFor) === norm(value)) ? initialBrandfetchIconUrl : undefined)
      }
      onSuggestionPicked={(sug) => {
        setTyping(false);
        /* The picked company's own identity, so the collapsed card can render a real logo
           even while logo.dev's quota is exhausted. */
        setPicked((prev) => ({
          name: sug.name,
          logoUrl: prev && norm(prev.name) === norm(sug.name) ? prev.logoUrl : undefined,
          domain: (sug as any).domain,
          brandfetchIconUrl: (sug as any).brandfetchIconUrl,
        }));
        onSuggestionPicked?.(sug);
      }}
      placeholder={placeholder}
      id={fieldId}
      name="company"
      className={
        inputClassName ??
        "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#2e0562]"
      }
    />
  );

  return (
    /* Named so a test can scope to this field: other cards on the same form - the country picker,
       for one - also render an "Edit details" control. */
    <div data-testid="company-field">
      {label && (
        <label htmlFor={fieldId} className="mb-2 block text-sm font-semibold text-foreground">
          {label} {required && <RequiredMark />}
        </label>
      )}

      {asCard ? (
        <FormSubjectCard
          layout="inline"
          name={value || "Choose a company"}
          logo={
            <CompanyLogoImg
              /* Keyed on the name so a changed company re-resolves rather than keeping the
                 previous company's mark. */
              key={value}
              company={value}
              logoUrl={shownLogoUrl}
              /* The resolved domain is the fallback behind any supplied URL, not a replacement. */
              domain={pickedBelongsToValue ? picked?.domain : resolvedDomain}
              from={pickedBelongsToValue ? picked : undefined}
              sizeClass="h-6 w-6 rounded"
              eager
            />
          }
          editing={editing}
          onEditStart={() => setEditing(true)}
          onEditDone={() => { setTyping(false); setEditing(false); }}
          /* Named for its field, like every other collapsible field on these forms. Several can be
             open at once, and controls that all announce themselves as "Edit details" tell a
             screen-reader user nothing about which one they are on. */
          editLabel="Edit company details"
          doneLabel="Done editing company"
        >
          {picker}
        </FormSubjectCard>
      ) : (
        picker
      )}

      {hint}
    </div>
  );
}
