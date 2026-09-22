import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { toast } from "sonner";
import { AlertCircle, ArrowLeft, Check, X } from "lucide-react";
import { Layout } from "@/components/Layout";
import { CompanyLogoImg } from "@/components/ManagerCard";
import { CompanyField } from "@/components/CompanyField";
import { CompanyAutocomplete } from "@/components/CompanyAutocomplete";
import { RatingInput, FormField } from "@/components/RatingInput";
import { AboutPanel, AnonymityCard, FormIntro, FormSubjectCard, RatingRow } from "@/components/RatingFormParts";
import { recentYears } from "@/components/MonthYear";
import { WorkTimelineFields, type MonthYear as MonthYearValue } from "@/components/ManagerFormFields";
import { AttestationCard } from "@/components/RatingFormParts";
import { LocationField } from "@/components/LocationField";
import { LocationValue, EMPTY_LOCATION, declaredPayload, orUserGeo } from "@/lib/location";
import { fetchGeo } from "@/lib/geo";
import { useFormDraft, clearFormDraft } from "@/hooks/useFormDraft";

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

export default function RateCompany() {
  const { industrySlug, companySlug } = useParams<{ industrySlug?: string; companySlug: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
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

  useEffect(() => {
    if (!mine || loadedExisting) return;
    // Editing keeps the name the rating already carries. A fresh one would make the same person
    // look like a different reviewer to anybody who had read it.
    if (mine.author) setGeneratedName(mine.author);
    setDraft({
      overallRating: mine.overallRating ?? null,
      ratings: mine.ratings ?? {},
      workedFrom: (mine.workedFrom ?? "").slice(0, 7),
      workedUntil: mine.workedUntil ? mine.workedUntil.slice(0, 7) : null,
      stillHere: !mine.workedUntil,
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
  }, [mine, loadedExisting]);

  const companyName = company?.name ?? "this company";
  /*
    Seeded once the company loads. The field is showing the company being rated, so it opens as
    that company rather than empty - and anything typed afterwards is the reader's, not overwritten
    by a later refetch.
  */
  const [companySeeded, setCompanySeeded] = useState(false);

  /*
    What was typed, kept across a refresh.

    This form had no draft at all: reloading it - or being bounced to sign in and coming back -
    threw away every answer. Keyed per company, so two half-finished ratings cannot overwrite each
    other, and cleared only when the rating is actually submitted.
  */
  const draftKey = `rmm_pending_company_rating_${companySlug ?? "unknown"}`;
  useFormDraft(
    draftKey,
    { draft, location, fromParts, untilParts, generatedName, attested, companyText, step },
    saved => {
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
    { enabled: !!companySlug },
  );

  useEffect(() => {
    if (companySeeded || !company?.name) return;
    setCompanyText(company.name);
    setCompanySeeded(true);
  }, [company?.name, companySeeded]);

  /*
    Prefilled rather than asked for, the same way the manager and interview forms do it.

    It fills the visible field; it never attaches itself at submit. A value somebody can see,
    change, and send unchanged is a declaration - one attached behind their back is an inference
    about where they worked, drawn from an IP address. orUserGeo never overwrites a location that
    is already set, so a stored one always wins.
  */
  useEffect(() => {
    let cancelled = false;
    fetchGeo()
      .then(geo => {
        if (cancelled || !geo?.country) return;
        setLocation(prev => orUserGeo(prev, geo));
      })
      // Geo is a convenience. Failing to resolve it just means the field starts empty.
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

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

  const setRating = (category: (typeof COMPANY_CATEGORIES)[number], value: number) => {
    setDraft((prev) => ({ ...prev, ratings: { ...prev.ratings, [category]: value } }));
    setErrors((prev) => ({ ...prev, [category]: undefined }));
  };

  const handleSubmit = async () => {
    setSubmitError(null);
    const found = validateCompanyRating(draft);
    if (Object.keys(found).length > 0) {
      setErrors(found);
      return;
    }
    if (!user) {
      /*
        Keep the work before sending them away.

        Everything below this point is answered by now, and the very next thing that happens is a
        redirect to sign in that most people do not come back from. The manager forms have captured
        this moment for a long time; this one threw it away, which meant a complete rating was lost
        every time somebody rated a workplace before making an account.

        Fire-and-forget on purpose: capturing is a courtesy to somebody who is already leaving, and
        must never be the reason the redirect does not happen.
      */
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
      navigate(`/signin?returnTo=/companies/${companySlug}/rate`);
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
      await axios.post(
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
      queryClient.invalidateQueries({ queryKey: ["company-profile-slug", companySlug] });
      queryClient.invalidateQueries({ queryKey: ["my-company-rating", companySlug] });
      toast.success(`Thanks, your rating of ${companyName} is live.`);
      backToCompany();
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
            onEditDone={() => setLocationEditing(false)}
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
              const forStep = step === "dates"
                ? Object.fromEntries(Object.entries(found).filter(([k]) => dateKeys.includes(k)))
                : {};
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
        </div>
        </div>
      </div>
    </div>
  );
}
