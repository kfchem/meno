import { useLayoutEffect, useRef, type RefObject } from "react";
import { DURATION, EASE } from "../theme/motion";

/** A tab's width with room to spare, the least it narrows to (chosen, and not), and the gap after it, in pixels. */
const TAB_PX = 192;
const LEAST_PX = { chosen: 96, other: 32 };
const GAP_PX = 4;

/**
 * The room a tab takes, at once: its width, the least it narrows to and the
 * gap after it. A tab coming in has it from the first frame - nothing in it
 * is laid out again as the tab rises, the page it opens mounting meanwhile -
 * and one chosen or left changes to it as the bar fills.
 */
export const tabRoom = (selected: boolean) => ({ width: TAB_PX, minWidth: selected ? LEAST_PX.chosen : LEAST_PX.other, marginRight: GAP_PX });

/**
 * A tab coming in rises, and what its room moves along moves with it: by
 * `transform` and `opacity` alone, as animations of the Web Animations API,
 * which the browser's compositor runs while the page's own thread is busy
 * mounting what the tab opens. Never a width, a margin or a position.
 */
export const TAB_RISE = {
  from: { transform: "translateY(30px)", opacity: 0 },
  to: { transform: "translateY(0)", opacity: 1 },
  timing: { duration: DURATION.base * 1000, easing: `cubic-bezier(${EASE.join(",")})` },
} as const;

/**
 * An element rising into its place, once, as it is mounted: by transform and
 * opacity (`TAB_RISE`).
 */
export function useRises(ref: RefObject<HTMLElement | null>, rises: boolean) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !rises || typeof el.animate !== "function") return;
    // (added to the transform the element already has, a tab dragged meanwhile: it is the drag's, kept)
    const moved = el.animate({ transform: [TAB_RISE.from.transform, TAB_RISE.to.transform] }, { ...TAB_RISE.timing, composite: "add", fill: "backwards" });
    const shown = el.animate({ opacity: [TAB_RISE.from.opacity, TAB_RISE.to.opacity] }, { ...TAB_RISE.timing, fill: "backwards" });
    return () => {
      moved.cancel();
      shown.cancel();
    };
  }, [ref, rises]);
}

/**
 * An element whose place moved along as the tabs took their room - "+"
 * after the last, a tab in a full bar - kept where it was and eased into its
 * new place by transform (`TAB_RISE.timing`; FLIP), from the room being taken at
 * once. `count` is the number of tabs: only a change of it is eased.
 */
export function useMovedAlong(ref: RefObject<HTMLElement | null>, count: number) {
  const at = useRef<{ left: number; count: number } | null>(null);
  // (every render: where it stands now, laid out - as the window is resized, too, so that a move that is not the tabs' is not eased)
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const left = el.offsetLeft;
    const was = at.current;
    at.current = { left, count };
    if (!was || was.count === count || was.left === left || typeof el.animate !== "function") return;
    el.animate({ transform: [`translateX(${was.left - left}px)`, "translateX(0)"] }, { ...TAB_RISE.timing, composite: "add" });
  });
}

