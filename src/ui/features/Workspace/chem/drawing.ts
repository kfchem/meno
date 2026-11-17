/**
 * The structure as a drawing, for what reads its stereochemistry out of it
 * (lib/layout/drawn): each atom where it is drawn, with its depth where the
 * structure is in perspective and the H it carries undrawn, each bond with
 * its wedge narrow at the end the drawing puts it.
 *
 * And the structure as a reader that knows only wedges needs it - a MOL
 * file, a plugin: a cage drawn in perspective shows its stereochemistry by the
 * drawing itself, which such a reader cannot see, so it is given the wedges
 * (and H) that say it.
 */
import { wedgeNarrowAtom } from "../../../../lib/chem/layout2d";
import { implicitHydrogens, setValenceOrder, valenceOrder } from "../../../../lib/chem/molecule";
import type { WriterModel } from "../../../../lib/chem/molWriter";
import { unsureStereo, wedgesForFlat, type DrawnAtom, type DrawnBond } from "../../../../lib/layout/drawn";
import { recognisedSaid } from "../../../../lib/layout/recognised";
import { READ_AS_HAWORTH, READ_IN_PERSPECTIVE } from "../../../../lib/chem/perception/projection/recognise";
import { isElementSymbol } from "../../../../lib/roles/molblock";
import type { Bond, Model } from "../store/types";
import { byStructure, type StructureValues } from "../utils/byStructure";
import { greatest } from "../../../../lib/chem/lists";

/** How many bonds each atom has, as the drawing counts them to say which end of a wedge is narrow. */
export function degrees(bonds: readonly Pick<Bond, "a" | "b">[]): Map<number, number> {
  const degree = new Map<number, number>();
  for (const b of bonds) {
    degree.set(b.a, (degree.get(b.a) ?? 0) + 1);
    degree.set(b.b, (degree.get(b.b) ?? 0) + 1);
  }
  return degree;
}

/** Which end of a wedged bond is narrow: its stereocentre (`Bond.narrow`; none given, the end with more bonds by `degree`). */
export function narrowEnd(b: Pick<Bond, "a" | "b" | "narrow">, degree: Map<number, number>): number {
  return wedgeNarrowAtom({ a1: b.a, a2: b.b, narrow: b.narrow }, degree);
}

/** Whether a bond is drawn narrow at one end: a wedge or hashed wedge, or a ring's bond in perspective toward the viewer. */
export function isWedge(b: Pick<Bond, "stereo" | "display">): boolean {
  return b.stereo === "up" || b.stereo === "down" || b.display === "wedge";
}

/**
 * The model with every wedge's narrow end given by atom (`Bond.narrow`), so
 * that a bond added or taken away beside a wedge does not move it to the
 * other end, as the end with more bonds, counted again after each edit,
 * did. A wedge whose narrow end is one of its atoms keeps it. Any other -
 * one the edit made, or whose narrow atom the edit took from it - is narrow
 * where the drawing had it before the edit (`before`, the bond by id) while
 * that is still one of its ends, and otherwise at its end with more bonds.
 */
export function wedgesHeld(model: Model, before?: Model): Model {
  // (no bond changed: none counted otherwise, so none read otherwise - an atom dragged)
  if (model.bonds === before?.bonds) return model;
  const loose = (b: Bond) => isWedge(b) && b.narrow !== b.a && b.narrow !== b.b;
  if (!model.bonds.some(loose)) return model;
  const now = degrees(model.bonds);
  const was = before ? degrees(before.bonds) : now;
  const old = new Map((before?.bonds ?? []).map((b) => [b.id, b]));
  const bonds = model.bonds.map((b) => {
    if (!loose(b)) return b;
    const p = old.get(b.id);
    const kept = p && isWedge(p) ? narrowEnd(p, was) : undefined;
    return { ...b, narrow: kept === b.a || kept === b.b ? kept : narrowEnd(b, now) };
  });
  return { ...model, bonds };
}

