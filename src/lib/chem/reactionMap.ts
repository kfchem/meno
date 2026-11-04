/**
 * A reaction's atom map, for calculation: every atom of the products paired
 * one to one with an atom of the reactants - hydrogens too, placed by
 * geometry, as E/Z, R/S and which face each side shows have them - so that
 * the products can be written in the reactants' atom numbering, as NEB,
 * QST3 and matching an IRC's ends need (docs/ATOM-MAPPING.md).
 *
 * The maps are worked out by ./accelMapper, ACCeL's mapper ported as it is,
 * with departures of Meno's own, each named there (`Departures`;
 * `accelExact` turns them off). This is how Meno hands it its structures and
 * reads its answer:
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
  ACCEL_EXACT,
  Atoms,
  BondType,
  MENO_DEPARTURES,
  atomsMapNumbers,
  atomsMapped,
  incorporate,
  orderedMaps,
  type MapperTrace,
} from "./accelMapper";
import { implicitHydrogens, type Molecule, type ParsedAtom, type ParsedBond } from "./molecule";
import { aromaticForm } from "./identity";
import { AROMATIC_BOND } from "./kekulize";

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
  /** Map exactly as ACCeL does, without Meno's departures from it (accelMapper's `Departures`). */
  accelExact?: boolean;
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

/**
 * A structure as ACCeL's mapper reads one: bond types 1 to 4 as they are,
 * any other undefined - and the bonds of an aromatic ring aromatic (4), as
 * ACCeL's own flow has them before it maps (Box.calc_bonds calls
 * Modeler.aromatize), whichever Kekulé structure the ring was drawn in.
 * ACCeL perceives the rings from the geometry; Meno from the bonds
 * (lib/chem/identity `aromaticForm`).
 */
