/**
 * How a molecule without its hydrogens is protonated, as the chemist
 * chooses it (docs/WORKSPACE.md, *How it is protonated*): its sites - the
 * groups that can carry a hydrogen more or less, or carry it on one atom or
 * another - and each one's forms, every form a molecule of its own: an acid
 * or its anion, an amine or its ammonium, imidazole with its hydrogen on
 * one nitrogen or the other. Nothing is chosen here: a form is what the
 * chemist picks, the orders of its bonds and the charges of its atoms
 * following from the hydrogens it puts where (lib/chem/skeleton: a
 * molecule without hydrogens says none of this).
 *
 * The sites, by what they are made of - each atom in one site at most, the
 * first that takes it; two sites that would move the hydrogens of one atom
 * are one (a biguanide; cytosine's lactam and its amino group):
 * - a lactam: a flat ring with a nitrogen and an oxygen on a carbon of it
 *   (2-pyridone, 4-pyridone, uracil, a triazolone), the hydrogen on the
 *   nitrogen or on the oxygen;
 * - an azole: a flat five-membered ring with two nitrogens or more, the
 *   hydrogen on each ring nitrogen that has no substituent, or not;
 * - a cyclic amidine: a flat ring's carbon beside a ring nitrogen, with an
 *   amino group on it (2-aminopyridine, 2-aminothiazole, adenine), the
 *   hydrogen on the ring nitrogen or the amino group;
 * - an amidine or a guanidine: a carbon with two or three nitrogens and no
 *   oxygen, outside a flat ring;
 * - a carboxyl: a carbon with two oxygens bonded to nothing else;
 * - a phosphate and a sulfonate: a phosphorus or sulfur with four
 *   neighbours, two oxygens or more of them bonded to nothing else (named
 *   by what else it carries: a phosphonate, a sulfate);
 * - a ring nitrogen: one in a flat six-membered ring, with no substituent;
 *   or a flat five-membered ring's one nitrogen, doubly bonded (an
 *   oxazole's, a thiazole's);
 * - a phenol and a thiol: an oxygen on a flat ring's carbon, a sulfur on a
 *   carbon, each bonded to nothing else and singly;
 * - an imine: a nitrogen outside a flat ring doubly bonded to a carbon, on
 *   carbons alone;
 * - an amine: a nitrogen with single bonds only, outside a flat ring, not
 *   on a carbon, sulfur or phosphorus doubly bonded to oxygen, sulfur or
 *   nitrogen (an amide's, a sulfonamide's), nor on an oxygen of its own (a
 *   nitro group's), nor on a flat ring's carbon beside a ring nitrogen (an
 *   aminopyridine's, whose ring nitrogen is the site).
 *
 * A form is the hydrogens each of a site's atoms carries, with its charge:
 * the orders of the bonds around it - in a ring, the whole flat ring
 * system's - are found again for it, so that each atom's valence is met;
 * where none can be found the form is not one. Two ways of drawing the
 * same hydrogens and charge (a carboxylate's two oxygens) are one form. A
 * bond to a metal counts in a carbon's or a halogen's valence; a donor's
 * may be in place of a hydrogen or not, its own site (`DONORS`).
 *
 * Pure: over atoms and bonds, as lib/chem/skeleton.
 */
import { implicitHydrogens, type Radical } from "./molecule";

export type ProtonAtom = { el: string; charge?: number; radical?: Radical };
export type ProtonBond = { a1: number; a2: number; order: number };

/** What a site is, as the chemist knows it. */
export type SiteKind =
  | "azole"
  | "lactam"
  | "amidine"
  | "guanidine"
  | "cyclic amidine"
  | "carboxyl"
  | "phosphate"
  | "sulfonate"
  | "ring nitrogen"
  | "phenol"
  | "thiol"
  | "imine"
  | "amine"
  | "metal bond";

/**
 * A form of a site: the hydrogens and charge of each of its atoms that can
 * change (`at`), the orders its bonds then have (`orders`, by bond), its
 * charge, and what it is called - by what it is, and where its hydrogens
 * are (`name`, `where`).
 */
export type Form = {
  at: { atom: number; h: number; charge: number; metal?: boolean }[];
  orders: { bond: number; order: number }[];
  charge: number;
  name: string;
  where: string;
};

/** A site: what it is, and what it is called (`title`: "Thiazole nitrogen", "Phosphonate"), its atoms (all of them, to be shown), those whose hydrogens change, its forms, and which of them it is drawn in now - none, where it is none of them. */
export type Site = { kind: SiteKind; title: string; atoms: number[]; changing: number[]; forms: Form[]; now: number | null };

/** Where a molecule's bond orders, and so its charges, came from: the CCD, a SMILES, or an estimate from its atoms' distances. */
export type OrdersBy = "dictionary" | "assigned" | "estimated" | "perceived" | "unknown" | undefined;

/** Whether a molecule's orders and charges were given by a definition: the CCD's, a SMILES', or its own file's (`undefined`: a molfile's, its hydrogens those its valences leave room for). */
export const definedBy = (by: OrdersBy) => by === "dictionary" || by === "assigned" || by === undefined;

/**
 * The form each site starts at, as the card opens - Meno's one policy, so
 * that it is changed in one place (the maintainer, 2026-10-22 and
 * 2026-10-23): where its orders and charges were given by a definition
 * (`definedBy`), the form they draw; else none - an estimate from
 * distances says nothing of how a molecule is protonated, so each site
 * waits for the chemist. A bond to a metal waits whatever the source: a
 * molfile has no dative bond, so a water on a zinc is often drawn with a
 * single bond, which read as drawn would be a hydroxide.
 */
export function startingForms(by: OrdersBy, sites: readonly Site[], aromatic = false): (number | null)[] {
  // (a file's aromatic bonds say no more of where a ring's hydrogens are than distances do: each site waits)
  return sites.map((s) => (s.kind !== "metal bond" && definedBy(by) && !aromatic ? s.now : null));
}

