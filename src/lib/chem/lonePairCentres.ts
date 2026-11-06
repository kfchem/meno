/**
 * Which atoms of three neighbours, a lone pair for the fourth, keep a
 * configuration of their own: Meno's rule, the one every reading of a
 * structure's stereo takes - a drawing's wedges (lib/layout/drawn), a
 * SMILES's @ and @@ (lib/chem/smiles), what a structure leaves open
 * (lib/chem/stereoOpen) and a molecule's in 3D (lib/chem/lonePairsIn3d).
 *
 * Such an atom is a pyramid, and its lone pair can pass through the plane
 * of its three neighbours, turning it into its mirror image: pyramidal
 * inversion. Its configuration is its own where that is slow at room
 * temperature - on the barriers Rauk, Allen and Mislow review (Angew.
 * Chem. Int. Ed. Engl. 9, 400, 1970), section and page given:
 * - P, As and S, measured: a phosphine's P, 29-36 kcal/mol (Table 2,
 *   p. 408) - but not one whose planar form would close an aromatic ring
 *   with its lone pair: a phosphole's, about 16 kcal/mol, some 25 below its
 *   saturated analogues (Sec. 4.2, p. 408), lower than a plain N-alkyl
 *   aziridine's (below), nor an arsole's As alike, by Meno's count of an
 *   aromatic ring (lib/chem/conformersSought `flatRingAtoms`); an arsine's
 *   As, its invertomers told apart and one resolved
 *   (Sec. 4.4.2, p. 413); a sulfoxide's, a sulfinate's, a sulfinamide's, a
 *   sulfilimine's and a sulfite's S, its pyramid stable at ordinary
 *   temperatures (p. 412), and a sulfonium's, 25-29 kcal/mol (p. 414);
 * - Sb, Bi, Se and Te, by the review's trend: barriers rise down a group
 *   with atomic number (Sec. 4, p. 407) - none of them measured there. A
 *   stibole's Sb and a bismole's Bi are kept by that trend too: the review
 *   gives no figure for them in an aromatic ring, as it does a phosphole's;
 * - N in a three-membered ring with a heteroatom beside it - a halogen, an
 *   O or an N on it (an N-chloro, an N-alkoxy, an N-amino aziridine's), or
 *   an O or an N next to it in the ring (an oxaziridine's, a
 *   diaziridine's): the ring's strain and the heteroatom together, stable
 *   at room temperature, invertomers separated (Sec. 4.1, p. 407; Sec.
 *   4.4.1, p. 411). Not a plain N-alkyl aziridine's N, lower at 17.7-20.5
 *   kcal/mol (Sec. 4.3, p. 409), its invertomers a conformer search's to
 *   find; nor one bonded to a pi system, lower still (an N-aryl's, 8-13,
 *   Table 1; an N-acyl's, below 6, p. 408);
 * - N at a bridgehead of a small bridged ring system (Tröger's base, a
 *   quinuclidine): it cannot turn over without breaking a bond, its lone
 *   pair having no room to turn into its cage - every bridge of three atoms
 *   or fewer (bicyclo[3.3.3] and smaller), its rings of eight atoms or
 *   fewer (`BRIDGE`). A larger cage can turn it in and out, and is left
 *   free.
 * Any other N - an amine's, which turns over many times a second (4-8
 * kcal/mol, Table 3, p. 409) - is no centre; nor is any other element.
 *
 * With an H among its three - carried, or an atom of its own, as every H
 * is in 3D - a P, As, Sb or Bi is a centre as it is without one (a
 * secondary phosphine's P); an N, or an S, Se or Te, never is, its ring,
 * cage or charge notwithstanding (an oxaziridine's N-H, a sulfonium's
 * S+-H): the maintainer's ruling, 2026-11-06, one rule for a drawing, a
 * SMILES and a molecule in 3D alike.
 *
 * An atom has a lone pair where its valence electrons, less its charge
 * and its bonds' orders, leave two or more: an amine's N, a phosphine's P,
 * a sulfoxide's S (two bonds and a double), a sulfonium's S+; not an
 * iminium's N+ or SO3's S.
 */
