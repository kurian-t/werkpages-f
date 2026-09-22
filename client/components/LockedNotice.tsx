import React from "react";

/**
 * How this product says "you cannot see this yet".
 *
 * <p><b>One wording shape, one look, everywhere.</b> A bold line naming what is withheld, a muted
 * line saying what opens it, and the control that does — always all three.
 *
 * <p><b>The control is required, and the type enforces it.</b> Every locked section of the
 * manager profile offers a way to rate or add, and not one of them states a lock as bare text.
 * The company page grew three that did — "Company insights are locked" floating mid-header with
 * nothing to click. Making `cta` non-optional is the point: a locked panel with no way out is now
 * unrepresentable rather than merely discouraged, which is the difference between a convention
 * and a rule. The compiler found all three the moment it became one.
 *
 * <p>No padlock glyph: the blurred content behind it already reads as withheld, and the icon was
 * the main thing making these panels look like they came from different products.
 *
 * <p>This is the manager profile's treatment, extracted rather than reinvented. Before it, the
 * company page had four locked panels in three styles: two header overlays with a padlock and no
 * call to action, an interview list with a padlock and a different type scale, and two plain
 * cards with a button — beside a manager profile that used none of those. Every one of them was
 * written by somebody matching the one next to it by eye.
 *
 * <p>Three shapes, because the surfaces genuinely differ:
 *
 * <ul>
 *   <li>{@link LockedOverlay} — over content that exists and is blurred out.</li>
 *   <li>{@link LockedPanelCard} — a bordered card, where there is nothing to blur.</li>
 *   <li>{@link LockedNotice} — the words alone, for a caller that owns its own container.</li>
 * </ul>
 */

export interface LockedCta {
  label: string;
  onClick: () => void;
}

export function LockedNotice({
  title,
  hint,
  cta,
  size = "sm",
}: {
  /** What is withheld: "Overview is locked". Never "Rate a manager" — that is the cta. */
  title: string;
  /** What opens it. One line. */
  hint?: React.ReactNode;
  /**
   * The way out. **Required** — see the note above.
   *
   * <p>Where the surface already carries this control elsewhere, that one is suppressed while
   * locked rather than this one omitted: the notice is where a reader looks once they are told
   * they cannot see something, so that is where the control belongs.
   */
  cta: LockedCta;
  /** "sm" inside an overlay, "md" in a card that stands on its own. */
  size?: "sm" | "md";
}) {
  return (
    <>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      <button
          type="button"
          onClick={cta.onClick}
          className={`mt-3 inline-flex items-center gap-1.5 rounded-xl bg-[#2e0562] font-semibold text-white shadow-sm transition-colors hover:bg-[#2e0562]/90 ${
            size === "md" ? "px-5 py-2.5 text-sm" : "px-4 py-2 text-xs"
          }`}
      >
        {cta.label}
      </button>
    </>
  );
}

/**
 * The scrim and the notice, centred over whatever the caller blurred.
 *
 * <p>The caller owns the blur — it is their content — and this owns everything about saying so.
 *
 * <p>Always interactive, because it always holds the control that unlocks it. An earlier version
 * was pointer-transparent so that a button *behind* it stayed clickable; the button now lives in
 * here instead, which is where a reader looks once they have been told they cannot see something.
 */
export function LockedOverlay(props: { title: string; hint?: React.ReactNode; cta: LockedCta }) {
  return (
    // Interactive, because it always holds the control that unlocks it.
    <div
      className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-xl bg-background/75 px-4 text-center"
      data-testid="locked-overlay"
    >
      <LockedNotice {...props} />
    </div>
  );
}

/** The same notice as a bordered card, for a list with nothing behind it to blur. */
export function LockedPanelCard(
  { className = "", ...notice }: { title: string; hint?: React.ReactNode; className?: string; cta: LockedCta },
) {
  return (
    <div
      className={`flex flex-col items-center rounded-xl border border-border bg-card p-8 text-center ${className}`}
      data-testid="locked-panel"
    >
      <LockedNotice {...notice} size="md" />
    </div>
  );
}