/** An atom's hydrogens, its bonds' orders summed (`sum`): its valence's room, a phosphorus or sulfur taking its higher valences (5; 4 and 6) where its bonds go past the lower. */
export function hydrogensOf(a: ProtonAtom, sum: number): number {
  const charge = a.charge ?? 0;
  if (!charge && !a.radical && (a.el === "P" || a.el === "S")) {
    const valences = a.el === "P" ? [3, 5] : [2, 4, 6];
    const v = valences.find((x) => x >= sum);
    return v == null ? 0 : v - sum;
  }
  return implicitHydrogens(a.el, sum, charge, a.radical);
}

/** The elements whose bonds count in their neighbours' valences - the nonmetals and the metalloids; not a metal. */
const COUNTED = new Set(["H", "B", "C", "N", "O", "F", "Si", "P", "S", "Cl", "Ge", "As", "Se", "Br", "Sb", "Te", "I"]);

/**
 * The elements that may give a metal a pair of electrons of their own: a
 * bond of theirs to a metal (a zinc ion's, a heme's iron's, a sodium salt's
 * sodium's) may be in place of a hydrogen or not, which only the chemist
 * can say (a site of its own, `"metal bond"`). Any other's - a carbon's on
 * tin or lithium, a chlorine's on mercury - counts in its valence.
 */
const DONORS = new Set(["N", "P", "As", "O", "S", "Se", "Te"]);

/** Whether an element's bonds count in its neighbours' valences (`COUNTED`): not a metal's. */
export const countsInValence = (el: string) => COUNTED.has(el);

/** Whether a bond counts in the valence of its atom `i`: one to an atom that counts, or to a metal from one that cannot give it a pair of its own. */
const countsFor = (atoms: readonly ProtonAtom[], b: ProtonBond, i: number) => countsInValence(atoms[b.a1 === i ? b.a2 : b.a1].el) || !DONORS.has(atoms[i].el);

/** Each atom's bonds' orders summed, those that count in its valence (`countsFor`) alone - an aromatic bond one and a half; its bonds' orders `orders`, by bond, where given. */
export function valenceSums(atoms: readonly ProtonAtom[], bonds: readonly ProtonBond[], orders?: readonly number[]): Float64Array {
  const sum = new Float64Array(atoms.length);
  bonds.forEach((b, k) => {
    const o = orders ? orders[k] : b.order;
    for (const i of [b.a1, b.a2]) if (countsFor(atoms, b, i)) sum[i] += o === 4 ? 1.5 : o;
  });
  return sum;
}

/** Each atom's bonds to metals that may be in place of hydrogens or not, their orders summed: a donor's (`DONORS`). */
function metalOrders(atoms: readonly ProtonAtom[], bonds: readonly ProtonBond[]): Float64Array {
  const sum = new Float64Array(atoms.length);
  for (const b of bonds) for (const i of [b.a1, b.a2]) if (!countsFor(atoms, b, i)) sum[i] += b.order === 4 ? 1.5 : b.order;
  return sum;
}

/** The hydrogens an atom's valence leaves room for (`hydrogensOf`), its bonds that count in it (`countsFor`) summed - not its bonds to hydrogens, which are what is counted. */
export function hydrogensRoom(atoms: readonly ProtonAtom[], bonds: readonly ProtonBond[], i: number): number {
  let sum = 0;
  for (const b of bonds) {
    const other = b.a1 === i ? b.a2 : b.a2 === i ? b.a1 : -1;
    if (other >= 0 && atoms[other].el !== "H" && countsFor(atoms, b, i)) sum += b.order === 4 ? 1.5 : b.order;
  }
  return hydrogensOf(atoms[i], Math.round(sum));
}

/** The hydrogens an atom may carry, its bonds drawn as they are (`hydrogensRoom`) - a donor's bonds to metals in place of hydrogens, or not: one number, where it has none, or the two come to the same. */
export function hydrogensRooms(atoms: readonly ProtonAtom[], bonds: readonly ProtonBond[], i: number): number[] {
  const without = hydrogensRoom(atoms, bonds, i);
  const metal = metalOrders(atoms, bonds)[i];
  if (!metal) return [without];
  const withMetal = hydrogensOf(atoms[i], Math.round(valenceSums(atoms, bonds)[i] + metal));
  return withMetal === without ? [without] : [without, withMetal];
}

/** The most steps a search for bond orders takes before it says none were found. */
const MOST_STEPS = 200_000;

/**
 * A molecule's atoms' neighbours and bonds, none to a metal; each atom's
 * orders summed over the bonds that count in its valence (`sum`), its bonds
 * to metals among them (`held`: a carbon's, a halogen's); a donor's metals
 * and its bonds' orders to them (`metals`, `metalSum`); and its atoms
 * other than hydrogens.
 */
type Graph = { near: number[][]; bondOf: Map<string, number>; sum: Float64Array; held: Float64Array; metals: number[][]; metalSum: Float64Array; heavy: number[] };

const key = (p: number, q: number) => (p < q ? `${p},${q}` : `${q},${p}`);

