import type { Axial } from "../layout/stereo";
import { axesWith, shownAs, splitDescriptor, withConfiguration, type Enantiomers } from "./enantiomers";
import { anionOf, longestGroup, partsOf } from "./formula";
import { kekuleOrders } from "./kekulize";
import { implicitHydrogens, valenceOrder } from "./molecule";
import { readSmiles, type SmilesAtom, type SmilesBond } from "./smiles";
import { ELEMENTS } from "./elements";

/**
 * The ligands of transition-metal chemistry, and the complexes written with
 * them - Pd(PPh3)4, Pd2(dba)3, PdCl2(dppf), [Ir(cod)Cl]2, [Rh(cod)2]BF4 -
 * read as the structures they stand for.
 *
 * Meno's own list, from what chemists commonly write. Each ligand is the
 * molecule it is, in SMILES, its donor atoms marked by atom class: [P:1],
 * [P:2] for a chelating diphosphine; several atoms of one class for a pi
 * system bound through all of them (η²: cod's two C=C, η⁵: Cp*). A donor is
 * neutral (an L ligand, bound by a coordination bond from it to the metal)
 * unless it is listed as anionic (an X ligand, bound by a covalent bond) or
 * as bound by a double bond (an alkylidene), and a ligand written as an
 * anion (Cp*⁻) leaves its charge on the metal it is bound to. A chiral one
 * is given as one enantiomer, its @ and @@ and the descriptors that name it
 * and its mirror image: (S,S)-DPEN, (R,R)-DPEN.
 */

/** A bond of a group's structure: as in SMILES, and a coordination bond or a haptic one. */
export type StructureBond = SmilesBond & {
  /** A coordination bond, from `a1`, the donor, to `a2`. */
  coordination?: boolean;
  /** A haptic bond's pi system: from the metal (`a1`) to a star (`a2`) at its centre. */
  endpoints?: number[];
  attach?: "all";
};

/**
 * Six metals as an octahedron, by their places 0 to 5 round it seen down
 * one of its threefold axes - 0, 2 and 4 the near face, 1, 3 and 5 the far
 * one: its twelve edges, each a pair of places. Opposite corners (0 and 3,
 * 1 and 4, 2 and 5) are joined by none.
 */
export const OCTAHEDRON_EDGES: readonly (readonly [number, number])[] = [
  [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0],
  [0, 2], [2, 4], [4, 0],
  [1, 3], [3, 5], [5, 1],
];


/**
 * What a label stands for, as atoms and bonds (Kekulé): where it is attached
 * (`attach`: an atom, or the star at the centre of a pi system bound through
 * all its atoms - `haptic` says which), and its stars' pi systems. A group
 * is attached by one atom; a chelating ligand by several; a complex by none.
 */
export type GroupStructure = {
  atoms: SmilesAtom[];
  bonds: StructureBond[];
  attach: number[];
  haptic?: { star: number; atoms: number[] }[];
  /** For each atom it is attached by: whether that atom lends its pair - a neutral donor's - the bond to it a coordination bond. */
  lends?: boolean[];
  /** Its axes of chirality, with the configuration it has (BINAP's, a descriptor before it said). */
  axes?: Axial[];
};

export type Ligand = {
  label: string;
  also?: string[];
  name: string;
  /** The ligand, its donors marked by atom class. */
  smiles: string;
  /** The donor classes that bind as anions (X), by covalent bonds. */
  anionic?: number[];
  /** The donor classes bound by a double bond: an alkylidene's carbon. */
  double?: number[];
  /** Its enantiomers, for a chiral one: the descriptors read before its label. */
  enantiomers?: Enantiomers;
  /**
   * An axially chiral one's axis, by its SMILES's atoms, as the enantiomer
   * `enantiomers.as` names has it: its refs the carbons bearing its P (the
   * neighbours CIP ranks first), turned - (R) - as M is.
   */
  axis?: Axial;
  /** A metal inside the ligand and the pi systems bound to it - dppf's iron: [metal class, ring class]. */
  inner?: [number, number][];
  /** Written as a formula, PPh3 or MeCN, not as a name: read into its elements when a label is written. */
  formula?: boolean;
  /** Read only inside a complex's formula: CO, H2O, NH3 mean other things on their own. */
  inComplex?: boolean;
};

// (ring number 9, used nowhere else: a phenyl written inside a ring that
// is open must not close it)
const PH = "c9ccccc9";
const CY = "C9CCCCC9";
const TBU = "C(C)(C)C";
const DTBM = "c9cc(C(C)(C)C)c(OC)c(C(C)(C)C)c9";
/** 1-Adamantyl, by its bridgehead (ring numbers 6 to 8, used nowhere else). */
const AD = "C78CC6CC(CC(C6)C7)C8";
/** The 2,4,6-triisopropylphenyl of XPhos and its kin. */
const TRIP = "c1c(C(C)C)cc(C(C)C)cc1C(C)C";
/** An axially chiral ligand's: (R) and (S), its axis's (`Ligand.axis`). */
const AXIAL: Enantiomers = { as: ["(R)", "(Ra)"], mirror: ["(S)", "(Sa)"], axial: true };

// --- Meno's ligands, by family ----------------------------------------------

