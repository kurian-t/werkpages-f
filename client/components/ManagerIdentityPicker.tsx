import { useEffect, useState } from "react";
import { Check, UserPlus, AlertCircle, ArrowLeft } from "lucide-react";
import {
  PersonCard, CompanySection, RoleRow, ProposedRoleRow, ProposedEmploymentRow,
  CompanySummaryRow, BlockLabel, CandidateSummaryCard, mostRecentRole,
  groupEmploymentsByCompany, type CompanyGroup,
} from "@/components/EmploymentTile";


/*
  How tall the work-history window is: three closed employers.

  A closed employer carries two lines of text - the company, then the dates - at 16px and 14px,
  inside a row padded 10px top and bottom within a 1px box, with a 10px gap above it. Stated as the
  arithmetic rather than a bare number so that changing the row's padding does not silently leave a
  window showing three and a half of something.
*/
import {
  identifyManager,
  describeEmployment,
  isSelectable,
  RoleAwareDisabledError,
  type Candidate,
  type Employment,
  type IdentifyResult,
  type IdentitySelection,
} from "@/lib/roleAwareSubmission";

/**
 * "Which of these people did you work for, and in which job?"
 *
 * ## The one thing this component is for
 *
 * **The contributor decides.** Nothing here is pre-selected, nothing is auto-advanced on a match,
 * and no manager or employment is ever created by looking. The legacy path attached a rating to
 * whichever manager was within one edit of the typed name; that is why one person had eight
 * profiles and twenty-one people had two each with their reviews split between them.
 *
 * ## Three paths, and the third is a first-class choice
 *
 * 1. the person is listed and so is the job -> pick both, carry on to the rating
 * 2. the person is listed, the job is not   -> "I worked for them in a different job"
 * 3. the person is not listed              -> "None of these people"
 *
 * Path 3 is a visible button WHENEVER THERE IS A LIST: somebody looking at four Priya
 * Raghunathans must be able to say none of them is theirs.
 *
 * ## Nobody found is not a question
 *
 * When the search conclusively returns nobody there is nothing to choose between, and asking
 * "are you sure you want to add them?" on a form where the contributor has already typed the
 * person's name is a confirmation of a decision they have already made. So a conclusively empty
 * result reports itself through `onNobodyFound` and this component renders no screen at all.
 *
 * CONCLUSIVELY is the whole weight of that sentence. It means the request SUCCEEDED and the scan
 * was COMPLETE. A failed lookup is not evidence that somebody does not exist, and neither is a
 * scan the server truncated (`incompleteEvidence`) - both still ask, because the alternative is
 * proposing a duplicate of a manager the search simply did not reach.
 *
 * ## An employment with no canonical record
 *
 * A manager's current role often has no employment record behind it, so there is nothing a rating
 * can be attached to. It is still SHOWN - hiding it would make the person look like they had never
 * worked anywhere - but selecting it routes into path 2 rather than sending an id that does not
 * exist. The contributor is told what will happen in plain words and is never silently moved onto
 * a different job.
 *
 * ## No product vocabulary
 *
 * A contributor never needs to know what a role claim, a canonicalization or an
 * employment-resolution conflict is. The strongest word on this screen is "job".
 */
