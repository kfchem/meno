/**
 * Hydrogens and valence in the core (foundation part 12): how many hydrogens an atom carries that are not drawn as atoms, the valence
 * they are counted against, and the other valence tables of Meno, each under its own name and answering its own question.
 *
 * Moved here unchanged (part 12a): `implicitHydrogens`, `valencesAt`, `mostBonds`, `canTakeBond`, `valenceOrder` and their table from
 * lib/chem/molecule (which re-exports them, so their importers do not change); a formula's valences (lib/chem/formula), a label's
 * (lib/chem/chain) and a carrier's (lib/chem/abbreviations), each imported back by the file whose table it is. New: `hydrogenCounts`, the
 * one count on a graph, an aromatic bond always by its Kekulé order (./kekule).
 *
 * The tables side by side, by element, as each file holds them ("-": the table has no entry; parentheses: a higher valence it also takes).
 * Each answers another question: the count (`VALENCE`, `HIGHEST`) says how many hydrogens an under-bonded DRAWN atom silently carries; a
 * formula's (`FORMULA_VALENCE`, `FORMULA_HIGHER`) how many bonds an element takes in a formula read as a salt or a complex's ion; a
 * label's (`LABEL_VALENCES`) how many bonds an element of a typed group takes, so that "SnBu3" leaves one bond out; a carrier's
 * (`CARRIERS`) how many of one group an atom takes but its bond out (PPh2); OpenSMILES's organic subset (`NORMAL_VALENCES`: that
 * specification's table) the hydrogens a SMILES's plain atom is filled to. Moved here unchanged (part 12d), each imported back by the
 * file whose table it is: OpenSMILES's (lib/chem/smiles), the lone pair's valence electrons (`PYRAMID_VALENCE`, perception/stereo/lonePairs)
 * and the CIP's (`VALENCE_ELECTRONS`, `D_ORBITAL_VALENCE`, `octetValence`, lib/chem/cip/prepare) - electrons, not valences, so not in the
 * table below. One more stays where it is, named, read by part 12c: a figure's bonds left (lib/figure/read `BONDS_LEFT`).
 *
 * | element | the count | a formula's | a label's | a carrier's | OpenSMILES | a figure's |
 * |---|---|---|---|---|---|---|
 * | H | - | 1 | 1 (D 1) | - | - | - |
 * | Li Na K Rb Cs | - | 1 | - | - | - | - |
 * | Be Mg Ca Sr Ba | - | 2 | - | - | - | - |
 * | B | 3 | 3 | 3 | 3 | 3 | 3 |
 * | Al Ga In | - | 3 | - | - | - | - |
 * | C | 4 | 4 | 4 | - | 4 | - |
 * | Si | 4 (to 6 in an anion) | 4 | 4 | 4 | - | 4 |
 * | Ge | - | 4 | 4 | 4 | - | - |
 * | Sn | - | 4 | 4 | 4 | - | - |
 * | Pb | - | 4 | - | - | - | - |
 * | N | 3 | 3 | 3 | 3 | 3 (5) | 3 |
 * | P | 3 (5) | 3 (5) | 3 (5) | 3 | 3 (5) | 3 |
 * | As | - | 3 (5) | 3 (5) | 3 | - | - |
 * | Sb Bi | - | 3 (5) | - | - | - | - |
 * | O | 2 | 2 | 2 | - | 2 | 2 |
 * | S | 2 (6) | 2 (4, 6) | 2 (4, 6) | - | 2 (4, 6) | 2 |
 * | Se | 2 (6) | 2 (4, 6) | 2 (4, 6) | - | - | 2 |
 * | Te | - | 2 (4, 6) | - | - | - | - |
 * | F | 1 | 1 | 1 | - | 1 | - |
 * | Cl Br I | 1 (7) | 1 (3, 5, 7) | 1 | - | 1 | - |
 *
 * A formula's outer electrons (`FORMULA_OUTER`) are by group, 1 to 7, for the elements of a formula's table.
 */
import { metal } from "./elements";
import { valenceOrders } from "./kekule";

/**
 * An atom with electrons of its own unpaired: one (a doublet, the usual
 * radical: CH3•) or two, paired (a singlet carbene) or not (a triplet).
 */
export type Radical = "doublet" | "singlet" | "triplet";

/** A bond as a valence counts it: its order, and whether it lends a pair (dative), coordinates or is a hydrogen bond. */
export type ValenceBond = { order: number; dative?: boolean; coordination?: boolean; hydrogen?: boolean };

