/**
 * A plugin's guide (docs/PLUGINS.md, *A plugin's guide*): steps of plain
 * text that Meno shows one at a time, in a card of its own, each pointing
 * at a part of the window - by a name Meno gives it, never by how the
 * window is built - and going on by itself once the chemist does what it
 * says. Data, as all of a manifest is: no plugin's code runs in the window.
 * Meno shows a plugin's guide once, the first time the plugin is there; the
 * guide Meno comes with (resources/plugins/getting-started) is there from
 * the first time Meno opens.
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

/** A step of a guide: what it is called and says; where it points and what it waits for, where it says; the plugins it offers to add, by id. */
export type GuideStep = {
  title: string;
  text: string;
  at?: GuidePlace;
  until?: GuideEvent;
  /** Plugins it offers to add, each with Add - asking for the network as adding always does. */
  suggest?: string[];
};

/** A plugin a plugin suggests (its catalogue): by id, with what it is for, in a line. */
export type Suggestion = { plugin: string; for: string };