/** A molecule's atoms' neighbours and bonds, those that count in a valence alone (`counts`): a metal's bonds kept apart, as they are, each atom's to a metal said beside. */
function graphOf(atoms: readonly ProtonAtom[], bonds: readonly ProtonBond[]): Graph {
  const near: number[][] = atoms.map(() => []);
  const metals: number[][] = atoms.map(() => []);
  const held = new Float64Array(atoms.length);
  const bondOf = new Map<string, number>();
  bonds.forEach((b, k) => {
    if (!countsInValence(atoms[b.a1].el) || !countsInValence(atoms[b.a2].el)) {
      for (const [p, q] of [
        [b.a1, b.a2],
        [b.a2, b.a1],
      ]) {
        if (!countsInValence(atoms[p].el) || countsInValence(atoms[q].el)) continue;
        if (countsFor(atoms, b, p)) held[p] += b.order === 4 ? 1.5 : b.order;
        else metals[p].push(q);
      }
      return;
    }
    near[b.a1].push(b.a2);
    near[b.a2].push(b.a1);
    bondOf.set(key(b.a1, b.a2), k);
  });
  return { near, bondOf, sum: valenceSums(atoms, bonds), held, metals, metalSum: metalOrders(atoms, bonds), heavy: atoms.map((a, i) => (a.el === "H" ? -1 : i)).filter((i) => i >= 0) };
}

/** The rings of up to eight atoms through each bond, the smallest, each once, its atoms in order round it. */
function smallRings(g: Graph, n: number): number[][] {
  const rings = new Map<string, number[]>();
  for (const [k] of g.bondOf) {
    const [u, v] = k.split(",").map(Number);
    // (the shortest way from u to v not along their own bond)
    const from = new Int32Array(n).fill(-1);
    from[u] = u;
    let front = [u];
    for (let depth = 0; depth < 7 && from[v] < 0 && front.length; depth++) {
      const next: number[] = [];
      for (const p of front)
        for (const q of g.near[p]) {
          if (from[q] >= 0 || (p === u && q === v)) continue;
          from[q] = p;
          next.push(q);
        }
      front = next;
    }
    if (from[v] < 0) continue;
    const ring = [v];
    for (let p = v; p !== u; ) ring.push((p = from[p]));
    rings.set([...ring].sort((p, q) => p - q).join(","), ring);
  }
  return [...rings.values()];
}

/**
 * Whether a ring is flat - its atoms drawn as a conjugated ring: each has a
 * double or aromatic bond, but for as many nitrogens, oxygens and sulfurs
 * with single bonds only as it has room for: one in a five-membered ring
 * (pyrrole's, furan's), and in either as many more as its carbons with an
 * oxygen on them alone or a nitrogen doubly bonded outside the ring
 * (2-pyridone's, uracil's, a triazolone's, cytosine's drawn as its imine).
 */
function isFlat(ring: readonly number[], atoms: readonly ProtonAtom[], bonds: readonly ProtonBond[], g: Graph): boolean {
  const multiple = (i: number) => g.near[i].some((j) => (bonds[g.bondOf.get(key(i, j))!].order ?? 1) >= 2);
  const plain = ring.filter((i) => !multiple(i));
  if (plain.some((i) => !["N", "O", "S"].includes(atoms[i].el))) return false;
  if (ring.length !== 5 && ring.length !== 6) return false;
  // (a ring carbon with an oxygen on it alone, or a nitrogen doubly bonded outside the ring - 2-iminopyridine's, cytosine's drawn as its imine)
  const oxo = ring.filter((i) => atoms[i].el === "C" && g.near[i].some((j) => !ring.includes(j) && (terminal(atoms, g, j, "O") || (atoms[j].el === "N" && g.near[j].length <= 2 && (bonds[g.bondOf.get(key(i, j))!].order ?? 1) === 2)))).length;
  return plain.length <= oxo + (ring.length === 5 ? 1 : 0);
}

/** Whether an atom is of an element (`el`; O, S, N unset) and bonded to nothing else. */
const terminal = (atoms: readonly ProtonAtom[], g: Graph, i: number, el?: string) => g.near[i].length === 1 && (el ? atoms[i].el === el : ["O", "S", "N"].includes(atoms[i].el));

/** The orders a form's bonds take, by bond, and what each atom's valence asks of them: found, or none. */
function ordersFor(
  atoms: readonly ProtonAtom[],
  bonds: readonly ProtonBond[],
  g: Graph,
  region: readonly number[],
  fixed: ReadonlyMap<number, { h: number; charge: number; metal?: boolean }>,
): Map<number, number> | null {
  const inRegion = new Set(region);
  // (each bond among the region's atoms single or double, as the search makes it)
  const free = [...new Set(region.flatMap((i) => g.near[i].filter((j) => inRegion.has(j)).map((j) => g.bondOf.get(key(i, j))!)))];
  // (what each region atom asks of them: its valence less its hydrogens and its bonds' single parts, and less the double parts of its bonds out of the region)
  const need = new Map<number, number>();
  for (const i of region) {
    const a = atoms[i];
    const f = fixed.get(i);
    const drawn = Math.round(g.sum[i]);
    let outside = 0;
    for (const j of g.near[i]) {
      if (inRegion.has(j)) continue;
      const o = bonds[g.bondOf.get(key(i, j))!].order;
      if (o === 4) return null;
      outside += o - 1;
    }
    // (its valence: as its charge leaves it, for an atom whose hydrogens the form gives; else as it is drawn - a sulfonyl's sulfur six, a metal's bonds as they are)
    const valence = f ? implicitHydrogens(a.el, 0, f.charge, a.radical) : drawn + hydrogensOf(a, drawn);
    const h = f ? f.h : hydrogensOf(a, drawn);
    // (less its bonds to metals that count in it - a carbon's always, a donor's where its form says they are in place of hydrogens)
    need.set(i, valence - h - g.near[i].length - outside - g.held[i] - (f?.metal ? g.metalSum[i] : 0));
  }
  if ([...need.values()].some((x) => x < 0)) return null;
  const order = new Map<number, number>(free.map((b) => [b, 1]));
  let steps = 0;
  const left = new Map(need);
  const go = (): boolean => {
    if (++steps > MOST_STEPS) return false;
    // (the atom still wanting, with the fewest bonds it could take it from)
    let pick = -1;
    let ways: number[] = [];
    for (const [i, w] of left) {
      if (w <= 0) continue;
      const can = g.near[i].filter((j) => (left.get(j) ?? 0) > 0 && order.get(g.bondOf.get(key(i, j))!) === 1);
      if (!can.length) return false;
      if (pick < 0 || can.length < ways.length) [pick, ways] = [i, can];
    }
    if (pick < 0) return true;
    for (const j of ways) {
      const b = g.bondOf.get(key(pick, j))!;
      order.set(b, 2);
      left.set(pick, left.get(pick)! - 1);
      left.set(j, left.get(j)! - 1);
      if (go()) return true;
      order.set(b, 1);
      left.set(pick, left.get(pick)! + 1);
      left.set(j, left.get(j)! + 1);
    }
    return false;
  };
  return go() ? order : null;
}

