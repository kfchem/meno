/**
 * How wide Settings is laid out (the maintainer, 2026-10-17 and again
 * 2026-10-18): every section as wide as the others, and everything in it -
 * each card, the search, a form - as wide as the section; words said
 * about what a setting is kept to one readable measure everywhere. Inputs
 * in a card keep their own sizes; the card around them does not.
 * (Literal class names, as Tailwind finds them in the source.)
 */

/** Every section's width: room for a style editor's settings beside its preview (StyleEditor/sideBySide). */
export const SECTION_WIDTH = "max-w-5xl";
/** The column the tabs and the section share: the section's width (64rem) and the padding (`px-6`, 1.5rem) either side of it. */
export const COLUMN_WIDTH = "max-w-[67rem]";
/**
 * The one measure of Settings' explanatory words beside a setting's
 * control: a setting's account of itself, a note under a card. A section's
 * own account of itself, at its top, runs the section's width, as its cards
 * do (the maintainer, 2026-10-19).
 */
export const PROSE_WIDTH = "max-w-2xl";