import { isMetal } from "../layout/perceive";
import { smallestRings } from "../layout/rings";
import { flatRingAtoms } from "./conformersSought";

/** The elements of the rule but N, which keeps its configuration only where its ring or its cage holds it. */
const KEPT: ReadonlySet<string> = new Set(["P", "As", "Sb", "Bi", "S", "Se", "Te"]);

/** The elements of the rule that are centres with an H among their three (above): the rest - N, S, Se, Te - never are. */
const KEPT_WITH_H: ReadonlySet<string> = new Set(["P", "As", "Sb", "Bi"]);

/** The atoms beside an aziridine's N that hold it: a halogen, an O or an N, on it or next to it in the ring. */
const HOLDS: ReadonlySet<string> = new Set(["F", "Cl", "Br", "I", "O", "N"]);

/** The most atoms a bridge between two bridgeheads holds for the bridgehead N to be held (above): three, bicyclo[3.3.3] and smaller. */
export const BRIDGE = 3;

/** An atom as the rule reads it: its element and charge, and the hydrogens it carries that are not atoms of their own. */
export type PyramidAtom = { el?: string; charge?: number; hs?: number };
/** A bond as the rule reads it: its atoms and its order (4 aromatic). */
export type PyramidBond = { a: number; b: number; order: number };

/**
 * Whether each atom, by index, is a centre by its lone pair under Meno's
 * rule: asked of an atom at a time, the structure's bonds read once.
 */
export function lonePairCentres(atoms: readonly PyramidAtom[], bonds: readonly PyramidBond[]): (at: number) => boolean {
  const around: number[][] = atoms.map(() => []);
  const order: number[] = atoms.map(() => 0);
  // (each atom with a double, triple or aromatic bond: a pi system an N bonded to it shares its lone pair with)
  const pi: boolean[] = atoms.map(() => false);
  for (const b of bonds) {
    if (b.a === b.b || !around[b.a] || !around[b.b]) continue;
    around[b.a].push(b.b);
    around[b.b].push(b.a);
    const o = b.order === 4 ? 1.5 : b.order;
    order[b.a] += o;
    order[b.b] += o;
    if (o > 1) pi[b.a] = pi[b.b] = true;
  }
  const metal = (k: number) => isMetal(atoms[k].el ?? "C");
  // (the atoms on a ring that is aromatic with a P's or an As's lone pair given it - an arsole counted as its phosphole,
  //  As giving its ring its pair as P does - worked out once, where a P or an As is asked of)
  let aromatic: Set<number> | null = null;
  const onAromatic = (at: number) =>
    (aromatic ??= flatRingAtoms(
      atoms.map((a) => ({ el: a.el === "As" ? "P" : (a.el ?? "C"), charge: a.charge ?? 0 })),
      bonds,
      smallestRings(atoms.length, bonds.map((b) => [b.a, b.b] as const)),
    )).has(at);
  const known = new Map<number, boolean>();
  return (at) => {
    if (!known.has(at)) known.set(at, centre(at));
    return known.get(at)!;
  };

  function centre(at: number): boolean {
    const atom = atoms[at];
    const el = atom?.el ?? "C";
    const hs = atom?.hs ?? 0;
    if (!atom || !lonePairOfThree(el, atom.charge ?? 0, around[at].length, order[at], hs)) return false;
    // (an H among its three, carried or an atom of its own: a centre still only where the rule keeps it so - above)
    if ((hs || around[at].some((n) => atoms[n].el === "H")) && !KEPT_WITH_H.has(el)) return false;
    if (el === "P" || el === "As") return !onAromatic(at);
    if (el !== "N") return KEPT.has(el);
    // (an N held by its ring or its cage: its three bonds single, none to a metal)
    if (order[at] !== 3 || around[at].some(metal)) return false;
    const [p, q, r] = around[at];
    const bonded = (x: number, y: number) => around[x].includes(y);
    // (in a three-membered ring with a halogen, an O or an N beside it, bonded to no pi system)
    const small = bonded(p, q) || bonded(q, r) || bonded(p, r);
    if (small && around[at].some((n) => HOLDS.has(atoms[n].el ?? "C")) && !around[at].some((n) => pi[n])) return true;
    return bridgehead(at);
  }

  /**
   * Whether `at` is a bridgehead of a small bridged ring system: another
   * atom, not bonded to it, that three paths reach from it - one through
   * each of its neighbours, none sharing an atom but their ends, each
   * holding at most `BRIDGE` atoms between them, through no metal
   * (Tröger's base: its two N, by its CH2 and its two rings' three atoms
   * each). Rings fused at it - sharing the bond it is on, an indolizidine's -
   * have no such atom.
   */
  function bridgehead(at: number): boolean {
    // (each path out through each neighbour, at most BRIDGE atoms before its end, by the atom it ends at)
    const paths = around[at].map((n) => {
      const out = new Map<number, number[][]>();
      const walk = (path: number[]) => {
        const last = path[path.length - 1];
        for (const v of around[last]) {
          if (v === at || path.includes(v) || metal(v)) continue;
          const p = [...path, v];
          if (!around[at].includes(v)) out.set(v, [...(out.get(v) ?? []), p]);
          if (p.length <= BRIDGE) walk(p);
        }
      };
      if (!metal(n)) walk([n]);
      return out;
    });
    const [a, b, c] = paths;
    for (const [m, pa] of a) {
      const pb = b.get(m);
      const pc = c.get(m);
      if (!pb || !pc) continue;
      // (the bridge atoms: each path but its end)
      const inner = (p: number[]) => p.slice(0, -1);
      for (const x of pa)
        for (const y of pb) {
          if (inner(x).some((k) => inner(y).includes(k))) continue;
          for (const z of pc) if (!inner(z).some((k) => inner(x).includes(k) || inner(y).includes(k))) return true;
        }
    }
    return false;
  }
}