/**
 * Each way an atom that can change can be: its charge, the double bonds it
 * takes (0 or 1), and so its hydrogens. A nitrogen of a flat ring, an
 * amidine or a guanidine (`flat`) stays flat: charged, it keeps a double
 * bond - never an ammonium's four single ones.
 */
function waysOf(a: ProtonAtom, degree: number, outsideDouble: number, charges: readonly number[], doubles: readonly number[], flat: boolean): { h: number; charge: number }[] {
  const ways: { h: number; charge: number }[] = [];
  for (const charge of charges)
    for (const d of doubles) {
      if (flat && a.el === "N" && charge > 0 && d + outsideDouble === 0) continue;
      // (its valence as its charge leaves it, met by these bonds and its hydrogens - never past it)
      const valence = implicitHydrogens(a.el, 0, charge, a.radical);
      const sum = degree + outsideDouble + d;
      if (valence >= sum) ways.push({ h: valence - sum, charge });
    }
  return ways;
}

/** A form's name for each sign of its charge: none, plus, minus. */
type Names = [string, string, string];

/** A ring's names, by the elements round it - its neutral form's, its cation's, its anion's: "Thiazole", "Thiazolium", "Thiazolate"; none for a ring not named here. */
function ringNames(ring: readonly number[], atoms: readonly ProtonAtom[]): Names | null {
  const where = (el: string) => ring.flatMap((i, k) => (atoms[i].el === el ? [k] : []));
  const [ns, os, ss] = [where("N"), where("O"), where("S")];
  const apart = (p: number, q: number) => Math.min(Math.abs(p - q), ring.length - Math.abs(p - q));
  let base: string | undefined;
  if (ring.length === 5 && os.length + ss.length === 0) base = [undefined, "Pyrrol", ns.some((p) => ns.some((q) => apart(p, q) === 1)) ? "Pyrazol" : "Imidazol", "Triazol", "Tetrazol", "Pentazol"][ns.length];
  else if (ring.length === 5 && os.length + ss.length === 1) {
    const [other, x] = os.length ? ["ox", os[0]] : ["thi", ss[0]];
    if (ns.length === 1) base = apart(ns[0], x) === 1 ? (os.length ? "Isoxazol" : "Isothiazol") : `${other[0].toUpperCase()}${other.slice(1)}azol`;
    else if (ns.length === 2 || ns.length === 3) base = `${other[0].toUpperCase()}${other.slice(1)}a${ns.length === 2 ? "di" : "tri"}azol`;
  } else if (ring.length === 6 && os.length + ss.length === 0) {
    const two = ns.length === 2 ? ["Pyridazin", "Pyrimidin", "Pyrazin"][apart(ns[0], ns[1]) - 1] : undefined;
    base = [undefined, "Pyridin", two, "Triazin", "Tetrazin"][ns.length];
  }
  return base ? [`${base}e`, `${base}ium`, `${base}ate`] : null;
}

/** The name a form goes by: what its site is, by its charge's sign - a lactam's by where its hydrogens are, a cyclic amidine's by whether its amino group is one; an amino group on a ring drawn as an imine said so. */
function nameOf(f: Found, charge: number, atoms: readonly ProtonAtom[], g: Graph, form: Form): string {
  const sign = charge > 0 ? 1 : charge < 0 ? 2 : 0;
  const imino = form.at.some((x) => f.exo.includes(x.atom) && !x.charge && x.h < implicitHydrogens(atoms[x.atom].el, 0, 0) - g.near[x.atom].length);
  if (f.kind === "lactam" && !charge) {
    const ohs = form.at.filter((x) => atoms[x.atom].el === "O" && x.h > 0).length;
    const os = form.at.filter((x) => atoms[x.atom].el === "O").length;
    const base = ohs === 0 ? "Lactam" : ohs === os ? "Lactim" : "Lactam and lactim";
    return imino ? `Imino ${base.toLowerCase()}` : base;
  }
  if (f.kind === "lactam") return charge > 0 ? "Protonated" : "Deprotonated";
  if (f.kind === "cyclic amidine" && !charge) return imino ? "Imino form" : "Amino form";
  return imino && !charge ? `Imino ${f.names[0].toLowerCase()}` : f.names[sign];
}

/** Where a form's hydrogens are, by its atoms' names (`label`): "H on O2", "2 H on N1, H on N3"; none, "no H". */
function whereOf(form: Form, label: (i: number) => string): string {
  const on = form.at.filter((x) => x.h > 0).map((x) => `${x.h > 1 ? `${x.h} ` : ""}H on ${label(x.atom)}`);
  return on.length ? on.join(", ") : "no H";
}

/**
 * A site as it is found: what it is, its atoms, those whose hydrogens
 * change, the atoms whose bonds' orders are found again for its forms (its
 * region; none, where they stay as they are), each changing atom's charges
 * and double bonds, whether its charge is one at most (`cap`: a ring's),
 * the amino groups on a ring it holds (`exo`), and what it and its forms
 * are called (`title`, `names`).
 */