/**
 * How much of an atom's valence a bond takes: its order - none for a dative
 * bond, which lends a pair, nor for a coordination or a hydrogen bond. But
 * a carbon at either end of a dative or a coordination bond is the one
 * that lends it - a carbene's, an NHC's, CO's - and the pair it lends is
 * two of its valence: it carries no H for it.
 */
export function valenceOrder(b: ValenceBond, el?: string): number {
  if (b.dative || b.coordination) return el === "C" ? 2 : 0;
  return b.hydrogen ? 0 : b.order;
}

/**
 * Valences used to work out how many hydrogens an atom carries, for the
 * elements that take them; any other carries none it is not drawn with.
 */
const VALENCE: Record<string, { valence: number; group: number }> = {
  B: { valence: 3, group: 13 },
  C: { valence: 4, group: 14 },
  Si: { valence: 4, group: 14 },
  N: { valence: 3, group: 15 },
  P: { valence: 3, group: 15 },
  O: { valence: 2, group: 16 },
  S: { valence: 2, group: 16 },
  Se: { valence: 2, group: 16 },
  F: { valence: 1, group: 17 },
  Cl: { valence: 1, group: 17 },
  Br: { valence: 1, group: 17 },
  I: { valence: 1, group: 17 },
};

/**
 * The hydrogens an atom carries that are not drawn as atoms, for bonds
 * whose orders sum to `bondOrderSum`. A charge moves the valence the way
 * the electrons do: to the right of carbon a positive charge adds a bond
 * (NH4+, H3O+) and a negative one takes one away (O-, NH2-); carbon loses
 * one either way (CH3+, CH3-); boron, to its left, gains one with a
 * negative charge (BH4-). An unpaired electron takes a bond's place, and a
 * carbene's pair two. A P, an S or an Se takes its higher valences where its
 * bonds to non-metals pass the lower (`LADDER`), where the caller says the
 * share of `bondOrderSum` that is bonds to metals (`toMetals`, 0 for none);
 * not said, its element's own valence alone.
 */
export function implicitHydrogens(
  el: string,
  bondOrderSum: number,
  charge = 0,
  radical?: Radical,
  toMetals?: number,
): number {
  const v = VALENCE[el];
  if (!v) return 0;
  // (the lowest valence it takes at or above its bonds - a P(V) of four bonds carries one, an H-phosphonate's; an S(IV) of three,
  //  a sulfinyl H - the rule connection tables and SMILES count by, the chemistry check's ruling. The step is chosen by its bonds
  //  to non-metals alone (`toMetals`, of `bondOrderSum`): a phosphine on a metal stays P(III), no H; past the highest, none. A
  //  caller that does not say which of its bonds go to metals gets its element's own valence alone, as before: none is lifted
  //  by a bond to a metal it did not set apart - found in review)
  if (toMetals == null) return Math.max(0, valenceAs(v, v.valence, charge, radical) - bondOrderSum);
  for (const valence of LADDER[el] ?? [v.valence]) {
    const at = valenceAs(v, valence, charge, radical);
    if (at >= bondOrderSum - toMetals) return Math.max(0, at - bondOrderSum);
  }
  return 0;
}

/**
 * The valences a P, an S or an Se takes, lowest first, for `implicitHydrogens`: P 3 and 5, S and Se 2, 4 and 6 (as a charge or an
 * unpaired electron leaves each). Any other element its own alone.
 */
const LADDER: Record<string, readonly number[]> = { P: [3, 5], S: [2, 4, 6], Se: [2, 4, 6] };

/**
 * The valences an atom of `el` takes at its charge, as `implicitHydrogens`
 * counts them - its element's own and, below the second row, its highest
 * (`HIGHEST`) - or none where Meno has no valence for the element.
 */
export function valencesAt(el: string, charge = 0, radical?: Radical): number[] {
  const v = VALENCE[el];
  if (!v) return [];
  const own = valenceAs(v, v.valence, charge, radical);
  const most = HIGHEST[el] != null ? valenceAs(v, HIGHEST[el], charge, radical) : null;
  return most != null && most !== own ? [own, most] : [own];
}

/** A valence as a charge and an unpaired electron leave it, as `implicitHydrogens` counts them. */
function valenceAs(v: { group: number }, valence: number, charge: number, radical?: Radical): number {
  if (v.group >= 15) valence += charge;
  else if (v.group === 14) valence -= Math.abs(charge);
  else valence -= charge;
  if (radical === "doublet") valence -= 1;
  else if (radical) valence -= 2;
  return valence;
}

