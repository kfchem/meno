import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import type { Molecule, ParsedAtom, ParsedBond } from "../../../../lib/chem/molecule";
import { writeMolfile3d } from "../../../../lib/chem/molWriter";
import { bondChanges, type ReactionMap } from "../../../../lib/chem/reactionMap";
import { arrowEnds, reactionRoles } from "../../../../lib/chem/reactionScheme";
import type { Arrow, ArrowAtomMap, Model, Plus } from "../store/types";
import { signatureOf } from "../utils/drawnLink";

/**
 * A drawn reaction's atom map (docs/ATOM-MAPPING.md, *On a drawn scheme*):
 * which structures an arrow's reaction is, the map kept on the arrow, and
 * what it shows on the drawing - a number by each heavy atom, the same on
 * either side, and the bonds made, broken or changed in order marked as
 * reacting centres. The map itself is the full one, every hydrogen in it,
 * worked out on the structures in 3D; the numbers are read off it.
 */

/** How far apart two structures on one side of an arrow may stand, room for a "+" between them, and still be one side: in bonds. */
const SIDE_GAP_BONDS = 4;
/** How near the arrow's tail or point the nearest structure must be: in bonds (as an RXN file takes a reaction, chem/reactionFile). */
const NEAR_BONDS = 5;
/** How many maps, best first, are kept for "Other map". */
export const MAPS_KEPT = 100;

type Box = { x0: number; y0: number; x1: number; y1: number };
const boxOf = (model: Pick<Model, "atoms">, ids: readonly number[]): Box => {
  const inside = new Set(ids);
  const xs: number[] = [];
  const ys: number[] = [];
  for (const a of model.atoms)
    if (inside.has(a.id)) {
      xs.push(a.x);
      ys.push(a.y);
    }
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
};
const gap = (p: Box, q: Box) => Math.hypot(Math.max(0, q.x0 - p.x1, p.x0 - q.x1), Math.max(0, q.y0 - p.y1, p.y0 - q.y1));
const pointGap = (b: Box, p: { x: number; y: number }) => Math.hypot(Math.max(0, b.x0 - p.x, p.x - b.x1), Math.max(0, b.y0 - p.y, p.y - b.y1));

/**
 * The structures an arrow's reaction is: its reactants, the structure
 * nearest its tail and those standing on from it one after another away
 * from the arrow (a "+" between them); its products, likewise from its
 * point. Reagents written over or under it are not of it. By atom id, each
 * structure's atoms; empty sides where nothing stands near.
 */
export function reactionOf(model: Model, arrow: Arrow, pluses: readonly Plus[]): { reactants: number[][]; products: number[][] } {
  const roles = reactionRoles(model, arrow, pluses, NOMINAL_BOND_LENGTH);
  const { from, to } = arrowEnds(arrow);
  const side = (pieces: number[][], end: { x: number; y: number }): number[][] => {
    const boxes = pieces.map((ids) => ({ ids, box: boxOf(model, ids) }));
    const near = NEAR_BONDS * NOMINAL_BOND_LENGTH;
    const taken: typeof boxes = [];
    const first = boxes.filter((b) => pointGap(b.box, end) < near).sort((p, q) => pointGap(p.box, end) - pointGap(q.box, end))[0];
    if (!first) return [];
    taken.push(first);
    for (;;) {
      const next = boxes
        .filter((b) => !taken.includes(b) && taken.some((t) => gap(t.box, b.box) < SIDE_GAP_BONDS * NOMINAL_BOND_LENGTH))
        .sort((p, q) => pointGap(p.box, end) - pointGap(q.box, end))[0];
      if (!next) break;
      taken.push(next);
    }
    // (in the order they are drawn along the arrow, as reactionRoles gives them)
    return pieces.filter((ids) => taken.some((t) => t.ids === ids));
  };
  return { reactants: side(roles.reactants, from), products: side(roles.products, to) };
}

/** A structure in 3D for mapping, and the drawn atom each of its atoms is (none for a hydrogen made for it). */
export type Side3D = { molecule: Molecule; drawnFrom: (number | null)[] };

/**
 * What an arrow keeps of a mapped reaction: each side in 3D as one
 * structure, its atoms' drawn atoms, and the complete maps, best first - a
 * reaction whose atoms do not all map keeps none (`complete` false).
 */
export function keptMap(model: Model, result: ReactionMap, reactants: readonly Side3D[], products: readonly Side3D[]): ArrowAtomMap {
  const drawn = (sides: readonly Side3D[]) => sides.flatMap((s) => s.drawnFrom);
  const reactantFrom = drawn(reactants);
  const productFrom = drawn(products);
  const ids = [...reactantFrom, ...productFrom].filter((id): id is number => id != null);
  const maps = result.maps.filter((_, i) => result.complete[i]).slice(0, MAPS_KEPT);
  const plain = (m: Molecule): Omit<ArrowAtomMap["reactant"], "drawnFrom"> => ({
    atoms: m.atoms.map((a) => ({ el: a.el, x: a.x, y: a.y, z: a.z, ...(a.charge ? { charge: a.charge } : {}) })),
    bonds: m.bonds.map((b) => ({ a1: b.a1, a2: b.a2, order: b.order })),
  });
  return {
    drawnAs: signatureOf(model, ids),
    reactant: { ...plain(result.reactant), drawnFrom: reactantFrom },
    product: { ...plain(result.product), drawnFrom: productFrom },
    maps,
    complete: maps.length > 0,
    chosen: 0,
    shown: true,
  };
}

