import type { EditorState } from "../store/types";

/**
 * What a right-click menu acts on, said in its first line (docs/EDITOR-2D.md, *Selecting*): the thing right-clicked
 * ("This atom") and the selection it is in, counted by kind ("3 atoms, 2 bonds") - and whether the selection holds more
 * than that one thing. A thing right-clicked is selected by it, so the selection always holds it.
 */
export type MenuScope = {
  thing: string;
  count: string;
  more: boolean;
  /** How many of the right-clicked kind are selected, said: "3 atoms" - what its own items reach, where they reach the selection. */
  ofKind: string;
};

/** Each kind's name, one and many, as a menu's first line says it. */
const NAMES = {
  atom: ["atom", "atoms"],
  bond: ["bond", "bonds"],
  molecule3d: ["molecule", "molecules"],
  arrow: ["arrow", "arrows"],
  plus: ["plus sign", "plus signs"],
  caption: ["text", "texts"],
  text: ["text", "texts"],
  ink: ["writing", "pieces of writing"],
  cycle: ["catalytic cycle", "catalytic cycles"],
  shape: ["shape", "shapes"],
  picture: ["picture", "pictures"],
  pdf: ["PDF", "PDFs"],
  slide: ["slide", "slides"],
  set: ["set", "sets"],
  step: ["step", "steps"],
} as const;
export type ScopedKind = keyof typeof NAMES;

type Held = Pick<EditorState, "sel" | "sel3d" | "selArrows" | "selPluses" | "selCaptions" | "selTexts" | "selInks" | "selCycles" | "selShapes" | "selPictures" | "selPdfs" | "selSlides" | "selFlow" | "model">;

/** How many of each kind are selected, in the order a first line says them. */
function counts(st: Held): [ScopedKind, number][] {
  const all: [ScopedKind, number][] = [
    ["atom", st.sel.atoms.size],
    ["bond", st.sel.bonds.size],
    ["molecule3d", st.sel3d.size],
    ["arrow", st.selArrows.size],
    ["plus", st.selPluses.size],
    ["caption", st.selCaptions.size],
    ["text", st.selTexts.size],
    ["ink", st.selInks.size],
    ["cycle", st.selCycles.size],
    ["shape", st.selShapes.size],
    ["picture", st.selPictures.size],
    ["pdf", st.selPdfs.size],
    ["slide", st.selSlides.size],
    ["set", st.selFlow.sets.size],
    ["step", st.selFlow.steps.size],
  ];
  return all.filter(([, n]) => n > 0);
}

/** The menu's scope, right-clicked on `kind` `id` with the selection `st` holds. */
export function menuScope(st: Held, kind: ScopedKind, id: number): MenuScope {
  const thing = `This ${NAMES[kind][0]}`;
  const held = counts(st);
  // (the selection is the one thing: an atom alone; a bond with its two atoms; anything else, it alone)
  const bond = kind === "bond" ? st.model.bonds.find((b) => b.id === id) : undefined;
  const alone =
    kind === "bond"
      ? !!bond && st.sel.bonds.size === 1 && st.sel.bonds.has(id) && [...st.sel.atoms].every((a) => a === bond.a || a === bond.b) && held.every(([k]) => k === "atom" || k === "bond")
      : held.length === 1 && held[0][0] === kind && held[0][1] === 1;
  const said = (k: ScopedKind, n: number) => `${n} ${NAMES[k][n === 1 ? 0 : 1]}`;
  const ofKind = said(kind, held.find(([k]) => k === kind)?.[1] ?? 1);
  if (alone) return { thing, count: thing, more: false, ofKind };
  const count = held.map(([k, n]) => said(k, n)).join(", ");
  return { thing, count: count || thing, more: true, ofKind };
}

/** Whether a menu's kind is one a first line names (a selectable thing's). */
export function isScopedKind(kind: string): kind is ScopedKind {
  return kind in NAMES;
}

/** The selection counted by kind - "3 atoms, 1 shape" - for the page's menu with a selection; null with none. */
export function selectionCount(st: Held): string | null {
  const held = counts(st);
  return held.length ? held.map(([k, n]) => `${n} ${NAMES[k][n === 1 ? 0 : 1]}`).join(", ") : null;
}

/**
 * What a menu's own items reach: the selected things of its kind, the one right-clicked among them, where the menu is the
 * selection's; else that one alone (docs/EDITOR-2D.md, *Selecting*).
 */
export function reachedOf(menu: { selection: "none" | "elsewhere" | "here" }, selected: ReadonlySet<number>, id: number): number[] {
  return menu.selection === "here" && selected.has(id) ? [id, ...[...selected].filter((x) => x !== id)] : [id];
}
