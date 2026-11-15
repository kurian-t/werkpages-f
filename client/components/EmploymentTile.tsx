import type { ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { CompanyLogoImg } from "@/components/ManagerCard";
import type { Employment } from "@/lib/roleAwareSubmission";

/**
 * One person's employment history, drawn with the career trajectory's card.
 *
 * ## One box per person, employers inside it
 *
 * Everything in the box belongs to the same human being: their name at the top, then each employer
 * as a heading over the positions held there. Giving every employer its own card made one person
 * with three jobs look like three search results, which is exactly the confusion this screen
 * exists to resolve.
 *
 * ## The same card, not a card like it
 *
 * The chrome and the type scale are lifted verbatim from `CompanyCard` in CareerTimeline.tsx: an
 * 8px radius over a 1px `#e2e8f0` border with a 3px left edge and a 1px shadow, `px-4` inside, and
 * a 13px semibold `slate-900` primary line. The numbers are inline styles for the same reason they
 * are there: they are the trajectory's own values, and restating them as approximate Tailwind
 * steps is how the two drift apart.
 *
 * ## No rating
 *
 * The trajectory card leads with an average and a row of stars, because its subject is how the
 * manager was rated. Here the subject is which person you worked for, and a score beside each one
 * invites somebody to choose the one who looks better rather than the one they actually worked
 * for. The rating they are about to give is the thing that would be biased.
 *
 * ## The logo is resolved, never guessed
 *
 * `CompanyLogoImg` is given the domain, the stored URL and the Brandfetch icon the server carries
 * on the employment. A name on its own makes the renderer guess a domain, and a guessed domain
 * produces a confident-looking logo belonging to somebody else - which passes any test that only
 * asserts an image appeared.
 */
export function PersonCard({
  personName,
  children,
}: {
  /** Whose history this is. One name at the top of one box, not repeated down the column. */
  personName?: string;
  children: ReactNode;
}) {
  return (
    <div
      data-testid="person-card"
      className="flex flex-col overflow-hidden"
      style={{
        height: PERSON_CARD_H,
        borderRadius: 8,
        background: "#ffffff",
        border: "1px solid #e2e8f0",
        borderLeft: "3px solid #e2e8f0",
        boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
      }}
    >
      {personName && (
        <p className="shrink-0 px-4 pt-3 text-[13px] font-semibold text-slate-900 leading-tight truncate">
          {personName}
        </p>
      )}
      {/*
        THE CARD IS A FIXED OBJECT; ITS CONTENTS SCROLL.

        Opening an employer used to grow the card and push every candidate below it down the page,
        so the row somebody was reaching for moved while they were reaching for it. Collapsing did
        the reverse, and ten cards of ten different heights made the list impossible to scan.

        One scroller, here, rather than a window around the history as well: nested scroll regions
        mean a wheel gesture does different things depending on which few pixels the pointer
        happens to be over.
      */}
      <div className="hover-scroll min-h-0 flex-1 overflow-y-auto px-4 pb-3 pr-3">{children}</div>
    </div>
  );
}

/*
  How tall a candidate card is.

  Enough for the job they typed, the employer it belongs to with a position or two inside, and the
  first of the other employers - which is the point at which somebody can tell one Bob Burger from
  another. Everything past that scrolls.
*/
export const PERSON_CARD_H = 300;

/**
 * One employer inside a person's card: the grey box, with the logo in it and the roles under it.
 *
 * ## The logo lives in the box
 *
 * The employer header sat on the card's white above the grey, which read as a label floating over
 * a group rather than the heading OF it. The box is the employer: its logo, its name, and every
 * position held there, so the grouping is visible rather than implied by proximity.
 *
 * ## The trajectory's grey
 *
 * `#f8fafc` over a 1px `#e2e8f0` border at a 6px radius, which is `RoleItem`'s own fill in
 * CareerTimeline.tsx. One step darker - `#f1f5f9` - and the boxes stop reading as part of the card
 * they sit in.
 */
export function CompanySection({
  group,
  proposed = false,
  onToggle,
  collapsed = false,
  children,
}: {
  group: CompanyGroup;
  /**
   * This employer is not one we hold for them: it is the one the contributor typed.
   *
   * Dashed rather than solid, for the same reason the position inside it is: everything else in
   * the card is a record, and this is a proposal. A solid box would claim the product knows they
   * worked there.
   */
  proposed?: boolean;
  /**
   * Makes the employer's own header the control that closes it again.
   *
   * Whatever opened a thing should close it. Expanding an employer by tapping its line and then
   * having to find a different control to put it away is the kind of one-way door somebody stops
   * trusting after the first time, so they stop opening anything.
   */
  onToggle?: () => void;
  /** Closed: the header alone, with the chevron pointing down. */
  collapsed?: boolean;
  /** The roles held here, as whatever the caller needs them to be - rows, buttons, links. */
  children: ReactNode;
}) {
  return (
    <div
      data-testid={proposed ? "proposed-company-section" : "company-section"}
      className="mt-2.5"
      style={{
        // 8, matching CompanyCard in CareerTimeline.tsx. It was 6, which is a different card
        // drawn next to the real one rather than the same card reused, and the drift was caught
        // by the test that compares the two computed styles.
        borderRadius: 8,
        border: proposed ? "1px dashed #cbd5e1" : "1px solid #e2e8f0",
        background: proposed ? "transparent" : "#f8fafc",
        overflow: "hidden",
      }}
    >
      {(() => {
        const header = (
          <>
            <CompanyLogoImg
              company={group.company ?? ""}
              logoUrl={group.companyLogoUrl ?? null}
              domain={group.companyDomain ?? null}
              brandfetchIconUrl={group.companyBrandfetchIconUrl ?? null}
              sizeClass="h-7 w-7"
            />
            <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-900 leading-tight">
              {group.company || "Company not recorded"}
            </span>
            {onToggle && (collapsed
              ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
              : <ChevronUp className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
            )}
          </>
        );
        /*
          THE EMPLOYER IS A BAND, THE POSITIONS ARE ROWS ON WHITE.

          Header and rows shared one fill, so the logo line read as a thing of the same kind as the
          jobs under it - and once a job was selected and tinted, the header looked like a fourth
          state of something rather than the label of the group. A deeper band behind the employer
          and white behind the positions says which is the heading and which are the choices,
          without a word of explanation.
        */
        const bandStyle = { background: "#f1f5f9" };
        return onToggle ? (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={!collapsed}
            aria-label={`${collapsed ? "Show" : "Hide"} positions at ${group.company || "this company"}`}
            className="flex w-full items-center gap-2 px-3 pt-2.5 pb-2 text-left transition-colors hover:bg-slate-200/70"
            style={bandStyle}
          >
            {header}
          </button>
        ) : (
          <div className="flex items-center gap-2 px-3 pt-2.5 pb-2" style={bandStyle}>{header}</div>
        );
      })()}

      {/* Positions, each ruled off from the one above it. */}
      {!collapsed && (
        <div className={proposed ? "" : "divide-y divide-slate-200 border-t border-slate-200"}>
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * The "pick this one" mark on a position.
 *
 * ## Why a radio and not a chevron or a tick
 *
 * Nothing on these rows said they were selectable, and the only hint was a line of copy at the top
 * of the screen. The ambiguity was worse than that: with a bordered card per person and a bordered
 * box per employer, it was not clear whether the thing being chosen was the person, the employer
 * or the job.
 *
 * A radio answers both at once. It is the control people already read as "pick exactly one of
 * these", and putting the circles on the positions says the positions are the choice - the card
 * and the employer box are just where they live.
 *
 * Drawn rather than an <input>, because the row itself is the button; a real radio inside it would
 * be a control inside a control, with two tab stops for one decision.
 */
function SelectMark({ selected, dashed = false }: { selected: boolean; dashed?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full"
      style={{
        border: selected
          ? "4px solid #2e0562"
          : `1px ${dashed ? "dashed" : "solid"} #94a3b8`,
        background: "#ffffff",
      }}
    />
  );
}

/**
 * One position held at that employer: the title, its dates, and the row it sits on.
 *
 * ## A row inside the employer's box, not a box of its own
 *
 * Three attempts got here. A `#f1f5f9` chip made each position read as a separate card. A bare
 * bottom rule on white lost the grouping entirely. A `#f8fafc` box per position put a box inside a
 * box once the employer became one. What a position actually is, is a line in somebody's history
 * under the employer it belongs to - so it is a row, ruled off from the next, inside the grey.
 *
 * Presentational only. Whether a position can be chosen, and what choosing it means, belongs to
 * the screen using it - this draws a job.
 */
export function RoleRow({
  employment,
  footnote,
  selected = false,
  interactive = false,
}: {
  employment: Employment;
  /** Shown under the period, for things like "we don't have the dates for this job yet". */
  footnote?: string;
  selected?: boolean;
  /** Draws the hover affordance. The control itself belongs to the caller. */
  interactive?: boolean;
}) {
  const period = employmentPeriod(employment);

  return (
    <div
      data-testid="role-row"
      /*
        White, so a position reads as a choice sitting under the employer band rather than more of
        the band. The selected one takes the brand tint and a 3px inset edge, which is the only
        colour in the box and therefore unmistakable.
      */
      /*
        THE SAME LANGUAGE AS EVERY OTHER TILE: AN OUTLINE, NOT A FILL.

        A selected row used to flood with `#ede9fe`, which made the one thing the contributor had
        chosen the loudest block of colour on the screen and sank its own text into it. Tiles in
        this product say "you are on me" with a purple border and "this is clickable" by lifting
        the title to purple, and a row in a list is not a different kind of object.

        Hover draws the outline and lifts the title to the directory's `#6d28d9`. Selecting keeps
        that outline rather than losing it, at twice the width and a deeper purple, over a tint
        faint enough to stay behind the words.

        `ring-inset` rather than a border: these rows sit flush inside the employer box, and a real
        border would shove its neighbours around every time one was hovered.
      */
      className={`group px-3 py-2.5 transition-all ${
        selected
          ? "bg-[#faf8ff] ring-2 ring-inset ring-[#2e0562]/60"
          : interactive
            ? "bg-white hover:bg-[#fcfbff] hover:ring-1 hover:ring-inset hover:ring-[#2e0562]/30"
            : "bg-white"
      }`}
    >
      <div className="flex items-start gap-2.5">
        <SelectMark selected={selected} />
        <span className="min-w-0 flex-1">
          <span
            className={`block text-xs font-semibold leading-snug transition-colors ${
              selected ? "text-[#6d28d9]" : "text-slate-800 group-hover:text-[#6d28d9]"
            }`}
          >
            {employment.title || "Job title not recorded"}
          </span>
          {period && (
            <span className="mt-0.5 block text-[10.5px] text-slate-500 tabular-nums">{period}</span>
          )}
          {footnote && <span className="mt-1 block text-[10.5px] text-slate-500">{footnote}</span>}
        </span>
      </div>
    </div>
  );
}

/**
 * The job the contributor typed on the previous screen, offered as something they can pick.
 *
 * ## Why this exists
 *
 * "I worked for them in a different job" is true but useless: the contributor already said which
 * job, on the screen before this one, and a generic button asks them to say it again. Showing the
 * thing they typed turns path 2 from a description into a choice - they recognise their own words
 * and tap them.
 *
 * ## Dashed, because it is not a record yet
 *
 * Everything else in the box is an employment the product holds. This is a proposal. The dashed
 * edge is the form's existing vocabulary for "this will be created", and it is the same signal
 * the add-something-new controls use elsewhere on the page, so nothing new has to be learnt.
 *
 * The line under it is an invitation, not a warning. That a proposed job waits for a moderator is
 * said by `publicationNote` on the confirmation strip once they have chosen, which is where it
 * belongs: a caveat on a control somebody has not picked yet reads as a reason not to pick it.
 */
export function ProposedRoleRow({
  title,
  selected = false,
}: {
  /** What they typed. Shown verbatim - it is their words, and recognising them is the point. */
  title: string | null;
  selected?: boolean;
}) {
  return (
    <div
      data-testid="proposed-role-row"
      className={`group px-3 py-2.5 transition-all ${selected ? "" : "hover:bg-[#fcfbff]"}`}
      style={{
        borderStyle: "dashed",
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? "rgba(46,5,98,0.6)" : "#cbd5e1",
        borderRadius: 6,
        margin: "8px",
        background: selected ? "#faf8ff" : "transparent",
      }}
    >
      <div className="flex items-start gap-2.5">
        <SelectMark selected={selected} dashed />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span
              className={`min-w-0 truncate text-xs font-semibold leading-snug transition-colors ${
                selected ? "text-[#6d28d9]" : "text-slate-600 group-hover:text-[#6d28d9]"
              }`}
            >
              {title || "The job you described"}
            </span>
            {/*
              It is not on their profile yet, and choosing it is what adds it.

              Green, and the same green the form already uses for its "you're signed in" banner,
              because this is the one thing on the screen that is additive. In grey it read as
              another piece of metadata on a row that already had two.
            */}
            <span className="shrink-0 rounded-full border border-green-500/40 bg-green-500/10 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-green-700">
              + New
            </span>
          </span>
          <span className="mt-0.5 block text-[10.5px] text-slate-500">Rate this position</span>
        </span>
      </div>
    </div>
  );
}

/**
 * One employer on a single line: the logo, the name, and the most recent job held there.
 *
 * ## The default view of a history
 *
 * A person with ten employers and twenty jobs produced a card taller than the screen, and the row
 * somebody was looking for was as likely to be at the bottom as the top. The question this screen
 * asks is "which of these people is yours", and the answer almost always comes from WHERE and WHEN
 * they worked rather than from the exact sequence of job titles there. So the employer and the
 * span are the summary, and the positions are the detail.
 *
 * The whole row is the control, and it opens the full history rather than selecting anything. A
 * line somebody taps that does nothing is worse than a line they cannot tap.
 */
export function CompanySummaryRow({
  group,
  onOpen,
}: {
  group: CompanyGroup;
  onOpen: () => void;
}) {
  const period = companyPeriod(group);
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid="company-summary-row"
      aria-label={`${group.company || "Company not recorded"}${period ? `, ${period}` : ""}. Show every position`}
      className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-slate-100"
    >
      <CompanyLogoImg
        company={group.company ?? ""}
        logoUrl={group.companyLogoUrl ?? null}
        domain={group.companyDomain ?? null}
        brandfetchIconUrl={group.companyBrandfetchIconUrl ?? null}
        sizeClass="h-7 w-7"
      />
      {/*
        The dates get their own line.

        On one line with the company name and a chevron, inside a 255px card, a span like
        "Jan 2018 - Dec 2022" was cropped to "Jan 2018 - Dec ..." - and the end date is half the
        reason the line is there. Somebody deciding whether this is the Bob Burger they worked for
        in 2021 cannot do it from a truncated range.
      */}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-xs font-semibold text-slate-900 leading-snug">
          {group.company || "Company not recorded"}
        </span>
        {period && (
          <span className="text-[10.5px] tabular-nums text-slate-500 leading-snug">{period}</span>
        )}
      </span>
      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
    </button>
  );
}

/** A small uppercase heading, in the trajectory card's own label style. */
export function BlockLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-[9.5px] font-semibold uppercase tracking-widest text-slate-400 leading-none mt-3 mb-1.5">
      {children}
    </p>
  );
}

/**
 * How long they were at an employer: earliest start to latest end, across every role held there.
 *
 * Someone promoted twice at one company has three rows and one continuous span, and three separate
 * ranges on a summary line would read as three spells. Any role still running makes the whole span
 * run to Present.
 *
 * Roles whose period was never confirmed contribute nothing. An unconfirmed start printed as fact
 * is how a contributor rules out the right person for working there at the wrong time, and a
 * summary line is exactly where that mistake would be made fastest.
 */
export function companyPeriod(group: CompanyGroup): string | null {
  let earliest: string | null = null;
  let latest: string | null = null;
  let ongoing = false;

  for (const r of group.roles) {
    if (!r.periodKnown || !r.startDate) continue;
    if (!earliest || r.startDate < earliest) earliest = r.startDate;
    if (!r.endDate) ongoing = true;
    else if (!latest || r.endDate > latest) latest = r.endDate;
  }

  if (!earliest) return null;
  const from = monthYear(earliest);
  if (!from) return null;
  if (ongoing) return `${from} – Present`;
  const to = latest ? monthYear(latest) : null;
  return to ? `${from} – ${to}` : from;
}

/**
 * The job they typed, offered on a person whose employer we do not hold: one compact dotted row.
 *
 * ## Why it appears on every candidate, and first
 *
 * Ten people share this name. The contributor worked for one of them at MSN, and the fact that we
 * have no MSN on nine of those profiles does not mean those nine are the wrong person - it means
 * we do not hold that employment yet, which is precisely what this row proposes to fix. Offering
 * it on each candidate is what lets somebody say "this Bob Burger is mine, and he worked at MSN".
 *
 * It comes first because it is the only row on those cards that matches what they told us. The
 * history below is evidence about who the person is; this is the thing being chosen.
 *
 * ## Why it is one row rather than a company box
 *
 * It WAS a full employer box with a logo header and a position inside, which added about 120px to
 * every card. On a ten-candidate page that was a second screen of scrolling spent on the same
 * dashed box repeated ten times. The company, the job and the mark fit on one line and a half.
 */
export function ProposedEmploymentRow({
  company,
  companyDomain,
  companyLogoUrl,
  companyBrandfetchIconUrl,
  title,
  selected = false,
}: {
  company: string | null;
  companyDomain?: string | null;
  companyLogoUrl?: string | null;
  companyBrandfetchIconUrl?: string | null;
  title: string | null;
  selected?: boolean;
}) {
  return (
    <div
      data-testid="proposed-employment-row"
      className={`mt-2.5 px-3 py-2.5 transition-colors ${selected ? "" : "hover:bg-slate-100"}`}
      style={{
        borderRadius: 6,
        border: `1px dashed ${selected ? "#2e0562" : "#cbd5e1"}`,
        background: selected ? "#ede9fe" : "transparent",
      }}
    >
      <div className="flex items-start gap-2.5">
        <SelectMark selected={selected} dashed />
        <CompanyLogoImg
          company={company ?? ""}
          logoUrl={companyLogoUrl ?? null}
          domain={companyDomain ?? null}
          brandfetchIconUrl={companyBrandfetchIconUrl ?? null}
          sizeClass="h-7 w-7"
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="min-w-0 truncate text-xs font-semibold text-slate-800 leading-snug">
              {company || "Company not recorded"}
            </span>
            <span className="shrink-0 rounded-full border border-green-500/40 bg-green-500/10 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-green-700">
              + New
            </span>
          </span>
          <span className="mt-0.5 block truncate text-[10.5px] text-slate-500">
            {title || "The job you described"} · Rate this position
          </span>
        </span>
      </div>
    </div>
  );
}

/**
 * One candidate, as a thing to choose between rather than a thing to read.
 *
 * ## It leads with the employer, not the name
 *
 * Ten people called Bob Burger produce ten cards whose most prominent line is identical. The name
 * was 13px semibold at the top of every one, while the employer - the only thing that tells them
 * apart - was smaller, greyer and below a label. That is the information hierarchy inverted: the
 * loudest element carried no information and the quietest carried all of it.
 *
 * So the card leads with where they worked and when, and the name moves to a footer line.
 *
 * ## Except when the name IS what differs
 *
 * On a PLAUSIBLE match the names are near misses rather than exact ones - "Bob Burgher" against
 * "Bob Burger" - and then the name is precisely what somebody must read carefully. The rule is
 * lead with whatever differs, not demote the name on principle.
 */
export function CandidateSummaryCard({
  name,
  lead,
  leadTitle,
  otherCompanies,
  positionCount,
  nameFirst = false,
  best = false,
  selected = false,
  onChoose,
}: {
  name: string;
  /** The employer this person is identified by: the one they named, else the most recent. */
  lead: CompanyGroup | undefined;
  leadTitle: string | null;
  /** The rest, named rather than counted: a logo says less than "Google, Stripe". */
  otherCompanies: string[];
  positionCount: number;
  nameFirst?: boolean;
  best?: boolean;
  selected?: boolean;
  onChoose: () => void;
}) {
  const period = lead ? companyPeriod(lead) : null;
  const shownOthers = otherCompanies.slice(0, 2);
  const restCount = otherCompanies.length - shownOthers.length;

  return (
    <button
      type="button"
      onClick={onChoose}
      data-testid="candidate-summary-card"
      aria-label={[
        name,
        lead?.company,
        leadTitle,
        period,
        `${positionCount} ${positionCount === 1 ? "position" : "positions"}`,
      ].filter(Boolean).join(", ")}
      /*
        THE SAME HOVER EVERY OTHER TILE IN THE PRODUCT HAS.

        Lifted from `ManagerTile`, which is what the directory and the company pages use: the
        shadow deepens and the border takes the brand purple. A card that is clickable everywhere
        else in the product and inert-looking here teaches somebody that these are not clickable.

        The resting border and shadow moved from inline styles into classes to make that possible -
        an inline style beats a hover class, so the hover was being written and never applied. The
        exact resting values are kept as arbitrary values rather than rounded to the nearest
        Tailwind step.
      */
      className={`flex h-full w-full flex-col overflow-hidden border border-l-[3px] border-slate-200 bg-white text-left shadow-[0_1px_3px_rgba(0,0,0,0.05)] transition-all ${
        selected
          ? "ring-2 ring-primary"
          : "hover:border-[#2e0562]/30 hover:shadow-md hover:shadow-[#2e0562]/5"
      }`}
      style={{ borderRadius: 8 }}
    >
      <div className="flex flex-1 flex-col px-4 pt-3 pb-2">
        {nameFirst && (
          <p className="mb-2 text-[13px] font-semibold text-slate-900 leading-tight truncate">
            {name}
          </p>
        )}

        <div className="flex items-start gap-2">
          {lead && (
            <CompanyLogoImg
              company={lead.company ?? ""}
              logoUrl={lead.companyLogoUrl ?? null}
              domain={lead.companyDomain ?? null}
              brandfetchIconUrl={lead.companyBrandfetchIconUrl ?? null}
              sizeClass="h-9 w-9"
            />
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold text-slate-900 leading-tight">
              {lead?.company || "No employer recorded"}
            </span>
            {leadTitle && (
              <span className="mt-0.5 block truncate text-[11px] text-slate-600">{leadTitle}</span>
            )}
            {period && (
              <span className="mt-0.5 block text-[10.5px] tabular-nums text-slate-500">{period}</span>
            )}
          </span>
          {best && (
            /* The server already ranked these. Saying so turns silent work into visible help. */
            <span className="shrink-0 rounded-full border border-primary/30 bg-primary/5 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-primary">
              Closest
            </span>
          )}
        </div>

        {shownOthers.length > 0 && (
          <p className="mt-2 truncate text-[10.5px] text-slate-500">
            Also {shownOthers.join(", ")}
            {restCount > 0 && ` and ${restCount} more`}
          </p>
        )}
      </div>

      <div className="border-t border-slate-200 px-4 py-2">
        <p className="truncate text-[10.5px] text-slate-500">
          {nameFirst ? `${positionCount} ${positionCount === 1 ? "position" : "positions"}`
                     : `${name} · ${positionCount} ${positionCount === 1 ? "position" : "positions"}`}
        </p>
      </div>
    </button>
  );
}

/** The most recent job held at an employer, which is what identifies it to a contributor. */
export function mostRecentRole(group: CompanyGroup | undefined): Employment | undefined {
  if (!group) return undefined;
  let best: Employment | undefined;
  for (const r of group.roles) {
    if (!r.startDate) continue;
    if (!best || !best.startDate || r.startDate > best.startDate) best = r;
  }
  return best ?? group.roles[0];
}

export interface CompanyGroup {
  /** `c:<id>` for a company with a record, `n:<name>` otherwise. Stable within one result. */
  key: string;
  company: string | null;
  companyDomain?: string | null;
  companyLogoUrl?: string | null;
  companyBrandfetchIconUrl?: string | null;
  roles: Employment[];
}

/**
 * Employments grouped by employer, in the order the server sent them.
 *
 * ## Why the id is preferred over the name
 *
 * Two rows can name the same employer differently - "MSN" and "msn.com", a record created before
 * the company existed and one created after - and grouping on the name alone would draw that
 * person two boxes for one job. Where a `companyId` exists it is the identity; a name is only the
 * fallback, lowercased and trimmed, for rows that never got one.
 *
 * ## The order is the server's
 *
 * `findSelectableEmployments` orders by role id then start date, and first appearance decides a
 * company's position here. Re-sorting by date would look tidier and would disagree with the
 * ordering every other surface uses.
 *
 * The identity fields are taken from the first row that carries them, because a company's logo
 * belongs to the company and not to one job at it.
 */
export function groupEmploymentsByCompany(employments: Employment[]): CompanyGroup[] {
  const out: CompanyGroup[] = [];
  const byKey = new Map<string, CompanyGroup>();

  for (const e of employments) {
    const key = e.companyId != null
      ? `c:${e.companyId}`
      : `n:${(e.company ?? "").trim().toLowerCase()}`;

    let group = byKey.get(key);
    if (!group) {
      group = {
        key,
        company: e.company,
        companyDomain: e.companyDomain,
        companyLogoUrl: e.companyLogoUrl,
        companyBrandfetchIconUrl: e.companyBrandfetchIconUrl,
        roles: [],
      };
      byKey.set(key, group);
      out.push(group);
    }
    // A later row can carry identity the first one lacked; the company's logo is the company's.
    group.company ??= e.company;
    group.companyDomain ??= e.companyDomain;
    group.companyLogoUrl ??= e.companyLogoUrl;
    group.companyBrandfetchIconUrl ??= e.companyBrandfetchIconUrl;
    group.roles.push(e);
  }

  return out;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * "Jan 2018 – Dec 2022", "Mar 2023 – Present", or null when the period is not known.
 *
 * Null rather than a placeholder: a tile that says "Dates unknown" under every job on a
 * search-created manager is a column of noise, and the absence is already legible from the chip
 * having nothing there.
 *
 * `periodKnown` is read rather than inferred from the dates being present. A record can carry a
 * start date that was never confirmed, and presenting an unconfirmed period as fact is how a
 * contributor rules out the right person for working there at the wrong time.
 */
export function employmentPeriod(e: Employment): string | null {
  if (!e.periodKnown || !e.startDate) return null;
  const from = monthYear(e.startDate);
  if (!from) return null;
  const to = e.endDate ? monthYear(e.endDate) : "Present";
  return to ? `${from} – ${to}` : from;
}

function monthYear(iso: string): string | null {
  const m = /^(\d{4})-(\d{2})/.exec(iso);
  if (!m) return null;
  const month = MONTHS[Number(m[2]) - 1];
  return month ? `${month} ${m[1]}` : m[1];
}
