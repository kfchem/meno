import { ELEMENTS, type Element } from "../../../lib/chem/elements";
import { atomColour, type MoleculeLook } from "../../../lib/chem/style3d";

/** The elements most drawn, in a row of their own above the table. */
export const COMMON = ["H", "C", "N", "O", "F", "P", "S", "Cl", "Br", "I", "B", "Si"];

export const BY_SYMBOL = new Map(ELEMENTS.map((e) => [e.symbol, e]));

/** An element's name as a heading says it: its first letter capital. */
export const nameOf = (e: Element) => e.name.charAt(0).toUpperCase() + e.name.slice(1);

/**
 * Each element's colour as a style draws it, and whether the style has
 * changed it: against `preset` - the built-in style's own, in the colour
 * set chosen; the user's own, its colour set's alone.
 */
export function elementColours(look: MoleculeLook, preset: MoleculeLook): { symbol: string; colour: string; changed: boolean }[] {
  return ELEMENTS.map((e) => {
    const colour = atomColour(e.symbol, look);
    const was = atomColour(e.symbol, { colours: preset.colours, colourSet: look.colourSet });
    return { symbol: e.symbol, colour, changed: colour.toLowerCase() !== was.toLowerCase() };
  });
}