/** The highest valence an element below the second row takes, past its own: P(V), S(VI), I(VII). */
const HIGHEST: Record<string, number> = { P: 5, S: 6, Se: 6, Cl: 7, Br: 7, I: 7 };

/**
 * The most an atom's bonds' orders can sum to: its element's valence as its
 * charge and an unpaired electron leave it, counted as `implicitHydrogens`
 * counts them - or a heavier one's highest (P(V), S(VI), I(VII)), a charge
 * either way taking it further (PF6-), and a silicon's one more for each
 * negative charge, to six (SiF6 2-); null for an element with no valence
 * here, a metal.
 */
export function mostBonds(el: string, charge = 0, radical?: Radical): number | null {
  const v = VALENCE[el];
  if (!v) return null;
  // (a silicon's four, and one more for each negative charge, to six: a siliconate's five, SiF6 2-'s six - a neutral one none past four)
  if (el === "Si") return Math.min(6, 4 + Math.max(0, -charge)) - (radical === "doublet" ? 1 : radical ? 2 : 0);
  // (a heavier one's highest, its charge either way taking it further: PF6-'s six, a sulfonium's)
  const highest = HIGHEST[el];
  return highest != null ? highest + Math.abs(charge) - (radical === "doublet" ? 1 : radical ? 2 : 0) : valenceAs(v, v.valence, charge, radical);
}

/**
 * Whether an atom can take another bond: its element's valence, as its
 * charge and unpaired electron leave it, is not yet met by bonds whose
 * orders sum to `bondOrderSum`. An element with no valence here - a metal -
 * always can; hydrogen takes one.
 */
export function canTakeBond(el: string, bondOrderSum: number, charge = 0, radical?: Radical): boolean {
  if (el === "H") return bondOrderSum < 1;
  return VALENCE[el] ? implicitHydrogens(el, bondOrderSum, charge, radical) > 0 : true;
}

/** An atom as the one count reads it: its element, charge and unpaired electrons, and its hydrogens where they are given. */
export type CountedAtom = { el: string; charge?: number; hs?: number; radical?: Radical };
/** A bond as the one count reads it: its atoms by index, its order (4 aromatic; past 4, a file's bond types that take nothing) and its kind. */
export type CountedBond = { a: number; b: number } & ValenceBond;

/**
 * Each atom's hydrogens that are no atoms of their own, the one count: those given (`hs`), else those its valence leaves
 * (`implicitHydrogens`) over its bonds - a single, double or triple bond by its order, an aromatic one (order 4) always by the order a
 * Kekulé structure gives it (./kekule `valenceOrders`; a pyrrole's N keeps its H, a pyridine's has none), a dative, coordination or hydrogen
 * bond as `valenceOrder` counts it, and any other bond type nothing.
 */
export function hydrogenCounts(atoms: readonly CountedAtom[], bonds: readonly CountedBond[]): number[] {
  const sum = atoms.map(() => 0);
  // (and of it, each atom's bonds to metals: a P, S or Se's valence step is chosen by its other bonds - `implicitHydrogens`)
  const toMetals = atoms.map(() => 0);
  const orders = valenceOrders(atoms, bonds);
  bonds.forEach((b, k) => {
    const kind = b.dative || b.coordination || b.hydrogen;
    for (const [end, other] of [
      [b.a, b.b],
      [b.b, b.a],
    ]) {
      const o = kind ? valenceOrder(b, atoms[end]?.el) : orders[k] <= 3 ? orders[k] : 0;
      sum[end] += o;
      if (metal.has(atoms[other]?.el ?? "")) toMetals[end] += o;
    }
  });
  return atoms.map((a, i) => a.hs ?? implicitHydrogens(a.el, Math.round(sum[i]), a.charge ?? 0, a.radical, Math.round(toMetals[i])));
}

/** One atom's hydrogens by the one count (`hydrogenCounts`). */
export function hydrogensOn(atoms: readonly CountedAtom[], bonds: readonly CountedBond[], atom: number): number {
  return hydrogenCounts(atoms, bonds)[atom];
}

