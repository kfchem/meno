import { wordsSet } from "../../../../lib/chem/captions";
import { labelSetOf, type Atom as LAtom, type Bond as LBond } from "../../../../lib/chem/layout2d";
import { layoutByStructure, structureLayouts } from "../../../../lib/chem/layoutStructures";
import { chemistry } from "../../../../lib/chem/molecule";
import { DEFAULT_STYLE_CHOICE, styleOf, type StyleChoice } from "../../../../lib/chem/style";
import { editorLayoutOptions, layoutBonds } from "../layoutOptions";
import type { Atom, Bond, Caption, CaptionOf, Molecule3D } from "../store/types";

/**
 * Words that belong to a structure (docs/EDITOR-2D.md, *Text*): a caption
 * whose `of` names a drawing's atom or a molecule in 3D keeps its place
 * against its structure's box - moved, turned, drawn on, deleted with it -
 * as an edit leaves the page. Free words are never tied by being near.
 */

type Page = {
  model: { atoms: readonly Atom[]; bonds: readonly Bond[] };
  /** The workspace's drawing style: how far its structures reach as drawn. */
  style?: StyleChoice;
  captions?: Caption[];
  molecules3d?: readonly Pick<Molecule3D, "id" | "at">[];
};

type Pt = { x: number; y: number };

/** The atoms of the structure the atom `id` is in, by id: those joined to it by bonds. */
function structureOf(bonds: readonly Bond[], id: number, by?: Map<number, number[]>): Set<number> {
  const next = by ?? neighbours(bonds);
  const seen = new Set([id]);
  const todo = [id];
  while (todo.length)
    for (const n of next.get(todo.pop()!) ?? [])
      if (!seen.has(n)) {
        seen.add(n);
        todo.push(n);
      }
  return seen;
}

function neighbours(bonds: readonly Bond[]): Map<number, number[]> {
  const by = new Map<number, number[]>();
  for (const b of bonds) {
    by.set(b.a, [...(by.get(b.a) ?? []), b.b]);
    by.set(b.b, [...(by.get(b.b) ?? []), b.a]);
  }
  return by;
}

/** A box on the page: its left, bottom, right and top. */
export type Box = { x0: number; y0: number; x1: number; y1: number };

/**
 * How far the structure of the atoms `ids` reaches as it is drawn in
 * `style` - its atoms and their labels: the box text is put under as it is
 * added, and kept its place against as the structure changes.
 */
export function drawnStructureBox(model: Page["model"], ids: ReadonlySet<number>, style: StyleChoice = DEFAULT_STYLE_CHOICE): Box | null {
  const atoms = model.atoms.filter((a) => ids.has(a.id));
  if (!atoms.length) return null;
  const index = new Map<number, number>();
  const la: LAtom[] = atoms.map((a, i) => {
    index.set(a.id, i);
    return { id: a.id, x: a.x, y: a.y, el: a.el, ...chemistry(a), ...(a.chargeAt ? { chargeAt: a.chargeAt } : {}) };
  });
  const lb: LBond[] = layoutBonds(model.bonds.filter((b) => index.has(b.a) && index.has(b.b)), index);
  const r = layoutByStructure(la, lb, editorLayoutOptions(styleOf(style)), 1, structureLayouts()).bounds;
  return { x0: r.min.x, y0: r.min.y, x1: r.max.x, y1: r.max.y };
}

/**
 * Where words whose middle is `at` and half-size `half` go as their
 * structure's box goes from `was` to `now`: kept at the side of the box they
 * stand outside of by the most (below where they are as far below as to any
 * other side) - as far from that side, and as far along it from its middle -
 * or, their middle inside the box, as far from its middle.
 */
