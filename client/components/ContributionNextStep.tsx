import { X } from "lucide-react";

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
  /** Optional second route. Omit it and the dialog shows one action. */
  secondaryLabel?: string;
  onSecondary?: () => void;
  dismissLabel?: string;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
      data-testid="contribution-next-step"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="next-step-question"
        className="relative w-full max-w-sm rounded-2xl border border-border bg-background p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X size={18} />
        </button>

        {/*
          The confirmation leads. Somebody who has just submitted wants to know it worked before
          they are asked for anything else, and an offer on its own reads as a failure.
        */}
        <p className="mb-4 text-sm font-medium text-emerald-700 dark:text-emerald-400">
          ✓ {confirmation}
        </p>

        <h2 id="next-step-question" className="text-base font-semibold text-foreground">
          {question}
        </h2>
        {blurb && <p className="mt-1.5 text-sm text-muted-foreground">{blurb}</p>}

        <button
          onClick={onPrimary}
          data-testid="next-step-primary"
          className="mt-5 w-full rounded-xl bg-[#2e0562] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#2e0562]/90"
        >
          {primaryLabel}
        </button>

        {secondaryLabel && onSecondary && (
          <button
            onClick={onSecondary}
            data-testid="next-step-secondary"
            className="mt-3 w-full rounded-xl border border-border px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted/60"
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
          className="mt-4 w-full text-center text-xs font-medium text-muted-foreground underline-offset-2 hover:underline"
        >
          {dismissLabel}
        </button>
      </div>
    </div>
  );
}
