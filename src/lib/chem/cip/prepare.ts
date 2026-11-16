/**
 * A structure made ready for the sequence rules (docs/CIP.md): the
 * valence-bond conventions of Cahn, Ingold and Prelog 1966 (§2.2, pp.
 * 391-394) applied once, before any digraph is built, and each atom's
 * ligancy complemented as the hierarchical digraph wants it.
 *
 * - Convention (b), d orbitals neglected (p. 391; p. 392 names sulphoxides
 *   and sulphinates): a double bond at an atom of the third period or later
 *   with more bonds than its valence - a sulfoxide's, a sulfone's or a
 *   sulfinate's S=O and S=S, a phosphine oxide's P=O, an ylide's P=C - is
 *   taken as a single bond, its charges on its ends (S+-O-).
 * - Convention (c), usual structures (p. 391): an atom of the second period
 *   drawn with more bonds than its octet allows - a nitro group drawn
 *   N(=O)=O, an N-oxide drawn N=O - is given the usual structure, N+ and O-.
 * - Convention (d), as amended in 1966 (pp. 392-394): a closed-conjugated
 *   system with several Kekulé structures is their blend. Each of its atoms
 *   gets one duplicate, of the mean atomic number of its neighbours in the
 *   system, the delocalised valency shared equally among them (p. 393). The
 *   bonds are those on an alternating cycle (lib/chem/identity
 *   `aromaticForm`), of any size: benzene's and pyridine's, and
 *   cyclooctatetraene's and azulene's perimeter, which p. 393 names - as
 *   Hanson et al. 2018 (p. 1758) propose, a fully conjugated cycle of
 *   essentially any size.
 * - Ligancy complementation (1966 pp. 390-392): duplicates at both ends of
 *   each multiple bond, then phantom atoms of atomic number 0 up to four,
 *   for lone pairs and incomplete shells.
 *
 * A mesomeric system with a charge, a lone pair, an empty place or an
 * unpaired electron carried along it - a carboxylate, a nitro group, an
 * enolate, an amidinium, a cyclopentadienide - is not blended (`Mesomeric`):
 * its usual structures are found, and its atoms marked unsure, to be asked
 * about again with each of those structures drawn (index.ts `agreed`).
 * What the conventions cannot complement at all is marked unsure too: a
 * metal, a star, an element with no symbol, an atom still past its octet.
 * A ranking that would have to look past an unsure atom says so, and gives
 * no label: it never takes the structure as drawn for its blend.
 */
import { isMetal } from "../../layout/perceive";
import { elementOf } from "../elements";
import { aromaticForm, type IdentityInput } from "../identity";
import { isotopeMass, standardWeight } from "../isotopes";

/** Each element's valence electrons, for those of the main groups the conventions ask about. */
const VALENCE_ELECTRONS: Record<string, number> = {
  H: 1,
  B: 3,
  C: 4,
  N: 5,
  O: 6,
  F: 7,
  Al: 3,
  Si: 4,
  P: 5,
  S: 6,
  Cl: 7,
  Ga: 3,
  Ge: 4,
  As: 5,
  Se: 6,
  Br: 7,
  In: 3,
  Sn: 4,
  Sb: 5,
  Te: 6,
  I: 7,
  Tl: 3,
  Pb: 4,
  Bi: 5,
};

/** The elements convention (b) reads, each with its valence uncharged: the third period on, groups 15 to 17. */
const D_ORBITAL_VALENCE: Record<string, number> = { P: 3, As: 3, Sb: 3, Bi: 3, S: 2, Se: 2, Te: 2, Cl: 1, Br: 1, I: 1 };

/** The second period's, whose bonds an octet bounds. */
const SECOND_PERIOD = new Set(["B", "C", "N", "O", "F"]);

const pair = (a: number, b: number) => (a < b ? `${a},${b}` : `${b},${a}`);

