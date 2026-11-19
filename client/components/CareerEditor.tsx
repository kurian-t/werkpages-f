import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { X, Plus, Loader2 } from "lucide-react";
import API_BASE from "@/lib/api";
import { CollapsibleField, FormTextInput } from "@/components/FormFields";
import { PositionEditor } from "@/components/PositionEditor";
import {
  Employment, PositionDraft, draftOf, emptyDraft, orderEmployments,
  buildSubmission, hasAnythingToSubmit, positionProblem, isRemovable, originalsOf,
  originalKeyOf,
} from "@/lib/careerEditor";

/**
 * The career history editor.
 *
 * <h2>What it replaced, and why</h2>
 *
 * <p>The old form asked about "the manager's current position" and could express exactly one. To
 * end a role and record its successor somebody had to submit, leave the page and come back; to fix
 * a historical title there was no way to say which employment they meant. This holds the whole
 * career at once: correct any number of existing positions, mark one ended, add a current one and
 * fill in missing history, all in one session and one submission.
 *
 * <h2>Correcting is not the same as adding</h2>
 *
 * <p>Editing a card corrects that employment, identified by its id. Adding a position records a
 * distinct one and never ends another, so two current roles stay two current roles. Changing a
 * card's company replaces that employment rather than editing it, because ratings are attributed
 * through the employer, and the card says so before anybody commits.
 *
 * <h2>Nothing is destructive</h2>
 *
 * <p>An unsaved position can be removed. An employment that already exists cannot be deleted here
 * at all: it has ratings and claims attached and removing it is a moderation decision. Saying the
 * role ended is what this offers instead.
 */