type Found = {
  kind: SiteKind;
  atoms: number[];
  changing: number[];
  region: number[];
  charges: Map<number, readonly number[]>;
  doubles: Map<number, readonly number[]>;
  cap: boolean;
  exo: number[];
  title: string;
  names: Names;
};

const union = <T>(p: readonly T[], q: readonly T[]) => [...new Set([...p, ...q])];

/** The sites among some atoms (`among`), each atom in one at most - as the comment above lists them, in that order. */
function sitesAmong(atoms: readonly ProtonAtom[], bonds: readonly ProtonBond[], g: Graph, among: ReadonlySet<number>): Found[] {
  const taken = new Set<number>();
  const found: Found[] = [];
  const order = (i: number, j: number) => bonds[g.bondOf.get(key(i, j))!].order;
  const rings = smallRings(g, atoms.length).filter((r) => r.every((i) => among.has(i)));
  const flat = rings.filter((r) => isFlat(r, atoms, bonds, g));
  const inFlat = new Set(flat.flat());
  // (a flat ring's system: the flat rings it shares atoms with, and theirs - its atoms, with the oxygens on them)
  const systemOf = (ring: readonly number[]) => {
    const atomsOf = new Set(ring);
    for (let grew = true; grew; ) {
      grew = false;
      for (const r of flat)
        if (r.some((i) => atomsOf.has(i)) && r.some((i) => !atomsOf.has(i))) {
          r.forEach((i) => atomsOf.add(i));
          grew = true;
        }
    }
    for (const i of [...atomsOf]) for (const j of g.near[i]) if (!atomsOf.has(j) && terminal(atoms, g, j) && order(i, j) <= 2) atomsOf.add(j);
    return [...atomsOf];
  };
  // (two sites whose forms move the hydrogens of one atom - a biguanide's two guanidines, cytosine's lactam and its amino group - are one: their forms found together, neither left out)
  const merged = (into: Found, f: Found) => {
    const biguanide = into.kind === "guanidine" && f.kind === "guanidine";
    into.atoms = union(into.atoms, f.atoms);
    into.changing = union(into.changing, f.changing).sort((p, q) => p - q);
    into.region = union(into.region, f.region);
    for (const [i, c] of f.charges) into.charges.set(i, union(into.charges.get(i) ?? [], c));
    for (const [i, d] of f.doubles) into.doubles.set(i, union(into.doubles.get(i) ?? [], d));
    into.cap ||= f.cap;
    into.exo = union(into.exo, f.exo);
    if (biguanide) [into.title, into.names] = ["Biguanide", ["Biguanide", "Biguanidium", "Biguanidate"]];
  };
  const add = (f: Found) => {
    if (!f.changing.length) return;
    if (f.changing.some((i) => taken.has(i))) {
      const over = found.filter((s) => f.changing.some((i) => s.changing.includes(i)));
      if (!f.region.length || !over.length || over.some((s) => !s.region.length)) return;
      const [into, ...rest] = over;
      for (const s of rest) {
        merged(into, s);
        found.splice(found.indexOf(s), 1);
      }
      merged(into, f);
      f.atoms.forEach((i) => taken.add(i));
      return;
    }
    // (its atoms in their order in the molecule: a form's hydrogens said in that order)
    f.changing.sort((p, q) => p - q);
    f.atoms.forEach((i) => taken.add(i));
    found.push(f);
  };
  const N_WAYS = { charges: [0, 1], doubles: [0, 1] };
  // (an atom not bonded to a metal: one whose hydrogens another site may move)
  const free = (i: number) => !g.metals[i].length;
  const simple = (kind: SiteKind, names: Names, title = names[0]) => ({ kind, cap: false, exo: [], title, names });
  // (an atom bonded to a metal: in no other site, its hydrogens moved by none - a site of its own where its bond to the metal may be in place of a hydrogen or not, the two leaving it different hydrogens)
  for (const i of g.heavy) {
    if (!among.has(i) || !g.metals[i].length) continue;
    taken.add(i);
    const a = atoms[i];
    if (hydrogensOf(a, Math.round(g.sum[i])) === hydrogensOf(a, Math.round(g.sum[i] + g.metalSum[i]))) continue;
    const metals = [...new Set(g.metals[i].map((j) => atoms[j].el))].join(", ");
    const charge = a.charge ?? 0;
    found.push({ atoms: [i], changing: [i], region: [], charges: new Map([[i, [charge]]]), doubles: new Map([[i, [0]]]), ...simple("metal bond", [`Covalent bond to ${metals}`, "", ""], `Bond to ${metals}`) });
  }
  // (a nitrogen on a carbon, sulfur or phosphorus doubly bonded to an oxygen, sulfur or nitrogen: an amide's, a sulfonamide's)
  const doublyToHetero = (j: number) => g.near[j].some((k) => ["O", "S", "N"].includes(atoms[k].el) && order(j, k) >= 2);
  // (lactams: a flat ring's unsubstituted nitrogens and the oxygens on its carbons)
  for (const r of flat.filter((x) => x.some((i) => atoms[i].el === "N"))) {
    const os = r.flatMap((i) => (atoms[i].el === "C" ? g.near[i].filter((j) => !r.includes(j) && terminal(atoms, g, j, "O") && free(j)) : []));
    const ns = r.filter((i) => atoms[i].el === "N" && g.near[i].length === 2 && free(i));
    if (!os.length || !ns.length) continue;
    const changing = [...ns, ...os];
    add({
      kind: "lactam",
      atoms: [...r, ...os],
      changing,
      region: systemOf(r),
      charges: new Map(changing.map((i) => [i, atoms[i].el === "N" ? [0, 1] : [-1, 0]])),
      doubles: new Map(changing.map((i) => [i, [0, 1]])),
      cap: true,
      exo: [],
      title: "Lactam",
      names: ["Lactam", "Protonated", "Deprotonated"],
    });
  }
  // (azoles)
  for (const r of flat.filter((x) => x.length === 5 && x.filter((i) => atoms[i].el === "N").length >= 2)) {
    const changing = r.filter((i) => atoms[i].el === "N" && g.near[i].length === 2 && free(i));
    const names = ringNames(r, atoms) ?? ["Azole", "Azolium", "Azolate"];
    add({ kind: "azole", atoms: r, changing, region: systemOf(r), charges: new Map(changing.map((i) => [i, [-1, 0, 1]])), doubles: new Map(changing.map((i) => [i, N_WAYS.doubles])), cap: true, exo: [], title: names[0], names });
  }
  // (cyclic amidines: a flat ring's carbon beside a nitrogen of the ring, with an amino group on it - 2-aminopyridine's, cytosine's, adenine's - the hydrogen on the ring's nitrogen or the amino group's)
  for (const r of flat)
    for (const c of r) {
      if (atoms[c].el !== "C") continue;
      const ns = g.near[c].filter((j) => r.includes(j) && atoms[j].el === "N" && g.near[j].length === 2 && free(j));
      if (!ns.length) continue;
      for (const x of g.near[c]) {
        if (!among.has(x) || !free(x) || inFlat.has(x) || atoms[x].el !== "N" || g.near[x].length > 3 || g.near[x].some((j) => j !== c && order(x, j) !== 1)) continue;
        if (g.near[x].some((j) => j !== c && (["N", "O"].includes(atoms[j].el) || (["C", "S", "P"].includes(atoms[j].el) && doublyToHetero(j))))) continue;
        const changing = [...ns, x];
        add({
          kind: "cyclic amidine",
          atoms: [c, ...changing],
          changing,
          region: union(systemOf(r), [x]),
          charges: new Map(changing.map((i) => [i, N_WAYS.charges])),
          doubles: new Map(changing.map((i) => [i, N_WAYS.doubles])),
          cap: true,
          exo: [x],
          title: "Amidine",
          names: ["Amino form", "Amidinium", "Amidinate"],
        });
      }
    }
  // (amidines and guanidines: outside a flat ring, a carbon with two or three nitrogens and no oxygen or sulfur)
  for (const c of g.heavy) {
    if (!among.has(c) || atoms[c].el !== "C" || inFlat.has(c)) continue;
    const ns = g.near[c].filter((j) => atoms[j].el === "N" && !inFlat.has(j));
    if (ns.length < 2 || g.near[c].some((j) => atoms[j].el === "O" || atoms[j].el === "S") || g.near[c].length > 3) continue;
    // (a nitrogen on a carbonyl too - an acyl amidine's - is the amide's)
    const changing = ns.filter((n) => free(n) && !g.near[n].some((j) => j !== c && g.near[j].some((k) => terminal(atoms, g, k, "O") && order(j, k) === 2)));
    if (changing.length < 2) continue;
    add({
      atoms: [c, ...ns],
      changing,
      region: [c, ...changing],
      charges: new Map(changing.map((i) => [i, N_WAYS.charges])),
      doubles: new Map(changing.map((i) => [i, N_WAYS.doubles])),
      ...(ns.length === 3 ? simple("guanidine", ["Guanidine", "Guanidinium", "Guanidinate"]) : simple("amidine", ["Amidine", "Amidinium", "Amidinate"])),
    });
  }
  // (carboxyls, phosphates and sulfonates - a phosphorus's or sulfur's by what else it carries)
  for (const c of g.heavy) {
    if (!among.has(c)) continue;
    const os = g.near[c].filter((j) => terminal(atoms, g, j, "O"));
    const el = atoms[c].el;
    const rest = g.near[c].filter((j) => !os.includes(j)).map((j) => atoms[j].el);
    const carbons = rest.filter((e) => e === "C").length;
    const names: [SiteKind, Names] | null =
      el === "C" && os.length === 2 && g.near[c].length <= 3 && !rest.includes("O")
        ? ["carboxyl", ["Carboxylic acid", "Carboxylic acid", "Carboxylate"]]
        : el === "P" && g.near[c].length === 4 && os.length >= 2
          ? ["phosphate", rest.includes("N") && !carbons ? ["Phosphoramidate", "Phosphoramidate", "Phosphoramidate"] : (["Phosphate", "Phosphonate", "Phosphinate"].map((n) => [n, n, n] as Names)[Math.min(carbons, 2)])]
          : el === "S" && g.near[c].length === 4 && os.length >= 2
            ? ["sulfonate", carbons ? ["Sulfonic acid", "Sulfonic acid", "Sulfonate"] : rest.includes("N") ? ["Sulfamic acid", "Sulfamic acid", "Sulfamate"] : ["Hydrogen sulfate", "Hydrogen sulfate", "Sulfate"]]
            : null;
    if (!names) continue;
    const changing = os.filter(free);
    add({ atoms: [c, ...os], changing, region: [c, ...changing], charges: new Map(changing.map((i) => [i, [-1, 0]])), doubles: new Map(changing.map((i) => [i, [0, 1]])), ...simple(names[0], names[1], names[0] === "carboxyl" ? "Carboxyl" : names[1][2]) });
  }
  // (ring nitrogens: a flat six-membered ring's, with no substituent; and a flat five-membered ring's lone nitrogen, doubly bonded - an oxazole's, a thiazole's)
  for (const r of flat.filter((x) => x.length === 6 || (x.length === 5 && x.filter((i) => atoms[i].el === "N").length === 1)))
    for (const n of r)
      if (atoms[n].el === "N" && g.near[n].length === 2 && !taken.has(n) && (r.length === 6 || g.near[n].some((j) => order(n, j) === 2))) {
        const names = ringNames(r, atoms) ?? ["Ring nitrogen", "Protonated ring nitrogen", "Ring nitrogen"];
        add({ atoms: [n], changing: [n], region: [], charges: new Map([[n, N_WAYS.charges]]), doubles: new Map([[n, [1]]]), ...simple("ring nitrogen", names, `${names[0]} nitrogen`) });
      }
  // (phenols and thiols: an oxygen on a flat ring's carbon, a sulfur on a carbon, singly)
  for (const o of g.heavy) {
    if (!among.has(o) || taken.has(o) || !terminal(atoms, g, o) || order(o, g.near[o][0]) !== 1 || atoms[g.near[o][0]].el !== "C") continue;
    if (atoms[o].el === "O" && inFlat.has(g.near[o][0]))
      add({ atoms: [o], changing: [o], region: [], charges: new Map([[o, [-1, 0]]]), doubles: new Map([[o, [0]]]), ...simple("phenol", ["Phenol", "Phenol", "Phenolate"]) });
    else if (atoms[o].el === "S") add({ atoms: [o], changing: [o], region: [], charges: new Map([[o, [-1, 0]]]), doubles: new Map([[o, [0]]]), ...simple("thiol", ["Thiol", "Thiol", "Thiolate"]) });
  }
  // (imines: a nitrogen outside a flat ring, doubly bonded to a carbon, on carbons alone - not an oxime's, a hydrazone's, nor an acyl imine's)
  for (const n of g.heavy) {
    if (!among.has(n) || taken.has(n) || atoms[n].el !== "N" || inFlat.has(n) || g.near[n].length > 2) continue;
    const doubly = g.near[n].filter((j) => order(n, j) === 2);
    if (doubly.length !== 1 || g.near[n].some((j) => atoms[j].el !== "C" || order(n, j) > 2)) continue;
    if (g.near[n].some((j) => j !== doubly[0] && doublyToHetero(j))) continue;
    add({ atoms: [n], changing: [n], region: [], charges: new Map([[n, N_WAYS.charges]]), doubles: new Map([[n, [1]]]), ...simple("imine", ["Imine", "Iminium", "Imine"]) });
  }
  // (amines)
  for (const n of g.heavy) {
    if (!among.has(n) || taken.has(n) || atoms[n].el !== "N" || inFlat.has(n)) continue;
    if (g.near[n].some((j) => order(n, j) !== 1) || g.near[n].length > 3) continue;
    if (g.near[n].some((j) => terminal(atoms, g, j, "O") || (["C", "S", "P"].includes(atoms[j].el) && doublyToHetero(j)))) continue;
    if (g.near[n].some((j) => inFlat.has(j) && g.near[j].some((k) => inFlat.has(k) && atoms[k].el === "N" && g.near[k].length === 2))) continue;
    add({ atoms: [n], changing: [n], region: [], charges: new Map([[n, N_WAYS.charges]]), doubles: new Map([[n, [0]]]), ...simple("amine", ["Amine", "Ammonium", "Amine"]) });
  }
  return found;
}