export function ManagerIdentityPicker({
  firstName,
  lastName,
  company,
  companyId,
  companyLogoUrl,
  title,
  value,
  onChange,
  onUnavailable,
  onNobodyFound,
  onChooseNewManager,
  onEditEntry,
}: {
  firstName: string;
  lastName: string;
  company: string | null;
  companyId: number | null;
  /** The chosen company's stored logo, so the proposed box draws the employer rather than a letter. */
  companyLogoUrl?: string | null;
  title: string | null;
  value: IdentitySelection | null;
  onChange: (selection: IdentitySelection | null) => void;
  /** The server's flag is off, so the caller falls back to the legacy journey. */
  onUnavailable: () => void;
  /**
   * Nobody matched, conclusively: the lookup succeeded and the scan was complete.
   *
   * The caller takes the proposeManager path and moves on. Called at most once per result, and
   * never on a failure or a truncated scan.
   */
  onNobodyFound: () => void;
  /**
   * They looked at the candidates and none is theirs: take the new-manager path and MOVE ON.
   *
   * Selecting and waiting for Next was two actions for one decision, and the first of them had no
   * visible result - the only feedback was a ring on the tile they had just pressed. This is the
   * rating flow, where every extra step is somebody deciding not to bother.
   *
   * Unlike `onNobodyFound` the contributor DID see this screen, so Back must return to it rather
   * than skipping to the details step.
   */
  onChooseNewManager: () => void;
  /**
   * Take them back to the screen where the job title was typed.
   *
   * The only fix for "the job I entered is already listed but it was a different one" is to change
   * what they typed, and that lives one step back. A line of advice with no way to act on it is a
   * worse version of the button it replaced.
   */
  onEditEntry: () => void;
}) {
  const [result, setResult] = useState<IdentifyResult | null>(null);
  /*
    CHOOSING A PERSON AND CHOOSING A JOB ARE DIFFERENT DECISIONS.

    Picking WHICH Bob Burger is a comparison across people. Picking which of his jobs is a decision
    inside one of them. Doing both on one screen forced every card to carry the job list, the
    radios and the proposal, which is what made ten cards tall, repetitive and nearly identical -
    and put a green "+ NEW" on nine profiles the contributor had not chosen.

    So: compare people, then choose a job with that person's history open and nothing competing.

    ONE CANDIDATE SKIPS THE COMPARISON. There is nothing to compare, and a confirmation step on a
    list of one is a tap that asks somebody to agree with themselves.
  */
  const [chosenId, setChosenId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    identifyManager({ firstName, lastName, company, title, companyId })
      .then((r) => {
        if (cancelled) return;
        setResult(r);
        /*
          NOBODY, AND WE ARE SURE. There is nothing on this screen to decide, so it is not shown.

          Both conditions matter. `incompleteEvidence` means the server stopped scanning before it
          ran out of people, so an empty list under it says "we did not find anyone", not "there is
          no one" - and advancing on that would propose a duplicate of somebody the search never
          reached. A failed request never arrives here at all; it is caught below.
        */
        if (r.candidates.length === 0 && !r.incompleteEvidence) {
          onNobodyFound();
          return;
        }
        /*
          A SELECTION MADE AGAINST A DIFFERENT LIST IS NOT A SELECTION.

          Going back, changing the name and returning re-runs this search. Whatever was chosen
          before was chosen from the previous answer's candidates, and leaving it in place would
          show "None of these people" already ticked next to people who were not on screen when
          it was ticked - a silent choice between real candidates, which is the one thing this
          component exists to prevent.
        */
        const stillOffered = value === null
          || (value.kind !== "proposeManager"
              && r.candidates.some(c => c.id === value.managerId));
        if (!stillOffered) onChange(null);

        /*
          AN UNAMBIGUOUS PERSON SKIPS THE PERSON SCREEN.

          Somebody who typed "MSN" and "Manager", where exactly one of these people holds that job
          at that company, has already answered "which Bob Burger". Showing them ten cards and
          asking them to find the one that matches what they just typed is asking them to agree
          with themselves.

          EXACTLY ONE. If two of them are Managers at MSN - which happens, and is the reason this
          screen exists - the question is real and they both get shown.

          This skips the comparison, NOT the choice. They land on that person's history with the
          job unselected and still tap it. A rating attaches to an employment, and attaching one
          to a role nobody affirmatively picked is the guess the whole redesign removes: the old
          path did exactly this and produced one manager with eight profiles and reviews split
          between them. The back link is right there, so a wrong skip costs one tap.
        */
        const wantCompany = norm(company);
        const wantTitle = norm(title);
        if (wantCompany && wantTitle && r.candidates.length > 1) {
          const exact = r.candidates.filter(c =>
            c.employments.some(e =>
              (companyId != null && e.companyId === companyId
                ? true
                : norm(e.company) === wantCompany) && norm(e.title) === wantTitle));
          if (exact.length === 1) setChosenId(exact[0].id);
        }
        /*
          A SINGLE CANDIDATE IS STILL NOT A SELECTION.

          Every job is on screen from the start now, so there is nothing left to open on the
          contributor's behalf. What has not changed is that one result is not consent: it is
          shown, and it is chosen only by a tap. Auto-selecting it would be the old guess wearing
          a nicer presentation.
        */
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof RoleAwareDisabledError) onUnavailable();
        else setFailed(true);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // Re-identify when the typed identity changes, not when the selection does.
  }, [firstName, lastName, company, companyId, title]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        Looking for {firstName} {lastName}…
      </p>
    );
  }

  if (failed) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
        <p className="font-medium">We couldn't check for existing profiles.</p>
        <p className="mt-1">
          You can still add {firstName} {lastName} as someone new.
        </p>
        <button
          type="button"
          className="mt-3 underline"
          onClick={() => onChange({ kind: "proposeManager" })}
        >
          Add them as a new manager
        </button>
      </div>
    );
  }

  const candidates = result?.candidates ?? [];
  const fullName = `${firstName} ${lastName}`.trim();
  const entered = { company, companyId, companyLogoUrl, title };

  // The person whose jobs are on screen: the one they picked, or the only one there was.
  const chosen =
    candidates.length === 1
      ? candidates[0]
      : candidates.find(c => c.id === chosenId) ?? null;

  /*
    THE EMPLOYER IS THE EVIDENCE. A TITLE IS NOT.

    "Closest" used to be earned by matching the company OR the title, and a title match is close to
    meaningless here: half the managers in the product are called some kind of Manager, so "Bob
    Burger, Manager" matching "Manager at MSN" says nothing about whether it is the same Bob. The
    company is the thing a contributor actually knows about their own manager.

    So the badge requires the leader to hold the company that was typed.
  */
  const holdsEnteredCompany = (c: Candidate) => {
    const want = norm(company);
    if (!want && companyId == null) return false;
    return c.employments.some(e =>
      (companyId != null && e.companyId === companyId) || (!!want && norm(e.company) === want));
  };
  const leaderIsEarned = candidates.length > 0 && holdsEnteredCompany(candidates[0]);

  /*
    NOBODY HERE HAS EVER WORKED THERE, SO THE LIKELIEST ANSWER IS "NONE OF THESE".

    Somebody typed an employer, and not one of these people has it anywhere in their history. They
    share a name and nothing else. Leaving the way out as the last tile makes the contributor read
    ten strangers before reaching the option that was probably right from the start - and in a
    rating flow, that reading is where people give up.

    Only when an employer was actually typed. With no company to test against, we know nothing and
    claim nothing.
  */
  const nobodyHoldsCompany =
    (!!norm(company) || companyId != null) && !candidates.some(holdsEnteredCompany);

  /*
    One tile, placed at whichever end of the grid it belongs to. Written once so the two positions
    cannot drift into two slightly different controls.
  */
  const escapeTile = (
    <button
      type="button"
      onClick={() => {
        onChange({ kind: "proposeManager" });
        onChooseNewManager();
      }}
      /*
        A TILE, NOT A GAP IN THE GRID.

        It was a dashed outline over the page background, so among nine white cards it read as
        empty space rather than a tenth option - the one option somebody needs precisely when none
        of the other nine is theirs. White, with the dashed edge kept: the fill makes it an object,
        the dashes say it creates something rather than selecting it.
      */
      /*
        Content starts at the TOP, like every other card in the grid.

        Centred, its badge floated halfway down the tile while the neighbouring cards carry theirs
        on the first line, so the one row a reader scans across had a pill out of line with the
        rest. Top-aligned, the two badges sit at the same height.
      */
      className="flex h-full w-full flex-col items-start justify-start gap-1.5 border-2 border-dashed border-slate-300 bg-white px-4 pt-3 pb-4 text-left shadow-[0_1px_3px_rgba(0,0,0,0.05)] transition-all hover:border-[#2e0562]/40 hover:shadow-md hover:shadow-[#2e0562]/5"
      style={{ borderRadius: 8 }}
    >
      <div className="flex w-full items-center justify-between gap-2">
        <UserPlus className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        {nobodyHoldsCompany && (
          /* A fact, not a guess: not one of them has this employer anywhere in their history. */
          <span className="shrink-0 rounded-full border border-primary/30 bg-primary/5 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-primary">
            Most likely
          </span>
        )}
      </div>
      <span className="text-sm font-medium">None of these is my manager</span>
      <span className="text-xs text-muted-foreground">
        {nobodyHoldsCompany && company
          ? `None of them has worked at ${company}`
          : `Continue with a new ${fullName}`}
      </span>
    </button>
  );

  return (
    <div className="space-y-4">
      {candidates.length === 0 ? (
        <NobodyFound firstName={firstName} lastName={lastName} value={value} onChange={onChange} />
      ) : chosen ? (
        /*
          THE JOB SCREEN SETS ITS OWN WIDTH.

          The step container opens to max-w-6xl for the person comparison and returns to the form's
          column once an identity is chosen - so selecting a position resized the card that was
          being selected, under the pointer that selected it. Pinning this half to the form column
          means the outer change is invisible: the card is the same size before and after the tap.
        */
        <div className="mx-auto w-full max-w-2xl space-y-4">
          {candidates.length > 1 && (
            <button
              type="button"
              onClick={() => {
                setChosenId(null);
                // Their job choice belonged to the person they are leaving.
                onChange(null);
              }}
              className="flex items-center gap-1.5 text-xs font-semibold text-primary transition hover:underline"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Not them? Choose someone else
            </button>
          )}

          <div>
            {/*
              THE HEADING IS THE INSTRUCTION.

              It used to ask a question the screen had already answered - "which job did you work
              under?" above a subtitle telling them to select one - so the loud line was rhetorical
              and the quiet line carried the task.
            */}
            <h3 className="text-base font-semibold">Select the job you want to rate.</h3>
            {result?.nameClass === "PLAUSIBLE" && (
              <p className="mt-1 text-sm text-muted-foreground">
                This name is close to what you typed, so check carefully before choosing.
              </p>
            )}
          </div>

          <CandidateProfile
            candidate={chosen}
            entered={entered}
            value={value}
            onChange={onChange}
            onEditEntry={onEditEntry}
          />
        </div>
      ) : (
        <>
          <div>
            {/*
              THE WAY OUT IS THE TILE AT THE END OF THE GRID, AND ONLY THAT.

              There was briefly a second control on this line. It selected the tile at the far end
              of the grid, so clicking it produced no visible result where the pointer was, and it
              pushed the heading around on narrow screens. A control whose effect happens somewhere
              you are not looking reads as a broken control.

              Discoverability was the reason for it, and the wider grid answered that instead: ten
              candidates and the tile now fit on one screen with nothing to scroll past.
            */}
            <h3 className="text-base font-semibold">Which {fullName} did you work with?</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {result?.nameClass === "PLAUSIBLE"
                ? "These names are close to what you typed, so check carefully before choosing."
                : "Ordered by how closely they match what you entered."}
            </p>
          </div>

          {/*
            TWO UP, NOT TEN DOWN.

            A 255px card in a 620px column left more than half the width empty while ten people
            took four screens to scroll past. The decision here is a comparison, and a comparison
            somebody cannot hold two of on screen at once is one they make by scrolling back and
            forth and guessing.

            `auto-rows-fr` so a row's cards match their tallest sibling instead of every card in
            the grid being padded out to the tallest card anywhere in it.

            One column on a phone, where two would be 150px each and unreadable.
          */}
          {/*
            "CLOSEST" IS A CLAIM, AND IT HAS TO BE EARNED.

            The badge went to whoever was first, and first is only meaningful when the ranking had
            something to rank on. The matcher orders by name class, then by whether a candidate
            holds the company or the title the contributor typed, then by review count and id. When
            nobody holds either, the head of the list is the person with the most reviews - which
            says nothing at all about whose manager they are.

            So the badge appears only when the leader actually matches something that was typed. If
            none of them do, they are ten equally plausible strangers and saying one is closest
            points somebody at a card for no reason.
          */}
          <div className="grid grid-cols-1 gap-3 auto-rows-fr sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {nobodyHoldsCompany && escapeTile}
            {candidates.map((c, i) => {
              const groups = groupEmploymentsByCompany(c.employments);
              const lead = pickLeadGroup(groups, entered);
              return (
                <CandidateSummaryCard
                  key={c.id}
                  name={c.name}
                  lead={lead}
                  leadTitle={mostRecentRole(lead)?.title ?? null}
                  otherCompanies={groups.filter(g => g !== lead).map(g => g.company ?? "").filter(Boolean)}
                  positionCount={c.employments.length}
                  nameFirst={result?.nameClass === "PLAUSIBLE"}
                  best={i === 0 && result?.nameClass !== "PLAUSIBLE" && leaderIsEarned}
                  selected={
                    (value?.kind === "existing" || value?.kind === "proposeEmployment") &&
                    value.managerId === c.id
                  }
                  onChoose={() => setChosenId(c.id)}
                />
              );
            })}

            {!nobodyHoldsCompany && escapeTile}
          </div>

          {result?.incompleteEvidence && (
            <p className="flex items-start gap-2 text-xs text-muted-foreground">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              There may be more people with this name than we can show here.
            </p>
          )}
        </>
      )}
    </div>
  );
}

