/**
 * What kind of element (foundation part 3): each set Meno reads an element by, said once, under the name of what it means, with who takes it.
 * Sets of symbols as the element table writes them (lib/chem/elements), case and all; anything that is no element's symbol (a star, a label,
 * "R") is in none of them.
 *
 * The sets a caller takes are its lists as they were, moved here unchanged; where one differs from the plain chemical set (`drawnRoundMetal`
 * from `transitionMetal`, the two sets of elements whose bonds are counted), the difference is named in its comment, to be mended one ruling at
 * a time and not by a caller choosing another copy.
 */
import { ELEMENTS } from "../elements";

/** The symbols of the elements whose atomic numbers lie in the ranges given, each range from and to inclusive. */
const byNumber = (...ranges: readonly (readonly [number, number])[]): ReadonlySet<string> =>
  new Set(ELEMENTS.filter((e) => ranges.some(([from, to]) => e.number >= from && e.number <= to)).map((e) => e.symbol));

/**
 * The transition metals: the d block (groups 3 to 12, Sc to Zn, Y to Cd, Hf to Hg, Rf to Cn) WITH the lanthanoids and the actinoids, IUPAC's
 * inner transition elements - so Z 21-30, 39-48, 57-80, 89-112, 68 elements. Not groups 3 to 12 only. A metal four ligands are held round as its d
 * count holds them (lib/chem/metalHolds).
 */
export const transitionMetal: ReadonlySet<string> = byNumber([21, 30], [39, 48], [57, 80], [89, 112]);

/** The metals of the main groups: the alkali and alkaline-earth metals, and the metals of groups 13 to 16 (Al to Nh, Sn to Fl, Bi and Mc, Po and Lv). */
export const mainGroupMetal: ReadonlySet<string> = new Set("Li Na K Rb Cs Fr Be Mg Ca Sr Ba Ra Al Ga In Tl Nh Sn Pb Fl Bi Mc Po Lv".split(" "));

/** The metals: a transition metal or a main-group one. Every element is a `metal` or a `notMetal`, never both. */
export const metal: ReadonlySet<string> = new Set([...transitionMetal, ...mainGroupMetal]);

/**
 * The elements that are no metals: hydrogen, the noble gases, the nonmetals and the metalloids (B, Si, Ge, As, Sb, Te, At; Ts with At). A label's
 * smart reading reads every other symbol as a metal's (lib/chem/smartLabel), and only an atom of these carries groups written after it
 * (lib/chem/abbreviations).
 */
export const notMetal: ReadonlySet<string> = new Set("H He B C N O F Ne Si P S Cl Ar Ge As Se Br Kr Sb Te I Xe At Rn Ts Og".split(" "));

/**
 * What a label typed or written is that is also an element's symbol (the maintainer's rule, 2026-10-10: a group named as an element is the
 * group): "Pr" propyl's, "Ac" acetyl's, "Ts" tosyl's, "Fm" 9-fluorenylmethyl's, "At" 7-azabenzotriazol-1-yl's. A fact about labels, not
 * about the elements: what a typed label is read as, and what a label's text holds (Ac in HoAc, acetyl's - lib/chem/ligands). A drawing's
 * atom so typed holds its group, and is given to every reader of elements as the group's name, never as the element (foundation part 3,
 * B2, the maintainer's choice of 2026-11-16); an atom with the symbol and nothing held - from a file's element column, a SMILES, 3D - is
 * the element. Every label and other name of the abbreviations' table (lib/chem/abbreviations) that is an element's symbol, and no other:
 * held so by a test, the core taking no table but the elements'.
 */
export const labelNotElement: ReadonlySet<string> = new Set(["Pr", "Ac", "Ts", "Fm", "At"]);

/**
 * The metals ligands are drawn round (lib/layout/perceive `isMetal`, docs/LAYOUT-2D.md section 7), and a complex's formula is read for
 * (lib/chem/ligands): the `transitionMetal`s, the actinoids among them (Th to Lr: uranocene is a sandwich as ferrocene is, and an H on U is a
 * hydride kept, as on Pd - foundation part 3, B1), praseodymium, actinium and fermium with them: a drawing's propyl, acetyl or
 * 9-fluorenylmethyl typed as Pr, Ac or Fm is given to these readers as the group's name, never as the element (`labelNotElement`; B2). But
 * Rf to Cn, the seventh row's d block, whose complexes are not made: not listed, as before.
 */
export const drawnRoundMetal: ReadonlySet<string> = ((notMade) => new Set([...transitionMetal].filter((el) => !notMade.has(el))))(byNumber([104, 112]));

/**
 * Nine metals of groups 1, 2, 12 and 13 bridged to a transition metal by two atoms as a second transition metal is - the Tebbe reagent's
 * aluminium, Cp2Ti(μ-Cl)(μ-CH2)AlMe2 - so that the ring the two bridges close is drawn as such a ring is (lib/layout/perceive). Zn is among
 * them and in `transitionMetal` too: this set is of the bridge's partner, not a kind of element.
 */
export const bridgesToMetal: ReadonlySet<string> = new Set(["Li", "Na", "K", "Mg", "Ca", "Zn", "Al", "Ga", "In"]);

/** The charges of the ions groups 1 and 2 make: a halide of one is a salt, written as its ions (lib/chem/smilesWhy). */
export const ionic: ReadonlyMap<string, number> = new Map([
  ...["Li", "Na", "K", "Rb", "Cs", "Fr"].map((el) => [el, 1] as const),
  ...["Be", "Mg", "Ca", "Sr", "Ba", "Ra"].map((el) => [el, 2] as const),
]);

/**
 * Of `ionic`, the metals a condensed formula binds as ions to anything (lib/chem/condensed): the alkali metals but lithium, which is bound as an
 * ion to anything but carbon (said where it is read), and francium, in no formula.
 */
export const alwaysIonic: ReadonlySet<string> = new Set([...ionic].filter(([el, charge]) => charge === 1 && el !== "Li" && el !== "Fr").map(([el]) => el));

/**
 * The elements whose bonds count in their neighbours' valences, as a structure's protonation reads them (lib/chem/protonation) and as bond
 * orders are worked out from a geometry (lib/chem/ordersFromGeometry): hydrogen, the nonmetals and the metalloids - not a metal's bonds, which
 * are dative, kept single and out of the reckoning, nor a noble gas's, At's or Ts's. Sb among them as As is: a metalloid bonded covalently to
 * C, H and halogens (SbPh3, SbCl3), so that an aryl carbon on it is not one bond short (foundation part 3, B3; before, the geometry's set
 * left Sb out).
 */
export const inValenceSums: ReadonlySet<string> = new Set("H B C N O F Si P S Cl Ge As Se Br Sb Te I".split(" "));
