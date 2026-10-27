/** A box on the screen, in the canvas's pixels: its left and top edges, and how wide and tall it is. */
export type ScreenRect = { left: number; top: number; width: number; height: number };

/** How wide and tall the card of how words on the page are set is, in pixels (WordsCard). */
export const WORDS_CARD = { width: 320, height: 196 } as const;

/** How far a card stands clear of what it works on, in pixels. */
export const CARD_CLEAR = 16;
/** How near the canvas's edges a card comes, in pixels. */
const EDGE = 8;

/**
 * Where a card `card` wide and tall goes, in a canvas `within`, so as not to
 * lie over `target` - what it works on, seen changing as it is used: to its
 * right, level with its top; else below it, from its left; else to its
 * left; else above it - `CARD_CLEAR` from it, inside the canvas. Where none
 * has the room, the side with the most, kept inside the canvas.
 */
export function cardBeside(target: ScreenRect, card: { width: number; height: number }, within: { width: number; height: number }): { x: number; y: number } {
  const across = (x: number) => Math.max(EDGE, Math.min(x, within.width - card.width - EDGE));
  const down = (y: number) => Math.max(EDGE, Math.min(y, within.height - card.height - EDGE));
  const right = target.left + target.width + CARD_CLEAR;
  const below = target.top + target.height + CARD_CLEAR;
  const left = target.left - CARD_CLEAR - card.width;
  const above = target.top - CARD_CLEAR - card.height;
  const sides = [
    { room: within.width - EDGE - (right + card.width), at: { x: right, y: down(target.top) } },
    { room: within.height - EDGE - (below + card.height), at: { x: across(target.left), y: below } },
    { room: left - EDGE, at: { x: left, y: down(target.top) } },
    { room: above - EDGE, at: { x: across(target.left), y: above } },
  ];
  const fits = sides.find((s) => s.room >= 0);
  if (fits) return fits.at;
  const most = sides.reduce((a, b) => (b.room > a.room ? b : a));
  return { x: across(most.at.x), y: down(most.at.y) };
}
