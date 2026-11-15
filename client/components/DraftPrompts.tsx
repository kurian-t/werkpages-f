import { AlertTriangle, CloudOff, Clock, RotateCcw } from "lucide-react";
import type { DraftStatus, ServerDraftConflict } from "@/hooks/useServerDraft";
import { DRAFT_RETENTION_DAYS } from "@/hooks/useServerDraft";

/**
 * The three things a contributor needs told about an unfinished rating, and nothing else.
 *
 * <h2>Why these are prompts rather than automatic behaviour</h2>
 *
 * <p>Each one is a fork where both answers are defensible and only the person can choose. Resuming
 * work from another device discards what is on screen; keeping what is on screen discards the
 * other device's. Picking either silently is how answers vanish, and the version of that bug this
 * product already shipped is the one where a reload destroyed a draft rather than resuming it.
 *
 * <p>One component for all three so the wording and the shape stay together: a form that asked
 * these questions its own way would be the fourth place this conversation is written down.
 */

const CARD = "rounded-lg border p-4 text-sm";

/** A rating the server already holds for this subject, from another device or an earlier visit. */
export function ResumeDraftPrompt({ version, onResume, onDismiss }: {
  version: number;
  onResume: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className={`${CARD} border-primary/30 bg-primary/5`} data-testid="resume-draft-prompt">
      <div className="flex items-start gap-3">
        <RotateCcw className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0">
          <p className="font-semibold text-foreground">You have an unfinished rating saved</p>
          <p className="mt-1 text-muted-foreground">
            Saved from another device or an earlier visit. Bringing it back will replace whatever
            is on this page.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={onResume}
              className="rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground">
              Bring it back
            </button>
            <button type="button" onClick={onDismiss}
              className="rounded-md border border-border px-3 py-1.5 font-medium text-foreground">
              Keep what's here
            </button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Saved version {version}.</p>
        </div>
      </div>
    </div>
  );
}

/** A draft started before signing in, on this browser. Offered, never adopted silently. */
export function AdoptAnonymousDraftPrompt({ onAdopt, onDismiss }: {
  onAdopt: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className={`${CARD} border-primary/30 bg-primary/5`} data-testid="adopt-anon-prompt">
      <div className="flex items-start gap-3">
        <Clock className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0">
          <p className="font-semibold text-foreground">Continue the rating you started?</p>
          <p className="mt-1 text-muted-foreground">
            Answers were filled in on this browser before you signed in.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={onAdopt}
              className="rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground">
              Continue it
            </button>
            <button type="button" onClick={onDismiss}
              className="rounded-md border border-border px-3 py-1.5 font-medium text-foreground">
              Start fresh
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Another device saved newer answers while this page was open.
 *
 * <p>Nothing is merged. An unfinished rating is one coherent answer set, and merging two would
 * invent an opinion neither device gave.
 */
export function DraftConflictPrompt({ conflict, onTakeServer, onKeepLocal }: {
  conflict: ServerDraftConflict;
  onTakeServer: () => void;
  onKeepLocal: () => void;
}) {
  return (
    <div className={`${CARD} border-amber-500/40 bg-amber-500/5`} data-testid="draft-conflict-prompt">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" aria-hidden="true" />
        <div className="min-w-0">
          <p className="font-semibold text-foreground">This rating was changed somewhere else</p>
          <p className="mt-1 text-muted-foreground">
            Another device saved newer answers (version {conflict.version}). Choose which to keep.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={onTakeServer}
              className="rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground">
              Use the newer answers
            </button>
            <button type="button" onClick={onKeepLocal}
              className="rounded-md border border-border px-3 py-1.5 font-medium text-foreground">
              Keep what's on this page
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * What became of the last save, said plainly and only when it is worth saying.
 *
 * <p>Silent on success after the first confirmation, because a banner that never goes away stops
 * being read. Loud about the two cases somebody can act on: the session expired, and the save did
 * not arrive.
 */
export function DraftSaveStatus({ status }: { status: DraftStatus }) {
  if (status === "unauthenticated") {
    return (
      <p className="flex items-center gap-2 text-xs text-amber-600" data-testid="draft-status-auth">
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
        Your sign-in expired. Your answers are safe on this device, and you'll be asked to sign in
        again when you submit.
      </p>
    );
  }
  if (status === "offline") {
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground" data-testid="draft-status-offline">
        <CloudOff className="h-3.5 w-3.5" aria-hidden="true" />
        Couldn't reach the server. Your answers are kept on this device and will be saved again
        shortly.
      </p>
    );
  }
  if (status === "saved") {
    return (
      <p className="text-xs text-muted-foreground" data-testid="draft-status-saved">
        Saved to your account. Unfinished ratings are kept for {DRAFT_RETENTION_DAYS} days.
      </p>
    );
  }
  return null;
}
