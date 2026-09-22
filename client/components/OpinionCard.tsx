import React from "react";
import { getAvatarColor, getInitials } from "@/components/ManagerCard";
import { LockedPanelCard, type LockedCta } from "@/components/LockedNotice";

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
  /** A rating held for moderation is ringed; nothing else is. */
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
        tone === "held" ? "border-amber-300 ring-1 ring-amber-200" : "border-border"
      } ${className}`}
    >
      {blurred ? (
        <div aria-hidden="true" className="select-none blur-sm pointer-events-none">{children}</div>
      ) : children}
    </div>
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
}: {
  /** The handle, or the stand-in for an opinion written before handles existed. */
  name: string;
  /** "3 days ago", "edited 8 days ago". */
  when: string;
  verified?: boolean;
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
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-medium text-foreground">{name}</span>
          {verified && (
            <span
              className="inline-flex flex-shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-border bg-muted/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
              title="Submitted by a registered account holder. Identity is not independently verified."
            >
              ✓ Registered
            </span>
          )}
        </div>
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