/** Phosphines, an arsine and phosphites. */
const PHOSPHINES: Ligand[] = [
  { label: "PPh3", also: ["Ph3P"], smiles: `[P:1](${PH})(${PH})${PH}`, name: "triphenylphosphine", formula: true },
  { label: "PCy3", also: ["Cy3P"], smiles: `[P:1](${CY})(${CY})${CY}`, name: "tricyclohexylphosphine", formula: true },
  { label: "P(t-Bu)3", also: ["PtBu3", "P(tBu)3", "t-Bu3P", "tBu3P"], smiles: `[P:1](${TBU})(${TBU})${TBU}`, name: "tri-tert-butylphosphine", formula: true },
  { label: "P(o-Tol)3", also: ["P(o-tol)3", "(o-Tol)3P"], smiles: "[P:1](c1ccccc1C)(c1ccccc1C)c1ccccc1C", name: "tri(o-tolyl)phosphine", formula: true },
  { label: "PMe3", also: ["Me3P"], smiles: "[P:1](C)(C)C", name: "trimethylphosphine", formula: true },
  { label: "PEt3", also: ["Et3P"], smiles: "[P:1](CC)(CC)CC", name: "triethylphosphine", formula: true },
  { label: "PBu3", also: ["P(n-Bu)3", "Bu3P"], smiles: "[P:1](CCCC)(CCCC)CCCC", name: "tributylphosphine", formula: true },
  { label: "P(OPh)3", also: ["(PhO)3P"], smiles: `[P:1](O${PH})(O${PH})O${PH}`, name: "triphenyl phosphite", formula: true },
  { label: "P(OMe)3", also: ["(MeO)3P"], smiles: "[P:1](OC)(OC)OC", name: "trimethyl phosphite", formula: true },
  { label: "TFP", also: ["P(2-furyl)3"], smiles: "[P:1](c1ccco1)(c1ccco1)c1ccco1", name: "tri(2-furyl)phosphine" },
  { label: "AsPh3", also: ["Ph3As"], smiles: `[As:1](${PH})(${PH})${PH}`, name: "triphenylarsine", formula: true },
];

/** Buchwald's dialkylbiaryl phosphines, bound by their P (a precatalyst is named by one: XPhos Pd G3). */
const BUCHWALD: Ligand[] = [
  { label: "XPhos", smiles: `[P:1](${CY})(${CY})c1ccccc1-c1c(C(C)C)cc(C(C)C)cc1C(C)C`, name: "2-dicyclohexylphosphino-2',4',6'-triisopropylbiphenyl" },
  { label: "SPhos", smiles: `[P:1](${CY})(${CY})c1ccccc1-c1c(OC)cccc1OC`, name: "2-dicyclohexylphosphino-2',6'-dimethoxybiphenyl" },
  { label: "RuPhos", smiles: `[P:1](${CY})(${CY})c1ccccc1-c1c(OC(C)C)cccc1OC(C)C`, name: "2-dicyclohexylphosphino-2',6'-diisopropoxybiphenyl" },
  { label: "BrettPhos", smiles: `[P:1](${CY})(${CY})c1c(OC)ccc(OC)c1-c1c(C(C)C)cc(C(C)C)cc1C(C)C`, name: "2-dicyclohexylphosphino-3,6-dimethoxy-2',4',6'-triisopropylbiphenyl" },
  { label: "tBuXPhos", also: ["t-BuXPhos"], smiles: `[P:1](${TBU})(${TBU})c1ccccc1-c1c(C(C)C)cc(C(C)C)cc1C(C)C`, name: "2-di-tert-butylphosphino-2',4',6'-triisopropylbiphenyl" },
  { label: "DavePhos", smiles: `[P:1](${CY})(${CY})c1ccccc1-c1ccccc1N(C)C`, name: "2-dicyclohexylphosphino-2'-(dimethylamino)biphenyl" },
  { label: "JohnPhos", smiles: `[P:1](${TBU})(${TBU})c1ccccc1-c1ccccc1`, name: "(2-biphenyl)di-tert-butylphosphine" },
  { label: "CyJohnPhos", smiles: `[P:1](${CY})(${CY})c1ccccc1-c1ccccc1`, name: "(2-biphenyl)dicyclohexylphosphine" },
  { label: "MePhos", smiles: `[P:1](${CY})(${CY})c1ccccc1-c1ccccc1C`, name: "2-dicyclohexylphosphino-2'-methylbiphenyl" },
  { label: "tBuMePhos", also: ["t-BuMePhos"], smiles: `[P:1](${TBU})(${TBU})c1ccccc1-c1ccccc1C`, name: "2-di-tert-butylphosphino-2'-methylbiphenyl" },
  { label: "tBuDavePhos", also: ["t-BuDavePhos"], smiles: `[P:1](${TBU})(${TBU})c1ccccc1-c1ccccc1N(C)C`, name: "2-di-tert-butylphosphino-2'-(dimethylamino)biphenyl" },
  { label: "PhDavePhos", smiles: `[P:1](${PH})(${PH})c1ccccc1-c1ccccc1N(C)C`, name: "2-diphenylphosphino-2'-(dimethylamino)biphenyl" },
  { label: "CPhos", smiles: `[P:1](${CY})(${CY})c1ccccc1-c1c(N(C)C)cccc1N(C)C`, name: "2-dicyclohexylphosphino-2',6'-bis(dimethylamino)biphenyl" },
  { label: "tBuBrettPhos", also: ["t-BuBrettPhos"], smiles: `[P:1](${TBU})(${TBU})c1c(OC)ccc(OC)c1-${TRIP}`, name: "2-di-tert-butylphosphino-3,6-dimethoxy-2',4',6'-triisopropylbiphenyl" },
  { label: "AdBrettPhos", smiles: `[P:1](${AD})(${AD})c1c(OC)ccc(OC)c1-${TRIP}`, name: "2-di(1-adamantyl)phosphino-3,6-dimethoxy-2',4',6'-triisopropylbiphenyl" },
  { label: "RockPhos", smiles: `[P:1](${TBU})(${TBU})c1c(OC)ccc(C)c1-${TRIP}`, name: "2-di-tert-butylphosphino-3-methoxy-6-methyl-2',4',6'-triisopropylbiphenyl" },
  { label: "Me4tBuXPhos", also: ["Me4t-BuXPhos"], smiles: `[P:1](${TBU})(${TBU})c1c(C)c(C)c(C)c(C)c1-${TRIP}`, name: "2-di-tert-butylphosphino-3,4,5,6-tetramethyl-2',4',6'-triisopropylbiphenyl" },
  { label: "EPhos", smiles: `[P:1](${CY})(${CY})c1c(OC(C)C)cccc1-${TRIP}`, name: "2-dicyclohexylphosphino-3-isopropoxy-2',4',6'-triisopropylbiphenyl" },
  { label: "GPhos", smiles: `[P:1](${CY})(${CY})c1c(OC(C)(C)C)ccc(OC)c1-c1c(C(C)C)cccc1C(C)C`, name: "2-dicyclohexylphosphino-3-tert-butoxy-6-methoxy-2',6'-diisopropylbiphenyl" },
  {
    label: "sSPhos",
    also: ["SPhos-SO3Na"],
    smiles: `[P:1](${CY})(${CY})c1ccccc1-c1c(OC)ccc(S(=O)(=O)[O-])c1OC.[Na+]`,
    name: "sodium 2'-dicyclohexylphosphino-2,6-dimethoxybiphenyl-3-sulfonate",
  },
];

