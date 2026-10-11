/**
 * The colours a part of a structure can be given from its colour card
 * (docs/EDITOR-2D.md, *Colour*): the user's own palette, set in Settings,
 * General - Meno's four to begin with.
 */

/**
 * Meno's palette (the maintainer, 2026-10-11): colour makes a drawing look
 * cheap easily, so a few that look right as they are - its base, its
 * accent, a black and a gray.
 */
export const MENO_PALETTE: readonly string[] = ["#317689", "#cd4560", "#141414", "#c0c0c0"];

/** Okabe and Ito's colours but black - told apart by those who see colours otherwise - for a palette in one step. */
export const OKABE_ITO: readonly string[] = ["#d55e00", "#e69f00", "#f0e442", "#009e73", "#56b4e9", "#0072b2", "#cc79a7"];

/** How many colours a palette holds at most. */
export const PALETTE_MOST = 12;

const COLOUR = /^#[0-9a-f]{6}$/;

/**
 * A palette as the settings file holds it: its colours, each once, as
 * #rrggbb, no more than `PALETTE_MOST` - an empty one as it is, anything
 * that is not a list Meno's own.
 */
export function acceptPalette(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [...MENO_PALETTE];
  const out: string[] = [];
  for (const v of raw) {
    const c = typeof v === "string" ? v.toLowerCase() : "";
    if (COLOUR.test(c) && !out.includes(c) && out.length < PALETTE_MOST) out.push(c);
  }
  return out;
}
