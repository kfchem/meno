/**
 * Meno's first steps (docs/WORKSPACE.md, *First steps*): plain text Meno
 * shows one step at a time, in a card of its own, each pointing at a part of
 * the window - by a name Meno gives it, never by how the window is built -
 * and going on by itself once the chemist does what it says. Shown only when
 * asked, from Settings, General. Meno's own: no plugin brings a guide, and
 * none is named in it.
 */

/**
 * The parts of the window a step may point at: the page; Quick Add, once
 * open; a structure drawn on the page - the one selected, else the last
 * drawn; a right-click menu, once open; Save and Settings in the title bar.
 */
export const GUIDE_PLACES = ["page", "quick-add", "structure", "menu", "save", "settings"] as const;
export type GuidePlace = (typeof GUIDE_PLACES)[number];

/** What the chemist may do that a step waits for, to go on by itself: open Quick Add, select a whole structure, open a right-click menu. */
export const GUIDE_EVENTS = ["quick-add", "selected", "menu"] as const;
export type GuideEvent = (typeof GUIDE_EVENTS)[number];

/** A step: what it is called and says; where it points and what it waits for, where it says. */
export type GuideStep = { title: string; text: string; at?: GuidePlace; until?: GuideEvent };

/** Meno's first steps, in order. */
export const FIRST_STEPS: readonly GuideStep[] = [
  { title: "Welcome to Meno", text: "Double-click on empty space to add something: a bond, a chain, a structure from its SMILES, text or an arrow.", at: "page", until: "quick-add" },
  { title: "Quick Add", text: "Press Chain and move: a carbon chain follows the pointer, closing a ring where it comes round. SMILES makes a structure from its SMILES.", at: "quick-add" },
  { title: "Hold to select", text: "Press and hold on a structure to select all of it. Keep holding and drag to move it.", at: "structure", until: "selected" },
  { title: "Right-click", text: "Right-click anything for what can be done with it. The icons along the top are those used most.", at: "menu" },
  { title: "Save", text: "Save keeps the whole workspace - drawings, molecules in 3D, results - as one .meno file. Settings is beside it.", at: "save" },
  { title: "Plugins", text: "Meno does more with plugins: add them in Settings, Plugins. Each is downloaded only when you add it, after Meno asks." },
];
