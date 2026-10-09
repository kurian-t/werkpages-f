import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronUp, Minus, X } from "lucide-react";

/**
 * What to do next, asked at the one moment somebody has proved they will.
 *
 * Every contribution used to end in a toast. A manager rating closed its modal and left the
 * person on the profile; a workplace rating navigated away. Both are dead ends, and they waste
 * the only moment when somebody has demonstrably just done the thing we want more of - they are
 * signed in, they have the company in mind, and they have already answered ten questions about
 * it. Asking then costs one click; asking later costs a visit we have to earn again.
 *
 * This matters more than traffic. Taking the average contributor from one answer to two doubles
 * the corpus without a single extra visitor, and it is the only lever here that does not depend
 * on Google.
 *
 * ONE COMPONENT, BOTH DIRECTIONS. Manager -> company and company -> manager are the same offer
 * with different nouns, so they are the same component with different props. Two near-identical
 * success dialogs is how one of them quietly keeps a stale company name, or loses the carried
 * context, while the other is fixed.
 *
 * THE COMPANY IS ALWAYS CARRIED. Never send somebody back to a search box for a company they
 * just told us about - every step that asks them to retype it is a step most people leave at.
 *
 * <h2>Why a corner card and not a modal</h2>
 *
 * This was a centred modal over a dimmed backdrop, and that made the offer arrive BEFORE the
 * thing it is congratulating could be seen. Somebody who had just rated a manager was asked to
 * choose between two further contributions while their own rating was hidden behind the dialog
 * asking about it. The honest order is: show them what they wrote, then ask.
 *
 * So it sits in the corner, it never dims or blocks the page, and it can be minimised to a pill
 * rather than only accepted or refused. Minimised is a real third answer - "I am reading this
 * page, ask me in a moment" - and a prompt that forces a decision to get out of the way is a
 * prompt people learn to dismiss without reading.
 *
 * Deliberately NOT aria-modal: nothing here traps focus or hides the rest of the page from a
 * screen reader, because the rest of the page is the point.
 */
export function ContributionNextStep({
  open,
  onClose,
  confirmation,
  question,
  blurb,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
  dismissLabel = "Not now",
}: {
  open: boolean;
  /** Dismiss. Always available, and never the only thing styled like an action. */
  onClose: () => void;
  /** What just happened, stated first so the offer never reads as "it failed, try this". */
  confirmation: string;
  question: string;
  blurb?: string;
  primaryLabel: string;
  onPrimary: () => void;
  /** Optional second route. Omit it and the card shows one action. */
  secondaryLabel?: string;
  onSecondary?: () => void;
  dismissLabel?: string;
}) {
  const [minimized, setMinimized] = useState(false);

  /*
    Reopening always reopens expanded. Minimised is an answer about THIS offer, not a preference
    to carry into the next one - somebody who tucked away a manager prompt has not asked never to
    be shown a company prompt later.
  */
  useEffect(() => {
    if (open) setMinimized(false);
  }, [open]);

  if (!open) return null;

  /*
    Portalled to document.body so the z-index below cannot be overruled by an ancestor.

    The z-index is what fixes the toast collision; this makes it hold wherever the card is used.
    `position: fixed` is still contained by any ancestor establishing a stacking context - a
    transform, a filter, an isolation - and inside one, a child's z-index competes only within it,
    however large the number. As a direct child of body there is no such ancestor to be trapped
    by. Same reason the dropdowns in this codebase are portalled.
  */
  const card = (
    /*
      Fixed to the corner, inset by the same 16px gutter the rest of the site uses, and capped at
      the viewport width so it is a card on a phone rather than something running off the screen.
    */
    <div
      /*
        Above the toast layer, deliberately.

        Sonner's toaster is also bottom-right and ships z-index: 999999999, so at z-50 the success
        toast sat ON TOP of this card and its container swallowed the clicks - "subtree intercepts
        pointer events". On a phone, where both are full-width, that made every button here
        unpressable: the offer rendered, looked fine, and could not be answered.

        Covering the toast costs nothing, because this card states the same confirmation itself.
      */
      className="fixed bottom-4 right-4 z-[1000000000] w-[calc(100vw-2rem)] max-w-sm"
      data-testid="contribution-next-step"
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
    >
      {minimized ? (
        <button
          onClick={() => setMinimized(false)}
          data-testid="next-step-expand"
          className="flex w-full items-center justify-between gap-3 rounded-full border border-border bg-background px-4 py-2.5 text-left text-sm font-semibold text-foreground shadow-lg transition-colors hover:bg-muted/60"
        >
          <span className="truncate">{question}</span>
          <ChevronUp size={16} aria-hidden="true" className="shrink-0 text-muted-foreground" />
        </button>
      ) : (
        <div
          role="dialog"
          aria-labelledby="next-step-question"
          className="relative rounded-2xl border border-border bg-background p-5 shadow-xl"
        >
          {/*
            Minimise and close are different answers and are both offered. Collapsing to a pill
            keeps the offer available to somebody who wants to read the page first; closing is a
            no, and it is remembered.
          */}
          <div className="absolute right-3 top-3 flex items-center gap-1">
            <button
              onClick={() => setMinimized(true)}
              aria-label="Minimize"
              data-testid="next-step-minimize"
              className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            >
              <Minus size={16} />
            </button>
            <button
              onClick={onClose}
              aria-label="Close"
              data-testid="next-step-close"
              className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            >
              <X size={16} />
            </button>
          </div>

          {/*
            The confirmation leads. Somebody who has just submitted wants to know it worked before
            they are asked for anything else, and an offer on its own reads as a failure.
          */}
          <p className="mb-3 pr-14 text-sm font-medium text-emerald-700 dark:text-emerald-400">
            ✓ {confirmation}
          </p>

          <h2 id="next-step-question" className="pr-14 text-base font-semibold text-foreground">
            {question}
          </h2>
          {blurb && <p className="mt-1.5 text-sm text-muted-foreground">{blurb}</p>}

          <button
            onClick={onPrimary}
            data-testid="next-step-primary"
            className="mt-4 w-full rounded-xl bg-[#2e0562] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#2e0562]/90"
          >
            {primaryLabel}
          </button>

          {secondaryLabel && onSecondary && (
            <button
              onClick={onSecondary}
              data-testid="next-step-secondary"
              className="mt-2 w-full rounded-xl border border-border px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted/60"
            >
              {secondaryLabel}
            </button>
          )}

          {/*
            Plain text, not a button. Declining is always available and never has to compete
            visually with the thing being offered.
          */}
          <button
            onClick={onClose}
            data-testid="next-step-dismiss"
            className="mt-3 w-full text-center text-xs font-medium text-muted-foreground underline-offset-2 hover:underline"
          >
            {dismissLabel}
          </button>
        </div>
      )}
    </div>
  );

  // No document during the server build; render in place rather than crashing the render.
  return typeof document === "undefined" ? card : createPortal(card, document.body);
}
