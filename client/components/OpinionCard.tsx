import React from "react";
import { getAvatarColor, getInitials } from "@/components/ManagerCard";
import { LockedPanelCard, type LockedCta } from "@/components/LockedNotice";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";

/**
 * The card an opinion is written on — a manager review, a workplace rating, an interview account.
 *
 * <p><b>One box, three lists.</b> All three wrote out `rounded-xl border border-border bg-card
 * p-5 shadow-sm` by hand, and the locked teaser on the manager profile wrote a fourth copy with
 * the blur baked in. They agreed by luck and by somebody checking them side by side, which is not
 * a mechanism. The same reasoning as ManagerTile: the box is decided here and nowhere else.
 */
export function OpinionCard({
  blurred = false,
  tone = "default",
  className = "",
  children,
}: {
  /** Behind the gate: unreadable, unselectable, inert — but exactly the same card. */
  blurred?: boolean;
  /**
   * A rating held for moderation is ringed; nothing else is.
   *
   * <b>There is no "example" tone, deliberately.</b> One existed, and it gave a platform example
   * an indigo border, ring and tint, so a demonstration was the most visually prominent thing on
   * the profile. An example is an ordinary rating carrying a label: it gets the same card as
   * everything else, and {@link ExampleRatingBadge} is the only thing that marks it.
   */
  tone?: "default" | "held";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    /*
      The blur goes on the CONTENTS, never on the card.

      Blurring the whole element blurs its border and its shadow with it, so a column of them
      smears into one soft grey block and stops reading as separate cards at all - which is the
      opposite of the point: the stack exists to show that there are several opinions here. The
      locked manager tiles already worked this way, with a crisp border round blurred content.
    */
    <div
      data-testid="opinion-card"
      className={`rounded-xl border bg-card p-5 shadow-sm ${
        tone === "held" ? "border-amber-300 ring-1 ring-amber-200"
        : "border-border"
      } ${className}`}
    >
      {blurred ? (
        <div aria-hidden="true" className="select-none blur-sm pointer-events-none">{children}</div>
      ) : children}
    </div>
  );
}

/**
 * The pill that marks a platform-generated example, and the only thing that marks one.
 *
 * <p><b>What this replaces.</b> A full-width indigo panel sat above the scores carrying two
 * paragraphs, on a card that was itself tinted indigo and ringed. The effect was that the one
 * rating on the page nobody wrote was the one the eye went to first, and a profile holding a
 * single genuine rating read as though the example were the main event.
 *
 * <p>So: the card is an ordinary card, and the label is an ordinary pill, built to match the
 * "Registered" badge beside it rather than to stand out from it. The explanation is still there in
 * full, one hover or one keyboard focus away, because it is a real disclosure and deleting it to
 * tidy the layout would be the wrong trade.
 *
 * <p><b>A button, not a bare span.</b> A tooltip that opens only on mouse hover is invisible to
 * anybody on a keyboard and to most people on a phone. A focusable trigger opens on focus and on
 * tap as well, which is the difference between a disclosure and a decoration.
 *
 * <p>Lives here rather than in the profile page because every opinion list can hold an example:
 * manager ratings, workplace ratings and interview accounts all render {@link OpinionCard}, and a
 * second copy written for the second list is how the three drifted apart the last time.
 */
export const EXAMPLE_RATING_EXPLANATION =
  "This is a platform-generated example showing how manager ratings appear. It was not submitted " +
  "by an employee and does not contribute to this manager's rating or statistics.";

export const EXAMPLE_AVERAGE_EXPLANATION =
  "This score comes from a platform-generated example, not from employee ratings. It is a " +
  "placeholder showing how a score appears, and it is replaced by the real average as soon as " +
  "somebody rates this manager.";

export const EXAMPLE_TRAJECTORY_EXPLANATION =
  "This trajectory is drawn from a platform-generated example, not from employee ratings. It " +
  "shows how the chart appears, and it is replaced as soon as somebody rates this manager.";

/**
 * The pill shape, and the disclosure attached to it, written once.
 *
 * <p>Two badges sit side by side on a rating card: "Example rating" and "Registered". They already
 * shared a class list, by somebody having matched them by hand, and they did NOT share how their
 * explanation appears - one opened a styled tooltip, the other relied on the browser's native
 * `title`, which renders as a small unstyled OS tooltip after a delay the page cannot control. Two
 * pills, one inch apart, behaving differently when you hover them.
 *
 * <p>So the shape and the disclosure are both decided here. A caller supplies the glyph, the words
 * and the explanation; it cannot supply the colour or the tooltip, which is the point.
 */
function InfoPill({
  glyph,
  label,
  explanation,
  className = "",
  testId,
}: {
  glyph: React.ReactNode;
  label: string;
  explanation: string;
  className?: string;
  testId?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          data-testid={testId}
          /*
            Cursor help rather than pointer: pressing it does nothing but open the explanation,
            and a pointer promises navigation that is not there.
          */
          className={`inline-flex flex-shrink-0 cursor-help items-center gap-1 whitespace-nowrap rounded-full border border-border bg-muted/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground ${className}`}
        >
          {glyph}
          {label}
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs leading-relaxed">
        {explanation}
      </TooltipContent>
    </Tooltip>
  );
}

