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
 *   aromatic ring (perception/flatRings `flatRingAtoms`); an arsine's
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
 *   Table 1; an N-acyl's, below 6, p. 408) - but an oxaziridine's N with
 *   an aryl on it is kept: its barrier measured at 23.4 kcal/mol (free
 *   energy of activation, a 3-methyl-2,3-diphenyloxaziridine's; Ono,
 *   Splitter and Calvin, Tetrahedron Lett. 14, 4107-4110, 1973), as high
 *   as an N-chloro aziridine's the rule keeps, its aryl a carbocyclic
 *   one; an N-heteroaryl oxaziridine's is not, no barrier measured for it
 *   (the maintainer, 2026-11-25), nor an N-acyl, N-sulfonyl or
 *   N-alkoxycarbonyl oxaziridine's, nor an N-vinyl one's, and a
 *   diaziridine's N with an aryl on it is not, no barrier measured for it
 *   (the maintainer, 2026-11-18);
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
 * SMILES and a molecule in 3D alike. A drawing states such a centre with
 * its H drawn as an atom: with its H carried and two bonds drawn, the two
 * corners left are each other's mirror image, which holds the H not
 * drawn, so its wedge states none (lib/layout/drawn `unreadWhy`).
 *
 * An atom has a lone pair where its valence electrons, less its charge
 * and its bonds' orders, leave two or more: an amine's N, a phosphine's P,
 * a sulfoxide's S (two bonds and a double), a sulfonium's S+; not an
 * iminium's N+ or SO3's S.
 *
 * In the core (foundation part 14 B), moved unchanged from
 * lib/chem/lonePairCentres, which re-exports it.
 */