/** Chelating diphosphines. */
const DIPHOSPHINES: Ligand[] = [
  { label: "dppm", smiles: `[P:1](${PH})(${PH})C[P:2](${PH})${PH}`, name: "1,1-bis(diphenylphosphino)methane" },
  { label: "dppe", smiles: `[P:1](${PH})(${PH})CC[P:2](${PH})${PH}`, name: "1,2-bis(diphenylphosphino)ethane" },
  { label: "dppp", smiles: `[P:1](${PH})(${PH})CCC[P:2](${PH})${PH}`, name: "1,3-bis(diphenylphosphino)propane" },
  { label: "dppb", smiles: `[P:1](${PH})(${PH})CCCC[P:2](${PH})${PH}`, name: "1,4-bis(diphenylphosphino)butane" },
  {
    label: "dppf",
    // ferrocene as its iron(II) and two cyclopentadienides, each ring bound to the iron through all five atoms
    smiles: `[Fe+2:9].[C-:7]1([P:1](${PH})${PH})[CH:7]=[CH:7][CH:7]=[CH:7]1.[C-:8]1([P:2](${PH})${PH})[CH:8]=[CH:8][CH:8]=[CH:8]1`,
    inner: [
      [9, 7],
      [9, 8],
    ],
    name: "1,1'-bis(diphenylphosphino)ferrocene",
  },
  {
    label: "BINAP",
    smiles: `[P:1](${PH})(${PH})c1ccc2ccccc2c1-c1c([P:2](${PH})${PH})ccc2ccccc12`,
    name: "2,2'-bis(diphenylphosphino)-1,1'-binaphthyl",
    enantiomers: AXIAL,
    // (C1-C1', turned from C2 to C2')
    axis: { atoms: [22, 23], refs: [13, 24], sense: -1 },
  },
  {
    label: "SEGPHOS",
    smiles: `[P:1](${PH})(${PH})c1ccc2OCOc2c1-c1c([P:2](${PH})${PH})ccc2OCOc12`,
    name: "5,5'-bis(diphenylphosphino)-4,4'-bi-1,3-benzodioxole",
    enantiomers: AXIAL,
    // (C4-C4', turned from C5 to C5')
    axis: { atoms: [21, 22], refs: [13, 23], sense: -1 },
  },
  {
    label: "DTBM-SEGPHOS",
    smiles: `[P:1](${DTBM})(${DTBM})c1ccc2OCOc2c1-c1c([P:2](${DTBM})${DTBM})ccc2OCOc12`,
    name: "5,5'-bis[di(3,5-di-tert-butyl-4-methoxyphenyl)phosphino]-4,4'-bi-1,3-benzodioxole",
    enantiomers: AXIAL,
    axis: { atoms: [41, 42], refs: [33, 43], sense: -1 },
  },
  { label: "Xantphos", smiles: `CC1(C)c2cccc([P:1](${PH})${PH})c2Oc2c([P:2](${PH})${PH})cccc21`, name: "4,5-bis(diphenylphosphino)-9,9-dimethylxanthene" },
  { label: "DPEphos", smiles: `[P:1](${PH})(${PH})c1ccccc1Oc1ccccc1[P:2](${PH})${PH}`, name: "bis[2-(diphenylphosphino)phenyl] ether" },
];

/** N donors: pyridines, amines, chiral diamines, salen, nitriles. */
const NITROGEN: Ligand[] = [
  { label: "bpy", also: ["bipy"], smiles: "c1cc[n:1]c(c1)-c1cccc[n:2]1", name: "2,2'-bipyridine" },
  { label: "dtbpy", also: ["dtbbpy"], smiles: "CC(C)(C)c1cc[n:1]c(c1)-c1cc(C(C)(C)C)cc[n:2]1", name: "4,4'-di-tert-butyl-2,2'-bipyridine" },
  { label: "phen", smiles: "c1c[n:1]c2c(c1)ccc1ccc[n:2]c12", name: "1,10-phenanthroline" },
  { label: "py", smiles: "c1cc[n:1]cc1", name: "pyridine" },
  { label: "TMEDA", smiles: "C[N:1](C)CC[N:2](C)C", name: "N,N,N',N'-tetramethylethylenediamine" },
  { label: "en", smiles: "[NH2:1]CC[NH2:2]", name: "ethylenediamine" },
  // chiral diamines, each given as its (S,S) or (R,R) form
  {
    label: "DPEN",
    smiles: `[NH2:1][C@@H](${PH})[C@@H]([NH2:2])${PH}`,
    name: "1,2-diphenylethylenediamine",
    enantiomers: { as: ["(S,S)", "(1S,2S)"], mirror: ["(R,R)", "(1R,2R)"] },
  },
  {
    label: "TsDPEN",
    also: ["Ts-DPEN"],
    // (bound by its sulfonamide's nitrogen, as an anion, and its amine)
    smiles: `Cc9ccc(cc9)S(=O)(=O)[N:1][C@@H](${PH})[C@@H]([NH2:2])${PH}`,
    anionic: [1],
    name: "N-(p-toluenesulfonyl)-1,2-diphenylethylenediamine",
    enantiomers: { as: ["(S,S)", "(1S,2S)"], mirror: ["(R,R)", "(1R,2R)"] },
  },
  {
    label: "DACH",
    smiles: "[NH2:1][C@@H]1CCCC[C@H]1[NH2:2]",
    name: "1,2-diaminocyclohexane",
    enantiomers: { as: ["(R,R)", "(1R,2R)"], mirror: ["(S,S)", "(1S,2S)"] },
  },
  {
    label: "salen",
    smiles: "[O:1]c1ccccc1C=[N:2]CC[N:3]=Cc1ccccc1[O:4]",
    anionic: [1, 4],
    name: "N,N'-bis(salicylidene)ethylenediamine",
  },
  { label: "MeCN", also: ["CH3CN"], smiles: "CC#[N:1]", name: "acetonitrile", formula: true },
  { label: "NH3", smiles: "[NH3:1]", name: "ammonia", formula: true, inComplex: true },
];

