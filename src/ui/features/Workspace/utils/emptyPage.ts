/**
 * Whether a page holds nothing at all - nothing drawn, in 3D, written, read, placed, talked over, run or being made on it - where its one quiet line
 * shows (components/EmptyPageLine; docs/WORKSPACE.md, *First steps*). Pure.
 */
import { isBlankDocument, type PageHeld } from "../document";
import type { EditorState } from "../store/types";

export function pageHoldsNothing(st: PageHeld & Pick<EditorState, "renderFrames">): boolean {
  // (what a document holds, as everywhere - and a render being made on it)
  return isBlankDocument(st) && !st.renderFrames.length;
}

/**
 * Whether something chosen from Quick Add, or begun on the page, is in hand before it is on the page: a chain or bond being drawn out (`extend`:
 * active, or a stroke going), a text's caption being written, an arrow or a shape being dragged out (`arrowDraft`, `shapeDraft`), a curved
 * arrow begun (`pushDraw`), or the pen's card open (`inkMode`). Pure.
 */
export function thingInHand(st: Pick<EditorState, "extend" | "captionEdit" | "arrowDraft" | "shapeDraft" | "pushDraw" | "inkMode">): boolean {
  return st.extend.active || !!st.extend.stroke || !!st.captionEdit || !!st.arrowDraft || !!st.shapeDraft || !!st.pushDraw || !!st.inkMode;
}

/**
 * Whether the empty page's line shows: on the workspace in front, where its page holds nothing - and not while the file the tab was
 * opened with is still being read (its page is only waiting for it), a card says what could not be read, Quick Add or a menu is open,
 * something is dragged over the page or a drop is being read, a talk is given, or something is in hand (`inHand`) or being made.
 */
export function emptyPageLineShown(s: { active: boolean; empty: boolean; opening: boolean; card: boolean; quickAdd: boolean; menu: boolean; draggedOver: boolean; dropping: boolean; talking: boolean; inHand: boolean }): boolean {
  return s.active && s.empty && !s.opening && !s.card && !s.quickAdd && !s.menu && !s.draggedOver && !s.dropping && !s.talking && !s.inHand;
}

/**
 * The empty page's mark (components/EmptyPageLine), drawn as water: at rest a small dot in the middle and one faint ring round it; in a
 * round, two clicks a double-click apart - at each the dot dips and a ripple is born at it and spreads to the mark's edge, fading as it
 * slows. Sizes in px of a square mark `size` across; times in seconds.
 */
export const EMPTY_PAGE_MARK = {
  size: 40,
  /** The dot at rest, and how far it dips at a click, and for how long (down and back). */
  dot: { r: 2, opacity: 0.5, dip: 0.75, dipFor: 0.18 },
  /** The faint ring at rest; it stays as it is while the ripples pass. */
  ring: { r: 9, opacity: 0.25 },
  /** A ripple: born at radius `from` and brought up to `opacity` in `bornIn`, it spreads to radius `to` in `spreadFor`, fading to nothing. */
  ripple: { from: 3, to: 15, opacity: 0.85, bornIn: 0.06, spreadFor: 0.9 },
  /** The second click after the first: a double-click's pace. */
  second: 0.25,
  /** From the mark's appearance: the first round after `first`, `rounds` in all, `every` apart (start to start); then it rests. */
  first: 0.3,
  every: 5,
  rounds: 3,
  /**
   * Where the pointer rests within `reach` of the mark's middle (the ripples' edge and a little slack), the mark wakes: the dot and the
   * ring brighten to these, in `wakeIn`, and one ripple is born as at a click; it eases back to rest in `sleepIn` once the pointer leaves.
   */
  awake: { reach: 18, dot: 0.9, ring: 0.55, wakeIn: 0.15, sleepIn: 0.25 },
} as const;

/** The ripple's spread: quick out of the dot, slowing as it reaches the edge, as water does. */
export const RIPPLE_SPREAD_EASE: [number, number, number, number] = [0.2, 0.5, 0.35, 1];

type Repeated = { duration: number; delay: number; repeat: number; repeatDelay: number };

/** One animation of `duration` played in every round of the mark, `at` seconds into the round. */
function inEveryRound(duration: number, at: number): Repeated {
  const m = EMPTY_PAGE_MARK;
  return { duration, delay: m.first + at, repeat: m.rounds - 1, repeatDelay: m.every - duration };
}

/**
 * How the mark moves: the dot's two dips, and the two ripples (the second `second` after the first). Only scale and opacity; each round
 * begins and ends at rest (the ripples unseen, the dot whole). A ripple is drawn at its full radius and scaled, its stroke kept as wide.
 */
export function emptyPageMarkMotion() {
  const { dot, ripple, second } = EMPTY_PAGE_MARK;
  const both = second + dot.dipFor;
  const t = (s: number) => s / both;
  const dip = {
    scale: [1, dot.dip, 1, 1, dot.dip, 1],
    transition: { ...inEveryRound(both, 0), times: [0, t(dot.dipFor / 2), t(dot.dipFor), t(second), t(second + dot.dipFor / 2), 1], ease: "easeInOut" as const },
  };
  const from = ripple.from / ripple.to;
  const ripples = [0, second].map((at) => ({
    scale: [from, 1],
    opacity: [0, ripple.opacity, 0],
    transition: {
      scale: { ...inEveryRound(ripple.spreadFor, at), ease: RIPPLE_SPREAD_EASE },
      opacity: { ...inEveryRound(ripple.spreadFor, at), times: [0, ripple.bornIn / ripple.spreadFor, 1], ease: ["easeOut", "linear"] as ("easeOut" | "linear")[] },
    },
  }));
  return { dip, ripples, rest: { ripple: { scale: from, opacity: 0 }, dot: { scale: 1 } } };
}

/** Whether the pointer, `dx`, `dy` px from the mark's middle, is inside it (`EMPTY_PAGE_MARK.awake.reach`). */
export function pointerInsideMark(dx: number, dy: number): boolean {
  return dx * dx + dy * dy <= EMPTY_PAGE_MARK.awake.reach ** 2;
}

/**
 * The mark under a resting pointer: whether it is awake, and how many ripples the pointer has had born (one each time it comes in; none
 * where the system asks for less motion - the brightening only). A pointer staying inside, or out, changes nothing. A round playing as
 * it comes in goes on as it is: the pointer's ripple is a ripple of its own.
 */
export function markUnderPointer(was: { awake: boolean; born: number }, inside: boolean, lessMotion: boolean): { awake: boolean; born: number } {
  if (inside === was.awake) return was;
  return { awake: inside, born: was.born + (inside && !lessMotion ? 1 : 0) };
}

/** The ripple born as the pointer comes in: one, as at a click of a round, at once and not again. */
export function pointerRippleMotion() {
  const { ripple } = EMPTY_PAGE_MARK;
  const from = ripple.from / ripple.to;
  return {
    scale: [from, 1],
    opacity: [0, ripple.opacity, 0],
    transition: {
      scale: { duration: ripple.spreadFor, ease: RIPPLE_SPREAD_EASE },
      opacity: { duration: ripple.spreadFor, times: [0, ripple.bornIn / ripple.spreadFor, 1], ease: ["easeOut", "linear"] as ("easeOut" | "linear")[] },
    },
  };
}