import { drawnRoundMetal, metal } from "../elements";
import { flatRingAtoms } from "../flatRings";
import { smallestRings } from "../rings";
import { PYRAMID_VALENCE } from "../hydrogens";

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
  // (a metal as the layout draws one round it: lib/layout/perceive `isMetal`, the same set)
  const metal = (k: number) => drawnRoundMetal.has(atoms[k].el ?? "C");
  // (the atoms on a ring that is aromatic with a P's or an As's lone pair given it - an arsole counted as its phosphole,
  //  As giving its ring its pair as P does - worked out once, where a P or an As is asked of)
  let rings: number[][] | null = null;
  const ringsOf = () => (rings ??= smallestRings(atoms.length, bonds.map((b) => [b.a, b.b] as const)));
  let aromatic: Set<number> | null = null;
  const onAromatic = (at: number) =>
    (aromatic ??= flatRingAtoms(
      atoms.map((a) => ({ el: a.el === "As" ? "P" : (a.el ?? "C"), charge: a.charge ?? 0 })),
      bonds,
      ringsOf(),
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
    // (an oxaziridine's N with an aryl on it, the ring's O beside it: held still - above)
    if (small && arylOxaziridine(at)) return true;
    return bridgehead(at);
  }

  /**
   * Whether `at`, an N of three single bonds in a three-membered ring, is
   * an oxaziridine's with an aryl on it: an O beside it in the ring, and
   * its one group outside the ring a C on an aromatic ring by Meno's count
   * (perception/flatRings `flatRingAtoms`) whose ring system - its
   * aromatic rings fused to one another, a naphthalene's two - is all C:
   * a carbocyclic aryl, the kind the barrier was measured for. Not a
   * heteroaryl, joined by a ring C or a ring N (a pyridyl, a thienyl): no
   * barrier is measured for one (the maintainer, 2026-11-25). Nor an acyl,
   * a sulfonyl, an alkoxycarbonyl or a vinyl: none of those is an aromatic
   * ring's C.
   */
  function arylOxaziridine(at: number): boolean {
    const ring = around[at].filter((n) => around[at].some((m) => m !== n && around[n].includes(m)));
    if (ring.length !== 2 || !ring.some((n) => atoms[n].el === "O")) return false;
    const out = around[at].find((n) => !ring.includes(n));
    if (out == null || (atoms[out].el ?? "C") !== "C" || !onAromatic(out)) return false;
    // (the aromatic rings it is on and those fused to them, each ring's every atom aromatic: all of their atoms C)
    const flat = ringsOf().filter((r) => r.every(onAromatic));
    const system = new Set<number>([out]);
    const taken = new Set<number[]>();
    let grew = true;
    while (grew) {
      grew = false;
      for (const r of flat)
        if (!taken.has(r) && r.some((k) => system.has(k))) {
          taken.add(r);
          for (const k of r) system.add(k);
          grew = true;
        }
    }
    return taken.size > 0 && [...system].every((k) => (atoms[k].el ?? "C") === "C");
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

/*
 * The other lists of which atoms have a lone pair to give, share or keep: each its caller's own, said here with its user and its
 * reason, and each caller taking the list it had (foundation part 14 B). None is merged with another or with the rule above:
 * where two are meant as one is the chemistry check's question, with the differences side by side. Meno's rule for an aromatic
 * ring keeps its own list, of the atoms that give a ring two electrons (perception/aromatic `LONE_PAIR`); the CIP keeps its own
 * count of an atom's lone pairs (lib/chem/cip/prepare `lonePairs`), for describing a configuration given - a carbanion's too -
 * not for which atoms keep one.
 */

/**
 * lib/chem/conformersSought: an end atom, uncharged or anionic, whose lone pair an acyl beside it shares, holding the bond
 * between them flat - an amide's N, an ester's O, a thioester's S - so that its two forms are one shape where its two other
 * groups are alike.
 */
export const HELD_FLAT_BY_AN_ACYL: ReadonlySet<string> = new Set(["N", "O", "S"]);

/**
 * lib/layout/cage `bondAngle`: an atom of three bonds or fewer whose lone pair, shared with a double bond beside it, opens its
 * bonds to 120 degrees as drawn - an amide's or a guanidine's N, an ester's O.
 */
export const SHARED_WITH_A_DOUBLE_BOND: ReadonlySet<string> = new Set(["N", "O"]);

/**
 * lib/chem/protonation: the elements that may give a metal a pair of electrons of their own, a bond of theirs to a metal then
 * in place of a hydrogen or not, which only the chemist can say.
 */
export const GIVES_A_METAL_A_PAIR: ReadonlySet<string> = new Set(["N", "P", "As", "O", "S", "Se", "Te"]);

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
 * Whether an end of a double bond is a trigonal-planar centre, which a cis or trans across that bond needs: no metal, and its
 * `neighbours`, its `hs` hydrogens and its lone pairs three at most (VSEPR) - only then do the double bond and the groups on its
 * ends lie in one plane. A C=C's, a C=N's, an N=N's, a silene's or a disilene's ends are; so is a sulfine's S (two neighbours and
 * a lone pair: its E and Z are two compounds). A sulfonium ylide's or a sulfilimine's S (three neighbours and a lone pair), a
 * sulfoxonium ylide's or a sulfoximine's S (four neighbours), a phosphorus ylide's P (four) and a metal carbene's metal are not:
 * their "double bond" is ylidic or dative, with no planar pi bond to hold a cis or trans. The lone pairs counted as the CIP counts
 * them (`lonePairOfThree`). The one rule identity (../symmetry `settingCisTrans`), the candidates (./candidates), the blanks
 * (./units `blanksOf`) and 3D's reader (lib/chem/cip/in3d) ask.
 */
export function trigonalEnd(el: string, charge: number, neighbours: number, bondOrders: number, hs: number): boolean {
  if (metal.has(el)) return false;
  const groups = neighbours + Math.max(0, hs);
  if (groups > 3) return false;
  return !(groups === 3 && lonePairOfThree(el, charge, neighbours, bondOrders, Math.max(0, hs)));
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

/**
 * Which atoms that are a protonated amine's N - an N+ of four neighbours,
 * an H among them, by index - keep a configuration of their own: in
 * solution such an N gives its H up and takes one back, turning over as
 * its amine does, so it keeps one only where its amine's N would by the
 * rule (`lonePairCentres`) - a bridgehead of a small cage, a held
 * aziridine's. Others are not asked of: `null`.
 */
export function protonatedAmineHeld(atoms: readonly PyramidAtom[], bonds: readonly PyramidBond[]): (at: number) => boolean | null {
  const around: number[][] = atoms.map(() => []);
  for (const b of bonds) {
    if (b.a === b.b || !around[b.a] || !around[b.b]) continue;
    around[b.a].push(b.b);
    around[b.b].push(b.a);
  }
  const order = (x: number, y: number) => bonds.find((b) => (b.a === x && b.b === y) || (b.a === y && b.b === x))?.order ?? 0;
  return (at) => {
    const a = atoms[at];
    if (!a || a.el !== "N" || a.charge !== 1) return null;
    const drawnH = around[at].filter((n) => atoms[n].el === "H");
    const hs = (a.hs ?? 0) + drawnH.length;
    if (hs < 1 || around[at].length + (a.hs ?? 0) !== 4 || around[at].some((n) => order(at, n) !== 1)) return null;
    // (its amine: one H taken off, its charge with it)
    const gone = drawnH[0];
    const amineAtoms = atoms.map((x, i) => (i === at ? { ...x, charge: 0, hs: gone == null ? (x.hs ?? 0) - 1 : (x.hs ?? 0) } : x));
    const amineBonds = gone == null ? bonds : bonds.filter((b) => b.a !== gone && b.b !== gone);
    return lonePairCentres(amineAtoms, amineBonds)(at);
  };
}