/**
 * The employer a candidate is identified BY.
 *
 * The one the contributor named where we hold it - that is why they typed it - and otherwise the
 * first the server returned, which is already ordered by relevance.
 */
function pickLeadGroup(
  groups: CompanyGroup[],
  entered: { company: string | null; companyId: number | null },
): CompanyGroup | undefined {
  const wanted = (entered.company ?? "").trim().toLowerCase();
  const byId = entered.companyId == null
    ? undefined
    : groups.find(g => g.roles.some(r => r.companyId === entered.companyId));
  if (byId) return byId;
  if (wanted) {
    const byName = groups.find(g => (g.company ?? "").trim().toLowerCase() === wanted);
    if (byName) return byName;
  }
  return groups[0];
}

/**
 * Nobody was RETURNED, but the scan was truncated, so nobody-found is not established.
 *
 * The conclusive case never reaches here: it advances without a screen. This one still asks,
 * because the server stopped looking before it ran out of people and adding a manager it simply
 * did not reach is how a duplicate profile is created.
 */
function NobodyFound({
  firstName,
  lastName,
  value,
  onChange,
}: {
  firstName: string;
  lastName: string;
  value: IdentitySelection | null;
  onChange: (s: IdentitySelection | null) => void;
}) {
  // Still an explicit confirmation rather than an auto-advance, so the contributor knows a new
  // profile is about to be created in their name. It is one tap.
  return (
    <div className="space-y-3">
      <h3 className="text-base font-semibold">
        We couldn't find {firstName} {lastName}
      </h3>
      <p className="text-sm text-muted-foreground">
        There are more people with this name than we can check here, so they may already be
        listed. Add them as someone new and we'll check before anything appears publicly.
      </p>
      <button
        type="button"
        onClick={() => onChange({ kind: "proposeManager" })}
        aria-pressed={value?.kind === "proposeManager"}
        className={`flex w-full items-center gap-3 rounded-lg border p-4 text-left transition ${
          value?.kind === "proposeManager"
            ? "border-primary bg-primary/5 ring-2 ring-primary"
            : "border-border hover:border-primary/50"
        }`}
      >
        <UserPlus className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="font-medium">
          Add {firstName} {lastName}
        </span>
        {value?.kind === "proposeManager" && (
          <Check className="ml-auto h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}

/**
 * One person, with every job we hold for them shown at once.
 *
 * ## Nothing is hidden behind an expansion
 *
 * The jobs used to sit inside a collapsed card, so telling two people apart meant opening both and
 * remembering the first. The whole reason a contributor is on this screen is that a name was not
 * enough to identify somebody, and the employment history is the evidence that settles it. Putting
 * the evidence behind a tap asks them to decide before looking.
 *
 * ## The job IS the choice
 *
 * Selecting a tile picks the person AND the job in one action, which is what a rating has to carry:
 * a rating attaches to an employment, not to a name. A person-level "this is them" button would
 * have to guess which of three jobs was meant, and guessing which employment a rating belongs to is
 * the thing this whole redesign exists to stop.
 */
function CandidateProfile({
  candidate,
  entered,
  value,
  onChange,
  onEditEntry,
}: {
  candidate: Candidate;
  /** What the contributor typed on the previous screen, offered back to them as a choice. */
  entered: {
    company: string | null;
    companyId: number | null;
    companyLogoUrl?: string | null;
    title: string | null;
  };
  value: IdentitySelection | null;
  onChange: (s: IdentitySelection | null) => void;
  /** Back to the screen where the job title was entered. */
  onEditEntry: () => void;
}) {
  const groups = groupEmploymentsByCompany(candidate.employments);
  const proposing = value?.kind === "proposeEmployment" && value.managerId === candidate.id;
  const propose = () =>
    onChange({ kind: "proposeEmployment", managerId: candidate.id, managerName: candidate.name });

  /*
    WHERE THE JOB THEY TYPED BELONGS, if anywhere.

    Three cases, and they are genuinely different:

      already listed   the employer AND the job are both here, so there is nothing to propose -
                       the row they want is on screen and selecting it is path 1
      same employer    we hold this company for them but not this job, so the proposal goes
                       inside that employer's box, under the jobs we do hold
      new employer     we hold nothing for this company, so it gets its own dashed box

    Comparing on the company id first and the name only as a fallback, for the same reason the
    grouping does: two rows can name one employer differently, and a name comparison would put the
    proposal in a box of its own next to the company it actually belongs to.
  */
  const enteredTitle = norm(entered.title);
  const enteredCompany = norm(entered.company);
  const sameCompany = (g: ReturnType<typeof groupEmploymentsByCompany>[number]) =>
    entered.companyId != null && g.roles.some(r => r.companyId === entered.companyId)
      ? true
      : enteredCompany !== "" && norm(g.company) === enteredCompany;

  const hostGroup = enteredCompany === "" ? undefined : groups.find(sameCompany);
  const alreadyListed =
    enteredTitle !== "" &&
    !!hostGroup &&
    hostGroup.roles.some(r => norm(r.title) === enteredTitle);
  // Nothing was typed to offer back, so the generic control is all there is to show.
  const nothingEntered = enteredTitle === "" && enteredCompany === "";
  const offerProposal = !alreadyListed && !nothingEntered;

  /*
    A LONG HISTORY MUST NOT BURY THE ANSWER.

    Somebody with twenty employers produced a card taller than the screen, and the job the
    contributor was looking for was as likely to be at the bottom as the top. So the default view
    is one line per employer - logo, name, and how long they were there - and the positions held
    at each open on request.

    The employer they NAMED comes first, because it is nearly always the one they mean.

    This is not the accordion this screen used to have. That hid EVERY job behind a tap, including
    the only job of a person who had one, so telling two people apart meant opening both and
    remembering the first. Here the employers and their dates - the facts that actually distinguish
    two people with one name - are all on screen, and only the job titles within them fold away. A
    history short enough to show in full never collapses at all.
  */
  const others = hostGroup ? groups.filter(g => g !== hostGroup) : groups;
  /*
    EVERY employer in the history starts closed, however few there are.

    Leaving a single-employer person expanded "because there is nothing to summarise" meant nine
    cards on a ten-candidate page each carried an open position nobody had asked to see, and the
    cards stopped looking alike - some open, some closed, for a reason invisible to the reader. A
    history is a history: it is one line per employer until somebody opens it.
  */

  /*
    Which employers are open. Per employer, because opening one is not a request to open seven:
    somebody drilling into Adobe wants Adobe's positions, not everybody's.

    THE EMPLOYER THEY NAMED STARTS OPEN. They told us on the previous screen where they worked, so
    the question left is which job there - and making them tap the company they just typed to see
    the answer asks them to repeat themselves. Everyone else starts closed: those employers are
    evidence about WHO this is, not the thing being chosen.
  */
  const [openKeys, setOpenKeys] = useState<ReadonlySet<string>>(
    () => new Set(hostGroup ? [hostGroup.key] : []),
  );
  const toggle = (key: string) =>
    setOpenKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    /*
      NO OUTER FRAME, and the trajectory's own width.

      These were wrapped in a bordered card with the person's name as its heading, which drew a box
      around a box and put the name outside the thing being chosen. Each tile carries the name
      itself now, so the group needs nothing holding it together but space - and it is the width
      every other card in this product is, rather than the full width of the form column.
    */
    <div data-testid="candidate-profile" className="w-full">
      <PersonCard personName={candidate.name}>
        {/*
          THE EMPLOYER THEY NAMED, WITH THE JOB THEY TYPED INSIDE IT.

          This used to be a dashed box of its own above the history, which drew the same company
          twice when we already held it: once as "what you entered" and again in the list below.
          One employer, one box - the jobs we hold there, and the one they described, together,
          which is also the only place a contributor can see that their job is genuinely new.
        */}
        {hostGroup && (
          <CompanySection
            group={hostGroup}
            onToggle={() => toggle(hostGroup.key)}
            collapsed={!openKeys.has(hostGroup.key)}
          >
            {/*
              THE JOB THEY TYPED COMES FIRST, HERE TOO.

              On every other candidate it is the first row on the card. Putting it last inside this
              one employer meant the same choice sat in a different place depending on whether we
              happened to already hold that company - so somebody scanning ten cards for the row
              they recognise would find it at the top nine times and buried under an unrelated job
              the tenth.

              It is also the row that matches what they said. The positions below are the ones we
              hold, which is the comparison that makes it obvious theirs is genuinely new.
            */}
            {offerProposal && (
              <ProposedChoice title={entered.title} selected={proposing} onSelect={propose} />
            )}
            {hostGroup.roles.map((e, i) => (
              <EmploymentChoice
                key={e.roleId ?? `current-${i}`}
                employment={e}
                candidate={candidate}
                value={value}
                onChange={onChange}
              />
            ))}
          </CompanySection>
        )}

        {/*
          THE JOB THEY TYPED, ON A PERSON WHOSE EMPLOYER WE DO NOT HOLD.

          Ten people share this name. That we have no MSN on nine of those profiles does not make
          those nine the wrong person: it means we do not hold that employment, which is exactly
          what this row proposes to fix. Without it the contributor could only say "a job you
          don't list" and never say which, and the one thing they already told us would be the one
          thing missing from the card.

          First, because it is the only row here that matches what they said. The history below is
          evidence about who this person is; this is the thing being chosen.
        */}
        {offerProposal && !hostGroup && (
          <button
            type="button"
            onClick={propose}
            aria-pressed={proposing}
            aria-label={`Rate this position: ${entered.title || "the job you described"} at ${entered.company || "the company you entered"}, which we don't have on file yet`}
            className="block w-full text-left"
          >
            <ProposedEmploymentRow
              company={entered.company}
              companyLogoUrl={entered.companyLogoUrl}
              title={entered.title}
              selected={proposing}
            />
          </button>
        )}

        {others.length > 0 && (
          <>
            {/*
              ONE LABEL, WHICHEVER CASE THIS IS.

              It said "Their other companies" when an employer was pinned above and "Known work
              history" when none was, so the same list changed its name depending on what the
              contributor had typed on the previous screen. Two names for one thing is a difference
              a reader has to account for, and there is no difference to account for.
            */}
            <BlockLabel>Work history</BlockLabel>
            <div data-testid="work-history-scroll">
              {others.map((group) =>
                openKeys.has(group.key) ? (
                  <CompanySection
                    key={group.key}
                    group={group}
                    onToggle={() => toggle(group.key)}
                  >
                    {group.roles.map((e, i) => (
                      <EmploymentChoice
                        key={e.roleId ?? `current-${i}`}
                        employment={e}
                        candidate={candidate}
                        value={value}
                        onChange={onChange}
                      />
                    ))}
                  </CompanySection>
                ) : (
                  <CompanySummaryRowWrapper
                    key={group.key}
                    group={group}
                    onOpen={() => toggle(group.key)}
                  />
                ),
              )}
            </div>

          </>
        )}
      </PersonCard>

      {/*
        THE "DIFFERENT JOB" BUTTON IS GONE, AND IT WAS A BUG RATHER THAN BAD COPY.

        Title and company are both REQUIRED on the previous screen, so "they typed nothing" cannot
        happen here. That left one case where the control appeared: the job they typed is ALREADY
        on this person's profile. And pressing it called the same propose() as everywhere else,
        which submits the company and title from that screen - the identical pair already listed
        above it. So the only thing it could ever do was ask a moderator to approve a duplicate of
        an employment the manager already has.

        What somebody in that position actually wants is to correct the job title, which lives on
        the previous step and is one Back away. So this says that, and does not offer to create
        anything.
      */}
      {!offerProposal && (
        <p className="mt-2.5 text-[11px] text-muted-foreground">
          Worked under them in a different job?{" "}
          <button
            type="button"
            onClick={onEditEntry}
            className="font-semibold text-primary transition hover:underline"
          >
            Change the job title
          </button>
        </p>
      )}
    </div>
  );
}

function EmploymentChoice({
  employment,
  candidate,
  value,
  onChange,
}: {
  employment: Employment;
  candidate: Candidate;
  value: IdentitySelection | null;
  onChange: (s: IdentitySelection | null) => void;
}) {
  const selectable = isSelectable(employment);
  const chosen =
    value?.kind === "existing" &&
    value.managerId === candidate.id &&
    value.roleId === employment.roleId;

  /*
    AN EMPLOYMENT WITH NO CANONICAL RECORD IS NOT A SELECTION.

    There is no id for a rating to attach to, so choosing it routes into the missing-employment
    path for THIS manager. It is not disabled and it is not hidden: it is usually the only job a
    search-created manager shows, and a greyed-out row that is also the only row reads as a dead
    end. Selecting it keeps the person and asks for the job, which is what the contributor meant.
  */
  const handle = () => {
    if (selectable && employment.roleId !== null) {
      onChange({
        kind: "existing",
        managerId: candidate.id,
        managerName: candidate.name,
        roleId: employment.roleId,
        employment,
      });
    } else {
      onChange({
        kind: "proposeEmployment",
        managerId: candidate.id,
        managerName: candidate.name,
      });
    }
  };

  return (
    <button
      type="button"
      onClick={handle}
      aria-pressed={chosen}
      /*
        A DISTINCT ACCESSIBLE NAME. The person's name heading and this row would otherwise announce
        the same words when somebody has one job, leaving a screen reader with two controls called
        the same thing and no way to tell choosing the person from choosing their job.
      */
      aria-label={`Select job: ${describeEmployment(employment) || "job not recorded"}`}
      className="block w-full rounded-md text-left transition"
    >
      <RoleRow
        employment={employment}
        selected={chosen}
        interactive
        footnote={
          !selectable
            ? "We don't have the dates for this job yet, so you'll add them next."
            : employment.state !== "accepted"
              ? "Still being confirmed, so your rating appears once someone checks it."
              : undefined
        }
      />
    </button>
  );
}

/** The job they typed, as a control. Selecting it keeps the person and proposes the job. */
function ProposedChoice({
  title,
  selected,
  onSelect,
}: {
  title: string | null;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`Rate this position: ${title || "the job you described"}`}
      className="block w-full text-left"
    >
      <ProposedRoleRow title={title} selected={selected} />
    </button>
  );
}

/** Lowercase, trimmed, inner whitespace collapsed. Enough to tell "Dispatch Lead" from a retype. */
function norm(v: string | null | undefined): string {
  return (v ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * A closed employer, in the same grey box an open one uses.
 *
 * Its own box rather than one box holding every closed employer, because an employer can open
 * between two closed ones and a shared container would have to split in half to allow it.
 */
function CompanySummaryRowWrapper({
  group,
  onOpen,
}: {
  group: CompanyGroup;
  onOpen: () => void;
}) {
  return (
    <div
      className="mt-2.5"
      style={{
        borderRadius: 6,
        border: "1px solid #e2e8f0",
        background: "#f8fafc",
        overflow: "hidden",
      }}
    >
      <CompanySummaryRow group={group} onOpen={onOpen} />
    </div>
  );
}