/** N-heterocyclic carbenes, bound by their carbene carbon. */
const CARBENES: Ligand[] = [
  { label: "IPr", smiles: "CC(C)c1cccc(C(C)C)c1N1C=CN(c2c(C(C)C)cccc2C(C)C)[C:1]1", name: "1,3-bis(2,6-diisopropylphenyl)imidazol-2-ylidene" },
  { label: "IMes", smiles: "Cc1cc(C)c(N2C=CN(c3c(C)cc(C)cc3C)[C:1]2)c(C)c1", name: "1,3-bis(2,4,6-trimethylphenyl)imidazol-2-ylidene" },
  { label: "SIPr", smiles: "CC(C)c1cccc(C(C)C)c1N1CCN(c2c(C(C)C)cccc2C(C)C)[C:1]1", name: "1,3-bis(2,6-diisopropylphenyl)imidazolidin-2-ylidene" },
  { label: "SIMes", smiles: "Cc1cc(C)c(N2CCN(c3c(C)cc(C)cc3C)[C:1]2)c(C)c1", name: "1,3-bis(2,4,6-trimethylphenyl)imidazolidin-2-ylidene" },
];

/** Pi ligands, bound through all the atoms of each pi system. */
const PI: Ligand[] = [
  { label: "cod", also: ["COD"], smiles: "C1C[CH:1]=[CH:1]CC[CH:2]=[CH:2]1", name: "1,5-cyclooctadiene" },
  { label: "nbd", also: ["NBD"], smiles: "[CH:1]1=[CH:1][CH]2[CH:2]=[CH:2][CH]1C2", name: "norbornadiene" },
  { label: "dba", smiles: `O=C(C=C${PH})[CH:1]=[CH:1]${PH}`, name: "dibenzylideneacetone" },
  { label: "p-cymene", smiles: "C[c:1]1[cH:1][cH:1][c:1](C(C)C)[cH:1][cH:1]1", name: "4-isopropyltoluene" },
  { label: "Cp*", also: ["C5Me5"], smiles: "C[C-:1]1[C:1](C)=[C:1](C)[C:1](C)=[C:1]1C", name: "pentamethylcyclopentadienyl" },
  { label: "Cp", smiles: "[CH-:1]1[CH:1]=[CH:1][CH:1]=[CH:1]1", name: "cyclopentadienyl", inComplex: true },
  // (allyl alone is the group, bound by one bond; in a complex, through all three atoms)
  { label: "allyl", also: ["C3H5"], smiles: "[CH2:1]=[CH:1][CH2:1]", name: "allyl", inComplex: true },
  {
    label: "dvtms",
    also: ["dvds"],
    smiles: "C[Si](C)([CH:1]=[CH2:1])O[Si](C)(C)[CH:2]=[CH2:2]",
    name: "1,3-divinyl-1,1,3,3-tetramethyldisiloxane",
  },
];

/** Alkylidenes, bound by a double bond. */
const ALKYLIDENES: Ligand[] = [
  { label: "=CHPh", smiles: `[CH:1]${PH}`, double: [1], name: "benzylidene", inComplex: true },
  { label: "=CH2", smiles: "[CH2:1]", double: [1], name: "methylidene", inComplex: true },
];

/** O donors, and carbon monoxide. */
const OTHERS: Ligand[] = [
  { label: "acac", smiles: "CC(=[O:2])C=C(C)[O:1]", anionic: [1], name: "acetylacetonato" },
  { label: "THF", smiles: "[O:1]1CCCC1", name: "tetrahydrofuran" },
  { label: "H2O", smiles: "[OH2:1]", name: "water", formula: true, inComplex: true },
  // and carbon monoxide
  { label: "CO", smiles: "[C-:1]#[O+]", name: "carbon monoxide", formula: true, inComplex: true },
];

/** Meno's ligands by family, as Settings › Dictionary lists them. */
export const LIGAND_FAMILIES: { title: string; ligands: Ligand[] }[] = [
  { title: "Phosphines", ligands: PHOSPHINES },
  { title: "Buchwald ligands", ligands: BUCHWALD },
  { title: "Diphosphines", ligands: DIPHOSPHINES },
  { title: "Nitrogen ligands", ligands: NITROGEN },
  { title: "N-heterocyclic carbenes", ligands: CARBENES },
  { title: "Pi ligands", ligands: PI },
  { title: "Alkylidenes", ligands: ALKYLIDENES },
  { title: "Other ligands", ligands: OTHERS },
];

export const LIGANDS: Ligand[] = LIGAND_FAMILIES.flatMap((f) => f.ligands);

const LIGAND_BY_LABEL = new Map<string, Ligand>();
for (const l of LIGANDS) for (const name of [l.label, ...(l.also ?? [])]) LIGAND_BY_LABEL.set(name, l);

/** The ligand a label is, read on its own (not CO, H2O, NH3), or none. */
export function ligandOf(label: string, inComplex = false): Ligand | undefined {
  const l = LIGAND_BY_LABEL.get(label);
  return l && (inComplex || !l.inComplex) ? l : undefined;
}

/**
 * The ligand a label names, and the descriptor before it, where there is
 * one that names one of its enantiomers: (S,S)-DPEN, (R)-BINAP. None for
 * any other label.
 */
export function namedLigand(label: string, inComplex = false): { ligand: Ligand; descriptor: string | null } | undefined {
  const l = ligandOf(label, inComplex);
  if (l) return { ligand: l, descriptor: null };
  const d = splitDescriptor(label);
  const named = d && ligandOf(d.rest, inComplex);
  if (!d || !named || !withConfiguration([], named.enantiomers, d.descriptor)) return undefined;
  return { ligand: named, descriptor: d.descriptor };
}

