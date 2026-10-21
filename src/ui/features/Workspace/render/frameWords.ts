/**
 * Where a render's frame on the page has what it says, and how large
 * (docs/RENDER.md, *On the page*): inside it, two lines at most, between
 * margins clear of its stop button - or, where the frame is too small for
 * that, just below it, as wide as two lines of it need. All in CSS px of
 * the page, which the frame and its words zoom with alike, so that where
 * they go is the same at every zoom.
 */
import { IBM_PLEX_SANS } from "../../../../lib/chem/fonts/ibmPlexSans";

/** The size its words are set at, and the least they are made, to stay inside a frame. */
export const WORDS_PX = 13;
export const WORDS_LEAST_PX = 10;
/** A line of them, as tall as `leading-5` at 13 px. */
export const lineOf = (px: number) => (px * 20) / 13;
/** Each side's margin inside the frame: the stop button's place (6 px in, 24 wide) and a little more. */
export const SIDE = 32;
/** Above and below the words inside, and what stands under them: the bar (3 px) and the job's last line (16 px), each after a gap of 8. */
const PAD_Y = 12;
const UNDER = 3 + 8 + 16 + 8;
/** A note under them besides, where a render has one (renderScene's `note`): a line of 16 px after a gap of 8. */
const NOTE_UNDER = 16 + 8;
/** Below a frame: the gap to it, the stop button beside the words (24 px and a gap of 4), the box's padding (8 px left), and its widest. */
const BELOW_GAP = 6;
const BESIDE = 24 + 4 + 8;
export const BELOW_MOST = 320;

/** All a render running says (Renders2D `said`), its longest first: what a frame must hold. */
export const SAYINGS = ["Waiting for other jobs to finish…", "Putting it on the page…", "Rendering 100%…", "Getting ready…", "Stopping…", "Rendering…"];

/** How wide `s` is set at `px`: IBM Plex Sans's own advances (the app's typeface); "…" as three full stops, a letter it lacks as a figure. */
export function textWidth(s: string, px: number): number {
  let units = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (ch === "…") units += 3 * IBM_PLEX_SANS.advances[".".charCodeAt(0) - 32];
    else if (c >= 32 && c <= 126) units += IBM_PLEX_SANS.advances[c - 32];
    else units += 600;
  }
  return (units / IBM_PLEX_SANS.unitsPerEm) * px;
}

/** `s` set in lines no wider than `room` at `px`, a word at a time as a browser sets it; a word wider than `room` alone on its line. */
export function wrap(s: string, room: number, px: number): string[] {
  const lines: string[] = [];
  for (const word of s.split(" ")) {
    const last = lines[lines.length - 1];
    if (last != null && textWidth(`${last} ${word}`, px) <= room) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  return lines;
}

/** Whether `s` is set at `px` in `room` in two lines at most, none past it. */
const inTwo = (s: string, room: number, px: number) => {
  const lines = wrap(s, room, px);
  return lines.length <= 2 && lines.every((l) => textWidth(l, px) <= room);
};

/** The least room `s` is set in two lines in at `px` (to a tenth of a px). */
export function twoLineRoom(s: string, px: number): number {
  let lo = Math.max(...s.split(" ").map((w) => textWidth(w, px)));
  let hi = textWidth(s, px);
  if (inTwo(s, lo, px)) return lo;
  while (hi - lo > 0.1) {
    const mid = (lo + hi) / 2;
    if (inTwo(s, mid, px)) hi = mid;
    else lo = mid;
  }
  return hi;
}

export type FrameWords = { place: "inside"; px: number } | { place: "below"; px: number; width: number; height: number };

/**
 * Where the words of a frame `w` by `h` go: inside, at 13 px or as little
 * less, to 10, as holds all of `says` in two lines between its margins with
 * what stands under them; else below it, at 13 px, in a box as wide as two
 * lines of the longest need - never one word a line, never under the
 * button - up to `BELOW_MOST`; `noted`, with room for a note under them
 * inside (a below box's note is its title). A running render's `says` are all it may
 * say (`SAYINGS`), so where its words go is set as it begins and kept; a
 * failed one's is why it failed, shown below where it is long.
 */
export function frameWords(w: number, h: number, says: readonly string[] = SAYINGS, failed = false, noted = false): FrameWords {
  const room = w - 2 * SIDE;
  for (let px = WORDS_PX; px >= WORDS_LEAST_PX; px--) {
    const tall = 2 * PAD_Y + 2 * lineOf(px) + (failed ? 0 : UNDER + (noted ? NOTE_UNDER : 0)) + 2;
    if (room > 0 && tall <= h && says.every((s) => inTwo(s, room, px))) return { place: "inside", px };
  }
  const need = Math.max(...says.map((s) => twoLineRoom(s, WORDS_PX)));
  const text = Math.min(BELOW_MOST - BESIDE, Math.max(need, w - BESIDE));
  const lines = Math.max(...says.map((s) => wrap(s, text, WORDS_PX).length));
  return { place: "below", px: WORDS_PX, width: Math.ceil(text + BESIDE), height: BELOW_GAP + Math.max(24, lines * lineOf(WORDS_PX)) };
}

/** How far past its frame (CSS px of the page) a frame's words reach: below, and either side where they are wider. */
export function wordsReach(w: number, fw: FrameWords): { below: number; side: number } {
  return fw.place === "inside" ? { below: 0, side: 0 } : { below: fw.height, side: Math.max(0, (fw.width - w) / 2) };
}
