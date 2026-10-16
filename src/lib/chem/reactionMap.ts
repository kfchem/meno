/**
 * A reaction's atom map, for calculation: every atom of the products paired
 * one to one with an atom of the reactants - hydrogens too, placed by
 * geometry, as E/Z, R/S and which face each side shows have them - so that
 * the products can be written in the reactants' atom numbering, as NEB,
 * QST3 and matching an IRC's ends need (docs/ATOM-MAPPING.md).
 *
 * The maps are worked out by ./accelMapper, ACCeL's mapper ported as it is.
 * This is how Meno hands it its structures and reads its answer:
 *
 * - The structures go in in 3D with every atom, hydrogens included: a 2D
 *   drawing is first given its 3D structure (Meno's own 3D generation),
 *   never mapped as drawn.
 * - Several structures on a side are set side by side as ACCeL's
 *   Modeler.incorporate sets them (the next past the last's far corner, 2 Å
 *   apart on each axis) and numbered on from one another, the first first:
 *   that combined numbering is the reactants' numbering.
 * - Every map comes out, in ACCeL's order, best first. A map that leaves an
 *   atom of either side out is said to be incomplete; the products are
 *   rewritten in the reactants' numbering only when every map is complete,
 *   as ACCeL's get_mapped does.
 *
 * A heavy-atom map, for showing on a drawing, is read off a full map
 * (`heavyAtomPairs`); it never stands in for one.
 */
import {
  Atoms,
  BondType,
  atomsMapNumbers,
  atomsMapped,
  incorporate,
  orderedMaps,
  type MapperTrace,
} from "./accelMapper";
import { implicitHydrogens, type Molecule, type ParsedAtom, type ParsedBond } from "./molecule";

export type ReactionMapInput = {
  reactants: readonly Molecule[];
  products: readonly Molecule[];
  /** Pairs known beforehand, as (reactant atom, product atom) in the combined numberings, from 0. */
  knownPairs?: readonly (readonly [number, number])[];
  /** ACCeL's terminal_first: start from terminal atoms; by itself past 256 atoms. */
  terminalFirst?: boolean;
  /** ACCeL's ordering options: a factor on each score, by its name (EVALUATION_KEYS). */
  options?: Partial<Record<string, number>>;
  trace?: MapperTrace;
};

/** A bond the reaction changes, in the reactants' numbering: its CTfile type before and after, 0 where there is none. */
export type BondChange = { a1: number; a2: number; before: number; after: number };

export type ReactionMap = {
  /** The reactants as one structure, as mapped: atoms in the reactants' numbering. */
  reactant: Molecule;
  /** The products as one structure, as mapped. */
  product: Molecule;
  /** Each map, best first: for each product atom, the reactant atom it is (from 0), -1 where none. */
  maps: number[][];
  /** Whether each map pairs every atom of both sides, one to one. */
  complete: boolean[];
  /** For each map, the product in the reactants' numbering - its atoms where theirs are, its own bonds; empty unless every map is complete. */
  productsInReactantNumbering: Molecule[];
  /** The first map's bond changes: made, broken, order changed. */
  changes: { formed: BondChange[]; broken: BondChange[]; orderChanged: BondChange[] };
};

export type ReactionMapRefusal = { error: "2d" | "no-atoms" | "python-error"; message: string };

/** A structure as ACCeL's read_mol reads a molfile: bond types 1 to 4 as they are, any other undefined. */
function toAtoms(m: Molecule): Atoms {
  const atoms = new Atoms();
  for (const a of m.atoms) atoms.getNewAtom([a.el, a.x, a.y, a.z]);
  atoms.initBonds();
  for (const b of m.bonds) {
    const t = b.order >= 1 && b.order <= 4 ? b.order : BondType.undefined;
    atoms.addBond(b.a1 + 1, b.a2 + 1, t);
  }
  return atoms;
}

