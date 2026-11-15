import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { toast } from "sonner";
import { useAnalytics } from "@/hooks/useAnalytics";
import { consumePromptFollow } from "@/lib/contributionPrompt";
import { AlertCircle, ArrowLeft, Check, X } from "lucide-react";
import { Layout } from "@/components/Layout";
import { CompanyLogoImg } from "@/components/ManagerCard";
import { CompanyField } from "@/components/CompanyField";
import { CompanyAutocomplete } from "@/components/CompanyAutocomplete";
import { RatingInput, FormField } from "@/components/RatingInput";
import { AboutPanel, AnonymityCard, FormIntro, FormSubjectCard, HideDatesField, RatingRow } from "@/components/RatingFormParts";
import { recentYears } from "@/components/MonthYear";
import { WorkTimelineFields, type MonthYear as MonthYearValue } from "@/components/ManagerFormFields";
import { AttestationCard } from "@/components/RatingFormParts";
import { LocationField } from "@/components/LocationField";
import { LocationValue, EMPTY_LOCATION, declaredPayload, hasDeclaredLocation } from "@/lib/location";
import { useFormDraft, clearFormDraft } from "@/hooks/useFormDraft";
import { useServerDraft } from "@/hooks/useServerDraft";
import {
  AdoptAnonymousDraftPrompt, DraftConflictPrompt, DraftSaveStatus, ResumeDraftPrompt,
} from "@/components/DraftPrompts";
import { markJustRatedCompany } from "@/lib/rateCompanyNudge";

/** "2021-06" as the shared timeline control holds it, and back again. */
const monthYearOf = (value: string | null | undefined): MonthYearValue => {
  const [year, month] = (value ?? "").split("-");
  return { month: month ?? "", year: year ?? "" };
};
const yearMonthString = (v: MonthYearValue) => (v.month && v.year ? `${v.year}-${v.month}` : "");
import { useAuth } from "@/hooks/useAuth";
import API_BASE from "@/lib/api";
import { companyPath } from "@/lib/urls";
import { generateUsername } from "@/lib/validators";
import {
  COMPANY_CATEGORIES,
  COMPANY_CATEGORY_HINTS,
  COMPANY_CATEGORY_LABELS,
  emptyCompanyRatingDraft,
  toCompanyRatingPayload,
  validateCompanyRating,
  type CompanyRatingDraft,
  type CompanyRatingErrors,
} from "@/lib/companyRatings";

/**
 * Rating a company as a workplace.
 *
 * Separate from the manager rating on purpose: they answer different questions, and a company
 * page shows both side by side precisely so they can disagree. Nothing here asks about a manager.
 *
 * Split into steps, the way a manager review is. Ten rating rows and a period on one page is a
 * wall; asked in two passes, people finish it. The name the rating is signed with sits at the top
 * of the first step rather than on a screen of its own - it is the thing somebody wants settled
 * before they start answering, not after the work is done.
 */

/*
  The same three steps, in the same order, as every other contribution form: who this is about,
  when and where it happened, then the ratings.

  It used to open on the ten stars and ask about the company and the period afterwards - the same
  contribution wearing a different shape depending on which page somebody started from.
*/
type Step = "details" | "dates" | "ratings";
const STEPS: Step[] = ["details", "dates", "ratings"];

/** Said once, so the step check and the submit check cannot drift apart. */
const LOCATION_REQUIRED = "Where did you work? Add a location.";

