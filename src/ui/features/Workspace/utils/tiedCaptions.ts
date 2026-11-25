import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import type { Atom, Bond, Caption, CaptionOf, Molecule3D } from "../store/types";

/**
 * Words that belong to a structure (docs/EDITOR-2D.md, *Text*): a caption
 * whose `of` names a drawing's atom or a molecule in 3D goes where its
 * structure goes - moved, turned over, deleted with it - as an edit leaves
 * the page. Free words are never tied by being near.
 */

type Page = {
  model: { atoms: readonly Atom[]; bonds: readonly Bond[] };
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

/**
 * The turn, mirror and shift that take the points `from` most nearly onto
 * `to`, pair by pair (least squares, about their centres): applied to a
 * point. A mirror only where it fits better than any turn; where both fit
 * alike (a straight structure), the one that moves the point least.
 */
export function rigidFit(from: readonly Pt[], to: readonly Pt[]): (p: Pt) => Pt {
  const n = from.length;
  const c0 = { x: from.reduce((s, p) => s + p.x, 0) / n, y: from.reduce((s, p) => s + p.y, 0) / n };
  const c1 = { x: to.reduce((s, p) => s + p.x, 0) / n, y: to.reduce((s, p) => s + p.y, 0) / n };
  const fit = (flip: 1 | -1) => {
    let a = 0, b = 0;
    for (let i = 0; i < n; i++) {
      const px = from[i].x - c0.x, py = flip * (from[i].y - c0.y);
      const qx = to[i].x - c1.x, qy = to[i].y - c1.y;
      a += px * qx + py * qy;
      b += px * qy - py * qx;
    }
    const t = Math.atan2(b, a);
    const cos = Math.cos(t), sin = Math.sin(t);
    const map = (p: Pt): Pt => {
      const x = p.x - c0.x, y = flip * (p.y - c0.y);
      return { x: c1.x + cos * x - sin * y, y: c1.y + sin * x + cos * y };
    };
    let miss = 0;
    for (let i = 0; i < n; i++) {
      const q = map(from[i]);
      miss += (q.x - to[i].x) ** 2 + (q.y - to[i].y) ** 2;
    }
    return { map, miss };
  };
  if (n < 2) return (p) => ({ x: p.x + c1.x - c0.x, y: p.y + c1.y - c0.y });
  const turned = fit(1);
  const mirrored = fit(-1);
  const tolerance = 1e-9 * (1 + turned.miss + mirrored.miss);
  if (mirrored.miss < turned.miss - tolerance) return mirrored.map;
  if (turned.miss < mirrored.miss - tolerance) return turned.map;
  // (a turn and a mirror fitting alike - a straight structure: with equal evidence, the words stay where the chemist put them - the one that moves them least)
  return (p) => {
    const a = turned.map(p);
    const b = mirrored.map(p);
    return Math.hypot(b.x - p.x, b.y - p.y) < Math.hypot(a.x - p.x, a.y - p.y) ? b : a;
  };
}

/**
 * `next` with each caption that belongs to a structure where the edit from
 * `before` left its structure: carried as its structure was moved, turned
 * or turned over - unless the edit moved the words themselves; tied to
 * another atom of its structure where the one it named is gone; deleted
 * with its structure.
 */
export function tiedCaptionsSettled<T extends Page>(next: T, before: Page | undefined): T {
  if (!next.captions?.some((c) => c.of)) return next;
  if (before && next.model.atoms === before.model.atoms && next.molecules3d === before.molecules3d && next.captions === before.captions) return next;
  const atomsNow = new Map(next.model.atoms.map((a) => [a.id, a]));
  const atomsWere = new Map((before?.model.atoms ?? []).map((a) => [a.id, a]));
  const molsNow = new Map((next.molecules3d ?? []).map((m) => [m.id, m]));
  const molsWere = new Map((before?.molecules3d ?? []).map((m) => [m.id, m]));
  const wordsWere = new Map((before?.captions ?? []).map((c) => [c.id, c]));
  let by: Map<number, number[]> | undefined;
  let changed = false;
  const out: Caption[] = [];
  for (const c of next.captions) {
    if (!c.of) {
      out.push(c);
      continue;
    }
    const was = wordsWere.get(c.id);
    // (moved by the edit itself - dragged alone, or with what was selected: where it was put)
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
    if (!still || !before || !atomsWere.has(anchor)) {
      // (new words, or put somewhere: kept where they are - free if the atom they name is not drawn)
      if (there) out.push(c);
      else {
        changed = true;
        const { of: _of, ...free } = c;
        out.push(free);
      }
      continue;
    }
    by ??= neighbours(before.model.bonds);
    const kin = [...structureOf(before.model.bonds, anchor, by)].filter((id) => atomsNow.has(id));
    // (its structure gone: the words with it)
    if (!kin.length) {
      changed = true;
      continue;
    }
    const from = kin.map((id) => atomsWere.get(id)!);
    const to = kin.map((id) => atomsNow.get(id)!);
    const moved = from.some((a, i) => a.x !== to[i].x || a.y !== to[i].y);
    // (the atom it named gone: the nearest of its structure left)
    const held = there ? anchor : kin.reduce((best, id) => (dist(atomsWere.get(id)!, atomsWere.get(anchor)!) < dist(atomsWere.get(best)!, atomsWere.get(anchor)!) ? id : best), kin[0]);
    if (!moved && held === anchor) {
      out.push(c);
      continue;
    }
    changed = true;
    const at = moved ? rigidFit(from, to)(c) : c;
    out.push({ ...c, x: at.x, y: at.y, of: { atom: held } });
  }
  return changed ? { ...next, captions: out } : next;
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

/** Where words put under the structure the atom `id` is in begin: its middle across, a bond's length under its lowest atom. */
export function underStructure(page: Page, id: number): Pt | null {
  const atoms = structureOf(page.model.bonds, id);
  const at = page.model.atoms.filter((a) => atoms.has(a.id));
  if (!at.length) return null;
  const xs = at.map((a) => a.x);
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: Math.min(...at.map((a) => a.y)) - NOMINAL_BOND_LENGTH };
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
