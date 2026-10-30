import type { CtMolecule } from "./ctfile";

/**
 * What an atom is, chemically - the one place it is said, for every kind of
 * molecule the app handles: a file's as parsed, the editor's, the one the
 * drawing is made of, the one written out. Each adds where the atom is and
 * whatever else it needs; none says what the atom is any other way.
 */

/**
 * An atom with electrons of its own unpaired: one (a doublet, the usual
 * radical: CH3•) or two, paired (a singlet carbene) or not (a triplet).
 */
export type Radical = "doublet" | "singlet" | "triplet";

/** An atom list: the atom is one of `symbols`, or with `not`, none of them. */
export type AtomList = { not: boolean; symbols: string[] };

/**
 * The atoms and bonds an abbreviation's label stands for, where a file gave
 * them: each atom where it was, from the labelled atom; `attach`, the ones
 * its bonds out of the group leave from, in order.
 */
export type AbbreviationStructure = {
  /**
   * Its atoms, where they are - and, laid out in perspective (a cage), how
   * near the viewer each is (`z`) and whether a stereocentre's configuration
   * is shown by that drawing, with no wedge (`stereoCentre`), as Clean-up
   * draws them.
   */
  atoms: (Omit<AtomChem, "abbrev"> & { x: number; y: number; z?: number; stereoCentre?: boolean })[];
  bonds: (BondChem & {
    a1: number;
    a2: number;
    order: 1 | 2 | 3;
    stereo?: "up" | "down" | "wavy" | "either" | "none";
    /** Which end of a wedge is narrow, as a drawn bond's `stereoOrient` says. */
    stereoOrient?: "principle" | "reverse";
    /**
     * A ring's bond in perspective: a near edge, bold; one toward the viewer,
     * a wedge (narrow as `stereoOrient` says). Two metals of a cluster in
     * contact, dashed.
     */
    display?: "bold" | "wedge" | "dashed";
  })[];
  attach: number[];
  /**
   * For each atom it is attached by: whether that atom lends its pair (a
   * ligand's neutral donor): the bond out to it, a coordination bond.
   */
  lends?: boolean[];
  /**
   * Which way its first bond out went, from the labelled atom, with the
   * atoms where they are: so that it can be turned to where that bond goes
   * now.
   */
  toward?: { x: number; y: number };
  /**
   * Its pi systems bound through all their atoms (a ligand's: Cp*, cod), by
   * index: the star at each one's centre - which may be where it is
   * attached, a bond to it then haptic - and the system's atoms. A bond's
   * `endpoints` here are indices too.
   */
  haptic?: { star: number; atoms: number[] }[];
};

export type AtomChem = {
  /**
   * Its element's symbol - or, for an atom that stands for more, the label:
   * an abbreviation (Me, OTBS), a class (R, Ar, X), any text; R# for an
   * Rgroup (`rgroups`), L for an atom list (`list`).
   */
  el: string;
  /** Its formal charge; none when unset. */
  charge?: number;
  radical?: Radical;
  /** Its mass number, where it is one isotope in particular: 13 for ¹³C. */
  isotope?: number;
  /** An Rgroup's numbers, for an R# atom: drawn R¹ (IUPAC GR-9.1). */
  rgroups?: number[];
  /** The elements an L atom may be, or with `not`, may not. */
  list?: AtomList;
  /**
   * Its valence, where a file sets it to other than its element's usual:
   * the hydrogens it carries are what its bonds leave of it; 0, none.
   */
  valence?: number;
  /** [Query] how many hydrogens it must have at least; kept, not drawn. */
  hCount?: number;
  /** What an abbreviation from a file stands for (an abbreviation Sgroup's atoms). */
  abbrev?: AbbreviationStructure;
  /** [Reaction] its atom-atom mapping number. */
  map?: number;
  /** [Reaction] its configuration inverted or retained in the reaction. */
  invRet?: "invert" | "retain";
  /** [Reaction] the change on it is exactly as shown. */
  exactChange?: boolean;
  /** Its enhanced stereo group, as a stereocentre (V3000's STE collections). */
  stereoGroup?: StereoGroup;
  /** The Sgroups it is in. */
  sgroups?: SgroupMark[];
};

/**
 * A query bond (CTfile bond types 5 to 8): one that stands for either of
 * two kinds, or any. It is drawn as the first of them, labelled.
 */
export type BondQuery = "single-or-double" | "single-or-aromatic" | "double-or-aromatic" | "any";

/**
 * What a bond is besides its order, where it is not a plain covalent bond:
 * a query, a hydrogen bond (drawn dotted, IUPAC GR-1.8), or a coordination
 * bond drawn as a plain line (GR-1.7) rather than as a dative arrow.
 */
export type BondChem = {
  query?: BondQuery;
  hydrogen?: boolean;
  coordination?: boolean;
  /**
   * [Reaction] its reacting centre status, as CTfile Formats numbers it:
   * -1 not a centre, 1 a centre, 2 no change, 4 made or broken, 8 order
   * changes, 12 both; 5, 9 and 13 the same as 4, 8 and 12.
   */
  reactingCentre?: number;
  /** The enhanced stereo group of a double bond or an axis (V3000's STEB collections). */
  stereoGroup?: StereoGroup;
  /**
   * A bond from one atom to several (V3000's ENDPTS), by atom id: to all of
   * them - a haptic bond to a pi system, its other end a star atom at the
   * system's centre - or to any one of them (a variable attachment).
   */
  endpoints?: number[];
  attach?: "all" | "any";
};

/**
 * An Sgroup an atom is in, as each of its atoms carries it - the same on
 * each - so that it goes where they go: its type (CTfile Formats: SRU,
 * COP, MON, MER, CRO, MOD, GRA, COM, MIX, FOR, ANY, GEN, DAT; MUL and SUP
 * shown expanded) and what the file said of it. Its brackets are worked out
 * from where its atoms are.
 */
