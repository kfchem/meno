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
import { implicitHydrogens, valenceOrder } from "../../../../lib/chem/molecule";
import type { WriterModel } from "../../../../lib/chem/molWriter";
import { unsureStereo, wedgesForFlat, type DrawnAtom, type DrawnBond } from "../../../../lib/layout/drawn";
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
  const el = new Map(model.atoms.map((a) => [a.id, a.el]));
  for (const b of model.bonds) {
    // (a dative bond lends a pair, and takes no H from either end - but a
    // carbon lending it; nor does a coordination or a hydrogen bond)
    sum.set(b.a, (sum.get(b.a) ?? 0) + valenceOrder(b, el.get(b.a)));
    sum.set(b.b, (sum.get(b.b) ?? 0) + valenceOrder(b, el.get(b.b)));
  }
  return new Map(
    model.atoms.map((a) => [
      a.id,
      !isElementSymbol(a.el) || a.abbrev
        ? 0
        : a.valence != null
          ? // (a valence a file sets: what the bonds leave of it)
            Math.max(0, a.valence - (sum.get(a.id) ?? 0))
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
        ...(b.stereo === "wavy" ? { either: true } : {}),
      },
    ];
  });
  return { atoms, bonds, index };
}

/**
 * The structure for a reader that knows only wedges: as it is, and for each
 * centre a perspective drawing shows, a wedge that says it - on a bond out
 * of it, or on an H added for the purpose (after every atom there is, so
 * the atoms there are keep their places in a MOL file).
 */
export function forFlatReaders(model: Model): WriterModel {
  if (!model.atoms.some((a) => a.z != null)) return model;
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
export function unsureOf(model: Model, kept?: StructureValues<Unsure>): { atoms: Set<number>; bonds: Set<number> } {
  // (a structure at a time, what was found in each kept while it is the same - see byStructure)
  const found = kept ? byStructure(model, kept, unsureIn) : [unsureIn(model)];
  return { atoms: new Set(found.flatMap((f) => f.atoms)), bonds: new Set(found.flatMap((f) => f.bonds)) };
}

/** The stereocentres and double bonds a drawing shows only by luck, by id; see `unsureOf`. */
export type Unsure = { atoms: number[]; bonds: number[] };

function unsureIn(model: Model): Unsure {
  if (!model.bonds.some((b) => b.stereo === "up" || b.stereo === "down" || b.order === 2)) return { atoms: [], bonds: [] };
  const { atoms, bonds } = drawingOf(model);
  const found = unsureStereo(atoms, bonds);
  // (the bonds as drawingOf takes them: those between atoms there are)
  const ids = new Set(model.atoms.map((a) => a.id));
  const kept = model.bonds.filter((b) => ids.has(b.a) && ids.has(b.b));
  return { atoms: found.atoms.map((i) => model.atoms[i].id), bonds: found.bonds.map((i) => kept[i].id) };
}