export function keptAgainstBox(was: Box, now: Box, at: Pt, half: { w: number; h: number }): Pt {
  const mid = { x: (now.x0 + now.x1) / 2 - (was.x0 + was.x1) / 2, y: (now.y0 + now.y1) / 2 - (was.y0 + was.y1) / 2 };
  if (at.x >= was.x0 && at.x <= was.x1 && at.y >= was.y0 && at.y <= was.y1) return { x: at.x + mid.x, y: at.y + mid.y };
  const out = [
    { by: was.y0 - (at.y + half.h), d: { x: mid.x, y: now.y0 - was.y0 } },
    { by: at.y - half.h - was.y1, d: { x: mid.x, y: now.y1 - was.y1 } },
    { by: was.x0 - (at.x + half.w), d: { x: now.x0 - was.x0, y: mid.y } },
    { by: at.x - half.w - was.x1, d: { x: now.x1 - was.x1, y: mid.y } },
  ];
  // (the first of the most: below before above, left and right)
  const side = out.reduce((best, o) => (o.by > best.by ? o : best));
  return { x: at.x + side.d.x, y: at.y + side.d.y };
}

/**
 * `next` with each caption that belongs to a structure where the edit from
 * `before` left its structure: kept its place against its structure's drawn
 * box (`keptAgainstBox`) as the structure was moved, turned, turned over,
 * drawn on or relabelled - whatever the edit did to the words with it (a
 * selection turned carries them round): only words moved while their
 * structure stays as it was (moved alone) stay where they are put; tied
 * to another atom of its structure where the one it named is gone; deleted
 * with its structure.
 */
export function tiedCaptionsSettled<T extends Page>(next: T, before: Page | undefined): T {
  if (!next.captions?.some((c) => c.of)) return next;
  if (before && next.model === before.model && next.molecules3d === before.molecules3d && next.captions === before.captions) return next;
  const atomsNow = new Map(next.model.atoms.map((a) => [a.id, a]));
  const atomsWere = new Map((before?.model.atoms ?? []).map((a) => [a.id, a]));
  const molsNow = new Map((next.molecules3d ?? []).map((m) => [m.id, m]));
  const molsWere = new Map((before?.molecules3d ?? []).map((m) => [m.id, m]));
  const wordsWere = new Map((before?.captions ?? []).map((c) => [c.id, c]));
  let byWas: Map<number, number[]> | undefined;
  let byNow: Map<number, number[]> | undefined;
  let changed = false;
  const out: Caption[] = [];
  for (const c of next.captions) {
    if (!c.of) {
      out.push(c);
      continue;
    }
    const was = wordsWere.get(c.id);
    // (not moved by the edit itself)
    const still = !!was && was.of && was.x === c.x && was.y === c.y;
    if ("molecule" in c.of) {
      const m = molsNow.get(c.of.molecule);
      if (!m) {
        changed = true;
        continue;
      }
      const w = still ? molsWere.get(c.of.molecule) : undefined;
      if (w && (w.at.x !== m.at.x || w.at.y !== m.at.y)) {
        changed = true;
        out.push({ ...c, x: c.x + m.at.x - w.at.x, y: c.y + m.at.y - w.at.y });
      } else out.push(c);
      continue;
    }
    const anchor = c.of.atom;
    const there = atomsNow.get(anchor);
    if (!was?.of || !before || !atomsWere.has(anchor)) {
      // (new words: kept where they are - free if the atom they name is not drawn)
      if (there) out.push(c);
      else {
        changed = true;
        const { of: _of, ...free } = c;
        out.push(free);
      }
      continue;
    }
    // (the drawing as it was: the words where they are - moved alone, or not at all)
    if (next.model === before.model) {
      out.push(c);
      continue;
    }
    byWas ??= neighbours(before.model.bonds);
    const wasIds = structureOf(before.model.bonds, anchor, byWas);
    const kin = [...wasIds].filter((id) => atomsNow.has(id));
    // (its structure gone: the words with it)
    if (!kin.length) {
      changed = true;
      continue;
    }
    // (the atom it named gone: the nearest of its structure left)
    const held = there ? anchor : kin.reduce((best, id) => (dist(atomsWere.get(id)!, atomsWere.get(anchor)!) < dist(atomsWere.get(best)!, atomsWere.get(anchor)!) ? id : best), kin[0]);
    byNow ??= neighbours(next.model.bonds);
    const nowIds = structureOf(next.model.bonds, held, byNow);
    // (its structure as it was: words the edit moved were moved by the chemist - alone - and stay where put)
    const reshaped = nowIds.size !== wasIds.size || [...nowIds].some((id) => atomsNow.get(id) !== atomsWere.get(id));
    if (!reshaped) {
      out.push(c);
      continue;
    }
    // (its structure changed - by the edit, whatever it was: words carried with a selection turned, turned over, aligned or laid out
    //  too - seated against its whole box from where they were, at every frame of a gesture; with its structure only moved, moved as much)
    const at = placeKept(was, before, next, wasIds, nowIds, atomsWere, atomsNow);
    if (at.x === c.x && at.y === c.y && held === anchor) {
      out.push(c);
      continue;
    }
    changed = true;
    out.push({ ...c, x: at.x, y: at.y, of: { atom: held } });
  }
  return changed ? { ...next, captions: out } : next;
}