/** The ligands' labels that are names, not formulas: each read as one unit of a label (dppf, not d, p, p, f). */
export const LIGAND_UNITS = LIGANDS.filter((l) => !l.formula && !l.inComplex).flatMap((l) => [l.label, ...(l.also ?? [])]);

/**
 * A ligand as atoms and bonds, its donors where it is attached, each an
 * atom or a pi system's star - and for each, whether it binds as an anion
 * or by a double bond. With the configuration `descriptor` names, for a
 * chiral one: without one, none.
 */
export function ligandStructure(l: Ligand, descriptor: string | null = null): GroupStructure & { anionic: boolean[]; double: boolean[] } {
  const read = readSmiles(l.smiles);
  const orders = kekuleOrders(read.atoms, read.bonds);
  const atoms: SmilesAtom[] = withConfiguration(
    read.atoms.map(({ aromatic: _aromatic, cls: _cls, ...a }) => a),
    l.enantiomers,
    descriptor,
  ) ?? read.atoms.map(({ aromatic: _aromatic, cls: _cls, tetra: _tetra, ...a }) => a);
  const bonds: StructureBond[] = read.bonds.map((b, i) => ({ a1: b.a1, a2: b.a2, order: orders[i] }));
  const axes = axesWith(l.axis ? [l.axis] : undefined, l.enantiomers, descriptor);
  const byClass = new Map<number, number[]>();
  read.atoms.forEach((a, i) => {
    if (a.cls != null) byClass.set(a.cls, [...(byClass.get(a.cls) ?? []), i]);
  });
  const haptic: { star: number; atoms: number[] }[] = [];
  const star = (ring: number[]) => {
    atoms.push({ el: "*", hs: 0 });
    haptic.push({ star: atoms.length - 1, atoms: ring });
    return atoms.length - 1;
  };
  const insideClasses = new Set<number>();
  for (const [metal, ring] of l.inner ?? []) {
    insideClasses.add(metal);
    insideClasses.add(ring);
    const at = byClass.get(metal)![0];
    const s = star(byClass.get(ring)!);
    bonds.push({ a1: at, a2: s, order: 1, coordination: true, endpoints: byClass.get(ring)!, attach: "all" });
  }
  const donors = [...byClass.keys()].filter((c) => !insideClasses.has(c)).sort((a, b) => a - b);
  const attach = donors.map((c) => {
    const at = byClass.get(c)!;
    return at.length === 1 ? at[0] : star(at);
  });
  return {
    atoms,
    bonds,
    attach,
    ...(haptic.length ? { haptic } : {}),
    ...(axes ? { axes } : {}),
    anionic: donors.map((c) => !!l.anionic?.includes(c)),
    double: donors.map((c) => !!l.double?.includes(c)),
  };
}

/**
 * A ligand for a picture: the molecule - a chiral one as its SMILES has it
 * (enantiomers.shownAs) - each donor atom marked by a "*" bonded to it, as
 * a group's attachment is, and each pi system it binds through by the "*"
 * at its centre. A donor binds its star as it binds a metal: an anion by a
 * bond, an alkylidene by a double bond, a neutral donor by a coordination
 * bond, which takes none of its H.
 */
export function ligandPicture(l: Ligand): GroupStructure {
  const s = ligandStructure(l, shownAs(l.enantiomers));
  const atoms = [...s.atoms];
  const bonds: StructureBond[] = [...s.bonds];
  s.attach.forEach((at, k) => {
    if (s.haptic?.some((h) => h.star === at)) return;
    atoms.push({ el: "*", hs: 0 });
    const star = atoms.length - 1;
    if (s.double[k]) bonds.push({ a1: star, a2: at, order: 2 });
    else if (s.anionic[k]) bonds.push({ a1: star, a2: at, order: 1 });
    else bonds.push({ a1: at, a2: star, order: 1, coordination: true });
  });
  return { atoms, bonds, attach: [], ...(s.haptic ? { haptic: s.haptic } : {}), ...(s.axes ? { axes: s.axes } : {}) };
}

/**
 * A structure's molecular formula, in Hill order (C, H, then the rest
 * alphabetically; alphabetically throughout where there is no carbon): its
 * hydrogens as its atoms say or by valence, as a drawing counts them
 * (molecule.valenceOrder) - stars not counted.
 */
export function structureFormula(s: GroupStructure): string {
  const sums = s.atoms.map(() => 0);
  for (const b of s.bonds) {
    sums[b.a1] += valenceOrder(b, s.atoms[b.a1].el);
    sums[b.a2] += valenceOrder(b, s.atoms[b.a2].el);
  }
  const count = new Map<string, number>();
  const add = (el: string, n: number) => n && count.set(el, (count.get(el) ?? 0) + n);
  s.atoms.forEach((a, i) => {
    if (a.el === "*") return;
    // (deuterium as D, after H: CDCl3)
    add(a.el === "H" && a.isotope === 2 ? "D" : a.el, 1);
    add("H", a.hs ?? implicitHydrogens(a.el, sums[i], a.charge ?? 0));
  });
  const others = [...count.keys()].filter((e) => e !== "C" && e !== "H" && e !== "D").sort();
  const order = count.has("C") ? ["C", "H", "D", ...others] : [...count.keys()].sort();
  return order.filter((e) => count.has(e)).map((e) => `${e}${count.get(e)! > 1 ? count.get(e) : ""}`).join("");
}

// --- complexes ---------------------------------------------------------------

/** The metals a complex's formula may have: the d block and the lanthanides (Pr, propyl here, aside). */
const METALS = new Set(
  "Sc Ti V Cr Mn Fe Co Ni Cu Zn Y Zr Nb Mo Tc Ru Rh Pd Ag Cd Hf Ta W Re Os Ir Pt Au Hg La Ce Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu".split(" "),
);
const NAME = new Map(ELEMENTS.map((e) => [e.symbol, e.name]));

/** Whether a metal's symbol is written anywhere in `text`: what any complex's formula has. */
function hasMetal(text: string): boolean {
  for (const m of METALS) if (text.includes(m)) return true;
  return false;
}