/** Structures set side by side as one (Modeler.incorporate), with the original bonds' CTfile types, renumbered. */
function combine(ms: readonly Molecule[]): { atoms: Atoms; molecule: Molecule } {
  const atoms = toAtoms(ms[0]);
  for (const m of ms.slice(1)) incorporate(atoms, toAtoms(m));
  const molAtoms: ParsedAtom[] = [];
  const bonds: ParsedBond[] = [];
  let offset = 0;
  for (const m of ms) {
    m.atoms.forEach((a, i) => {
      const placed = atoms.at(offset + i);
      molAtoms.push({ ...a, x: placed.x, y: placed.y, z: placed.z });
    });
    for (const b of m.bonds) bonds.push({ ...b, a1: b.a1 + offset, a2: b.a2 + offset });
    offset += m.atoms.length;
  }
  return { atoms, molecule: { atoms: molAtoms, bonds } };
}

/** Whether every atom of the structures lies at z = 0. */
const flat = (ms: readonly Molecule[]) => ms.every((m) => m.atoms.every((a) => a.z === 0));

/**
 * Whether some atom of the structures is short of the hydrogens its valence
 * asks, as a drawn atom whose hydrogens are implicit is (an aromatic bond
 * counting one and a half).
 */
function shortOfHydrogens(ms: readonly Molecule[]): boolean {
  return ms.some((m) => {
    const sums = new Array(m.atoms.length).fill(0);
    for (const b of m.bonds) {
      const o = b.order === 4 ? 1.5 : b.order >= 1 && b.order <= 3 ? b.order : 0;
      sums[b.a1] += o;
      sums[b.a2] += o;
    }
    return m.atoms.some((a, i) => implicitHydrogens(a.el, Math.round(sums[i]), a.charge ?? 0, a.radical) > 0);
  });
}

/**
 * A 2D drawing, not structures in 3D: every atom flat at z = 0 and some atom
 * short of hydrogens. Small molecules lying in a plane (water, a lone ion)
 * with all their atoms are not taken for one.
 */
const drawing = (rs: readonly Molecule[], ps: readonly Molecule[]) =>
  flat(rs) && flat(ps) && (shortOfHydrogens(rs) || shortOfHydrogens(ps));

/** The bonds of a structure by atom pair (smaller index first), with their CTfile types. */
function bondTypes(m: Molecule, renumber: (i: number) => number = (i) => i): Map<string, { a1: number; a2: number; type: number }> {
  const out = new Map<string, { a1: number; a2: number; type: number }>();
  for (const b of m.bonds) {
    const p = renumber(b.a1);
    const q = renumber(b.a2);
    if (p < 0 || q < 0) continue;
    const [a1, a2] = p < q ? [p, q] : [q, p];
    out.set(`${a1},${a2}`, { a1, a2, type: b.order });
  }
  return out;
}

/** How the bonds differ between the reactant and the product read through `map` (product atom -> reactant atom). */
export function bondChanges(reactant: Molecule, product: Molecule, map: readonly number[]): ReactionMap["changes"] {
  const before = bondTypes(reactant);
  const after = bondTypes(product, (i) => map[i] ?? -1);
  const formed: BondChange[] = [];
  const broken: BondChange[] = [];
  const orderChanged: BondChange[] = [];
  for (const [k, b] of before) {
    const a = after.get(k);
    if (!a) broken.push({ a1: b.a1, a2: b.a2, before: b.type, after: 0 });
    else if (a.type !== b.type) orderChanged.push({ a1: b.a1, a2: b.a2, before: b.type, after: a.type });
  }
  for (const [k, a] of after) if (!before.has(k)) formed.push({ a1: a.a1, a2: a.a2, before: 0, after: a.type });
  const byAtoms = (p: BondChange, q: BondChange) => p.a1 - q.a1 || p.a2 - q.a2;
  return { formed: formed.sort(byAtoms), broken: broken.sort(byAtoms), orderChanged: orderChanged.sort(byAtoms) };
}