/** Where the words `c` go as their structure goes from the atoms `wasIds` of `before` to the atoms `nowIds` of `next`. */
function placeKept(c: Caption, before: Page, next: Page, wasIds: ReadonlySet<number>, nowIds: ReadonlySet<number>, atomsWere: ReadonlyMap<number, Atom>, atomsNow: ReadonlyMap<number, Atom>): Pt {
  // (the same atoms, drawn alike, each moved the same way - a move: the words with them, by just as much)
  if (wasIds.size === nowIds.size && next.model.bonds === before.model.bonds && [...nowIds].every((id) => wasIds.has(id))) {
    let d: Pt | null = null;
    let alike = true;
    for (const id of nowIds) {
      const a = atomsWere.get(id)!;
      const b = atomsNow.get(id)!;
      if (a === b) {
        if (d && Math.hypot(d.x, d.y) > 1e-9) alike = false;
        d ??= { x: 0, y: 0 };
        continue;
      }
      const { x: _x, y: _y, ...rest } = a;
      const { x: _bx, y: _by, ...restNow } = b;
      if (JSON.stringify(rest) !== JSON.stringify(restNow)) alike = false;
      const e = { x: b.x - a.x, y: b.y - a.y };
      if (d && Math.hypot(d.x - e.x, d.y - e.y) > 1e-9) alike = false;
      d ??= e;
      if (!alike) break;
    }
    if (alike && d) return { x: c.x + d.x, y: c.y + d.y };
  }
  const style = next.style ?? before.style;
  const wasBox = drawnStructureBox(before.model, wasIds, style);
  const nowBox = drawnStructureBox(next.model, nowIds, style);
  if (!wasBox || !nowBox) return c;
  const opts = editorLayoutOptions(styleOf(style ?? DEFAULT_STYLE_CHOICE));
  const w = wordsSet(c, opts, labelSetOf(opts));
  return keptAgainstBox(wasBox, nowBox, c, { w: w.halfW, h: w.halfH });
}

function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** The caption that belongs to the structure the atom `id` is in - or the molecule in 3D - if there is one. */
export function tiedCaptionOf(page: Page, of: CaptionOf): Caption | undefined {
  if ("molecule" in of) return page.captions?.find((c) => c.of && "molecule" in c.of && c.of.molecule === of.molecule);
  const atoms = structureOf(page.model.bonds, of.atom);
  return page.captions?.find((c) => c.of && "atom" in c.of && atoms.has(c.of.atom));
}

/** The captions among `captions` that belong to a structure all of whose atoms are among `ids`. */
export function tiedAmong(page: Page, ids: ReadonlySet<number>): Caption[] {
  const tied = (page.captions ?? []).filter((c) => c.of && "atom" in c.of && ids.has(c.of.atom));
  if (!tied.length) return [];
  const by = neighbours(page.model.bonds);
  return tied.filter((c) => [...structureOf(page.model.bonds, (c.of as { atom: number }).atom, by)].every((a) => ids.has(a)));
}

/** `of` as the pasted things are numbered: a drawing's atom by `atom`, a molecule in 3D by `molecule` - free where what it named did not come along. */
export function tieRenumbered(c: Caption, atom: (id: number) => number | undefined, molecule: (id: number) => number | undefined): Caption {
  if (!c.of) return c;
  const to = "atom" in c.of ? atom(c.of.atom) : molecule(c.of.molecule);
  const { of, ...free } = c;
  return to == null ? free : { ...free, of: "atom" in of ? { atom: to } : { molecule: to } };
}