/** The H an atom carries and the drawing does not show: by its valence, for an element; none for a label. */
export function undrawnHydrogens(model: Model): Map<number, number> {
  const sum = new Map<number, number>();
  // (and toward a valence a file sets: a metal's coordination bonds counted, as the file counts them - lib/chem/molecule `setValenceOrder`)
  const setSum = new Map<number, number>();
  const el = new Map(model.atoms.map((a) => [a.id, a.el]));
  for (const b of model.bonds) {
    // (a dative bond lends a pair, and takes no H from either end - but a
    // carbon lending it; nor does a coordination or a hydrogen bond)
    sum.set(b.a, (sum.get(b.a) ?? 0) + valenceOrder(b, el.get(b.a)));
    sum.set(b.b, (sum.get(b.b) ?? 0) + valenceOrder(b, el.get(b.b)));
    setSum.set(b.a, (setSum.get(b.a) ?? 0) + setValenceOrder(b, el.get(b.a)));
    setSum.set(b.b, (setSum.get(b.b) ?? 0) + setValenceOrder(b, el.get(b.b)));
  }
  return new Map(
    model.atoms.map((a) => [
      a.id,
      !isElementSymbol(a.el) || a.abbrev
        ? 0
        : a.valence != null
          ? // (a valence a file sets: what the bonds leave of it)
            Math.max(0, a.valence - (setSum.get(a.id) ?? 0))
          : implicitHydrogens(a.el, sum.get(a.id) ?? 0, a.charge ?? 0, a.radical),
    ]),
  );
}

/** The structure as lib/layout/drawn reads it, atoms in the model's order. */
export function drawingOf(model: Model): { atoms: DrawnAtom[]; bonds: DrawnBond[]; index: Map<number, number> } {
  const index = new Map(model.atoms.map((a, i) => [a.id, i]));
  const hs = undrawnHydrogens(model);
  const degree = degrees(model.bonds);
  const atoms: DrawnAtom[] = model.atoms.map((a) => ({
    x: a.x,
    y: a.y,
    el: a.el,
    hs: hs.get(a.id) ?? 0,
    ...(a.charge ? { charge: a.charge } : {}),
    ...(a.isotope ? { isotope: a.isotope } : {}),
    ...(a.radical ? { radical: a.radical } : {}),
    ...(a.z != null ? { z: a.z } : {}),
    ...(a.stereoCentre ? { centre: true } : {}),
  }));
  const bonds: DrawnBond[] = model.bonds.flatMap((b) => {
    const a = index.get(b.a);
    const c = index.get(b.b);
    if (a == null || c == null) return [];
    const wedged = b.stereo === "up" || b.stereo === "down";
    return [
      {
        a,
        b: c,
        order: b.order,
        ...(wedged ? { wedge: { narrow: index.get(narrowEnd(b, degree))!, stereo: b.stereo as "up" | "down" } } : {}),
        // (either configuration: a wavy bond's at its ends, and a double bond's own - a MOL file's crossed one, V2000's 3, V3000's
        //  CFG=2 - whose cis or trans is not known, however its ends happen to lie)
        ...(b.stereo === "wavy" || (b.order === 2 && b.stereo === "either") ? { either: true } : {}),
        // (a ring bond drawn bold, or as a ring in perspective's near edge: the edge that is the nearer)
        ...(b.order === 1 && (b.display === "bold" || b.display === "wedge") ? { bold: true } : {}),
        // (a hydrogen bond: kept, in its place, and read as no bond of the structure)
        ...(b.hydrogen ? { hydrogen: true } : {}),
      },
    ];
  });
  return { atoms, bonds, index };
}

/** Whether any bond of the drawing closes a ring (a union-find over its bonds: one pass, no ring perceived). */
function holdsRing(model: Model): boolean {
  const up = new Map<number, number>();
  const root = (x: number): number => {
    let r = x;
    while (up.has(r) && up.get(r) !== r) r = up.get(r)!;
    up.set(x, r);
    return r;
  };
  for (const b of model.bonds) {
    if (b.a === b.b) continue;
    const [p, q] = [root(b.a), root(b.b)];
    if (p === q) return true;
    up.set(p, q);
  }
  return false;
}

/**
 * The structure for a reader that knows only wedges: as it is, and for each
 * centre a perspective drawing shows, a wedge that says it - on a bond out
 * of it, or on an H added for the purpose (after every atom there is, so
 * the atoms there are keep their places in a MOL file). A ring drawn in
 * perspective with no depth, recognised as one (lib/layout/recognised), is
 * such a drawing too: a drawing with no depth and no ring is passed on as
 * it is, unread. `recognised` false leaves those out, for a reader that
 * asks nothing of stereochemistry (the valence marks): reading every ring
 * of a page is not done on the page's own thread for nothing.
 */