export type SgroupMark = {
  /** Unique in the document: from the ids atoms and bonds are given. */
  id: number;
  type: string;
  /** A polymer's subscript (SRU's n), a multiple group's multiplier, an abbreviation's label. */
  label?: string;
  subtype?: string;
  connect?: string;
  bracketStyle?: "bracket" | "paren";
  multiplier?: number;
  /** For a multiple group: this atom is of its paradigmatic repeating unit. */
  paradigm?: boolean;
  componentNumber?: number;
  /** The group it is within, by id. */
  parent?: number;
  /**
   * A data Sgroup's field and data, and what its file says besides, kept to
   * be written back: its units or format, its type (F, N or T), a V3000
   * FIELDINFO that gives neither (as read), how it is
   * displayed (V2000's M  SDD, V3000's FIELDDISP, as the file writes it - not
   * followed in the drawing) and its query's type and operator
   * (lib/chem/ctfile `CtSgroup.field`).
   */
  field?: { name: string; data: string[]; units?: string; type?: string; info?: string; display?: string; queryType?: string; queryOp?: string };
};

/**
 * An enhanced stereo group (V3000 collections): configurations known
 * absolutely; a mixture of the configuration drawn and its mirror image
 * ("and", racemic); or one or the other, not known which ("or", relative).
 * Groups of a kind are told apart by their number.
 */
export type StereoGroup = { kind: "abs" | "and" | "or"; n?: number };

/** What a bond is besides its order, where it is: to hand on with it, as `chemistry` an atom's. */
export function bondChem(b: BondChem): BondChem {
  return {
    ...(b.query ? { query: b.query } : {}),
    ...(b.hydrogen ? { hydrogen: true } : {}),
    ...(b.coordination ? { coordination: true } : {}),
    ...(b.reactingCentre ? { reactingCentre: b.reactingCentre } : {}),
    ...(b.stereoGroup ? { stereoGroup: b.stereoGroup } : {}),
    ...(b.endpoints?.length ? { endpoints: b.endpoints, attach: b.attach ?? "all" } : {}),
  };
}

/**
 * How much of an atom's valence a bond takes: its order - none for a dative
 * bond, which lends a pair, nor for a coordination or a hydrogen bond. But
 * a carbon at either end of a dative or a coordination bond is the one
 * that lends it - a carbene's, an NHC's, CO's - and the pair it lends is
 * two of its valence: it carries no H for it.
 */
export function valenceOrder(b: BondChem & { order: number; dative?: boolean }, el?: string): number {
  if (b.dative || b.coordination) return el === "C" ? 2 : 0;
  return b.hydrogen ? 0 : b.order;
}

/**
 * An atom as a file gives it: where it is, in the file's own units; and
 * `alias` where its `el` is the text a file shows for it (a V2000 "A"
 * line), not an element's symbol - its letters' case as written.
 */
export type ParsedAtom = AtomChem & { x: number; y: number; z: number; alias?: true };
/**
 * A bond as a file gives it, between atoms by index: its CTfile bond type
 * (1 to 10) as `order`, and its stereo as V2000 codes - a single bond's 1
 * up, 4 either, 6 down; a double bond's 3, cis or trans not known. A
 * coordination bond is type 9 (`COORDINATION_BOND`), `a1` the atom that
 * lends its pair - as a molecule in 3D holds one made from a drawing's
 * dative arrow or coordination bond, too: one way for both.
 */
export type ParsedBond = { a1: number; a2: number; order: number; stereoCode?: number };

/** The CTfile's bond type for a coordination (dative) bond ("CTfile Formats", the bond block). */
export const COORDINATION_BOND = 9;
/**
 * A molecule as a file gives it. A CTfile's carries all the file said
 * besides (lib/chem/ctfile), its atoms and bonds in the same order.
 */
export type Molecule = {
  atoms: ParsedAtom[];
  bonds: ParsedBond[];
  ct?: CtMolecule;
};

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
 * carbene's pair two.
 */
export function implicitHydrogens(
  el: string,
  bondOrderSum: number,
  charge = 0,
  radical?: Radical,
): number {
  const v = VALENCE[el];
  if (!v) return 0;
  return Math.max(0, valenceAs(v, v.valence, charge, radical) - bondOrderSum);
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

/** A charge as a formula writes it: +, 2+, − (a minus sign, not a hyphen), 3−. */
export function chargeText(charge: number): string {
  if (!charge) return "";
  const sign = charge > 0 ? "+" : "−";
  const n = Math.abs(charge);
  return n === 1 ? sign : `${n}${sign}`;
}

/** An atom's charge, radical and isotope, where it has them: to hand on with its element. */
export function chemistry(a: AtomChem): Omit<AtomChem, "el"> {
  return {
    ...(a.charge ? { charge: a.charge } : {}),
    ...(a.radical ? { radical: a.radical } : {}),
    ...(a.isotope ? { isotope: a.isotope } : {}),
    ...(a.rgroups?.length ? { rgroups: a.rgroups } : {}),
    ...(a.list ? { list: a.list } : {}),
    ...(a.valence != null ? { valence: a.valence } : {}),
    ...(a.hCount != null ? { hCount: a.hCount } : {}),
    ...(a.abbrev ? { abbrev: a.abbrev } : {}),
    ...(a.map ? { map: a.map } : {}),
    ...(a.invRet ? { invRet: a.invRet } : {}),
    ...(a.exactChange ? { exactChange: true } : {}),
    ...(a.stereoGroup ? { stereoGroup: a.stereoGroup } : {}),
    ...(a.sgroups?.length ? { sgroups: a.sgroups } : {}),
  };
}