/** A structure as the sequence rules read it, after the conventions. */
export type Prepared = {
  input: IdentityInput;
  /** Each atom's atomic number; NaN where its element is no element (a label, a star). */
  z: number[];
  /** Each atom's mass for rule 2 (Hanson et al. 2018 p. 1759): its isotope's exact mass where it has one, else its element's atomic weight; NaN where none is known. */
  mass: number[];
  /** Each atom's hydrogens not drawn as atoms. */
  hs: number[];
  /** Each atom's neighbours. */
  around: number[][];
  /** Each atom's charge after the conventions. */
  charge: number[];
  /** Each bond's order after the conventions, by its atoms ("a,b", the lower first): 1, 2 or 3; a blended bond 1. */
  order: Map<string, number>;
  /** Each bond's index in the input, by its atoms. */
  bondAt: Map<string, number>;
  /** The bonds of a blended system (convention (d)), by their atoms: each taken as single, its atoms' duplicate the blend's. */
  blended: Set<string>;
  /** Each atom's duplicates, by the atomic number each stands for: one per multiple bond's extra order, of the atom at its other end; one for a blended system, of its neighbours' mean. */
  dups: { z: number; of: number }[][];
  /** Whether an atom's ligands cannot be told from the drawing: see above. */
  unsure: boolean[];
  /** Its charged or radical mesomeric systems (`Mesomeric`), and each atom's, by index; -1 for none. */
  systems: Mesomeric[];
  systemOf: number[];
};

/**
 * A mesomeric system with a charge, a lone pair, an empty place or an
 * unpaired electron that its usual structures put on different atoms - a
 * carboxylate, an enolate, an amidinate, an allyl ion: its atoms, and its
 * usual structures, each the order of each of its bonds and the charge of
 * each of its atoms. None where it has more than `MOST_STRUCTURES`, or is
 * of a kind not worked out: then it is unsure whatever is asked.
 */
export type Mesomeric = { atoms: number[]; structures: { orders: Map<string, number>; charges: Map<number, number> }[] };

/** Each atom's bond orders summed, with its hydrogens. */
function valences(n: number, hs: readonly number[], order: ReadonlyMap<string, number>): number[] {
  const v = [...hs];
  for (const [k, o] of order) {
    const [a, b] = k.split(",").map(Number);
    v[a] += o;
    v[b] += o;
  }
  return v.slice(0, n);
}

/** The most bonds an atom of the second period takes by its octet: B 3, C 4, N 3, O 2, with its charge (N+ 4, C+ 3, O- 1). */
function octetValence(el: string, charge: number): number | null {
  const ve = VALENCE_ELECTRONS[el];
  if (ve == null || !SECOND_PERIOD.has(el)) return null;
  const e = ve - charge;
  return Math.min(e, 8 - e);
}

/**
 * `input` made ready for the rules. Its charged or radical mesomeric
 * systems are unsure (index.ts asks again with each of their usual
 * structures drawn, `asDrawn` the atoms of those taken as drawn) - but one
 * with a single usual structure, which is as drawn.
 */
