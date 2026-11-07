/**
 * What is drawn on the page by WebGL coming and going (docs/LOOK.md, no
 * abrupt changes): each item fades in as it comes, and out as it goes - a
 * gone one still drawn, as it last was, till it has - over Meno's base time
 * and easing (theme/motion), as a set's frame does in HTML (`meno-fade-in`,
 * `meno-fade-out`). Worked out here; drawn by the caller with each item's
 * `opacity`.
 */
import { DURATION, EASE, EASE_LEAVE, eased } from "../../../theme/motion";

/** An item, and when it came and - gone - when it went, in ms. */
export type Present<T> = { item: T; born: number; gone?: number };

/** How long a fade takes, in ms. */
export const FADE_MS = DURATION.base * 1000;

/**
 * The items present at `now`, from those present before (`was`) and those
 * there now (`items`): one new, born now - unless it is the first time
 * (`first`), when all are there already; one no longer there, gone now (as
 * it last was); one gone and back, born again; one gone a fade ago, dropped.
 */
export function presentAt<T extends { key: string }>(was: ReadonlyMap<string, Present<T>>, items: readonly T[], now: number, first = false): Map<string, Present<T>> {
  const next = new Map<string, Present<T>>();
  for (const item of items) {
    const p = was.get(item.key);
    next.set(item.key, { item, born: p && p.gone == null ? p.born : first ? now - FADE_MS : now });
  }
  for (const [key, p] of was) {
    if (next.has(key)) continue;
    const gone = p.gone ?? now;
    if (now - gone < FADE_MS) next.set(key, { ...p, gone });
  }
  return next;
}

/** How present an item is at `now`: 0 to 1 - eased in as it comes, out as it goes. */
export function presenceAt(p: Present<unknown>, now: number): number {
  if (p.gone != null) return 1 - eased(EASE_LEAVE, Math.min(1, Math.max(0, (now - p.gone) / FADE_MS)));
  return eased(EASE, Math.min(1, Math.max(0, (now - p.born) / FADE_MS)));
}

/** Whether any is still fading at `now`: drawn again till none is. */
export const fading = (present: ReadonlyMap<string, Present<unknown>>, now: number): boolean => [...present.values()].some((p) => (p.gone != null ? now - p.gone < FADE_MS : now - p.born < FADE_MS));