export function forFlatReaders(model: Model, recognised = true): WriterModel {
  if (!model.atoms.some((a) => a.z != null) && !(recognised && holdsRing(model))) return model;
  const { atoms, bonds } = drawingOf(model);
  const flat = wedgesForFlat(atoms, bonds);
  if (!flat.wedges.length) return model;
  const ids = model.atoms.map((a) => a.id);
  let next = Math.max(0, greatest(ids), greatest(model.bonds.map((b) => b.id))) + 1;
  const outAtoms = [...model.atoms];
  // (each wedge there is held where it is narrow, before an H is added beside it)
  const outBonds: Bond[] = [...wedgesHeld(model).bonds];
  const hydrogen = new Map<number, number>();
  for (const h of flat.hydrogens) {
    const id = next++;
    outAtoms.push({ id, x: h.at.x, y: h.at.y, r: 0.9, el: "H" });
    outBonds.push({ id: next++, a: ids[h.on], b: id, order: 1 });
    hydrogen.set(h.on, id);
  }
  for (const w of flat.wedges) {
    const from = ids[w.from];
    const to = w.to === -1 ? hydrogen.get(w.from)! : ids[w.to];
    const k = outBonds.findIndex((b) => (b.a === from && b.b === to) || (b.a === to && b.b === from));
    if (k < 0) continue;
    const b = outBonds[k];
    outBonds[k] = { ...b, stereo: w.stereo, narrow: from };
  }
  return { atoms: outAtoms, bonds: outBonds };
}

/**
 * The stereocentres and double bonds the drawing shows only by luck, by id
 * (lib/layout/drawn `unsureStereo`): marked on the canvas, as a valence
 * problem is, so that none is shown as if it were certain (the maintainer,
 * 2026-10-11).
 */
export function unsureOf(model: Model, kept?: StructureValues<Unsure>): { atoms: Set<number>; bonds: Set<number>; said: Map<number, string> } {
  // (a structure at a time, what was found in each kept while it is the same - see byStructure)
  const found = kept ? byStructure(model, kept, unsureIn) : [unsureIn(model)];
  return { atoms: new Set(found.flatMap((f) => f.atoms)), bonds: new Set(found.flatMap((f) => f.bonds)), said: new Map(found.flatMap((f) => f.said ?? [])) };
}

/**
 * The stereocentres and double bonds a drawing shows only by luck, by id; see `unsureOf` - and, for an atom of a ring drawn in perspective
 * that is not read (lib/layout/recognised), what its mark says: why, and what to draw.
 */
export type Unsure = { atoms: number[]; bonds: number[]; said?: [number, string][] };

function unsureIn(model: Model): Unsure {
  const wedged = model.bonds.some((b) => b.stereo === "up" || b.stereo === "down" || b.order === 2);
  if (!wedged && !holdsRing(model)) return { atoms: [], bonds: [] };
  const { atoms, bonds } = drawingOf(model);
  const found = wedged ? unsureStereo(atoms, bonds) : { atoms: [], bonds: [] };
  // (the bonds as drawingOf takes them: those between atoms there are)
  const ids = new Set(model.atoms.map((a) => a.id));
  const kept = model.bonds.filter((b) => ids.has(b.a) && ids.has(b.b));
  // (a ring taken for one drawn in perspective but not read: the unread mark on each of its atoms that carries a group and could be a
  //  centre, its words on it - "No R or S:" and why, as the R or S asked of it says - as a crossed wedge's is; nothing is silent)
  const unread = new Map([...recognisedSaid(atoms, bonds)].filter(([, words]) => words !== READ_IN_PERSPECTIVE && words !== READ_AS_HAWORTH));
  const around = (i: number) => bonds.flatMap((b) => (b.a === i ? [b.b] : b.b === i ? [b.a] : []));
  const marked = [...unread.keys()].filter((i) => atoms[i].hs <= 1 && around(i).some((n) => !unread.has(n)) && !found.atoms.includes(i));
  return {
    atoms: [...found.atoms, ...marked].map((i) => model.atoms[i].id),
    bonds: found.bonds.map((i) => kept[i].id),
    ...(marked.length ? { said: marked.map((i): [number, string] => [model.atoms[i].id, `No R or S: ${unread.get(i)!}.`]) } : {}),
  };
}