export function prepared(input: IdentityInput, asDrawn: ReadonlySet<number> = new Set()): Prepared {
  const n = input.atoms.length;
  const atoms = input.atoms;
  const charge = atoms.map((a) => a.charge ?? 0);
  const hs = atoms.map((a) => a.hs ?? 0);
  const around: number[][] = atoms.map(() => []);
  const order = new Map<string, number>();
  const bondAt = new Map<string, number>();
  const unsure = atoms.map((a) => {
    const e = elementOf(a.el);
    return !e || a.el === "*" || isMetal(a.el) || !!a.pi;
  });
  input.bonds.forEach((b, i) => {
    if (b.a === b.b || bondAt.has(pair(b.a, b.b))) return;
    bondAt.set(pair(b.a, b.b), i);
    around[b.a].push(b.b);
    around[b.b].push(b.a);
    // (a bond of another order - aromatic, dative, to a metal - has no duplicates the rules can make: its atoms unsure)
    if (b.order === 1 || b.order === 2 || b.order === 3) order.set(pair(b.a, b.b), b.order);
    else {
      order.set(pair(b.a, b.b), 1);
      unsure[b.a] = unsure[b.b] = true;
    }
  });

  // convention (b): a double bond at an atom past its valence, of the third period on, dipolar
  let v = valences(n, hs, order);
  for (let a = 0; a < n; a++) {
    const base = D_ORBITAL_VALENCE[atoms[a].el];
    if (base == null) continue;
    for (const b of around[a]) {
      if (v[a] <= base + charge[a]) break;
      const k = pair(a, b);
      if (order.get(k) !== 2) continue;
      order.set(k, 1);
      charge[a] += 1;
      charge[b] -= 1;
      v = valences(n, hs, order);
    }
  }
  // convention (c): an atom of the second period past its octet given its usual structure, its double bond to an end O or S dipolar
  for (let a = 0; a < n; a++) {
    for (const b of around[a]) {
      const most = octetValence(atoms[a].el, charge[a]);
      if (most == null || v[a] <= most) break;
      const k = pair(a, b);
      if (order.get(k) !== 2 || around[b].length !== 1 || !(atoms[b].el === "O" || atoms[b].el === "S")) continue;
      order.set(k, 1);
      charge[a] += 1;
      charge[b] -= 1;
      v = valences(n, hs, order);
    }
    const most = octetValence(atoms[a].el, charge[a]);
    if (most != null && v[a] > most) unsure[a] = true;
  }

  // convention (d): the blend of a closed-conjugated system's Kekulé structures
  const blended = new Set<string>();
  const formed = aromaticForm({
    atoms: atoms.map((a) => ({ el: a.el })),
    bonds: [...order].map(([k, o]) => {
      const [a, b] = k.split(",").map(Number);
      return { a, b, order: o };
    }),
  });
  for (const b of formed.bonds) if (b.order === 4) blended.add(pair(b.a, b.b));

  const z = atoms.map((a) => elementOf(a.el)?.number ?? NaN);
  const dups: { z: number; of: number }[][] = atoms.map(() => []);
  for (let a = 0; a < n; a++) {
    const inSystem = around[a].filter((b) => blended.has(pair(a, b)));
    if (inSystem.length) dups[a].push({ z: inSystem.reduce((t, b) => t + z[b], 0) / inSystem.length, of: -1 });
    for (const b of around[a]) {
      if (blended.has(pair(a, b))) continue;
      for (let k = 1; k < (order.get(pair(a, b)) ?? 1); k++) dups[a].push({ z: z[b], of: b });
    }
  }
  for (const k of blended) order.set(k, 1);

  // a charged or radical mesomeric system: unsure, but where it has one usual structure or is asked as drawn (index.ts `agreed`)
  const systems = mesomericSystems(input, around, order, blended, hs, charge, mesomeric(input, around, order, blended, hs, charge));
  const systemOf = atoms.map(() => -1);
  systems.forEach((m, i) => {
    for (const a of m.atoms) {
      systemOf[a] = i;
      if (!m.structures.length || (m.structures.length > 1 && !asDrawn.has(a))) unsure[a] = true;
    }
  });

  const mass = atoms.map((a) => (a.isotope ? (isotopeMass(a.el, a.isotope) ?? NaN) : (standardWeight(a.el) ?? NaN)));
  return { input, z, mass, hs, around, charge, order, bondAt, blended, dups, unsure, systems, systemOf };
}

/** An atom's lone pairs after the conventions, from its valence electrons, charge and bonds: none for an element not listed. */
export function lonePairs(p: Prepared, a: number): number {
  const ve = VALENCE_ELECTRONS[p.input.atoms[a].el];
  if (ve == null) return 0;
  // (each bond once, and each of its duplicates for the orders past the first)
  const bonded = p.around[a].length + p.hs[a] + p.dups[a].length;
  return Math.max(0, Math.floor((ve - p.charge[a] - bonded) / 2));
}

/**
 * The atoms of each mesomeric system whose usual structures the drawing
 * picks one of: X-Y=Z where moving the double bond to X=Y and a charge,
 * a lone pair or an unpaired electron from X to Z gives a structure with no
 * more formal charges (1966 convention (c)) - a carboxylate, a nitro group
 * as conventions (b) and (c) leave it, an enolate, a phenolate, an
 * amidinium, a carbocation beside a double bond, an allyl radical - and on
 * along the conjugation from Z. An amide's N-C=O or an enol ether's O-C=C
 * is none: moving its pair makes two charges where there were none.
 */