/** How an arrow's map stands to the drawing: none made; made of a drawing changed since; made with atoms that do not all map; or ready to show and use. */
export function mapStanding(arrow: Pick<Arrow, "atomMap">, model: Model): "none" | "changed" | "incomplete" | "ready" {
  const m = arrow.atomMap;
  if (!m) return "none";
  const ids = [...m.reactant.drawnFrom, ...m.product.drawnFrom].filter((id): id is number => id != null);
  if (signatureOf(model, ids) !== m.drawnAs) return "changed";
  return m.complete ? "ready" : "incomplete";
}

/**
 * What a ready map shows on the drawing: each heavy atom's number - the
 * reactants' numbered one after another as they stand in 3D, a product's
 * atom given its reactant atom's - and each bond's reacting centre, CTfile
 * Formats' code: 4 for one made or broken, 8 for one whose order changes.
 */
export function mapMarks(map: ArrowAtomMap, model: Pick<Model, "bonds">): { numbers: Map<number, number>; centres: Map<number, number> } {
  const numbers = new Map<number, number>();
  const mapping = map.maps[map.chosen] ?? map.maps[0];
  const centres = new Map<number, number>();
  if (!mapping) return { numbers, centres };
  const number = new Array<number>(map.reactant.atoms.length).fill(0);
  let next = 1;
  map.reactant.atoms.forEach((a, i) => {
    const id = map.reactant.drawnFrom[i];
    if (a.el === "H" || id == null) return;
    number[i] = next++;
    numbers.set(id, number[i]);
  });
  mapping.forEach((r, j) => {
    const id = map.product.drawnFrom[j];
    if (id == null || map.product.atoms[j].el === "H" || !number[r]) return;
    numbers.set(id, number[r]);
  });
  // the bonds' changes, in the reactants' numbering, back to the drawn bonds
  const changes = bondChanges(map.reactant as Molecule, map.product as Molecule, mapping);
  const productOf = new Array<number>(map.reactant.atoms.length).fill(-1);
  mapping.forEach((r, j) => (productOf[r] = j));
  const bondOf = (p: number | null, q: number | null) =>
    p == null || q == null ? undefined : model.bonds.find((b) => (b.a === p && b.b === q) || (b.a === q && b.b === p));
  const onReactant = (a1: number, a2: number) => bondOf(map.reactant.drawnFrom[a1], map.reactant.drawnFrom[a2]);
  const onProduct = (a1: number, a2: number) => bondOf(map.product.drawnFrom[productOf[a1]] ?? null, map.product.drawnFrom[productOf[a2]] ?? null);
  for (const c of changes.broken) {
    const b = onReactant(c.a1, c.a2);
    if (b) centres.set(b.id, 4);
  }
  for (const c of changes.formed) {
    const b = onProduct(c.a1, c.a2);
    if (b) centres.set(b.id, 4);
  }
  for (const c of changes.orderChanged) {
    for (const b of [onReactant(c.a1, c.a2), onProduct(c.a1, c.a2)]) if (b) centres.set(b.id, 8);
  }
  return { numbers, centres };
}

/** The drawn atoms a kept map is of: those its marks may be on. */
export function mapAtoms(map: ArrowAtomMap): Set<number> {
  return new Set([...map.reactant.drawnFrom, ...map.product.drawnFrom].filter((id): id is number => id != null));
}

/**
 * The reactants and the product in the reactants' numbering, in 3D, as one
 * SD file: two records, the reactants first, every atom of the second where
 * the same atom of the first is - for a calculation that goes from one to
 * the other (a nudged elastic band, QST2, an IRC's ends).
 */
export function mappedPairSdf(map: ArrowAtomMap, title: string): string {
  const mapping = map.maps[map.chosen] ?? map.maps[0];
  const reactant = map.reactant;
  const atoms: ParsedAtom[] = new Array(reactant.atoms.length);
  mapping.forEach((r, j) => (atoms[r] = { ...map.product.atoms[j] }));
  const bonds: ParsedBond[] = map.product.bonds.map((b) => ({ a1: mapping[b.a1], a2: mapping[b.a2], order: b.order }));
  const record = (name: string, as: readonly ParsedAtom[], bs: readonly ParsedBond[]) =>
    writeMolfile3d(
      as.map((a) => ({ el: a.el, x: a.x, y: a.y, z: a.z, ...(a.charge ? { charge: a.charge } : {}) })),
      bs.map((b) => ({ a1: b.a1, a2: b.a2, order: b.order })),
      { title: `${title} ${name}` },
    ) + "$$$$\n";
  return record("reactant", reactant.atoms, reactant.bonds) + record("product", atoms, bonds);
}