/**
 * The longest a part of a formula outside brackets is tried as one ligand,
 * group or counter-anion - longer than any of them is written: past it, a
 * label of a metal and a long run of letters was tried at every length.
 */
const LONGEST_PART = 32;

/**
 * A complex's counter-anions, written after its brackets, that no rule
 * reads: BArF names its aryl groups by no formula. BF4, PF6, SbF6, ClO4
 * and their like are read by rule (`counterIon`).
 */
export const COUNTER_IONS: Record<string, { smiles: string; name: string }> = {
  BArF: {
    smiles: "[B-](c1cc(C(F)(F)F)cc(C(F)(F)F)c1)(c1cc(C(F)(F)F)cc(C(F)(F)F)c1)(c1cc(C(F)(F)F)cc(C(F)(F)F)c1)c1cc(C(F)(F)F)cc(C(F)(F)F)c1",
    name: "tetrakis[3,5-bis(trifluoromethyl)phenyl]borate",
  },
};

/** One of COUNTER_IONS as the structure it is, its rings Kekulé; null for any other label. */
export function counterIonStructure(label: string): GroupStructure | null {
  if (!Object.prototype.hasOwnProperty.call(COUNTER_IONS, label)) return null;
  const read = readSmiles(COUNTER_IONS[label].smiles);
  const orders = kekuleOrders(read.atoms, read.bonds);
  const atoms = read.atoms.map(({ aromatic: _a, ...a }) => a);
  return { atoms, bonds: read.bonds.map((b, i) => ({ ...b, order: orders[i] })), attach: [] };
}

/**
 * A counter-anion written after a complex's brackets, of one charge: one
 * of COUNTER_IONS, or one ./formula reads - BF4, PF6, SbF6, AsF6, BPh4,
 * ClO4 - named as it is written. Null for any other text.
 */
function counterIon(t: string, groupOf: (label: string) => GroupStructure | null): { ion: GroupStructure; name: string } | null {
  const listed = counterIonStructure(t);
  if (listed) return { ion: listed, name: COUNTER_IONS[t].name };
  const parts = partsOf(t, longestGroup(groupOf), groupOf);
  const ion = parts && anionOf(parts, 1);
  return ion ? { ion, name: `${t}⁻` } : null;
}

type Item =
  | { kind: "metal"; el: string; n: number }
  | { kind: "ligand"; ligand: Ligand; descriptor: string | null; n: number; bridging?: boolean }
  | { kind: "x"; label: string; n: number; bridging?: boolean }
  | { kind: "counter"; ion: GroupStructure; name: string; n: number }
  | { kind: "unit"; items: Item[]; n: number };

/** The index of the bracket that closes the one opened at `i`, or -1. */
function closing(text: string, i: number): number {
  const open = text[i];
  const close = open === "(" ? ")" : "]";
  let depth = 0;
  for (let j = i; j < text.length; j++) {
    if (text[j] === open) depth++;
    if (text[j] === close && --depth === 0) return j;
  }
  return -1;
}

/**
 * What a complex's formula may name: groups bound by one bond (OAc, OTf,
 * Me), ligands of its own, and counter-anions where they may be read
 * (`counters`) - with, where it has no ligands of its own, what each text
 * was read as before by the same groups (`seen`).
 */
type Names = {
  groupOf: GroupOf;
  local: Readonly<Record<string, Ligand>>;
  counters: boolean;
  seen: Readings | null;
};

type GroupOf = (label: string) => GroupStructure | null;
/** What texts were read as: each as a metal, a ligand, a halide or a group (`plain`); each as a counter-anion. */
type Readings = { plain: Map<string, Item | null>; counters: Map<string, Item | null> };
/**
 * What each text was read as, by the groups it was read with. A label is
 * read in many writings as it is typed (./smartLabel), and each part of
 * each tried at every length: the same texts again and again. Forgotten as
 * the user's own abbreviations change (`forgetComplexReadings`).
 */
let readings = new WeakMap<GroupOf, Readings>();
/** The most texts kept for one way of reading groups, before they are forgotten and read again. */
const MOST_READINGS = 20_000;

/** Forgets what each text of a complex's formula was read as: the groups read in it may have changed. */
export function forgetComplexReadings(): void {
  readings = new WeakMap();
}

/** What texts were read as with `groupOf`, kept from now on. */
function readingsOf(groupOf: GroupOf): Readings {
  let seen = readings.get(groupOf);
  if (!seen || seen.plain.size + seen.counters.size >= MOST_READINGS) readings.set(groupOf, (seen = { plain: new Map(), counters: new Map() }));
  return seen;
}

/** `read()`, kept in `seen` - where there is one - and given from it after. */
function kept(seen: Map<string, Item | null> | undefined, t: string, read: () => Item | null): Item | null {
  if (!seen) return read();
  if (!seen.has(t)) seen.set(t, read());
  return seen.get(t)!;
}

/**
 * What a complex's formula is made of, in order, or null where any of it
 * is not a metal, a ligand, a halide, a hydride, a group bound by one bond
 * or a counter-ion.
 */
