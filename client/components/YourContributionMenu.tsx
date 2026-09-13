import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Pencil, Trash2 } from "lucide-react";

/**
 * The control that replaces the call to action once you have contributed here.
 *
 * <p>"Your experience" / "Your rating" rather than "Edit": the page acknowledging that this
 * contribution is yours matters more than naming the action, and edit and delete are the secondary
 * moves. This is the interview panel's menu, lifted out unchanged so the workplace rating gets the
 * same one rather than a second design that drifts from it.
 *
 * <p>Deleting asks first, in a modal that says what is actually about to happen to the numbers -
 * a menu item that silently removed somebody's contribution sits one careless click away from Edit.
 *
 * <p>The caller owns the delete itself: each surface invalidates different caches and says
 * something different afterwards, and burying that here would make one of them wrong.
 */
export function YourContributionMenu({
  label,
  editLabel,
  deleteLabel,
  confirmTitle,
  confirmBody,
  onEdit,
  onDelete,
}: {
  /** e.g. "Your experience", "Your rating". */
  label: string;
  editLabel: string;
  deleteLabel: string;
  confirmTitle: string;
  confirmBody: string;
  onEdit: () => void;
  /** Resolves once the contribution is gone; rejects to leave the dialog open. */
  onDelete: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocumentClick = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocumentClick);
    return () => document.removeEventListener("mousedown", onDocumentClick);
  }, []);

  const remove = async () => {
    setDeleting(true);
    try {
      await onDelete();
      setConfirming(false);
      setOpen(false);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div ref={menuRef} className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-xl border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
      >
        <Check size={15} className="text-green-600" aria-hidden="true" />
        {label}
        <ChevronDown size={15} aria-hidden="true" />
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-1 w-56 overflow-hidden rounded-xl border border-border bg-card shadow-lg">
          <button
            type="button"
            onClick={() => { setOpen(false); onEdit(); }}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-foreground transition-colors hover:bg-muted"
          >
            <Pencil size={14} aria-hidden="true" /> {editLabel}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-destructive transition-colors hover:bg-muted"
          >
            <Trash2 size={14} aria-hidden="true" /> {deleteLabel}
          </button>
        </div>
      )}

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-xl">
            <h3 className="text-base font-semibold text-foreground">{confirmTitle}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{confirmBody}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={remove}
                disabled={deleting}
                className="rounded-xl bg-destructive px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-destructive/90 disabled:opacity-60"
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