export default function RateCompany() {
  const { industrySlug, companySlug } = useParams<{ industrySlug?: string; companySlug: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { track } = useAnalytics();
  const [searchParams] = useSearchParams();
  const { user, refreshUser } = useAuth();
  /* Links a captured draft to the submission that follows, so finishing the form removes it. */
  const draftTokenRef = useRef<string | null>(null);
  /** First-hand experience, confirmed before anything is stored. */
  const [attested, setAttested] = useState(false);
  /*
    The timeline control holds month and year separately; the draft holds one "YYYY-MM" string.
    Keeping the parts here is what lets a half-entered date survive: composing the string on every
    keystroke turns "March, year not yet chosen" into "", which comes back as an empty control.
  */
  const [fromParts, setFromParts]   = useState<MonthYearValue>({ month: "", year: "" });
  const [untilParts, setUntilParts] = useState<MonthYearValue>({ month: "", year: "" });
  /*
    Where the work happened. Held beside the draft rather than inside it, exactly as the manager
    and interview forms hold it: a location is not a rating field, it is resolved server-side on
    submit, and the payload it produces is a different shape from everything else here.
  */
  const [location, setLocation] = useState<LocationValue>(EMPTY_LOCATION);
  const [locationEditing, setLocationEditing] = useState(false);

  const [draft, setDraft] = useState<CompanyRatingDraft>(emptyCompanyRatingDraft());
  const [errors, setErrors] = useState<CompanyRatingErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadedExisting, setLoadedExisting] = useState(false);
  const [step, setStep] = useState<Step>("details");
  const [changingCompany, setChangingCompany] = useState(false);
  const [companyText, setCompanyText] = useState("");
  /*
    The handle this rating is signed with. Generated once on mount so it does not change under the
    reader while they fill the form in, and replaced only when they ask for another.
  */
  const [generatedName, setGeneratedName] = useState(() => generateUsername());

  const { data: company } = useQuery({
    queryKey: ["company-profile-slug", companySlug],
    queryFn: async () => {
      const res = await axios.get(`${API_BASE}/api/companies/by-slug/${companySlug}`);
      return res.data as
        { id?: number; name: string; slug?: string; logoUrl?: string; industrySlug?: string };
    },
    enabled: !!companySlug,
    retry: false,
  });

  // An existing rating pre-fills the form: revisiting means changing your answer, not starting
  // again, and one rating per person per company means this replaces rather than adds.
  const { data: mine } = useQuery({
    queryKey: ["my-company-rating", companySlug],
    queryFn: async () => {
      const res = await axios.get(`${API_BASE}/api/companies/${companySlug}/rating`, {
        withCredentials: true,
      });
      return res.data?.review ?? null;
    },
    enabled: !!companySlug && !!user,
    retry: false,
  });

  /*
    What this form is ABOUT: the company named in the field, which is not always the company in
    the URL. The picker is backed by Clearbit and answers {name, domain}, so choosing a different
    company usually cannot navigate - there is no slug to navigate to - and the URL keeps naming
    the company the page opened with.
  */
  const subject = companyText.trim();
  const pageCompanyName = (company?.name ?? "").trim();
  const editingPageCompany =
    subject === "" || pageCompanyName === "" ||
    subject.toLowerCase() === pageCompanyName.toLowerCase();

  useEffect(() => {
    if (!mine || loadedExisting) return;
    /*
      Never seed over a form that belongs to a different company now.

      `mine` is fetched for the URL's company. Without this, clearing the form for Discord and
      then letting this run re-applied Shopify's dates and stars on top of it - the reported bug
      surviving its own fix.
    */
    if (!editingPageCompany) return;
    // Editing keeps the name the rating already carries. A fresh one would make the same person
    // look like a different reviewer to anybody who had read it.
    if (mine.author) setGeneratedName(mine.author);
    setDraft({
      overallRating: mine.overallRating ?? null,
      ratings: mine.ratings ?? {},
      workedFrom: (mine.workedFrom ?? "").slice(0, 7),
      workedUntil: mine.workedUntil ? mine.workedUntil.slice(0, 7) : null,
      stillHere: !mine.workedUntil,
      // Reopens in the state they chose. getMyCompanyRating sends the dates unmasked for exactly
      // this reason, so the form is never blanked by a privacy choice it is meant to edit.
      datesHidden: !!mine.datesHidden,
    });
    // The control reads the parts, so an existing rating has to fill those too - otherwise
    // revisiting shows an empty period over a draft that has one.
    setFromParts(monthYearOf((mine.workedFrom ?? "").slice(0, 7)));
    setUntilParts(monthYearOf(mine.workedUntil ? mine.workedUntil.slice(0, 7) : ""));
    /*
      The stored location, not wherever the reader happens to be today. A rating is a snapshot of
      where the work happened; re-deriving it from the current visitor's geography on every edit
      would quietly migrate an old opinion to a place it did not come from.

      Ratings written before this field existed have no ladder at all. Those fall through to the
      geo prefill below, which fills the field visibly so submitting it is a confirmation.
    */
    if (mine.declaredPrecision) {
      setLocation({
        country: mine.declaredCountry ?? "",
        state:   mine.declaredState ?? "",
        city:    mine.declaredCity ?? "",
        precision: mine.declaredPrecision,
        companyLocationId: mine.companyLocationId ?? null,
        corpusPlace: null,
        label: "",
      });
    }
    setLoadedExisting(true);
  }, [mine, loadedExisting, editingPageCompany]);

  const companyName = company?.name ?? "this company";
  /*
    Seeded once the company loads. The field is showing the company being rated, so it opens as
    that company rather than empty - and anything typed afterwards is the reader's, not overwritten
    by a later refetch.
  */
  const [companySeeded, setCompanySeeded] = useState(false);

  /*
    Changing the company starts a different rating, so none of the answers carry over.

    THE SUBJECT IS THE COMPANY IN THE FIELD, NOT THE ONE IN THE URL. That distinction is the whole
    bug. Picking a suggestion only navigates when it carries a slug, and the picker is backed by
    Clearbit - it answers {name, domain} for companies that mostly have no row here, so a pick
    almost never has one. companySlug therefore stayed on the company the page opened with, this
    effect never fired, and the form kept the first company's dates, stars and hide-dates box.

    Reported as: open "edit my rating of Shopify", change the company to Discord, press Next, and
    the dates were Shopify's.

    Resetting on the slug alone was not enough for a second reason. `mine` is fetched for the URL's
    company, so clearing `loadedExisting` while the URL still said Shopify made the effect below
    re-apply Shopify's rating over the cleared form. So the seeding effect is gated on the subject
    still BEING the page's company, and this clears whenever it stops being.

    Keyed off an actual change rather than firing on mount, or it would wipe the draft that
    useFormDraft has just restored.

    MOUNT IS NOT THE ONLY MOMENT THE SUBJECT ARRIVES, and skipping only the first run was not
    enough. The field is empty for the first render and is filled a tick later - by the restored
    draft, or by the company seeding once the profile loads. Both look exactly like somebody
    typing a different company, so this cleared the answers that had just been restored, and the
    save effect then wrote the emptied form back over the stored draft. A reload DESTROYED a
    rating instead of resuming it, and a second reload could not get it back.

    So an empty subject becoming a named one is the subject being ESTABLISHED, not changed.
    Somebody actually changing the company edits a name that is already there, and the first
    keystroke of that is a name-to-name change, which still clears on the spot.
  */
  const lastSubjectRef = useRef<{ slug: string; subject: string } | null>(null);
  useEffect(() => {
    const now = { slug: companySlug ?? "", subject: subject.toLowerCase() };
    const was = lastSubjectRef.current;
    lastSubjectRef.current = now;
    if (was === null) return;
    if (was.slug === now.slug && was.subject === now.subject) return;
    if (was.slug === now.slug && was.subject === "") return;

    setDraft(emptyCompanyRatingDraft());
    setFromParts({ month: "", year: "" });
    setUntilParts({ month: "", year: "" });
    setLocation(EMPTY_LOCATION);
    setAttested(false);
    setErrors({});
    setSubmitError(null);
    /*
      A fresh handle. The old one signs the other company's rating, and reusing it would publish
      two ratings under one name - which is exactly how an anonymous author stops being anonymous.
    */
    setGeneratedName(generateUsername());
    /*
      Only re-open an existing rating when the subject is the page's own company again. Clearing
      this while the field names a different company is what let Shopify's rating reload over a
      form that had just been emptied for Discord.
    */
    setLoadedExisting(!editingPageCompany);
  }, [companySlug, subject]); // eslint-disable-line react-hooks/exhaustive-deps


  /*
    What was typed, kept across a refresh.

    This form had no draft at all: reloading it - or being bounced to sign in and coming back -
    threw away every answer. Keyed per company, so two half-finished ratings cannot overwrite each
    other, and cleared only when the rating is actually submitted.
  */
  const draftKey = `rmm_pending_company_rating_${companySlug ?? "unknown"}`;
  /*
    Minted HERE rather than lazily inside the sync options below, so the snapshot persisted on the
    very first render already carries it.

    ISSUE 32: this token is the capture's identity, and V96 uses it to remove an anonymous
    publication when the author comes back and submits properly. It used to live only in this ref,
    which a page load discards - and signing in IS a page load. So the returning form minted a
    fresh token, the moderator's publication kept the old one, nothing matched, and the same
    opinion went live twice: once anonymously, once authored. BossProfile had always persisted its
    token; this form had not.
  */
  if (!draftTokenRef.current) draftTokenRef.current = crypto.randomUUID();
  const { anonymous: anonDraft } = useFormDraft(
    draftKey,
    { draft, location, fromParts, untilParts, generatedName, attested, companyText, step,
      draftToken: draftTokenRef.current },
    saved => {
      // Before anything else: the captured form's identity, or the capture cannot be superseded.
      if (saved.draftToken) draftTokenRef.current = saved.draftToken;
      if (saved.draft)        setDraft(saved.draft);
      if (saved.location)     setLocation(saved.location);
      if (saved.fromParts)    setFromParts(saved.fromParts);
      if (saved.untilParts)   setUntilParts(saved.untilParts);
      if (saved.generatedName) setGeneratedName(saved.generatedName);
      if (saved.attested != null) setAttested(saved.attested);
      // The company field is seeded from the page being rated, so a stored value only wins when
      // it says something different - somebody who corrected it meant the correction.
      if (saved.companyText) { setCompanyText(saved.companyText); setCompanySeeded(true); }
      if (saved.step)         setStep(saved.step);
    },
    {
      enabled: !!companySlug,
      /*
        Also sent to the server, so a closed tab keeps its answers rather than only a reload.

        The token is the one the submit path already mints, so an autosaved draft and the capture
        at submit are the SAME row: finishing the form updates what is already there instead of
        queueing a second copy of it.

        `body` returns null below the meaningful-progress floor, so opening the page and leaving
        writes nothing. The server applies the same rule again, because a client-side floor is a
        courtesy rather than a guarantee.
      */
      sync: {
        url: `${API_BASE}/api/companies/${companySlug}/rating/autosave`,
        token: draftTokenRef.current,
        body: (snap: any) => {
          /*
            Signed-in contributors do not autosave, matching the manager-rating form.

            They are about to submit a real rating, and a server-side partial copy of it would be
            the same opinion in two places with no purpose the submission does not already serve.
            Their work is still kept locally, so a reload or a closed tab resumes exactly as
            before; what changes is only that we do not also bank a draft.

            The feature exists for the people who would otherwise be lost entirely: the ones with
            no account, who answer several questions and never come back.
          */
          if (user) return null;
          const r = snap?.draft?.ratings ?? {};
          const anyCategory = Object.values(r).some((v) => typeof v === "number" && v > 0);
          if (!anyCategory && !snap?.draft?.overallRating) return null;
          return {
            ...toCompanyRatingPayload(snap.draft),
            ...declaredPayload(snap.location),
            author: snap.generatedName,
            companyName: (snap.companyText || "").trim() || companyName,
          };
        },
      },
    },
  );

  /*
    THE SIGNED-IN HALF, and the one the anonymous capture above deliberately does not do.

    A signed-in contributor's unfinished rating is private: it is never read by moderation, and it
    exists so they can come back to it on another device. Nothing about the anonymous path changes
    - useFormDraft still posts to the capture endpoint for people with no account, because an
    abandoned anonymous contribution is what moderation is there to see.
  */
  const serverDraft = useServerDraft({
    baseKey: draftKey,
    subjectType: "company",
    subjectId: company?.id ?? null,
    userId: user?.id ?? null,
    payload: () => {
      const anyCategory = Object.values(draft.ratings ?? {})
        .some((v) => typeof v === "number" && v > 0);
      if (!anyCategory && !draft.overallRating) return null;
      return { draft, location, fromParts, untilParts, generatedName, attested, companyText, step };
    },
    deps: [draft, location, fromParts, untilParts, generatedName, attested, companyText, step],
  });

  /** Applies a payload the contributor chose to bring back. One place, three callers. */
  const applyDraftPayload = (saved: any) => {
    if (!saved) return;
    if (saved.draft)            setDraft(saved.draft);
    if (saved.location)         setLocation(saved.location);
    if (saved.fromParts)        setFromParts(saved.fromParts);
    if (saved.untilParts)       setUntilParts(saved.untilParts);
    if (saved.generatedName)    setGeneratedName(saved.generatedName);
    if (saved.attested != null) setAttested(saved.attested);
    if (saved.companyText)      { setCompanyText(saved.companyText); setCompanySeeded(true); }
    if (saved.step)             setStep(saved.step);
  };


  useEffect(() => {
    if (companySeeded || !company?.name) return;
    setCompanyText(company.name);
    setCompanySeeded(true);
  }, [company?.name, companySeeded]);

  /*
    NOT prefilled from the reader's IP address. The person states where they worked.

    This used to fill the field with the full city-level guess from Cloudflare's headers, on the
    reasoning that a value somebody can see and change is a declaration once submitted unchanged.
    That reasoning was rejected: an IP address says where the browser is tonight, not where the work
    happened, and most people accept whatever a form has already filled in. A rating that says
    "Kitchener" because a datacentre is in Kitchener is worse than one that says nothing, because it
    cannot be told apart from a real answer.

    The observed location is still recorded - separately, in geo_observations, never in the declared
    columns - so nothing is lost for the purposes it legitimately serves.
  */

  /*
    Back where you came from, when the caller said where that was.

    Finishing a rating dropped everybody on the company page regardless of where they started -
    somebody who rated from the directory or from a manager's profile lost their place and had to
    navigate back. The company page is still the fallback, because a link typed by hand has no
    origin to return to.
  */
  const returnTo = searchParams.get("returnTo");
  const backToCompany = () =>
    navigate(
      returnTo && returnTo.startsWith("/")
        ? returnTo
        : companySlug
          ? companyPath(industrySlug ?? company?.industrySlug, companySlug)
          : "/companies",
    );

  /*
    Where a FINISHED rating lands, which is not where Cancel lands.

    backToCompany honours returnTo - right for Cancel, wrong here. Somebody who has just rated a
    company wants to see the rating, and it lives on the company tab; the page opens on Managers
    by default. Sending them to returnTo instead put them back on the manager profile they
    started from, where the thing they just wrote is not shown at all.
  */
  /*
    `slug` is the company the rating was FILED against, which is not always the one in the URL -
    the server files against the company the author named. Defaults to the URL for every caller
    that is not the submit path.
  */
  const toRatingOnCompanyTab = (slug: string | undefined = companySlug) =>
    navigate(
      slug
        /*
          The industry is only correct for the company this page loaded. Sending a different
          company down the loaded company's industry path would build an address for a company
          that does not live there, so an unfamiliar company goes to the flat path and the
          canonical redirect on the profile moves it to its real one.
        */
        ? `${slug === companySlug
              ? companyPath(industrySlug ?? company?.industrySlug, companySlug)
              : `/companies/${slug}`}?tab=company`
        : "/companies",
    );

  const setRating = (category: (typeof COMPANY_CATEGORIES)[number], value: number) => {
    setDraft((prev) => ({ ...prev, ratings: { ...prev.ratings, [category]: value } }));
    setErrors((prev) => ({ ...prev, [category]: undefined }));
  };

  /*
    One capture, used by both call sites: the one above the validation gate for a partial answer,
    and the one below it for a complete one that is only missing an account. Written once so the
    two can never drift into keeping different fields.

    Fire-and-forget on purpose. Capturing is a courtesy to somebody who is already leaving and
    must never be the reason the redirect does not happen, so every failure is swallowed.

    Keyed on a token that survives the round trip to sign-in, so pressing submit repeatedly is one
    form rather than one row per attempt.
  */
  const captureDraft = () => {
    if (!draftTokenRef.current) draftTokenRef.current = crypto.randomUUID();
    void axios.post(`${API_BASE}/api/companies/${companySlug}/rating/draft`, {
      ...toCompanyRatingPayload(draft),
      // The location goes into the draft as well. A draft exists so nothing a person answered is
      // thrown away, and keeping every answer but the one about where they worked would make it
      // a worse record than the form it came from.
      ...declaredPayload(location),
      author: generatedName,
      companyName: companyText.trim() || companyName,
      draftToken: draftTokenRef.current,
    }).catch(() => {});
  };

  const handleSubmit = async () => {
    setSubmitError(null);
    const found = validateCompanyRating(draft);
    // The location lives outside the draft, so the draft validator cannot see it. Checked here as
    // well as on the step, because a restored draft can reach this point without passing step 2.
    if (!hasDeclaredLocation(location)) found.location = LOCATION_REQUIRED;
    /*
      CAPTURED BEFORE THE VALIDATION GATE, not after it.

      This used to sit below the early return, so a form with one category unrated reached
      setErrors and stopped, and nothing was kept. The drop-offs most worth having were the only
      ones being thrown away: a finished rating usually gets submitted, while a half-finished one
      is abandoned and is gone for ever.

      A partial answer is still evidence. Somebody started rating this employer, got this far, and
      stopped here, which is worth keeping even if the rating itself never becomes publishable.

      It is NOT a rating and must never be counted as one. It goes to captured_drafts, which is
      JSONB, never aggregated and never served to a reader; the Publish button refuses anything
      incomplete and says which answer is missing. The gate below still stops the submission, so
      nothing about what this person sees has changed.
    */
    const worthKeeping =
      Object.values(draft.ratings ?? {}).some((r) => typeof r === "number" && r > 0) ||
      Boolean(draft.overallRating) ||
      Boolean(draft.workedFrom);
    if (!user && worthKeeping) captureDraft();

    if (Object.keys(found).length > 0) {
      setErrors(found);
      return;
    }
    if (!user) {
      /*
        Keep the work, then send them to sign in. The rating is NOT published here.

        This briefly wrote the rating live at this point, on the reasoning that the manager forms
        do. That was wrong and was reverted: a workplace rating must only become public once its
        author has an account and has pressed submit themselves. What this moment is for is making
        sure the answers are not lost in the meantime.

        The draftToken ties the capture to the submission that follows, so returning and submitting
        REPLACES this draft rather than leaving an admin to review work the author already
        finished.

        Fire-and-forget on purpose: capturing is a courtesy to somebody who is already leaving, and
        must never be the reason the redirect does not happen.
      */
      captureDraft();
      /*
        Encoded, because it is a query-parameter value. The path happens to contain nothing that
        needs escaping today, so this changes no behaviour; it stops a slug that one day contains
        an ampersand from truncating the destination and sending the author to the directory.
      */
      navigate(`/signin?returnTo=${encodeURIComponent(`/companies/${companySlug}/rate`)}`);
      return;
    }

    setSubmitting(true);
    try {
      /*
        The name travels with the rating.

        For a company already in the directory the slug resolves and this is ignored. For one the
        reader typed that we do not hold, it is what the server creates the company from - held for
        review rather than published. Sending it always means the form does not have to know which
        case it is in.
      */
      const namedCompany = companyText.trim() || companyName;
      const submitted = await axios.post(
        `${API_BASE}/api/companies/${companySlug}/rating`,
        {
          ...toCompanyRatingPayload(draft),
          // Resolved server-side: an exact pick is checked against this company and a corpus place
          // is promoted to a real location inside the write.
          ...declaredPayload(location),
          author: generatedName,
          ...(namedCompany && namedCompany !== "this company" ? { companyName: namedCompany } : {}),
          // Deletes the draft this rating came from, so an admin does not review work that was
          // finished a minute later.
          ...(draftTokenRef.current ? { draftToken: draftTokenRef.current } : {}),
        },
        { withCredentials: true },
      );
      /*
        Pull the session before going back, not after.

        Rating a workplace is what opens the workplace gate, and the gate lives on the account -
        so until the session is re-read the reader lands back on a page that still believes they
        have not contributed. Invalidating the profile alone did not help: the server shapes that
        response around the gate, so refetching it while the session still says "locked" just
        fetches the locked copy again. This is the write that unlocked it; it has to say so.
      */
      // Finished, so the draft is finished with. Only here: a failed submit keeps it.
      clearFormDraft(draftKey);
      await refreshUser();
      /*
        Follow the company the rating was actually filed against, not the one we posted to.

        Those differ whenever the author changed the company on the form: the server files against
        the company they NAMED, while this page is still sitting on the slug it opened with. Using
        the old slug sent them back to the previous company's page, where the rating they had just
        written was nowhere to be found - and for a company created by this very submission, that
        looked like the rating had vanished.

        Falls back to the posted slug, so an older server that does not send this still works.
      */
      const ratedSlug: string = submitted.data?.companySlug ?? companySlug;
      const ratedName: string = submitted.data?.companyName ?? companyName;

      queryClient.invalidateQueries({ queryKey: ["company-profile-slug", companySlug] });
      queryClient.invalidateQueries({ queryKey: ["my-company-rating", companySlug] });
      if (ratedSlug !== companySlug) {
        // The company that actually changed needs its caches dropped too, or its page renders
        // from a copy fetched before the rating existed.
        queryClient.invalidateQueries({ queryKey: ["company-profile-slug", ratedSlug] });
        queryClient.invalidateQueries({ queryKey: ["my-company-rating", ratedSlug] });
      }
      queryClient.invalidateQueries({ queryKey: ["company-listing"] });
      toast.success(`Thanks, your rating of ${ratedName} is live.`);

      /*
        A SUCCESSFUL WORKPLACE RATING, counted where success is known.

        Inside the try and after the write returned, so a refused or failed submission never
        reaches it. Workplace ratings had no event at all, which made the whole second half of the
        contribution funnel invisible: the prompt could be measured, and what it led to could not.

        `is_edit` because this same form updates an existing rating, and the two are different
        contributions. No company name, no reviewer, nothing identifying.
      */
      track("company_review_submitted", {
        is_edit: Boolean(loadedExisting),
        ...consumePromptFollow(),
      });
      /*
        Land on the rating, then ask - in that order.

        The offer used to open here, on the form, as a modal over a dimmed page: somebody was
        asked to choose between two further contributions before they could see the one they had
        just written. So this navigates to the company tab, where the rating is shown, and leaves
        a one-shot flag that the profile turns into a corner prompt.
      */
      markJustRatedCompany();
      toRatingOnCompanyTab(ratedSlug);
    } catch (err) {
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      setSubmitError(
        status === 401 ? "Please sign in to rate a company."
        : status === 404 ? "We couldn't find that company."
        : "Something went wrong. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const years = recentYears();

  const stepIdx = STEPS.indexOf(step) + 1;
  const stepTitles: Record<Step, string> = {
    details: "Company information",
    dates:   "When and where",
    ratings: "Rate your experience",
  };

  /*
    The manager review's full-screen stepped form, not a page with a card on it. Same header bar
    with Back on the left and Close on the right, same centred step title, same progress rule, same
    full-width button at the foot. Two forms asking the same kind of thing on one site should not be
    two different shapes.
  */
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-6">
        <button
          onClick={() => {
            if (step === "details") backToCompany();
            else setStep(STEPS[STEPS.indexOf(step) - 1]);
          }}
          className="flex min-w-[60px] items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {step !== "ratings" && <ArrowLeft size={16} aria-hidden="true" />}
          {step === "details" ? "Cancel" : "Back"}
        </button>
        <div className="text-center">
          <p className="text-sm font-semibold text-foreground">{stepTitles[step]}</p>
          <p className="text-xs text-muted-foreground">Step {stepIdx} of {STEPS.length} · {companyName}</p>
        </div>
        <button
          onClick={backToCompany}
          aria-label="Close"
          className="flex min-w-[60px] justify-end p-1 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      <div className="h-1 bg-muted/60">
        <div
          className="h-1 bg-[#2e0562] transition-all duration-300"
          style={{ width: `${Math.round((stepIdx * 100) / STEPS.length)}%` }}
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        {/*
          The forks only the contributor can settle, above the form so they are seen before any
          more answering happens. Each one replaces answers, so none of them is automatic.
        */}
        {(anonDraft.available || serverDraft.offered || serverDraft.conflict) && (
          <div className="mb-6 space-y-3">
            {anonDraft.available && (
              <AdoptAnonymousDraftPrompt
                onAdopt={() => applyDraftPayload(anonDraft.adopt())}
                onDismiss={anonDraft.dismiss}
              />
            )}
            {serverDraft.offered && (
              <ResumeDraftPrompt
                version={serverDraft.offered.version}
                onResume={() => applyDraftPayload(serverDraft.acceptOffered())}
                onDismiss={serverDraft.dismissOffered}
              />
            )}
            {serverDraft.conflict && (
              <DraftConflictPrompt
                conflict={serverDraft.conflict}
                onTakeServer={() => applyDraftPayload(serverDraft.resolveWithServer())}
                onKeepLocal={serverDraft.resolveWithLocal}
              />
            )}
          </div>
        )}
        {step === "details" && (
          <div className="mb-6 space-y-6">
            <FormIntro
              title="Rate a Workplace"
              blurb="Takes just a minute. Your firsthand experience helps other job seekers make more informed decisions."
            />
            {/*
              What is being rated, named before anything is asked about it - the manager form's own
              card, with the company in place of the manager. Editable, because somebody who opened
              this from the wrong company should not have to go and find the right one first.
            */}
            {/*
                The shared company field.

                Hand-rolled here until now, and its summary showed `company?.name` - the company
                the URL loaded - rather than what had been typed. So changing to a company we do
                not hold appeared to revert: the typed name lived in local state the card never
                read. The shared component renders the value it is given, so what you typed is what
                you see.
            */}
            <CompanyField
              value={companyText}
              onChange={setCompanyText}
              logoUrl={company?.logoUrl}
                  logoUrlFor={company?.name}
              onSuggestionPicked={(sug) => {
                /*
                  A company already in the directory has its own rate page, and ratings belong to
                  the company whose page this is - so picking one navigates there. One we do not
                  hold stays as typed and is created with the rating, held for review.
                */
                if (sug.slug) navigate(`/companies/${sug.slug}/rate`);
                else setCompanyText(sug.name);
              }}
            />

          </div>
        )}

        {submitError && (
          <div className="mb-6 rounded-lg border border-destructive/50 bg-destructive/5 p-4">
            <div className="flex gap-3">
              <AlertCircle className="flex-shrink-0 text-destructive" size={20} aria-hidden="true" />
              <p role="alert" className="text-sm text-destructive">{submitError}</p>
            </div>
          </div>
        )}

        <div className="space-y-6">
          {step === "ratings" && (
          <>
          {/*
            The ratings last, behind who and when - the order every contribution form uses. The
            identity and the ground rules sit above them exactly as they do on the add-manager
            form, so the final screen reads the same wherever somebody arrived from.
          */}
          <div>
            <h2 className="text-[22px] font-semibold text-foreground">Rate this workplace</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Rate it on each dimension. All 10 categories are required.
            </p>
          </div>

          <AnonymityCard
            what="rating"
            name={generatedName}
            onRegenerate={() => setGeneratedName(generateUsername())}
          />
          <AboutPanel
            title="About your rating"
            summary="Your rating reflects your personal experience. All feedback is structured and opinion-based."
            points={[
              "One rating per person per company",
              "Rating again replaces what you wrote before",
              "No written reviews, only structured ratings",
            ]}
          />

          <div className="space-y-3">
            {COMPANY_CATEGORIES.map((category) => (
              <RatingRow
                key={category}
                label={COMPANY_CATEGORY_LABELS[category]}
                hint={COMPANY_CATEGORY_HINTS[category]}
                value={draft.ratings[category] ?? null}
                onChange={(value) => setRating(category, value)}
              />
            ))}
          </div>

          {/*
            Asked, never derived. Somebody's summary judgement is not the mean of the ten above:
            "the pay was poor and it was chaotic, but I loved working there" is a real position,
            and an average erases exactly that.
          */}
          <div className="border-t border-border pt-6">
            <FormField
              label="Overall, how was working here?"
              hint="Your overall take, not an average of the ratings above."
              required
              error={errors.overallRating}
            >
              <RatingInput
                value={draft.overallRating}
                onChange={(value) => {
                  setDraft((prev) => ({ ...prev, overallRating: value }));
                  setErrors((prev) => ({ ...prev, overallRating: undefined }));
                }}
                ariaLabelPrefix="Overall"
              />
            </FormField>
          </div>

          {/*
            The same attestation the manager form asks, in this form's own words, and in the same
            place: the last step, under the ratings it is attesting to.
          */}
          <AttestationCard checked={attested} onChange={setAttested}>
            I confirm that I have personally worked at this company, and these ratings reflect my
            own experience and perceptions.
          </AttestationCard>
          </>
          )}

          {step === "dates" && (
          <>
          {/*
            Where, asked with when.

            The same control the manager and interview forms use, not a second implementation of
            the same question. company_reviews has carried the declared ladder since V68 and this
            form wrote none of it, so a workplace rating could only ever be filed against the
            company as a whole - while a review of a manager at that same company could name the
            branch it happened at. Ten Walmarts in one city can be ten different places to work,
            and a rating that cannot say which one it is about cannot answer the question a reader
            is actually asking.

            Coarse is a complete answer: a province on its own is a real rung, and nobody is made
            to find a street address to rate a workplace.
          */}
          <LocationField
            value={location}
            onChange={setLocation}
            companyId={company?.id ?? null}
            companyName={companyText.trim() || company?.name || undefined}
            editing={locationEditing}
            onEditStart={() => setLocationEditing(true)}
            onEditDone={() => {
              setLocationEditing(false);
              // Clear the complaint the moment it is answered, rather than on the next Next.
              if (hasDeclaredLocation(location)) setErrors((prev) => ({ ...prev, location: undefined }));
            }}
            error={errors.location}
            heading="Where did you work?"
            id="rating-location"
          />

          {/*
            When, because a company in 2019 says little about it now. Month precision: nobody
            remembers the day, and asking for one invites invention.
          */}
          <div className="border-t border-border pt-6">
            {/*
              The same control the add-manager form uses, not a second implementation of the same
              question. This had its own month pickers, its own "I still work here" checkbox and its
              own wording, so the identical question behaved differently depending on which page you
              were on - and a fix to one never reached the other.
            */}
            <WorkTimelineFields
              heading="When did you work here?"
              from={fromParts}
              until={untilParts}
              current={draft.stillHere}
              onFromChange={v => {
                setFromParts(v);
                setDraft(prev => ({ ...prev, workedFrom: yearMonthString(v) }));
              }}
              onUntilChange={v => {
                setUntilParts(v);
                setDraft(prev => ({ ...prev, workedUntil: yearMonthString(v) || null }));
              }}
              onCurrentChange={v => setDraft(prev => ({
                ...prev, stillHere: v, workedUntil: v ? null : prev.workedUntil,
              }))}
              problem={(errors.workedFrom ?? errors.workedUntil)
                ? <p className="text-xs text-red-600">{errors.workedFrom ?? errors.workedUntil}</p>
                : undefined}
            />
            {/*
              Asked where the dates are given, the same as on the manager forms. At a company with
              four people in the office the period identifies its author as precisely as a name.
            */}
            <div className="mt-6">
              <HideDatesField
                hidden={draft.datesHidden}
                onChange={v => setDraft(prev => ({ ...prev, datesHidden: v }))}
              />
            </div>
          </div>

          </>
          )}


          {/*
            Who it appears as. Word for word the manager review's identity step: the same lock, the
            same "will appear as", the same Regenerate, because it is the same promise being made.
          */}
        </div>

        {/*
          Back / Next, exactly as the manager review does it: the left control cancels on the first
          step and steps back everywhere else, so it never strands somebody on a screen they cannot
          leave. Validation runs per step - being sent back to the top to find one missing row is
          the thing that makes long forms get abandoned.
        */}
        {/* Full-width primary action at the foot, as the manager review has. The Back control
            lives in the header bar rather than beside it - one way out, in one place. */}
        <div className="mt-8">
          <button
            type="button"
            onClick={() => {
              if (step === "ratings") { void handleSubmit(); return; }
              /*
                Only what this step asked about.

                Validation runs over the whole draft, so without splitting it by step the first
                page would refuse to advance over a rating it has not asked for yet - which is
                precisely what makes a long form get abandoned.
              */
              const found = validateCompanyRating(draft);
              const dateKeys = ["workedFrom", "workedUntil"];
              const forStep: Record<string, string | undefined> = step === "dates"
                ? Object.fromEntries(Object.entries(found).filter(([k]) => dateKeys.includes(k)))
                : {};
              /*
                The location is asked for on this step and is required, so it is checked here. It is
                not part of the draft, so validateCompanyRating above cannot see it - the field
                carried a required asterisk for months with nothing enforcing it, and the gap was
                invisible because the field used to arrive prefilled from the reader's IP.
              */
              if (step === "dates" && !hasDeclaredLocation(location)) {
                forStep.location = LOCATION_REQUIRED;
              }
              if (Object.keys(forStep).length > 0) { setErrors((prev) => ({ ...prev, ...forStep })); return; }
              setStep(STEPS[STEPS.indexOf(step) + 1]);
            }}
            disabled={submitting || (step === "ratings" && !attested)}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#2e0562] px-4 py-3 font-medium text-white transition-all hover:bg-[#2e0562]/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {step !== "ratings"
              ? "Next"
              : submitting
                ? "Submitting…"
                : mine ? "Update rating" : "Submit rating"}
          </button>
          {/* Only ever says something a signed-in person can act on. */}
          <div className="mt-2"><DraftSaveStatus status={serverDraft.status} /></div>
        </div>
        </div>
      </div>
    </div>
  );
}