/**
 * The sites of a molecule without its hydrogens - of some of its atoms
 * (`among`; all, unset): each with its forms, and the form it is drawn in
 * now. Its atoms are named by `label` where a form says where its
 * hydrogens go. A site with one form alone - nothing to choose - is none.
 *
 * A site's forms all carry as many hydrogens, less their charge, as it is
 * drawn with: a hydrogen more is a proton, with a charge; two more with
 * none would be two hydrogens added to its bonds (a dihydro tetrazole), two
 * fewer two taken from them (a triazolone's ring drawn as an azo
 * compound) - never forms of it.
 */
export function protonationSites(
  atoms: readonly ProtonAtom[],
  bonds: readonly ProtonBond[],
  label: (i: number) => string,
  among: readonly number[] = atoms.map((_, i) => i),
): Site[] {
  const g = graphOf(atoms, bonds);
  const inside = new Set(among);
  const sites: Site[] = [];
  for (const f of sitesAmong(atoms, bonds, g, inside)) {
    if (f.kind === "metal bond") {
      // (its bond to the metal in place of a hydrogen, as its bonds are drawn - the form it is drawn in; or given by a lone pair of its own, its hydrogens as its other bonds leave room for)
      const i = f.changing[0];
      const charge = atoms[i].charge ?? 0;
      const metals = f.title.slice("Bond to ".length);
      const forms = [
        { h: hydrogensOf(atoms[i], Math.round(g.sum[i] + g.metalSum[i])), name: `Covalent bond to ${metals}`, metal: true },
        { h: hydrogensOf(atoms[i], Math.round(g.sum[i])), name: `Dative bond to ${metals}`, metal: false },
      ].map(({ h, name, metal }) => {
        const form: Form = { at: [{ atom: i, h, charge, ...(metal ? { metal } : {}) }], orders: [], charge, name, where: "" };
        return { ...form, where: whereOf(form, label) };
      });
      sites.push({ kind: f.kind, title: f.title, atoms: f.atoms, changing: f.changing, forms, now: 0 });
      continue;
    }
    const regionSet = new Set(f.region);
    // (each changing atom's ways, its bonds out of the region as they are)
    const ways = f.changing.map((i) => {
      const outside = g.near[i].filter((j) => !regionSet.has(j)).reduce((s, j) => s + bonds[g.bondOf.get(key(i, j))!].order - 1, 0);
      // (outside a region an atom's double bonds stay as they are)
      const doubles = f.region.length ? f.doubles.get(i)! : [Math.round(g.sum[i]) - g.near[i].length - outside];
      return waysOf(atoms[i], g.near[i].length, outside, f.charges.get(i)!, doubles, f.region.length > 0).map((w) => ({ atom: i, ...w }));
    });
    if (ways.some((w) => !w.length)) continue;
    const forms = new Map<string, Form & { charged: number }>();
    const pick = (k: number, chosen: { atom: number; h: number; charge: number }[]) => {
      if (k < ways.length) {
        for (const w of ways[k]) pick(k + 1, [...chosen, w]);
        return;
      }
      const charge = chosen.reduce((s, x) => s + x.charge, 0);
      const charged = chosen.filter((x) => x.charge).length;
      // (one charge a site, of one sign: no zwitterion of its own; a ring's one at most - no doubly charged uracil)
      if (chosen.some((x) => x.charge > 0) && chosen.some((x) => x.charge < 0)) return;
      if (f.cap && Math.abs(charge) > 1) return;
      const id = `${chosen.map((x) => x.h).join(",")}|${charge}`;
      const was = forms.get(id);
      if (was && was.charged <= charged) return;
      const fixed = new Map(chosen.map((x) => [x.atom, x]));
      let orders: { bond: number; order: number }[] = [];
      if (f.region.length) {
        const found = ordersFor(atoms, bonds, g, f.region, fixed);
        if (!found) return;
        orders = [...found].map(([bond, order]) => ({ bond, order }));
      }
      forms.set(id, { at: chosen, orders, charge, name: "", where: "", charged });
    };
    pick(0, []);
    // (as many hydrogens, less the charge, as it is drawn with)
    const level = (form: Form) => form.at.reduce((s, x) => s + x.h, 0) - form.charge;
    const drawn = f.changing.reduce((s, i) => s + hydrogensOf(atoms[i], Math.round(g.sum[i])) - (atoms[i].charge ?? 0), 0);
    const list: Form[] = [...forms.values()]
      .filter((form) => level(form) === drawn)
      .sort((p, q) => q.charge - p.charge || p.at.reduce((s, x, k) => s || q.at[k].h - x.h, 0))
      .map(({ charged: _, ...form }) => ({ ...form, name: nameOf(f, form.charge, atoms, g, form), where: whereOf(form, label) }));
    if (list.length < 2) continue;
    // (the form it is drawn in now: its atoms' hydrogens as its orders and charges give them, and its charge - however its bonds are drawn, a carboxylate's either way)
    const drawnCharge = f.changing.reduce((s, i) => s + (atoms[i].charge ?? 0), 0);
    const now = list.findIndex((form) => form.charge === drawnCharge && form.at.every((x) => x.h === hydrogensOf(atoms[x.atom], Math.round(g.sum[x.atom]))));
    sites.push({ kind: f.kind, title: f.title, atoms: f.atoms, changing: f.changing, forms: list, now: now < 0 ? null : now });
  }
  return sites;
}