function itemsOf(text: string, names: Names): Item[] | null {
  const out: Item[] = [];
  let i = 0;
  while (i < text.length) {
    let item: Item | null = null;
    if (text[i] === "[" || text[i] === "(") {
      const j = closing(text, i);
      if (j < 0) return null;
      const inner = text.slice(i + 1, j);
      // (square brackets around a ligand with its descriptor: RuCl[(S,S)-TsDPEN](p-cymene))
      const named = text[i] === "[" ? token(inner, names) : null;
      if (named && named.kind === "ligand") item = named;
      else if (text[i] === "[") {
        const items = itemsOf(inner, names);
        if (!items) return null;
        item = { kind: "unit", items, n: 1 };
      } else item = token(inner, names);
      i = j + 1;
    } else {
      // the longest token from here, up to the next bracket
      const stop = text.slice(i).search(/[[(]/);
      const rest = stop < 0 ? text.slice(i) : text.slice(i, i + stop);
      for (let len = Math.min(rest.length, LONGEST_PART); len > 0 && !item; len--) {
        const t = token(rest.slice(0, len), names);
        if (t) {
          item = t;
          i += len;
        }
      }
    }
    if (!item) return null;
    const count = /^\d+/.exec(text.slice(i));
    if (count) {
      // (a copy counted: what a text was read as is kept as it was read)
      item = { ...item, n: Number(count[0]) };
      i += count[0].length;
    }
    out.push(item);
  }
  return out;
}

/** A bridging ligand's mark: μ-Cl, μ-dvtms. */
const MU = /^(?:μ|mu)2?-(.+)$/;

/** What `t` is in a complex's formula, or null: a counter-anion only where one may be read. */
function token(t: string, names: Names): Item | null {
  const plain = kept(names.seen?.plain, t, () => plainToken(t, names));
  if (plain || !names.counters || MU.test(t)) return plain;
  return kept(names.seen?.counters, t, () => {
    const counter = counterIon(t, names.groupOf);
    return counter ? { kind: "counter", ...counter, n: 1 } : null;
  });
}

/** What `t` is as a metal, a ligand, a halide, a hydride or a group bound by one bond - a bridging one marked so - or null. */
function plainToken(t: string, names: Names): Item | null {
  // a bridging ligand: μ-Cl, μ-dvtms
  const mu = MU.exec(t);
  if (mu) {
    const bridge = plainToken(mu[1], names);
    return bridge && (bridge.kind === "ligand" || bridge.kind === "x") ? { ...bridge, bridging: true } : null;
  }
  if (METALS.has(t)) return { kind: "metal", el: t, n: 1 };
  const own = Object.prototype.hasOwnProperty.call(names.local, t) ? names.local[t] : undefined;
  // (a formula's own ligand as its SMILES has it: whose configuration it is, the reagent says)
  if (own) return { kind: "ligand", ligand: { ...own, enantiomers: own.enantiomers ?? { as: [], mirror: [], plain: true } }, descriptor: null, n: 1 };
  const ligand = namedLigand(t, true);
  if (ligand) return { kind: "ligand", ...ligand, n: 1 };
  if (["F", "Cl", "Br", "I", "H"].includes(t) || names.groupOf(t)) return { kind: "x", label: t, n: 1 };
  return null;
}

/**
 * A complex's formula - Pd(PPh3)4, Pd2(dba)3, PdCl2(dppf), Cp2ZrCl2,
 * [Ir(cod)Cl]2, [Rh(cod)2]BF4 - as the structure it stands for, or null for
 * a label that is not one. `groupOf` gives a group bound by one bond (OAc,
 * OTf, Me) as its structure.
 *
 * Each ligand is bound to the metal: a neutral donor by a coordination bond
 * from it, an anionic one, a halide or a group by a covalent bond, a pi
 * system by a haptic bond to its centre. Where there are several metals in
 * one part, the ligands are shared among them in turn: which ligands bridge
 * them, the formula does not say - unless it marks one with μ: a bridging
 * ligand's donors are bound to the metals in turn, and a bridging halide or
 * group to each of them. A part in brackets is made as many times as its
 * count; what follows the brackets is its counter-anions, each leaving a
 * positive charge on the part's metal. A part of one metal and a halide or
 * group made twice, with no counter-anion - [Ir(cod)Cl]2, [RuCl2(p-cymene)]2,
 * [Pd(allyl)Cl]2 - is the dimer bridged by them: each copy's first halide
 * (or group) bound to the other's metal as well. `local` names ligands of
 * the formula's own (a reagent's).
 */
export function complexStructure(
  label: string,
  groupOf: (label: string) => GroupStructure | null,
  local: Readonly<Record<string, Ligand>> = {},
): (GroupStructure & { name: string }) | null {
  // (no metal's symbol in it, no complex: a long label - OTBS forty times,
  // a long chain written out - was read at every length of every part of it,
  // for seconds, before it was found to be none)
  if (!hasMetal(label)) return null;
  // (no part in brackets, no counter-anion it may have: read first with none
  // tried - most of the cost of reading what is no complex - and, where it
  // reads so, again as it always was, a counter-anion making it none)
  const names: Names = { groupOf, local, counters: label.includes("["), seen: Object.keys(local).length ? null : readingsOf(groupOf) };
  let items = itemsOf(label, names);
  if (items && !names.counters) items = itemsOf(label, { ...names, counters: true });
  if (!items) return null;
  const atoms: SmilesAtom[] = [];
  const bonds: StructureBond[] = [];
  const haptic: { star: number; atoms: number[] }[] = [];
  const axes: Axial[] = [];
  const parts: string[] = [];

  /** Adds `s`'s atoms and bonds; the index its first atom has now. */
  const add = (s: GroupStructure): number => {
    const at = atoms.length;
    // (a centre's neighbours by index, moved with it)
    atoms.push(
      ...s.atoms.map((a) =>
        a.tetra ? { ...a, tetra: { ...a.tetra, neighbours: a.tetra.neighbours.map((n) => (n < 0 ? n : n + at)) } } : { ...a },
      ),
    );
    for (const b of s.bonds) {
      bonds.push({ ...b, a1: b.a1 + at, a2: b.a2 + at, ...(b.endpoints ? { endpoints: b.endpoints.map((e) => e + at) } : {}) });
    }
    for (const h of s.haptic ?? []) haptic.push({ star: h.star + at, atoms: h.atoms.map((e) => e + at) });
    for (const ax of s.axes ?? []) {
      axes.push({ atoms: [ax.atoms[0] + at, ax.atoms[1] + at], refs: [ax.refs[0] + at, ax.refs[1] + at], sense: ax.sense });
    }
    return at;
  };
  /** `at` bound to the metal: haptically where it is a pi system's star, else as anion, alkylidene or donor. */
  const bind = (metal: number, at: number, anionic: boolean, double = false) => {
    const pi = haptic.find((x) => x.star === at);
    if (pi) bonds.push({ a1: metal, a2: at, order: 1, coordination: true, endpoints: pi.atoms, attach: "all" });
    else if (double) bonds.push({ a1: metal, a2: at, order: 2 });
    else if (anionic) bonds.push({ a1: metal, a2: at, order: 1 });
    else bonds.push({ a1: at, a2: metal, order: 1, coordination: true });
  };

  // each part's first halide or group bound by one bond, by its first metal
  const firstX = new Map<number, number>();
  /** One part, its metals first: the index of its first metal, or -1. Its words go to `parts` once. */
  const build = (unit: Item[], named: boolean): number => {
    const named0 = parts.length;
    const metals: number[] = [];
    for (const it of unit) {
      if (it.kind !== "metal") continue;
      for (let k = 0; k < it.n; k++) {
        atoms.push({ el: it.el, hs: 0 });
        metals.push(atoms.length - 1);
      }
      parts.push(`${it.n > 1 ? `${it.n} ` : ""}${NAME.get(it.el) ?? it.el}`);
    }
    if (!metals.length) return -1;
    let turn = 0;
    for (const it of unit) {
      if (it.kind === "ligand" || it.kind === "x") {
        for (let k = 0; k < it.n; k++) {
          const first = turn++;
          const metal = metals[first % metals.length];
          if (it.kind === "ligand") {
            const s = ligandStructure(it.ligand, it.descriptor);
            const at = add(s);
            // a bridging one's donors to the metals in turn, from this one
            s.attach.forEach((d, j) =>
              bind(it.bridging ? metals[(first + j) % metals.length] : metal, d + at, s.anionic[j], s.double[j]),
            );
            // a ligand written as an anion (Cp*-) leaves its charge on the metal
            const charge = s.atoms.reduce((q, a) => q + (a.charge ?? 0), 0);
            if (charge && !it.ligand.inner) atoms[metal].charge = (atoms[metal].charge ?? 0) - charge;
          } else {
            const s: GroupStructure = ["F", "Cl", "Br", "I", "H"].includes(it.label)
              ? { atoms: [{ el: it.label, hs: 0 }], bonds: [], attach: [0] }
              : groupOf(it.label)!;
            const at = add(s);
            bind(metal, s.attach[0] + at, true);
            if (!firstX.has(metals[0])) firstX.set(metals[0], s.attach[0] + at);
            // bridging: to each of the others too, as a donor
            if (it.bridging) for (const other of metals) if (other !== metal) bind(other, s.attach[0] + at, false);
          }
        }
        const word = it.kind === "ligand" ? `${it.descriptor ? `${it.descriptor}-` : ""}${it.ligand.name}` : it.label;
        parts.push(`${it.n > 1 ? `${it.n} ` : ""}${it.bridging ? "μ-" : ""}${word}`);
      }
    }
    if (!named) parts.length = named0;
    return metals[0];
  };

  const units = items.filter((it): it is Extract<Item, { kind: "unit" }> => it.kind === "unit");
  const loose = items.filter((it) => it.kind !== "unit" && it.kind !== "counter");
  const counters = items.filter((it): it is Extract<Item, { kind: "counter" }> => it.kind === "counter");
  // in brackets: the part, and after them its counter-anions only
  if (units.length && loose.length) return null;
  if (counters.length && !units.length) return null;
  // a metal on its own, or metals only, is no complex
  const holds = (its: Item[]): boolean => its.some((it) => it.kind === "ligand" || it.kind === "x" || (it.kind === "unit" && holds(it.items)));
  if (!holds(items)) return null;
  const firsts: number[] = [];
  for (const u of units.length ? units : [{ kind: "unit" as const, items: loose, n: 1 }]) {
    const at = parts.length;
    const made: number[] = [];
    for (let k = 0; k < u.n; k++) {
      const first = build(u.items, k === 0);
      if (first < 0) return null;
      made.push(first);
    }
    firsts.push(...made);
    // a dimer of one metal each, a halide or group on it and no
    // counter-anion: bridged by those, each copy's first to the other's metal
    const oneMetal = u.items.filter((it) => it.kind === "metal").reduce((n, it) => n + it.n, 0) === 1;
    const bridged = u.n === 2 && oneMetal && !counters.length && made.every((m) => firstX.has(m));
    if (bridged) {
      bind(made[1], firstX.get(made[0])!, false);
      bind(made[0], firstX.get(made[1])!, false);
    }
    // a hexamer of one metal each, a hydride on it and no counter-anion -
    // [CuH(PPh3)]6, Stryker's reagent - the octahedral cluster such
    // hydrides make: the metals its corners, in contact along its edges,
    // each copy's hydride bridging an edge of the face its metal is on,
    // from its metal to the next on that face (μ2-H): the edges of two
    // opposite faces, as neutron diffraction places them (Bennett et al.,
    // Inorg. Chem. 2014, 53, 2963, Figure 1)
    const cluster =
      u.n === 6 && oneMetal && !counters.length && made.every((m) => firstX.has(m) && atoms[firstX.get(m)!].el === "H");
    if (cluster) {
      for (const [p, q] of OCTAHEDRON_EDGES) bonds.push({ a1: made[p], a2: made[q], order: 1 });
      made.forEach((m, k) => bind(made[(k + 2) % 6], firstX.get(m)!, false));
    }
    // a part made twice: 2 × (its words), and what bridges them
    if (u.n > 1) {
      const x = u.items.find((it): it is Extract<Item, { kind: "x" }> => it.kind === "x");
      const how = cluster ? ", an octahedron bridged by H" : bridged && x ? ` bridged by ${x.label}` : "";
      parts.splice(at, parts.length - at, `${u.n} × (${parts.slice(at).join(", ")})${how}`);
    }
  }
  let turn = 0;
  for (const c of counters) {
    for (let k = 0; k < c.n; k++) {
      add(c.ion);
      const metal = firsts[turn++ % firsts.length];
      atoms[metal].charge = (atoms[metal].charge ?? 0) + 1;
    }
    parts.push(`${c.n > 1 ? `${c.n} ` : ""}${c.name}`);
  }
  return { atoms, bonds, attach: [], ...(haptic.length ? { haptic } : {}), ...(axes.length ? { axes } : {}), name: parts.join(", ") };
}