export const REGISTERED_EXPLANATION =
  "Submitted by a registered account holder. Identity is not independently verified.";

/**
 * "Registered", on a rating written by somebody with an account.
 *
 * <p>Never shown on a platform example. An example has no account behind it, so claiming one would
 * be a straightforward false statement about provenance, and it is the single most credibility-
 * lending mark on the card. `createSeedReview` writes `verified = true` on the row, which is why
 * this has to be suppressed at the point of render rather than trusted from the data.
 */
export function RegisteredBadge({ className = "" }: { className?: string }) {
  return (
    <InfoPill
      testId="registered-badge"
      glyph={<span aria-hidden="true">✓</span>}
      label="Registered"
      explanation={REGISTERED_EXPLANATION}
      className={className}
    />
  );
}

export function ExampleRatingBadge({
  className = "",
  label = "Example rating",
  explanation = EXAMPLE_RATING_EXPLANATION,
}: {
  className?: string;
  /**
   * The pill's own words. "Example rating" on a rating card; "Example score" beside an average;
   * "Example score" beside an average. The trajectory card reuses "Example rating"
   * verbatim, deliberately: one name for one thing.
   *
   * A PROP RATHER THAN A SECOND COMPONENT, deliberately, and the reason is section 46 of the
   * operating rules: three places on one profile say "this is a demonstration", and three pills
   * written separately is how two of them end up looking different from the third after the next
   * change to any one of them. One pill, three strings.
   */
  label?: string;
  /** What the hover and focus disclosure says. Defaults to the rating-card wording. */
  explanation?: string;
}) {
  return (
    <InfoPill
      testId="example-rating-badge"
      glyph={<Info size={11} aria-hidden="true" />}
      label={label}
      explanation={explanation}
      className={className}
    />
  );
}

/**
 * Who wrote an opinion, and when.
 *
 * <p>Avatar circle, handle, an optional registered badge, and the age of the opinion — the same
 * three lines on a manager review, a workplace rating and an interview experience. All three had
 * written it out separately, and the interview one had quietly lost the avatar altogether, so a
 * reader flipping between two tabs of one company saw two different designs.
 *
 * <p>The avatar is seeded from the handle so its colour and initials belong to the name shown.
 */
export function OpinionAuthor({
  name,
  when,
  verified = false,
  blurred = false,
  isExample = false,
}: {
  /** The handle, or the stand-in for an opinion written before handles existed. */
  name: string;
  /** "3 days ago", "edited 8 days ago". */
  when: string;
  verified?: boolean;
  /**
   * A platform example, which takes the pill slot below the handle INSTEAD of "Registered".
   *
   * <p>One slot, never two, and that falls out of the rules rather than being enforced here: an
   * example has no account behind it, so it is never `verified`, so the two can never contend.
   * Putting the example pill here is what makes the two kinds of card agree: whatever a card has
   * to say about its author's standing is said in the same place, one line under the handle.
   */
  isExample?: boolean;
  /** Withheld with the scores: blurs the whole block, avatar included. */
  blurred?: boolean;
}) {
  return (
    <div className={`flex min-w-0 items-center gap-2.5 ${blurred ? "blur-sm select-none" : ""}`}>
      <div
        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
        style={{ backgroundColor: getAvatarColor(name) }}
      >
        {getInitials(name)}
      </div>
      <div className="min-w-0">
        <span className="block truncate text-sm font-medium text-foreground">{name}</span>
        {/*
          ITS OWN LINE, between the handle and the age.

          It sat on the same row as the handle, which cost twice: on a narrow card it wrapped the
          pill under a long handle anyway, so the alignment was inconsistent rather than tight, and
          beside the name it read as part of the name. Under it, it reads as a statement about the
          handle above, which is what it is.
        */}
        {isExample
          ? <ExampleRatingBadge className="mt-0.5" />
          : verified && <RegisteredBadge className="mt-0.5" />}
        <p className="text-[11px] text-muted-foreground">{when}</p>
      </div>
    </div>
  );
}

/**
 * What a locked opinion list shows instead of nothing.
 *
 * <p><b>A stack of cards, not a single line saying how many are hidden.</b> "1 opinion hidden" is
 * an accurate sentence and a terrible advertisement: it tells somebody that what sits behind the
 * gate is one review, which is no reason at all to write one. A stack with the ratings blurred
 * out reads as a body of opinion worth unlocking - the same device the company page already uses
 * for its teaser manager tiles.
 *
 * <p><b>The caller passes its own real card component, with placeholder rows.</b> Not a lookalike
 * built here from what a card roughly looks like - that is how the company page ended up with a
 * teaser tile half a head taller than the managers beside it. Each list has exactly one card
 * implementation and the locked stack renders that same one, so the two cannot drift.
 *
 * <p>This owns only what is genuinely common: the spacing, and the notice underneath that says
 * what is locked and offers the way out.
 */
export function LockedOpinions({
  children,
  notice,
}: {
  /** The caller's own cards, rendered blurred from placeholder rows. */
  children: React.ReactNode;
  notice: { title: string; hint?: React.ReactNode; cta: LockedCta };
}) {
  return (
    <div data-testid="locked-opinions" className="space-y-4">
      {children}
      <LockedPanelCard title={notice.title} hint={notice.hint} cta={notice.cta} />
    </div>
  );
}