/** Maps every atom of the products onto the reactants, in 3D (see the top of this file). */
export function mapReaction(input: ReactionMapInput): ReactionMap | ReactionMapRefusal {
  const { reactants, products } = input;
  if (!reactants.length || !products.length || reactants.some((m) => !m.atoms.length) || products.some((m) => !m.atoms.length))
    return { error: "no-atoms", message: "Each side needs a structure with atoms." };
  if (drawing(reactants, products))
    return { error: "2d", message: "The structures are flat drawings; map their 3D structures, with their hydrogens." };
  const r = combine(reactants);
  const p = combine(products);
  let ordered;
  try {
    ordered = orderedMaps(p.atoms, r.atoms, {
      knownPairs: input.knownPairs?.map(([a, b]) => [a + 1, b + 1] as const),
      terminalFirst: input.terminalFirst ?? null,
      options: input.options,
      trace: input.trace,
    });
  } catch (e) {
    return { error: "python-error", message: String(e) };
  }
  const nR = r.atoms.length;
  const nP = p.atoms.length;
  const maps = atomsMapNumbers(p.atoms, ordered).map((nums) => nums.map((n) => n - 1));
  const complete = maps.map((m) => nR === nP && m.every((i) => i >= 0) && new Set(m).size === nP);
  const mapped = atomsMapped(p.atoms, r.atoms, ordered);
  const productsInReactantNumbering: Molecule[] = mapped.length === ordered.length ? maps.map((m) => renumbered(p.molecule, m, nR)) : [];
  return {
    reactant: r.molecule,
    product: p.molecule,
    maps,
    complete,
    productsInReactantNumbering,
    changes: maps.length ? bondChanges(r.molecule, p.molecule, maps[0]) : { formed: [], broken: [], orderChanged: [] },
  };
}

/** The product's atoms put where the reactant's atoms they map to stand in the numbering, its bonds renumbered with them. */
function renumbered(product: Molecule, map: readonly number[], n: number): Molecule {
  const atoms: ParsedAtom[] = new Array(n);
  map.forEach((r, i) => {
    if (r >= 0) atoms[r] = { ...product.atoms[i] };
  });
  const bonds: ParsedBond[] = product.bonds.map((b) => {
    const a1 = map[b.a1];
    const a2 = map[b.a2];
    return { ...b, a1: Math.min(a1, a2), a2: Math.max(a1, a2) };
  });
  bonds.sort((p, q) => p.a1 - q.a1 || p.a2 - q.a2);
  return { atoms, bonds };
}

/** A full map's pairs between heavy atoms only - for showing on a drawing: (reactant atom, product atom). */
export function heavyAtomPairs(result: ReactionMap, mapIndex = 0): [number, number][] {
  const map = result.maps[mapIndex] ?? [];
  const out: [number, number][] = [];
  map.forEach((r, i) => {
    if (r < 0) return;
    if (result.product.atoms[i].el === "H" || result.reactant.atoms[r].el === "H") return;
    out.push([r, i]);
  });
  return out.sort((a, b) => a[0] - b[0]);
}

/**
 * The structures as they came in, each atom given its atom-atom mapping
 * number from a full map: a reactant atom its place in the reactants'
 * numbering plus one, a product atom that of the reactant atom it maps to.
 * Hydrogens are numbered too. Nothing is numbered unless the map is complete.
 */
export function withMapNumbers(
  input: { reactants: readonly Molecule[]; products: readonly Molecule[] },
  result: ReactionMap,
  mapIndex = 0,
): { reactants: Molecule[]; products: Molecule[] } {
  const map = result.maps[mapIndex];
  const ok = !!map && result.complete[mapIndex];
  let offset = 0;
  const reactants = input.reactants.map((m) => {
    const base = offset;
    offset += m.atoms.length;
    return { ...m, atoms: m.atoms.map((a, i) => withMap(a, ok ? base + i + 1 : undefined)) };
  });
  offset = 0;
  const products = input.products.map((m) => {
    const base = offset;
    offset += m.atoms.length;
    return { ...m, atoms: m.atoms.map((a, i) => withMap(a, ok ? map[base + i] + 1 : undefined)) };
  });
  return { reactants, products };
}

function withMap(a: ParsedAtom, n: number | undefined): ParsedAtom {
  const { map: _old, ...rest } = a;
  return n ? { ...rest, map: n } : rest;
}
