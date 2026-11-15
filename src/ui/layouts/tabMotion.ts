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

/** What a tab is as it comes in: its room already, and nothing else (it rises by `useRises`). */
export const tabInitial = tabRoom;

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

/** Whether a tab rises as it comes in: only one added after the bar was first drawn (`first`, the ids it had then). */
export const risesAfter = (first: ReadonlySet<string>, id: string) => !first.has(id);

/**
 * How far an element's place moved along as the tabs took their room, in
 * pixels to be eased away (FLIP: it is put back where it was, by that, and
 * goes to 0). `null` for no ease: nothing known of where it was, the number
 * of tabs the same (a window resized, a tab's room going as it leaves), or
 * the place the same.
 */
export const flipFrom = (was: { left: number; count: number } | null, left: number, count: number): number | null =>
  !was || was.count === count || was.left === left ? null : was.left - left;

/**
 * An element rising into its place, once, as it is mounted: by transform and
 * opacity (`TAB_RISE`). Replacing the transform, not adding to it: a tab
 * coming in has none to keep, and a replacing animation is the one a
 * compositor takes most surely.
 */
export function useRises(ref: RefObject<HTMLElement | null>, rises: boolean) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !rises || typeof el.animate !== "function") return;
    const moved = el.animate({ transform: [TAB_RISE.from.transform, TAB_RISE.to.transform] }, { ...TAB_RISE.timing, fill: "backwards" });
    const shown = el.animate({ opacity: [TAB_RISE.from.opacity, TAB_RISE.to.opacity] }, { ...TAB_RISE.timing, fill: "backwards" });
    return () => {
      moved.cancel();
      shown.cancel();
    };
  }, [ref, rises]);
}

/**
 * The place an element had just before the number of tabs changed, to ease from: its place now, read as the render with the new
 * `count` begins - the layout still the committed one, before the tabs take their room - where `seen` is the count it was last
 * laid out for. `null` where the count is the same (nothing to read), or the element is not there. It is the place just before
 * the change, never one read at an earlier change: a tab closing leaves its room moving on after the last render, so an earlier read
 * would be a place the element has left.
 */
export const placeBefore = (seen: number, count: number, left: number | null): number | null => (seen === count ? null : left);

/**
 * An element whose place moved along as the tabs took their room - "+"
 * after the last, a tab in a full bar - kept where it was and eased into its
 * new place by transform (`TAB_RISE.timing`; `flipFrom`), from the room being
 * taken at once. `count` is the number of tabs: only a change of it is eased,
 * and only then is the element's place read (a layout each, in the render
 * that has the new count: `placeBefore`). `composite` is "add" for one that may
 * be dragged meanwhile, whose transform is the drag's, kept; "replace" for one
 * with none ("+").
 */
export function useMovedAlong(ref: RefObject<HTMLElement | null>, count: number, composite: "add" | "replace" = "replace") {
  // (the count it was last laid out for, and the place it had as the count changed)
  const seen = useRef<number | null>(null);
  const before = useRef<number | null>(null);
  if (seen.current !== null) before.current = placeBefore(seen.current, count, ref.current ? ref.current.offsetLeft : null) ?? before.current;
  useLayoutEffect(() => {
    const el = ref.current;
    const was = seen.current;
    seen.current = count;
    if (!el || was === null || was === count) return;
    const by = flipFrom(before.current === null ? null : { left: before.current, count: was }, el.offsetLeft, count);
    before.current = null;
    if (by === null || typeof el.animate !== "function") return;
    el.animate({ transform: [`translateX(${by}px)`, "translateX(0)"] }, { ...TAB_RISE.timing, composite });
  });
}
