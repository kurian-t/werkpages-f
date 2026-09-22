import { useEffect, useState } from "react";

/**
 * Where a portalled dropdown goes, for every control that has one.
 *
 * <p>Written three times — the location field, the role picker and the company picker — with three
 * slightly different answers and one shared omission: none of them looked at the edge of the
 * screen. A list anchored to a field near the right-hand side ran off it, and a list opened near
 * the bottom ran past it, so the options a reader most needed were the ones they could not see.
 *
 * <p>Portalled to the body on purpose: these controls sit inside cards with their own overflow, and
 * a dropdown clipped by its container is worse than no dropdown. That is also why the position has
 * to be computed rather than inherited.
 */

/** Breathing room between the list and the edge of the window. */
const MARGIN = 8;
/** Below this there is not enough room to be worth opening downward. */
const MIN_USABLE = 160;

export interface AnchoredStyle extends React.CSSProperties {}

/**
 * Positions a list against its anchor, inside the viewport.
 *
 * @param anchor the element the list belongs to
 * @param open   whether the list is showing; nothing is measured while it is not
 * @param deps   anything that changes the list's size, so it is re-measured
 */
export function useAnchoredPosition(
  anchor: React.RefObject<HTMLElement>,
  open: boolean,
  deps: unknown[] = [],
  zIndex = 9999,
): AnchoredStyle {
  const [style, setStyle] = useState<AnchoredStyle>({});

  useEffect(() => {
    if (!open || !anchor.current) return;
    let frame = 0;

    const place = () => {
      const el = anchor.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      /*
        A zero-width measurement means layout has not settled — these fields swap between their
        summary and their input, and a list can open across that moment. Writing it through gives
        the portalled list width:0: an element that exists, holds every option, and cannot be seen
        or clicked. Better to wait a frame and measure again.
      */
      if (rect.width === 0) { frame = requestAnimationFrame(place); return; }

      const viewportW = window.innerWidth;
      const viewportH = window.innerHeight;

      // Never wider than the window, and never hanging off either edge - a list that starts past
      // the right-hand side is unreachable however correct its anchor was.
      const width = Math.min(rect.width, viewportW - MARGIN * 2);
      const left  = Math.max(MARGIN, Math.min(rect.left, viewportW - width - MARGIN));

      const below = viewportH - rect.bottom - MARGIN - 4;
      const above = rect.top - MARGIN - 4;
      // Open upward only when downward genuinely will not do, and upward is actually better.
      const openUp = below < MIN_USABLE && above > below;

      setStyle({
        position: "fixed",
        left,
        width,
        // Capped and scrollable rather than allowed to run past the edge: a reader can scroll a
        // short list, but cannot scroll to something rendered outside the window.
        maxHeight: Math.max(120, openUp ? above : below),
        overflowY: "auto",
        zIndex,
        ...(openUp ? { bottom: viewportH - rect.top + 4 } : { top: rect.bottom + 4 }),
      });
    };

    place();
    // The anchor moves when the page scrolls or the window changes shape, and a list left behind at
    // its old coordinates is pointing at nothing. Capture, so scrolling containers count too.
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, anchor, zIndex, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps

  return style;
}