/** The charges an atom outside every site can be given - its bonds' orders kept, its hydrogens following: those its valence has room for, of −1, 0 and +1 (a nitrogen, an oxygen, a sulfur). */
export function chargesFor(a: ProtonAtom, sum: number): number[] {
  if (!["N", "O", "S"].includes(a.el) || a.radical) return [];
  // (its valence, as the charge leaves it, met by its bonds and hydrogens - not past it)
  return [-1, 0, 1].filter((charge) => implicitHydrogens(a.el, 0, charge) >= sum);
}

/** What the chemist chose: a form for each site (by its place in the list), and a charge for atoms outside them. */
export type Chosen = { forms: readonly (number | null)[]; charges: ReadonlyMap<number, number> };

/**
 * A molecule protonated as chosen: each atom's charge, each bond's order -
 * found again, together, over every site's bonds, so that every atom's
 * valence is met - and the hydrogens each atom is to carry. Or why it
 * cannot be: a site not chosen, or choices that cannot all be drawn
 * together.
 */
export function protonated(
  atoms: readonly ProtonAtom[],
  bonds: readonly ProtonBond[],
  sites: readonly Site[],
  chosen: Chosen,
): { charges: number[]; orders: number[]; hydrogens: number[] } | { why: string } {
  if (chosen.forms.some((f, k) => f == null && k < sites.length) || chosen.forms.length < sites.length) return { why: "Choose how each site is protonated." };
  const g = graphOf(atoms, bonds);
  const fixed = new Map<number, { h: number; charge: number; metal?: boolean }>();
  const region = new Set<number>();
  sites.forEach((s, k) => {
    const form = s.forms[chosen.forms[k]!];
    for (const x of form.at) fixed.set(x.atom, x);
    for (const o of form.orders) {
      region.add(bonds[o.bond].a1);
      region.add(bonds[o.bond].a2);
    }
  });
  for (const [i, charge] of chosen.charges) {
    if (fixed.has(i)) continue;
    const at = { ...atoms[i], charge };
    fixed.set(i, { h: hydrogensOf(at, Math.round(g.sum[i])), charge });
  }
  const orders = bonds.map((b) => b.order);
  if (region.size) {
    const found = ordersFor(atoms, bonds, g, [...region], fixed);
    if (!found) return { why: "These choices cannot all be drawn together: choose again." };
    for (const [b, o] of found) orders[b] = o;
  }
  const charges = atoms.map((a, i) => fixed.get(i)?.charge ?? a.charge ?? 0);
  const sum = valenceSums(atoms, bonds, orders);
  const hydrogens = atoms.map((a, i) => (a.el === "H" ? 0 : (fixed.get(i)?.h ?? hydrogensOf({ ...a, charge: charges[i] }, Math.round(sum[i])))));
  // (every atom's valence met by its bonds and hydrogens: those changed, and those not)
  // (a donor on a metal: its bond to it in place of a hydrogen, or not - as its form says)
  for (const [i, f] of fixed) if (hydrogensOf({ ...atoms[i], charge: f.charge }, Math.round(sum[i] + (f.metal ? g.metalSum[i] : 0))) !== f.h) return { why: "These choices cannot all be drawn together: choose again." };
  return { charges, orders, hydrogens };
}