export function toAtoms(m: Molecule): Atoms {
  const atoms = new Atoms();
  for (const a of m.atoms) atoms.getNewAtom([a.el, a.x, a.y, a.z]);
  atoms.initBonds();
  const ring = aromaticBonds(m);
  for (const b of m.bonds) {
    const t = ring.has(b.a1 < b.a2 ? `${b.a1},${b.a2}` : `${b.a2},${b.a1}`) ? BondType.aromatic : b.order >= 1 && b.order <= 4 ? b.order : BondType.undefined;
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

/** The bonds of a structure that are of an aromatic ring (lib/chem/identity `aromaticForm`), by atom pair (smaller index first). */
function aromaticBonds(m: Molecule, renumber: (i: number) => number = (i) => i): Set<string> {
  const form = aromaticForm({ atoms: m.atoms.map((a) => ({ el: a.el })), bonds: m.bonds.map((b) => ({ a: b.a1, b: b.a2, order: b.order })) });
  const out = new Set<string>();
  for (const b of form.bonds) {
    const [p, q] = [renumber(b.a), renumber(b.b)];
    if (b.order === AROMATIC_BOND && p >= 0 && q >= 0) out.add(p < q ? `${p},${q}` : `${q},${p}`);
  }
  return out;
}

/**
 * How the bonds differ between the reactant and the product read through
 * `map` (product atom -> reactant atom). A bond of an aromatic ring on both
 * sides has not changed, whichever Kekulé structure each side is drawn
 * in: a map that turns a symmetric ring over pairs its single bonds with
 * the other side's double bonds, and the ring is the same.
 */
export function bondChanges(reactant: Molecule, product: Molecule, map: readonly number[]): ReactionMap["changes"] {
  const before = bondTypes(reactant);
  const after = bondTypes(product, (i) => map[i] ?? -1);
  const ringBefore = aromaticBonds(reactant);
  const ringAfter = aromaticBonds(product, (i) => map[i] ?? -1);
  const formed: BondChange[] = [];
  const broken: BondChange[] = [];
  const orderChanged: BondChange[] = [];
  for (const [k, b] of before) {
    const a = after.get(k);
    if (!a) broken.push({ a1: b.a1, a2: b.a2, before: b.type, after: 0 });
    else if (a.type !== b.type && !(ringBefore.has(k) && ringAfter.has(k))) orderChanged.push({ a1: b.a1, a2: b.a2, before: b.type, after: a.type });
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
      departures: input.accelExact ? ACCEL_EXACT : MENO_DEPARTURES,
    });
  } catch (e) {
    return { error: "python-error", message: String(e) };
  }
  const nR = r.atoms.length;
  const nP = p.atoms.length;
  const maps = atomsMapNumbers(p.atoms, ordered).map((nums) => nums.map((n) => n - 1));
  // (one to one, and each atom with one of its own element: a map that pairs a carbon with a fluorine is no map of the reaction)
  const complete = maps.map((m) => nR === nP && m.every((i, j) => i >= 0 && r.molecule.atoms[i].el === p.molecule.atoms[j].el) && new Set(m).size === nP);
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

/**
 * A row of a reaction's table of bond changes: a bond formed, broken or
 * changed in order, its atoms in the reactants' numbering (from 0, as an
 * entry's bonds number them) with their elements, and its CTfile bond type before and after (0 where
 * there is no bond; 4, aromatic). The types are the structures' own, as they
 * came in: nothing is perceived here.
 */
export type BondChangeRow = {
  a1: number;
  a2: number;
  element1: string;
  element2: string;
  before: number;
  after: number;
  change: "formed" | "broken" | "order";
};

/** One product written in the reactants' numbering by one of its maps, with the bond changes that map makes. */
export type MappedProduct = {
  /** Which product, by its place among those given (from 0). */
  product: number;
  /** Which of the product's maps, best first (from 0). */
  map: number;
  /** The product's atoms and bonds in the reactants' numbering: every atom mapped one to one, hydrogens included. */
  molecule: Molecule;
  /** For each atom in the reactants' numbering, the product's own atom it is (from 0): the product renumbered, read the other way. */
  order: number[];
  changes: BondChangeRow[];
};

/** A product, or one of its maps, that could not be written in the reactants' numbering, and why. */
export type ProductNotMapped = { product: number; map?: number; reason: string };

/** A map's bond changes as table rows: formed, then broken, then changed in order, each by its atoms. */
export function bondChangeRows(reactant: Molecule, product: Molecule, map: readonly number[]): BondChangeRow[] {
  const c = bondChanges(reactant, product, map);
  const row = (b: BondChange, change: BondChangeRow["change"]): BondChangeRow => ({
    a1: b.a1,
    a2: b.a2,
    element1: reactant.atoms[b.a1].el,
    element2: reactant.atoms[b.a2].el,
    before: b.before,
    after: b.after,
    change,
  });
  return [...c.formed.map((b) => row(b, "formed")), ...c.broken.map((b) => row(b, "broken")), ...c.orderChanged.map((b) => row(b, "order"))];
}

/**
 * What *Atom map* does, in a workflow and on the page
 * (docs/WORKFLOWS-FOUNDATION.md, *Atom mapping, and what Meno does
 * itself*): each entry mapped onto the reference, in 3D with every
 * hydrogen, and written in its numbering - by its first map, or by `every`
 * map - with the bonds that map forms, breaks or changes. The reference and
 * each entry are a side of one or more structures, set side by side as one
 * as `mapReaction` sets them: a reaction's reactants and one of its
 * products (or all of them), or a compound and one of its conformers. With
 * `bonds` "same", the entry is to be the reference's own structure, and a
 * map that forms, breaks or changes any bond is said, never passed on. An
 * entry that cannot be mapped one to one, atom for atom, is said with the
 * reason, never passed on in part.
 */
export function mapOnto(
  reference: readonly Molecule[],
  entries: readonly (readonly Molecule[])[],
  o: { bonds: "change" | "same"; every?: boolean; accelExact?: boolean },
): { mapped: MappedProduct[]; notMapped: ProductNotMapped[] } {
  const mapped: MappedProduct[] = [];
  const notMapped: ProductNotMapped[] = [];
  const atomsOf = (side: readonly Molecule[]) => side.reduce((n, m) => n + m.atoms.length, 0);
  const n = atomsOf(reference);
  // (a side's atoms as one, for counting its elements)
  const all = (side: readonly Molecule[]): Molecule => ({ atoms: side.flatMap((m) => m.atoms), bonds: [] });
  entries.forEach((p, product) => {
    if (atomsOf(p) !== n) {
      notMapped.push({ product, reason: `It has ${atomsOf(p)} atoms and the reference ${n}: every atom must map one to one, hydrogens included.` });
      return;
    }
    const unlike = elementsDiffer(all(reference), all(p));
    if (unlike) {
      notMapped.push({ product, reason: unlike });
      return;
    }
    const result = mapReaction({ reactants: [...reference], products: [...p], accelExact: o.accelExact });
    if ("error" in result) {
      notMapped.push({ product, reason: result.message });
      return;
    }
    if (!result.maps.length) {
      notMapped.push({ product, reason: "No map was found." });
      return;
    }
    const which = o.every ? result.maps.map((_, i) => i) : [0];
    for (const k of which) {
      const m = result.maps[k];
      const j = m.findIndex((i, j) => i >= 0 && result.reactant.atoms[i].el !== result.product.atoms[j].el);
      if (j >= 0) {
        const [a, b] = [result.product.atoms[j].el, result.reactant.atoms[m[j]].el];
        notMapped.push({ product, map: k, reason: `The map pairs its atom ${j + 1} (${a}) with the reference's atom ${m[j] + 1} (${b}): an atom maps only to one of its own element.` });
        continue;
      }
      if (!result.complete[k]) {
        notMapped.push({ product, map: k, reason: "The map leaves atoms of one side unpaired." });
        continue;
      }
      const changes = bondChangeRows(result.reactant, result.product, m);
      if (o.bonds === "same" && changes.length) {
        const words = { formed: "formed", broken: "broken", order: "of another order" } as const;
        const said = changes.map((c) => `${c.a1 + 1}-${c.a2 + 1} ${words[c.change]}`).join(", ");
        notMapped.push({ product, map: k, reason: `The map has bonds ${said}, and its bonds are to stay the same.` });
        continue;
      }
      const order: number[] = new Array(m.length);
      m.forEach((r, j) => (order[r] = j));
      mapped.push({ product, map: k, molecule: renumbered(result.product, m, n), order, changes });
    }
  });
  return { mapped, notMapped };
}

/** Why a product cannot map atom for atom onto the reactants for its elements - which it has more or fewer of - or none where each side has as many of each. */
function elementsDiffer(reactant: Molecule, product: Molecule): string | null {
  const count = (m: Molecule) => {
    const n = new Map<string, number>();
    for (const a of m.atoms) n.set(a.el, (n.get(a.el) ?? 0) + 1);
    return n;
  };
  const [r, p] = [count(reactant), count(product)];
  const els = [...new Set([...r.keys(), ...p.keys()])].sort();
  const more = els.filter((e) => (p.get(e) ?? 0) > (r.get(e) ?? 0)).map((e) => `${(p.get(e) ?? 0) - (r.get(e) ?? 0)} ${e}`);
  const fewer = els.filter((e) => (p.get(e) ?? 0) < (r.get(e) ?? 0)).map((e) => `${(r.get(e) ?? 0) - (p.get(e) ?? 0)} ${e}`);
  if (!more.length && !fewer.length) return null;
  const said = [more.length ? `${more.join(", ")} more` : "", fewer.length ? `${fewer.join(", ")} fewer` : ""].filter(Boolean).join(" and ");
  return `It has ${said} than the reference: every atom must map to one of its own element.`;
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
