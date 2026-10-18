/**
 * A label's letters as they are written over its atom (docs/EDITOR-2D.md,
 * *Labels typed in place*): set as words on the page are (lib/chem/captions),
 * in the drawing's typeface at its size, left to right, the first on the
 * atom - a two-letter symbol's middle - as the drawing sets a label. What
 * the writing draws (LabelTyping2D) and what the atom's bonds stop short of
 * meanwhile (DrawnLayout) are both set by this.
 */
import { captionRuns, captionSet } from "../../../../lib/chem/captions";
import { runsWidth, type LabelSet, type TextItem, type Writing } from "../../../../lib/chem/layout2d";
import { DURATION, easeOut } from "../../../theme/motion";

/**
 * `text` set about its atom, in letters `fs` high: the set as captionSet
 * lays it about its middle (`laid`), how far that middle is to the right of
 * the atom (`dx`), and its items set about the atom (`items`).
 */
export function writtenLetters(text: string, fs: number, set: LabelSet): { laid: ReturnType<typeof captionSet>; dx: number; items: TextItem[] } {
  const laid = captionSet(text, 0, 0, fs, set);
  const first = [...text][0];
  const dx = /^[A-Z][a-z]$/.test(text) || !first ? 0 : runsWidth(captionRuns(text), fs, set) / 2 - runsWidth([{ text: first }], fs, set) / 2;
  return { laid, dx, items: laid.items.map((t) => ({ ...t, x: t.x + dx })) };
}

/**
 * How long an atom's bonds take to make room for a label being written over
 * it - for its first letter, and for each after - and to go back to its
 * label as drawn once it is kept or let go, in ms (docs/EDITOR-2D.md,
 * *Labels typed in place*).
 */
export const WRITE_MS = DURATION.quick * 1000;

/**
 * A label being written over an atom, as its bonds make room for it: what
 * was written at each step (`text`, its letters `items` set about the atom
 * - none, its label as drawn: kept or let go), since when, over what it
 * stopped short of before (`was`), and whether the drawing draws no label
 * for it meanwhile (`hidden`). Each step its own number.
 */
export type WriteStep = { n: number; text?: string; items?: readonly TextItem[]; since: number; was?: WriteStep; hidden: boolean };

/** How far a step has come at `now`: eased, 0 to 1. */
export const writeK = (s: WriteStep, now: number) => easeOut(Math.min(1, Math.max(0, (now - s.since) / WRITE_MS)));

/** A step as the layout takes it (lib/chem/layout2d `Writing`), at `now` - those it has come all the way from left out. */
export function writingAt(s: WriteStep, now: number): Writing {
  const k = writeK(s, now);
  return { ...(s.items ? { items: s.items } : {}), k, ...(k < 1 && s.was ? { was: writingAt(s.was, now) } : {}), ...(s.hidden ? { hidden: true } : {}) };
}

/** Whether a step is still on its way: where it is there, those before it are passed. */
export function writeMoving(s: WriteStep | undefined, now: number): boolean {
  return !!s && writeK(s, now) < 1;
}

/** Each step its own number. */
let steps = 0;
/** A new step's number. */
export const nextWriteStep = () => ++steps;