function mesomeric(input: IdentityInput, around: readonly number[][], order: ReadonlyMap<string, number>, blended: ReadonlySet<string>, hs: readonly number[], charge: readonly number[]): Set<number> {
  const atoms = input.atoms;
  const bondsOf = (a: number) => around[a].reduce((t, b) => t + (blended.has(pair(a, b)) ? 1.5 : (order.get(pair(a, b)) ?? 1)), hs[a]);
  const doubled = (y: number, not: number) => around[y].filter((z) => z !== not && (order.get(pair(y, z)) === 2 || blended.has(pair(y, z))));
  const out = new Set<number>();
  const spread = (from: number, via: number) => {
    // (on along the conjugation: Z-W=V takes the charge on as X-Y=Z did)
    const queue: [number, number][] = [[from, via]];
    while (queue.length) {
      const [z, y] = queue.pop()!;
      for (const w of around[z]) {
        if (w === y || order.get(pair(z, w)) !== 1 || blended.has(pair(z, w))) continue;
        for (const v of doubled(w, z)) {
          if (out.has(v) && out.has(w)) continue;
          out.add(w).add(v);
          queue.push([v, w]);
        }
      }
    }
  };
  for (let x = 0; x < atoms.length; x++) {
    const ve = VALENCE_ELECTRONS[atoms[x].el];
    if (ve == null || atoms[x].el === "H") continue;
    const bonded = bondsOf(x);
    const lone = ve - charge[x] - bonded;
    const radical = !!atoms[x].radical || lone % 2 === 1;
    // (with an empty orbital: fewer than eight electrons round it, of the second period)
    const empty = SECOND_PERIOD.has(atoms[x].el) && lone >= 0 && 2 * bonded + lone < 8;
    for (const y of around[x]) {
      if (order.get(pair(x, y)) !== 1 || blended.has(pair(x, y))) continue;
      for (const z of doubled(y, x)) {
        const now = Math.abs(charge[x]) + Math.abs(charge[z]);
        const gives = lone >= 2 && Math.abs(charge[x] + 1) + Math.abs(charge[z] - 1) <= now;
        const takes = empty && Math.abs(charge[x] - 1) + Math.abs(charge[z] + 1) <= now;
        if (!gives && !takes && !radical) continue;
        out.add(x).add(y).add(z);
        spread(z, y);
      }
    }
  }
  return out;
}

/**
 * The most usual structures one mesomeric system is taken in: past it, the
 * system is unsure. A carboxylate, an enolate or an amidinate has two or
 * three, a cyclopentadienide five; 64 is far past any ordinary system, and
 * keeps a structure's work bounded, each of its units asked again at most
 * that many times (index.ts `MOST_VARIANTS`).
 */
export const MOST_STRUCTURES = 64;

/**
 * The charged or radical mesomeric systems of a structure (`mesomeric`'s
 * atoms, joined through bonds of no closed-conjugated ring), each with its
 * usual structures: as many double bonds as drawn, on the system's bonds,
 * each atom in one at most, what moves - a lone pair, an empty place, an
 * unpaired electron - held by the atoms left, and no more formal charges
 * than drawn (CIP 1966 convention (c), p. 391).
 *
 * Where a system meets a closed-conjugated ring (blended before), its
 * structures keep that ring as it is, as CIP 1966 has it for overlapped
 * systems (p. 394, "maximally retain primary systems"): a phenolate's
 * charge stays on its O, a fluorenylide's on C9, an indenylide's moves
 * between C1 and C3 only.
 */
