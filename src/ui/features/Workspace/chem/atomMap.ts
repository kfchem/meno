import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import type { Molecule, ParsedAtom, ParsedBond } from "../../../../lib/chem/molecule";
import { writeMolfile3d } from "../../../../lib/chem/molWriter";
import { bondChanges, type ReactionMap } from "../../../../lib/chem/reactionMap";
import { arrowEnds, reactionMeant, reactionRoles } from "../../../../lib/chem/reactionScheme";
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

/**
 * Whether an arrow's menu has its atom map: where it means a reaction
 * (`reactionMeant`) and has one drawn on either side; or where it holds a
 * map made before it came to mean none - said so, to be taken off.
 */
export function mapOffered(arrow: Pick<Arrow, "atomMap"> & Partial<Pick<Arrow, "kind" | "heads">>, sides: { reactants: readonly unknown[]; products: readonly unknown[] }): boolean {
  if (reactionMeant(arrow) !== true) return !!arrow.atomMap;
  return sides.reactants.length > 0 && sides.products.length > 0;
}

/** Why no atom map is made of an arrow, in a sentence - or null where it means a reaction. */
export function noMapSaid(arrow: Partial<Pick<Arrow, "kind" | "heads">>): string | null {
  const meant = reactionMeant(arrow);
  return meant === true ? null : `No atom map for this arrow: ${meant.why}.`;
}

/** A structure in 3D for mapping, and the drawn atom each of its atoms is (none for a hydrogen made for it). */
export type Side3D = { molecule: Molecule; drawnFrom: (number | null)[] };

/**
 * What an arrow keeps of a mapped reaction: each side in 3D as one
 * structure, its atoms' drawn atoms, and the complete maps, best first - or,
 * where none is complete, the partial ones (`complete` false: each product
 * atom with none -1), which show the atoms that pair and name the rest. Of
 * maps that pair the heavy atoms alike, only the
 * first is kept: they show the same numbers, and its hydrogens are those
 * ACCeL ranked first.
 */