export function CareerEditor({
  managerId,
  managerName,
  open,
  onClose,
  onSubmitted,
  signedIn,
  onAuthRequired,
}: {
  managerId: number | string;
  managerName: string;
  open: boolean;
  onClose: () => void;
  onSubmitted: (summary: { positions: number; nameChanged: boolean }) => void;
  signedIn: boolean;
  /**
   * Called instead of submitting when nobody is signed in.
   *
   * <p>The page owns the authentication step, so this reuses whatever it already does rather than
   * inventing a second route to sign-in. The fields are never hidden behind it: the whole form is
   * filled in first and an account is asked for only here, at submit.
   */
  onAuthRequired: (resume: () => void) => void;
}) {
  const [loading, setLoading]   = useState(true);
  const [loadError, setError]   = useState<string | null>(null);
  const [employments, setEmployments] = useState<Employment[]>([]);
  const [drafts, setDrafts]     = useState<PositionDraft[]>([]);
  const [name, setName]         = useState(managerName);
  const [nameOpen, setNameOpen] = useState(false);
  const [openKey, setOpenKey]   = useState<string | null>(null);
  const [explanation, setExplanation] = useState("");
  const [submitting, setSubmitting]   = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  /*
    THE DRAFT SURVIVES SIGNING IN.

    Submitting while logged out sends somebody to authenticate, and a social sign-in is a full-page
    redirect that destroys this component. Without this, everything they filled in is gone and they
    come back to an empty form - which is the exact loss the capture rules exist to prevent: a form
    that sends somebody away without keeping their answer has thrown the answer away.

    sessionStorage, wrapped, because it throws in a private window and must never take the form
    down with it.
  */
  const draftKey = `career-editor-draft:${managerId}`;

  const saveDraft = (next: {
    name: string; explanation: string; drafts: PositionDraft[];
  }) => {
    try { sessionStorage.setItem(draftKey, JSON.stringify(next)); } catch { /* not available */ }
  };

  const clearDraft = () => {
    try { sessionStorage.removeItem(draftKey); } catch { /* not available */ }
  };

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    /*
      REOPENING STARTS FROM THE COLLAPSED LIST.

      This component stays mounted while closed - it is rendered with an `open` prop rather than
      being conditionally mounted - so its state survives a close. Without resetting here,
      reopening showed whichever card had been expanded before.
    */
    setOpenKey(null);
    setSubmitError(null);
    axios.get(`${API_BASE}/api/managers/${managerId}/employments`)
      .then(res => {
        if (cancelled) return;
        const list: Employment[] = orderEmployments(res.data?.data ?? []);
        setEmployments(list);

        // A draft kept across authentication wins over what the server says, because it is what
        // the person actually typed. Restored only for THIS manager, and only if it parses.
        let restored = false;
        try {
          const saved = sessionStorage.getItem(`career-editor-draft:${managerId}`);
          if (saved) {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed?.drafts)) {
              setDrafts(parsed.drafts);
              if (typeof parsed.name === "string") setName(parsed.name);
              if (typeof parsed.explanation === "string") setExplanation(parsed.explanation);
              restored = true;
            }
          }
        } catch { /* a corrupt draft is no draft */ }

        if (!restored) setDrafts(list.map(draftOf));
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError("We could not load this manager's positions. Please try again.");
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [open, managerId]);

  useEffect(() => { setName(managerName); }, [managerName]);

  // Keyed through the shared helper, which covers the manager-record position's absent id.
  const originals = useMemo(() => originalsOf(employments), [employments]);

  const anything = hasAnythingToSubmit(name, managerName, drafts, originals);
  const blocked  = drafts
    .filter(d => !d.removed)
    // Each draft is judged against its own original, because positionProblem only demands a
    // location of a position this submission is actually proposing.
    .map(d => {
      const k = originalKeyOf(d);
      return positionProblem(d, k === null ? undefined : originals.get(k));
    })
    .find(Boolean) ?? null;

  if (!open) return null;

  const visible = drafts.filter(d => !d.removed);
  const current = visible.filter(d => d.status === "ongoing");
  const previous = visible.filter(d => d.status !== "ongoing");

  const patch = (key: string, next: PositionDraft) =>
    setDrafts(list => list.map(d => (d.key === key ? next : d)));

  const addPosition = () => {
    const fresh = emptyDraft();
    setDrafts(list => [...list, fresh]);
    setOpenKey(fresh.key);
  };

  const submit = async () => {
    if (!signedIn) {
      // Written synchronously, BEFORE handing over to authentication: an effect would run after
      // the render that follows, which never happens if the handler navigates away in this tick.
      saveDraft({ name, explanation, drafts });
      onAuthRequired(() => void submit());
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const body = buildSubmission(name, managerName, explanation, drafts, originals);
      const res = await axios.post(`${API_BASE}/api/managers/${managerId}/career-edit`, body);
      clearDraft();
      onSubmitted({
        positions: res.data?.positions ?? 0,
        nameChanged: Boolean(res.data?.newName),
      });
      onClose();
    } catch (err: unknown) {
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      if (status === 401) {
        /*
          THE SESSION EXPIRED WHILE THEY WERE FILLING THIS IN.

          Kept before handing over to authentication, for the same reason the logged-out branch
          above does it: a social sign-in is a full-page redirect that destroys this component, so
          a draft written any later is a draft never written. Without this the 401 path threw away
          a complete answer and brought them back to an empty form.
        */
        saveDraft({ name, explanation, drafts });
        onAuthRequired(() => void submit());
        return;
      }
      setSubmitError(
        (axios.isAxiosError(err) && (err.response?.data as { error?: string })?.error)
        || "We could not send your changes. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const renderCards = (list: PositionDraft[], heading: string) =>
    list.length > 0 && (
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {heading}
        </p>
        {list.map(d => {
          const index = drafts.findIndex(x => x.key === d.key);
          return (
            <PositionEditor
              key={d.key}
              draft={d}
              original={(() => { const k = originalKeyOf(d); return k === null ? undefined : originals.get(k); })()}
              open={openKey === d.key}
              onOpen={() => setOpenKey(d.key)}
              onClose={() => setOpenKey(null)}
              onChange={next => patch(d.key, next)}
              /* Only an unsaved addition may be removed; see the class comment. */
              onRemove={isRemovable(d)
                ? () => {
                    setDrafts(all => all.filter(x => x.key !== d.key));
                    if (openKey === d.key) setOpenKey(null);
                  }
                : undefined}
              index={index}
            />
          );
        })}
      </div>
    );

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background" data-testid="career-editor">
      <div className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-6">
        <button
          type="button"
          onClick={() => { clearDraft(); onClose(); }}
          className="flex min-w-[60px] items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Cancel
        </button>
        <div className="text-center">
          <p className="text-sm font-semibold text-foreground">Edit career history</p>
          <p className="text-xs text-muted-foreground">{managerName}</p>
        </div>
        <button
          type="button"
          onClick={() => { clearDraft(); onClose(); }}
          aria-label="Close"
          className="flex min-w-[60px] justify-end p-1 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      <div className="h-1 bg-primary" />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
          {loading && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 size={15} className="animate-spin" aria-hidden="true" /> Loading positions...
            </p>
          )}

          {loadError && <p className="text-sm text-destructive">{loadError}</p>}

          {!loading && !loadError && (
            <div className="space-y-6">
              <div>
                <h2 className="text-[22px] font-semibold text-foreground">
                  {managerName}'s career history
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Correct anything that is wrong and add anything that is missing. Nothing changes
                  until a moderator reviews it.
                </p>
              </div>

              <CollapsibleField
                id="manager-name"
                label="Manager's name"
                display={name}
                editing={nameOpen}
                onEditStart={() => setNameOpen(true)}
                onEditDone={() => setNameOpen(false)}
              >
                <FormTextInput
                  /* Matches the id CollapsibleField's <label htmlFor> names. */
                  id="manager-name"
                  value={name}
                  onChange={setName}
                  placeholder="Full name"
                  maxLength={200}
                />
              </CollapsibleField>

              {renderCards(current, current.length === 1 ? "Current position" : "Current positions")}
              {renderCards(previous, "Previous positions")}

              {visible.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No positions are recorded yet. Add the ones you know about.
                </p>
              )}

              <button
                type="button"
                onClick={addPosition}
                data-testid="add-position"
                className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border px-4 py-3 text-sm font-semibold text-foreground transition-colors hover:border-primary hover:bg-primary/5"
              >
                <Plus size={16} aria-hidden="true" /> Add position
              </button>

              {/*
                ONE EXPLANATION FOR THE WHOLE SUBMISSION, ASKED ON THE FORM ITSELF.

                The audit trail needs a reason against every field it records, but asking per field
                would mean retyping the same sentence to fix five things, so this one is reused for
                each correction the submission produces.

                It used to be asked on a separate Review Changes step. That step was removed: it
                restated what the person had just typed and made them press a second button to
                send it. The question itself is required by the API, the service and a CHECK on
                manager_edits, so it lives here rather than disappearing with the page.
              */}
              <div>
                <label htmlFor="career-explanation" className="mb-2 block text-sm font-semibold text-foreground">
                  How do you know? <span className="text-destructive">*</span>
                </label>
                <textarea
                  id="career-explanation"
                  value={explanation}
                  onChange={e => setExplanation(e.target.value)}
                  rows={3}
                  maxLength={2000}
                  placeholder="e.g. I worked in this team until 2023 and they moved to a different company in March."
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  One explanation covers every change you make above.
                </p>
              </div>

              {submitError && (
                <p data-testid="submit-error" className="text-sm text-destructive">{submitError}</p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-border bg-background px-4 py-4 sm:px-6">
        <div className="mx-auto max-w-2xl">
          {/*
            ONE BUTTON, AND IT SUBMITS.

            This was two: "Review changes" opened a summary page, and a second button there sent
            it. The summary restated what the person had just typed and cost them an extra press
            for nothing, so it is gone and this sends the submission directly.

            Every condition the old pair checked between them is checked here, which is the part
            worth being careful about: `blocked` is a position that cannot be submitted yet, and
            the explanation is required by the API, the service and a CHECK on manager_edits, so
            submitting without it would be refused by the server rather than caught here.
          */}
          {blocked && (
            <p className="mb-2 text-xs font-medium text-destructive">{blocked}</p>
          )}
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!anything || Boolean(blocked) || loading || submitting
                      || !explanation.trim()}
            data-testid="submit-changes"
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
            Submit
          </button>
        </div>
      </div>
    </div>
  );
}