function mesomericSystems(
  input: IdentityInput,
  around: readonly number[][],
  order: ReadonlyMap<string, number>,
  blended: ReadonlySet<string>,
  hs: readonly number[],
  charge: readonly number[],
  marked: ReadonlySet<number>,
): Mesomeric[] {
  const atoms = input.atoms;
  const primary = new Set<number>();
  for (const k of blended) for (const a of k.split(",").map(Number)) primary.add(a);
  const free = new Set([...marked].filter((a) => !primary.has(a)));
  const out: Mesomeric[] = [];
  const seen = new Set<number>();
  for (const start of [...free].sort((p, q) => p - q)) {
    if (seen.has(start)) continue;
    const system: number[] = [];
    const queue = [start];
    seen.add(start);
    while (queue.length) {
      const a = queue.pop()!;
      system.push(a);
      for (const b of around[a]) {
        if (!free.has(b) || seen.has(b) || blended.has(pair(a, b))) continue;
        seen.add(b);
        queue.push(b);
      }
    }
    system.sort((p, q) => p - q);
    out.push({ atoms: system, structures: structuresOf(system) ?? [] });
  }
  return out;

  /** A system's usual structures; null where it is of a kind not worked out, or has more than `MOST_STRUCTURES`. */
  function structuresOf(system: number[]): Mesomeric["structures"] | null {
    const inSystem = new Set(system);
    const edges: [number, number][] = [];
    const drawn = new Set<string>();
    for (const a of system) {
      for (const b of around[a]) {
        const o = order.get(pair(a, b)) ?? 1;
        if (!inSystem.has(b)) {
          // (a double bond out of the system, or a triple bond: not one the conventions' examples show)
          if (o >= 2 && !blended.has(pair(a, b))) return null;
          continue;
        }
        if (o >= 3) return null;
        if (a < b) {
          edges.push([a, b]);
          if (o === 2) drawn.add(pair(a, b));
        }
      }
    }
    const matchedDrawn = new Set([...drawn].flatMap((k) => k.split(",").map(Number)));
    const holders = system.filter((a) => !matchedDrawn.has(a));
    // (what moves: a lone pair, an empty place, or an unpaired electron - one kind in a system)
    const kinds = new Set(holders.map(kindOf));
    if (!holders.length || kinds.size !== 1 || kinds.has(null)) return null;
    const kind = [...kinds][0]!;
    const sign = kind === "pair" ? 1 : kind === "empty" ? -1 : 0;
    const chargesDrawn = system.reduce((t, a) => t + Math.abs(charge[a]), 0);

    const found: Mesomeric["structures"] = [];
    const partner = new Map<number, number>();
    let tooMany = false;
    const usual = (): Mesomeric["structures"][number] | null => {
      const charges = new Map<number, number>();
      let count = 0;
      for (const a of system) {
        const now = partner.has(a) ? 1 : 0;
        const was = matchedDrawn.has(a) ? 1 : 0;
        if (!now && was && !canHold(a, kind)) return null;
        const c = charge[a] + sign * (now - was);
        charges.set(a, c);
        count += Math.abs(c);
      }
      if (count > chargesDrawn) return null;
      const orders = new Map(edges.map(([p, q]) => [pair(p, q), partner.get(p) === q ? 2 : 1]));
      return { orders, charges };
    };
    const pick = (i: number, left: number) => {
      if (tooMany) return;
      if (left === 0) {
        const s = usual();
        if (s) found.push(s);
        tooMany = found.length > MOST_STRUCTURES;
        return;
      }
      if (system.slice(i).filter((a) => !partner.has(a)).length < 2 * left) return;
      const a = system[i];
      if (partner.has(a)) return pick(i + 1, left);
      for (const [p, q] of edges) {
        const b = p === a ? q : q === a ? p : -1;
        if (b < a || partner.has(b)) continue;
        partner.set(a, b).set(b, a);
        pick(i + 1, left - 1);
        partner.delete(a);
        partner.delete(b);
      }
      // (a left with no double bond: it holds what moves)
      pick(i + 1, left);
    };
    pick(0, drawn.size);
    return tooMany ? null : found;
  }

  /** What an atom with no double bond in the system holds that one could take: a lone pair, an empty place (a C of six electrons), or an unpaired electron. */
  function kindOf(a: number): "pair" | "empty" | "odd" | null {
    const el = atoms[a].el;
    const ve = VALENCE_ELECTRONS[el];
    if (ve == null) return null;
    const bonded = around[a].reduce((t, b) => t + (order.get(pair(a, b)) ?? 1), hs[a]);
    const lone = ve - charge[a] - bonded;
    if (atoms[a].radical || lone % 2 === 1) return "odd";
    if (lone >= 2) return "pair";
    if (el === "C" && lone === 0 && bonded === 3) return "empty";
    return null;
  }

  /** Whether an atom could hold what moves, its double bond in the system gone: a lone pair a C, N, O or S; an empty place a C; an unpaired electron a C, N or O. */
  function canHold(a: number, kind: "pair" | "empty" | "odd"): boolean {
    const el = atoms[a].el;
    return kind === "pair" ? ["C", "N", "O", "S"].includes(el) : kind === "empty" ? el === "C" : ["C", "N", "O"].includes(el);
  }
}
