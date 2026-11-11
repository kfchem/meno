/**
 * How a step's card is drawn as the page is zoomed out (docs/WORKSPACE.md,
 * *Drawn by WebGL*): by its size on the screen, in three bands - read (its
 * words, as it is drawn at the zoom a canvas opens at), named (its box at the
 * page's size and in it its kind's icon and its name, the name always as large
 * on the screen as the page's smallest words, a state mark at its corner),
 * marked (its box tinted by its state, the mark, and its name only where it
 * lies clear of the names before it). Pure: what the bands are, where the
 * name lies, which names are clear of each other.
 */
import { readingOrder } from "../workflow/entries";
import { WORDS_LEAST } from "../utils/pageScale";
import { switchedAt } from "../utils/zoomSwitch";

export type Band = "read" | "named" | "marked";

/** The page's scale a card's name is left out below: it is only marked (a page pixel is a quarter of a screen's). */
export const NAMED_LEAST = 0.25;

/** How large a card's name is drawn, in screen px, whatever the zoom: the smallest words the page has. */
export const NAME_PX = 11;

/** How large its kind's icon and its state's mark are drawn in the named band, in screen px. */
export const ICON_PX = 14;
export const MARK_PX = 10;

/**
 * The band at a page scale (screen px to a page px), it having been `was`:
 * read from `WORDS_LEAST` a little over, no longer a little under it - and
 * named from `NAMED_LEAST` a little over, marked a little under it
 * (utils/zoomSwitch `switchedAt`), so that a zoom stopped at an edge, or
 * turned a little back, does not switch back and forth.
 */
export function bandAt(scale: number, was: Band): Band {
  if (switchedAt(was === "read", scale, WORDS_LEAST)) return "read";
  return switchedAt(was !== "marked", scale, NAMED_LEAST) ? "named" : "marked";
}

/** A length of `px` screen pixels, in page pixels, at a page scale: a name drawn `NAME_PX` on the screen is this high on the page. */
export const onPage = (px: number, scale: number): number => px / Math.max(scale, 1e-9);

/** Where a card's name lies on the page, in page px: its box, `x0` to `x1` and `y0` to `y1` (y up from the card's top), as it is drawn at a page scale. */
export type NameBox = { key: string; x0: number; x1: number; y0: number; y1: number };

/**
 * The names that stay, of cards drawn at a page scale (`cards`: in the order
 * they are read, each its name's box): a name that lies over one before it is
 * left out - the one before it staying - and the rest stay. Where a name is
 * left out the page's tip shows it on pointing.
 */
export function namesKept(boxes: readonly NameBox[]): Set<string> {
  const kept: NameBox[] = [];
  for (const b of boxes) if (!kept.some((k) => b.x0 < k.x1 && k.x0 < b.x1 && b.y0 < k.y1 && k.y0 < b.y1)) kept.push(b);
  return new Set(kept.map((k) => k.key));
}

/** `cards` in the order they are read - by their top left, the higher first, then the one more to the left (workflow/entries `readingOrder`: cards within 0.9 of each other's height are one row). */
export function inReadingOrder<T extends { x: number; y: number; key: string }>(cards: readonly T[]): T[] {
  return [...cards].sort((a, b) => readingOrder({ x: a.x, y: a.y }, { x: b.x, y: b.y }) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}
