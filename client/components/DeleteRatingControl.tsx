import { useState } from "react";
import type { ModerationReason } from "@/lib/moderationReasons";

/**
 * Removing somebody else's rating, as a moderator, with the reason that decides the consequence.
 *
 * Written once and used from both places a moderator can be when they decide: the manager's
 * profile, where they are reading the rating in context, and the admin Ratings queue, where they
 * are scanning for the drive-by unlocks. Two copies of a control whose options change what the
 * backend DOES to an account is exactly the kind of drift that ends with one of them penalising
 * the wrong people.
 *
 * The reason is never defaulted. Only "junk" debits the author's confidence; a duplicate or a
 * data correction is not their fault, and an unexplained penalty is one nobody can defend six
 * months later.
 */
export const DELETE_RATING_REASONS: { key: ModerationReason; label: string; blurb: string }[] = [
  { key: "junk",       label: "Junk / fake contribution", blurb: "Removes it and lowers the author's confidence" },
  { key: "duplicate",  label: "Duplicate",                blurb: "No penalty for the author" },
  { key: "correction", label: "Data correction",          blurb: "No penalty for the author" },
  { key: "other",      label: "Other",                    blurb: "No penalty for the author" },
];

export function DeleteRatingControl({
  onDelete,
  busy = false,
  label = "Delete rating",
  className = "",
}: {
  /** Performs the delete. Resolves when it is done; the control closes itself either way. */
  onDelete: (reason: string) => Promise<void>;
  busy?: boolean;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className={`text-xs font-semibold text-red-600 hover:text-red-700 ${className}`}
      >
        {label}
      </button>
    );
  }

  return (
    <div className={`rounded-lg border border-red-200 bg-red-50/60 p-3 ${className}`}>
      <p className="text-xs font-semibold text-foreground">Why are you deleting this rating?</p>
      <div className="mt-2 space-y-1">
        {DELETE_RATING_REASONS.map(r => (
          <button
            key={r.key}
            disabled={busy}
            onClick={async () => { await onDelete(r.key); setOpen(false); }}
            className="block w-full rounded-md border border-border bg-background px-3 py-2 text-left text-xs hover:bg-muted/60 disabled:opacity-50"
          >
            <span className="font-semibold text-foreground">{r.label}</span>
            <span className="block text-[11px] text-muted-foreground">{r.blurb}</span>
          </button>
        ))}
      </div>
      <button
        disabled={busy}
        onClick={() => setOpen(false)}
        className="mt-2 text-[11px] font-medium text-muted-foreground underline disabled:opacity-50"
      >
        Cancel
      </button>
    </div>
  );
}