/** The valence each element of a formula has first (lib/chem/formula: a salt's ions, a complex's counter-anion). */
export const FORMULA_VALENCE: Record<string, number> = {
  H: 1, Li: 1, Na: 1, K: 1, Rb: 1, Cs: 1, F: 1, Cl: 1, Br: 1, I: 1,
  Be: 2, Mg: 2, Ca: 2, Sr: 2, Ba: 2, O: 2, S: 2, Se: 2, Te: 2,
  B: 3, Al: 3, Ga: 3, In: 3, N: 3, P: 3, As: 3, Sb: 3, Bi: 3,
  C: 4, Si: 4, Ge: 4, Sn: 4, Pb: 4,
};

/** The valences beyond it an element below the second row takes in an anion of a formula: P(V) in PF6, Cl(VII) in ClO4. */
export const FORMULA_HIGHER: Record<string, number[]> = {
  P: [5], As: [5], Sb: [5], Bi: [5], S: [4, 6], Se: [4, 6], Te: [4, 6], Cl: [3, 5, 7], Br: [3, 5, 7], I: [3, 5, 7],
};

/** An element of a formula's outer electrons, by its group: a centre with as many bonds has no lone pair left. */
export const FORMULA_OUTER: Record<string, number> = Object.fromEntries(
  ["H Li Na K Rb Cs", "Be Mg Ca Sr Ba", "B Al Ga In", "C Si Ge Sn Pb", "N P As Sb Bi", "O S Se Te", "F Cl Br I"].flatMap((g, i) =>
    g.split(" ").map((el) => [el, i + 1]),
  ),
);

/** The valences each element may have in a group a label names (lib/chem/chain): carbon four, sulfur two, four or six. */
export const LABEL_VALENCES: Record<string, number[]> = {
  H: [1], D: [1], F: [1], Cl: [1], Br: [1], I: [1],
  O: [2], S: [2, 4, 6], Se: [2, 4, 6],
  N: [3], P: [3, 5], As: [3, 5], B: [3],
  C: [4], Si: [4], Ge: [4], Sn: [4],
};

/**
 * Atoms that take as many of one group as fill their valence but the bond
 * out (PPh2, PCy2, NBn2): each one's valence, and the word its group's name
 * ends in (lib/chem/abbreviations).
 */
export const CARRIERS: Record<string, { valence: number; word: string }> = {
  B: { valence: 3, word: "boranyl" },
  N: { valence: 3, word: "amino" },
  P: { valence: 3, word: "phosphanyl" },
  As: { valence: 3, word: "arsanyl" },
  Si: { valence: 4, word: "silyl" },
  Ge: { valence: 4, word: "germyl" },
  Sn: { valence: 4, word: "stannyl" },
};

/** The valences an organic-subset atom may have, as OpenSMILES fills its hydrogens to (lib/chem/smiles): that specification's table. */
export const NORMAL_VALENCES: Record<string, number[]> = {
  B: [3], C: [4], N: [3, 5], O: [2], P: [3, 5], S: [2, 4, 6], F: [1], Cl: [1], Br: [1], I: [1],
};

/** The valence electrons of the elements whose atom of three neighbours can have a lone pair: groups 15 and 16 (perception/stereo/lonePairs). */
export const PYRAMID_VALENCE: ReadonlyMap<string, number> = new Map([
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

/** Each element's valence electrons, for those of the main groups the CIP's conventions and the lone pairs ask about (lib/chem/cip/prepare). */
export const VALENCE_ELECTRONS: Record<string, number> = {
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
  // (a noble gas's, for the lone pairs of a xenon or krypton fluoride: no centre - lib/chem/cip/index `refusedCentre`)
  Kr: 8,
  Xe: 8,
};

/** The elements the CIP's convention (b) reads, each with its valence uncharged: the third period on, groups 15 to 17 (lib/chem/cip/prepare). */
export const D_ORBITAL_VALENCE: Record<string, number> = { P: 3, As: 3, Sb: 3, Bi: 3, S: 2, Se: 2, Te: 2, Cl: 1, Br: 1, I: 1 };

/** The second period's, whose bonds an octet bounds (`octetValence`). */
export const SECOND_PERIOD = new Set(["B", "C", "N", "O", "F"]);

/** The most bonds an atom of the second period takes by its octet: B 3, C 4, N 3, O 2, with its charge (N+ 4, C+ 3, O- 1) - the CIP's (lib/chem/cip/prepare). */
export function octetValence(el: string, charge: number): number | null {
  const ve = VALENCE_ELECTRONS[el];
  if (ve == null || !SECOND_PERIOD.has(el)) return null;
  const e = ve - charge;
  return Math.min(e, 8 - e);
}