/** The valence electrons of the elements whose atom of three neighbours can have a lone pair: groups 15 and 16. */
const PYRAMID_VALENCE: ReadonlyMap<string, number> = new Map([
  ["N", 5],
  ["P", 5],
  ["As", 5],
  ["Sb", 5],
  ["Bi", 5],
  ["O", 6],
  ["S", 6],
  ["Se", 6],
  ["Te", 6],
]);

/**
 * Whether an atom of three - its `neighbours` and the `hs` hydrogens it
 * carries - has a lone pair for its fourth: a pyramid of three, whether or
 * not the lone pair keeps it (`lonePairCentres`): its valence electrons,
 * less its charge, its bonds' orders (`bondOrders`, aromatic 1.5) and its
 * hydrogens, leave two or more.
 */
export function lonePairOfThree(el: string, charge: number, neighbours: number, bondOrders: number, hs: number): boolean {
  const valence = PYRAMID_VALENCE.get(el) ?? 0;
  return valence > 0 && neighbours + hs === 3 && valence - charge - bondOrders - hs >= 2;
}

/**
 * Whether a wedge drawn at an atom is about its pyramid - a pyramid of
 * three by its lone pair (`lonePairOfThree`), P, As, Sb or Bi; S, Se or Te;
 * an O+, which keeps none - whether or not that keeps a configuration:
 * never an axis's end.
 * Not N, whose lone pair may lie in the plane of a ring or a carbonyl it
 * is bonded to (an N-aryl pyrrole's, an anilide's), its wedge then an
 * axis's.
 */
export function pyramidal(el: string, charge: number, neighbours: number, bondOrders: number, hs: number): boolean {
  return el !== "N" && lonePairOfThree(el, charge, neighbours, bondOrders, hs);
}