export function keptMap(model: Model, result: ReactionMap, reactants: readonly Side3D[], products: readonly Side3D[]): ArrowAtomMap {
  const drawn = (sides: readonly Side3D[]) => sides.flatMap((s) => s.drawnFrom);
  const reactantFrom = drawn(reactants);
  const productFrom = drawn(products);
  const ids = [...reactantFrom, ...productFrom].filter((id): id is number => id != null);
  // (maps that pair the heavy atoms alike - its numbers - differ only in which of an atom's like hydrogens is which:
  //  of those, the first in ACCeL's order stands, so that "Other map" steps through what the numbers show)
  const heavy = (m: readonly number[]) => m.flatMap((r, j) => (result.product.atoms[j].el === "H" ? [] : [`${j}:${r}`])).join(",");
  const seen = new Set<string>();
  const anyComplete = result.complete.some(Boolean);
  const maps = result.maps
    .filter((m, i) => {
      if (anyComplete && !result.complete[i]) return false;
      const k = heavy(m);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, MAPS_KEPT);
  const plain = (m: Molecule): Omit<ArrowAtomMap["reactant"], "drawnFrom"> => ({
    atoms: m.atoms.map((a) => ({ el: a.el, x: a.x, y: a.y, z: a.z, ...(a.charge ? { charge: a.charge } : {}) })),
    bonds: m.bonds.map((b) => ({ a1: b.a1, a2: b.a2, order: b.order })),
  });
  return {
    drawnAs: signatureOf(model, ids),
    reactant: { ...plain(result.reactant), drawnFrom: reactantFrom },
    product: { ...plain(result.product), drawnFrom: productFrom },
    maps,
    complete: anyComplete && maps.length > 0,
    chosen: 0,
    shown: true,
  };
}

/**
 * How an arrow's map stands to the drawing: none made; made of an arrow
 * that no longer means a reaction (`refused`: kept, never shown); made of a drawing
 * changed since; partial - made with atoms that do not all map, shown, and
 * not used where one to one is needed; or ready to show and use.
 */
export function mapStanding(arrow: Pick<Arrow, "atomMap"> & Partial<Pick<Arrow, "kind" | "heads">>, model: Model): "none" | "refused" | "changed" | "incomplete" | "ready" {
  const m = arrow.atomMap;
  if (!m) return "none";
  // (made of an arrow that has since come to mean no reaction - crossed out, retrosynthetic, headless, two-headed: kept, said, never shown)
  if (reactionMeant(arrow) !== true) return "refused";
  const ids = [...m.reactant.drawnFrom, ...m.product.drawnFrom].filter((id): id is number => id != null);
  if (signatureOf(model, ids) !== m.drawnAs) return "changed";
  return m.complete ? "ready" : "incomplete";
}

/** Why a map cannot be written in 3D as a reaction - partial, or of the drawing before an edit, or none - or null where it can. */
export function exportRefusal(map: ArrowAtomMap | undefined, model: Model, arrow: Partial<Pick<Arrow, "kind" | "heads">> = {}): string | null {
  const standing = map ? mapStanding({ atomMap: map, ...arrow }, model) : "none";
  // (the map of an arrow that no longer means a reaction: not written, whatever it was made as)
  if (standing === "refused") {
    const meant = reactionMeant(arrow, "export");
    return `No 3D reaction for this arrow: ${meant === true ? "it means no reaction" : meant.why}.`;
  }
  if (standing === "incomplete") return "Every atom must be mapped to write the reaction in 3D, and this map is partial.";
  return standing === "ready" ? null : "The reaction has no atom map of it as it is drawn.";
}

/** Whether a map's standing has it show on the drawing: ready, or partial. */
export const mapShows = (standing: ReturnType<typeof mapStanding>) => standing === "ready" || standing === "incomplete";

/** Which reactant atoms a map pairs with a product atom. */
function pairedOf(map: ArrowAtomMap, mapping: readonly number[]): Set<number> {
  return new Set(map.complete ? map.reactant.atoms.map((_, i) => i) : mapping.filter((r) => r >= 0));
}

/**
 * The atoms a partial map does not pair, by element and side - each heavy
 * atom by its element, each counted, in Hill's order ("C, 2 H, O") - in words, of
 * `sides` ("the reactants" and "the products"; "Before" and "After"): none,
 * for a complete map.
 */
export function unpairedSaid(map: ArrowAtomMap, sides: readonly [string, string]): string | null {
  const mapping = map.maps[map.chosen] ?? map.maps[0];
  if (map.complete || !mapping) return null;
  const paired = pairedOf(map, mapping);
  const words = (els: string[]) => {
    const n = new Map<string, number>();
    for (const el of els) n.set(el, (n.get(el) ?? 0) + 1);
    // (in Hill's order: with carbon, C, H, then the rest alphabetically; without, all alphabetically)
    const rank = (el: string) => (n.has("C") ? (el === "C" ? "0" : el === "H" ? "1" : `2${el}`) : el);
    return [...n].sort(([p], [q]) => (rank(p) < rank(q) ? -1 : 1)).map(([el, k]) => (k > 1 ? `${k} ${el}` : el)).join(", ");
  };
  const before = map.reactant.atoms.flatMap((a, i) => (paired.has(i) ? [] : [a.el]));
  const after = map.product.atoms.flatMap((a, j) => (mapping[j] >= 0 ? [] : [a.el]));
  const said = [before.length ? `${words(before)} of ${sides[0]}` : null, after.length ? `${words(after)} of ${sides[1]}` : null].filter(Boolean);
  return said.length ? `Not mapped: ${said.join("; ")}` : null;
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
  // (a partial map: only the atoms it pairs numbered, and no bond's change told - which bonds change is the whole map's to say)
  const paired = pairedOf(map, mapping);
  const number = beforeNumbers(map);
  map.reactant.atoms.forEach((a, i) => {
    const id = map.reactant.drawnFrom[i];
    if (a.el === "H" || id == null || !paired.has(i) || !number[i]) return;
    numbers.set(id, number[i]);
  });
  mapping.forEach((r, j) => {
    const id = map.product.drawnFrom[j];
    if (id == null || r < 0 || map.product.atoms[j].el === "H" || !number[r]) return;
    numbers.set(id, number[r]);
  });
  if (!map.complete) return { numbers, centres };
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

/**
 * Each of Before's atoms' numbers, by its atom, 0 for none: those renumbered
 * (`numbers`), on a complete map; else its drawn heavy atoms one after
 * another as it holds them - the numbers the drawing shows - then the rest,
 * its hydrogens, after them in the same order. Of a partial map, only those
 * it pairs.
 */
export function beforeNumbers(map: ArrowAtomMap): number[] {
  const n = map.reactant.atoms.length;
  if (map.complete && map.numbers?.length === n) return [...map.numbers];
  const out = new Array<number>(n).fill(0);
  const mapping = map.maps[map.chosen] ?? map.maps[0];
  if (!mapping) return out;
  const paired = new Set(map.complete ? map.reactant.atoms.map((_, i) => i) : mapping.filter((r) => r >= 0));
  const drawnHeavy = (i: number) => map.reactant.atoms[i].el !== "H" && map.reactant.drawnFrom[i] != null;
  let next = 1;
  for (let i = 0; i < n; i++) if (drawnHeavy(i) && paired.has(i)) out[i] = next++;
  for (let i = 0; i < n; i++) if (!drawnHeavy(i) && paired.has(i)) out[i] = next++;
  return out;
}

/**
 * Before's numbers by the drawing's order (*Renumber atoms*, docs/ATOM-MAPPING.md):
 * its heavy atoms as they are drawn - in the order of the drawing's atoms -
 * then each heavy atom's hydrogens, in its turn; an atom drawn by none
 * after those that are, as it was. The one place the order is chosen.
 */
export function renumbered(map: ArrowAtomMap, drawnOrder: ReadonlyMap<number, number>): number[] {
  const atoms = map.reactant.atoms;
  const n = atoms.length;
  const around: number[][] = atoms.map(() => []);
  for (const b of map.reactant.bonds) {
    around[b.a1].push(b.a2);
    around[b.a2].push(b.a1);
  }
  const place = (i: number) => {
    const id = map.reactant.drawnFrom[i];
    return id != null && drawnOrder.has(id) ? drawnOrder.get(id)! : Infinity;
  };
  const heavy = atoms.map((_, i) => i).filter((i) => atoms[i].el !== "H");
  // (by place, then by their own order - two with no place alike, compared so: Infinity less Infinity is no number)
  const by = (key: (i: number) => number) => (p: number, q: number) => (key(p) === key(q) ? p - q : key(p) - key(q));
  heavy.sort(by(place));
  const number = new Array<number>(n).fill(0);
  heavy.forEach((i, k) => (number[i] = k + 1));
  // (each H after the heavy atoms, by the number of the atom it is on; one on none, or on another H, last)
  const on = (h: number) => around[h].map((x) => number[x]).find((v) => v > 0) ?? Infinity;
  const hydrogens = atoms.map((_, i) => i).filter((i) => atoms[i].el === "H");
  hydrogens.sort(by(on));
  hydrogens.forEach((i, k) => (number[i] = heavy.length + k + 1));
  return number;
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
  // (each atom written at its number's place: the reactants' numbering, as the drawing and 3D show it)
  const number = beforeNumbers(map);
  const at = (i: number) => number[i] - 1;
  const reactant = {
    atoms: (() => {
      const out: ParsedAtom[] = new Array(map.reactant.atoms.length);
      map.reactant.atoms.forEach((a, i) => (out[at(i)] = { ...a }));
      return out;
    })(),
    bonds: map.reactant.bonds.map((b) => ({ a1: at(b.a1), a2: at(b.a2), order: b.order })),
  };
  const atoms: ParsedAtom[] = new Array(map.reactant.atoms.length);
  mapping.forEach((r, j) => (atoms[at(r)] = { ...map.product.atoms[j] }));
  const bonds: ParsedBond[] = map.product.bonds.map((b) => ({ a1: at(mapping[b.a1]), a2: at(mapping[b.a2]), order: b.order }));
  const record = (name: string, as: readonly ParsedAtom[], bs: readonly ParsedBond[]) =>
    writeMolfile3d(
      as.map((a) => ({ el: a.el, x: a.x, y: a.y, z: a.z, ...(a.charge ? { charge: a.charge } : {}) })),
      bs.map((b) => ({ a1: b.a1, a2: b.a2, order: b.order })),
      { title: `${title} ${name}` },
    ) + "$$$$\n";
  return record("reactant", reactant.atoms, reactant.bonds) + record("product", atoms, bonds);
}
