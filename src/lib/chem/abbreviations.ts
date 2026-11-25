/**
 * Abbreviations: the labels that stand for a group of atoms - Me, Ph, Boc,
 * OTBS, CO2Me - and what each stands for, so that a structure drawn with
 * them can be expanded, counted and written out whole.
 *
 * The list is Meno's own, from what organic chemists commonly write; it is
 * not taken from any program's table. IUPAC's recommendations for
 * structure diagrams (2008, GR-2.2, Table II) name the ones that may be used
 * without explanation - Me, Et, Pr, iPr, Bu, iBu, s-Bu, t-Bu, Ac, Ph, Ms,
 * Ts, Cp - marked `free` here; the rest are the protecting groups and
 * substituents of everyday use. Each structure is SMILES (./smiles), the
 * group's attachment first, after a "*".
 *
 * The list holds groups and contracted labels only. What is written by
 * putting them together is read by rule, not listed: a group behind O, S
 * or NH (OTBS, SPh, NHBoc), an ester (CO2Me), and a substituted aryl group
 * (2,6-diMeBz, 4-MeOC6H4: ./substitutedAryl).
 */
import { readSmiles, type Smiles } from "./smiles";
import { substitutedAryl } from "./substitutedAryl";
import { anionStructure, condensedStructure, metalSaltStructure } from "./condensed";
import { chainGroup } from "./chain";
import { complexStructure, forgetComplexReadings, LIGAND_UNITS, ligandStructure, namedLigand, type GroupStructure } from "./ligands";
import { precatalystPicture, precatalystStructure, REAGENT_UNITS, reagentOf, reagentStructure } from "./reagents";
import { aromaticRefusal, kekuleOrders, outsideRingRefusal } from "./kekulize";
import { typedRingRefused } from "./smilesWhy";
import type { TextRun } from "./layout2d";
import { ELEMENTS as TABLE } from "./elements";
import { notMetal } from "./perception/elements";
import { VALENCE } from "./formula";
import { CARRIERS } from "./perception/hydrogens";
import { movedBond } from "./structureBonds";

export type Abbreviation = {
  /** How it is written when its bond comes in from the left: OTBS, CO2Me. */
  label: string;
  /** Other ways of writing the same group: TBDMS for TBS. */
  also?: string[];
  /** Its structure: SMILES starting "*", the atom it is attached by next. */
  smiles: string;
  /** What it is, in words. */
  name: string;
  /** In IUPAC's Table II: may be used without explanation. */
  free?: boolean;
  /**
   * Put on to protect a site, or to make it leave or react, and taken off
   * again - a protecting group, an activating or leaving group (TBS, Boc,
   * Ts, Tf, Bpin, OSu): written by its name by Clean-up wherever it does
   * that work, as chemists write it (./contract).
   */
  role?: "protecting";
  /**
   * A ligand (./ligands), a complex's formula, or a whole molecule - a
   * reagent (./reagents), or a simple formula read by rule (./condensed) -
   * rather than a group: its structure is made, not read from `smiles`.
   */
  kind?: "ligand" | "complex" | "reagent";
  /** An atom carrying a group, its other bonds the drawing's (NBoc, ONa): put together by rule, after a reagent's or a ligand's name. */
  carrying?: boolean;
};

/** These groups, each a protecting, activating or leaving group (`role`). */
function protecting(groups: Abbreviation[]): Abbreviation[] {
  return groups.map((g) => ({ ...g, role: "protecting" as const }));
}

/** Groups attached by one bond. */
export const GROUPS: Abbreviation[] = [
  { label: "Me", smiles: "*C", name: "methyl", free: true },
  { label: "Et", smiles: "*CC", name: "ethyl", free: true },
  { label: "Pr", also: ["n-Pr", "nPr"], smiles: "*CCC", name: "propyl", free: true },
  { label: "iPr", also: ["i-Pr"], smiles: "*C(C)C", name: "isopropyl", free: true },
  { label: "Bu", also: ["n-Bu", "nBu"], smiles: "*CCCC", name: "butyl", free: true },
  { label: "iBu", also: ["i-Bu"], smiles: "*CC(C)C", name: "isobutyl", free: true },
  { label: "s-Bu", also: ["sBu", "sec-Bu"], smiles: "*C(C)CC", name: "sec-butyl", free: true },
  { label: "t-Bu", also: ["tBu", "tert-Bu"], smiles: "*C(C)(C)C", name: "tert-butyl", free: true },
  { label: "Ac", smiles: "*C(C)=O", name: "acetyl", free: true },
  { label: "Ph", also: ["C6H5"], smiles: "*c1ccccc1", name: "phenyl", free: true },
  { label: "Ms", smiles: "*S(=O)(=O)C", name: "methanesulfonyl (mesyl)", free: true, role: "protecting" },
  { label: "Ts", also: ["p-Ts", "Tos"], smiles: "*S(=O)(=O)c1ccc(C)cc1", name: "4-toluenesulfonyl (tosyl)", free: true, role: "protecting" },
  // (IUPAC: only where it is bonded to a metal - and so never behind O, S or NH here)
  { label: "Cp", smiles: "*C1C=CC=C1", name: "cyclopentadienyl", free: true },
  { label: "Bn", also: ["Bzl"], smiles: "*Cc1ccccc1", name: "benzyl" },
  // (IUPAC discourages Bz, once used for benzyl too; it is benzoyl here)
  { label: "Bz", smiles: "*C(=O)c1ccccc1", name: "benzoyl" },
  { label: "Piv", also: ["Pv"], smiles: "*C(=O)C(C)(C)C", name: "pivaloyl" },
  { label: "Boc", smiles: "*C(=O)OC(C)(C)C", name: "tert-butoxycarbonyl", role: "protecting" },
  { label: "Cbz", also: ["Z"], smiles: "*C(=O)OCc1ccccc1", name: "benzyloxycarbonyl", role: "protecting" },
  { label: "Fmoc", smiles: "*C(=O)OCC1c2ccccc2-c2ccccc21", name: "9-fluorenylmethoxycarbonyl", role: "protecting" },
  { label: "Alloc", also: ["Aloc"], smiles: "*C(=O)OCC=C", name: "allyloxycarbonyl", role: "protecting" },
  { label: "Troc", smiles: "*C(=O)OCC(Cl)(Cl)Cl", name: "2,2,2-trichloroethoxycarbonyl", role: "protecting" },
  { label: "Teoc", smiles: "*C(=O)OCC[Si](C)(C)C", name: "2-(trimethylsilyl)ethoxycarbonyl", role: "protecting" },
  { label: "Tf", smiles: "*S(=O)(=O)C(F)(F)F", name: "trifluoromethanesulfonyl (triflyl)", role: "protecting" },
  { label: "Ns", smiles: "*S(=O)(=O)c1ccccc1[N+](=O)[O-]", name: "2-nitrobenzenesulfonyl (nosyl)", role: "protecting" },
  { label: "TMS", smiles: "*[Si](C)(C)C", name: "trimethylsilyl", role: "protecting" },
  { label: "TES", smiles: "*[Si](CC)(CC)CC", name: "triethylsilyl", role: "protecting" },
  { label: "TBS", also: ["TBDMS"], smiles: "*[Si](C)(C)C(C)(C)C", name: "tert-butyldimethylsilyl", role: "protecting" },
  { label: "TIPS", smiles: "*[Si](C(C)C)(C(C)C)C(C)C", name: "triisopropylsilyl", role: "protecting" },
  { label: "TBDPS", smiles: "*[Si](c1ccccc1)(c1ccccc1)C(C)(C)C", name: "tert-butyldiphenylsilyl", role: "protecting" },
  { label: "PMB", also: ["MPM", "Mob"], smiles: "*Cc1ccc(OC)cc1", name: "4-methoxybenzyl", role: "protecting" },
  { label: "MOM", smiles: "*COC", name: "methoxymethyl", role: "protecting" },
  { label: "MEM", smiles: "*COCCOC", name: "(2-methoxyethoxy)methyl", role: "protecting" },
  { label: "SEM", smiles: "*COCC[Si](C)(C)C", name: "[2-(trimethylsilyl)ethoxy]methyl", role: "protecting" },
  { label: "THP", smiles: "*C1CCCCO1", name: "tetrahydropyran-2-yl", role: "protecting" },
  { label: "Tr", also: ["Trt"], smiles: "*C(c1ccccc1)(c1ccccc1)c1ccccc1", name: "triphenylmethyl (trityl)", role: "protecting" },
  { label: "Cy", smiles: "*C1CCCCC1", name: "cyclohexyl" },
  { label: "Mes", smiles: "*c1c(C)cc(C)cc1C", name: "2,4,6-trimethylphenyl (mesityl)" },
  { label: "Tol", also: ["p-Tol"], smiles: "*c1ccc(C)cc1", name: "4-methylphenyl (p-tolyl)" },
  { label: "Bpin", smiles: "*B1OC(C)(C)C(C)(C)O1", name: "pinacolatoboryl", role: "protecting" },

  // --- in peptide synthesis -------------------------------------------------
  ...protecting([
  { label: "Pbf", smiles: "*S(=O)(=O)c1c(C)c(C)c2OC(C)(C)Cc2c1C", name: "2,2,4,6,7-pentamethyl-2,3-dihydrobenzofuran-5-sulfonyl" },
  { label: "Pmc", smiles: "*S(=O)(=O)c1c(C)c(C)c2OC(C)(C)CCc2c1C", name: "2,2,5,7,8-pentamethylchroman-6-sulfonyl" },
  { label: "Mtr", smiles: "*S(=O)(=O)c1c(C)c(C)c(OC)cc1C", name: "4-methoxy-2,3,6-trimethylbenzenesulfonyl" },
  { label: "Mts", smiles: "*S(=O)(=O)c1c(C)cc(C)cc1C", name: "mesitylenesulfonyl" },
  { label: "Mtt", smiles: "*C(c1ccccc1)(c1ccccc1)c1ccc(C)cc1", name: "4-methyltrityl" },
  { label: "Mmt", also: ["MMTr"], smiles: "*C(c1ccccc1)(c1ccccc1)c1ccc(OC)cc1", name: "4-methoxytrityl" },
  { label: "DMTr", also: ["DMT"], smiles: "*C(c1ccccc1)(c1ccc(OC)cc1)c1ccc(OC)cc1", name: "4,4'-dimethoxytrityl" },
  { label: "Clt", also: ["2-ClTrt"], smiles: "*C(c1ccccc1)(c1ccccc1)c1ccccc1Cl", name: "2-chlorotrityl" },
  { label: "Dde", smiles: "*C(C)=C1C(=O)CC(C)(C)CC1=O", name: "1-(4,4-dimethyl-2,6-dioxocyclohexylidene)ethyl" },
  { label: "ivDde", smiles: "*C(CC(C)C)=C1C(=O)CC(C)(C)CC1=O", name: "1-(4,4-dimethyl-2,6-dioxocyclohexylidene)-3-methylbutyl" },
  { label: "Dmab", smiles: "*Cc1ccc(NC(CC(C)C)=C2C(=O)CC(C)(C)CC2=O)cc1", name: "4-{N-[1-(4,4-dimethyl-2,6-dioxocyclohexylidene)-3-methylbutyl]amino}benzyl" },
  { label: "Acm", smiles: "*CNC(C)=O", name: "acetamidomethyl" },
  { label: "Xan", smiles: "*C1c2ccccc2Oc2ccccc21", name: "9H-xanthen-9-yl" },
  { label: "Dmb", smiles: "*Cc1ccc(OC)cc1OC", name: "2,4-dimethoxybenzyl" },
  { label: "Hmb", smiles: "*Cc1ccc(OC)cc1O", name: "2-hydroxy-4-methoxybenzyl" },
  { label: "Tmob", smiles: "*Cc1c(OC)cc(OC)cc1OC", name: "2,4,6-trimethoxybenzyl" },
  { label: "Meb", smiles: "*Cc1ccc(C)cc1", name: "4-methylbenzyl" },
  { label: "Bom", also: ["BOM"], smiles: "*COCc1ccccc1", name: "benzyloxymethyl" },
  { label: "Dnp", smiles: "*c1ccc([N+](=O)[O-])cc1[N+](=O)[O-]", name: "2,4-dinitrophenyl" },
  { label: "Npys", smiles: "*Sc1ncccc1[N+](=O)[O-]", name: "3-nitro-2-pyridinesulfenyl" },
  { label: "Nps", smiles: "*Sc1ccccc1[N+](=O)[O-]", name: "2-nitrophenylsulfenyl" },
  { label: "Moz", also: ["MeOZ"], smiles: "*C(=O)OCc1ccc(OC)cc1", name: "4-methoxybenzyloxycarbonyl" },
  { label: "2-Cl-Z", also: ["Cl-Z", "ClZ"], smiles: "*C(=O)OCc1ccccc1Cl", name: "2-chlorobenzyloxycarbonyl" },
  { label: "2-Br-Z", also: ["Br-Z", "BrZ"], smiles: "*C(=O)OCc1ccccc1Br", name: "2-bromobenzyloxycarbonyl" },
  { label: "Bpoc", smiles: "*C(=O)OC(C)(C)c1ccc(-c2ccccc2)cc1", name: "2-(4-biphenylyl)-2-propoxycarbonyl" },
  { label: "Ddz", smiles: "*C(=O)OC(C)(C)c1cc(OC)cc(OC)c1", name: "2-(3,5-dimethoxyphenyl)-2-propoxycarbonyl" },
  { label: "Nsc", smiles: "*C(=O)OCCS(=O)(=O)c1ccc([N+](=O)[O-])cc1", name: "2-(4-nitrophenylsulfonyl)ethoxycarbonyl" },
  { label: "Msc", smiles: "*C(=O)OCCS(C)(=O)=O", name: "2-(methylsulfonyl)ethoxycarbonyl" },
  { label: "Fm", smiles: "*CC1c2ccccc2-c2ccccc21", name: "9-fluorenylmethyl" },
  { label: "Pac", smiles: "*CC(=O)c1ccccc1", name: "phenacyl" },
  { label: "Tfa", smiles: "*C(=O)C(F)(F)F", name: "trifluoroacetyl" },
  // the active esters' leaving groups, written behind O: OSu, OPfp, OBt, OAt
  { label: "Su", smiles: "*N1C(=O)CCC1=O", name: "succinimidyl" },
  { label: "Pfp", also: ["C6F5"], smiles: "*c1c(F)c(F)c(F)c(F)c1F", name: "pentafluorophenyl" },
  // (in Kekulé form: the triazole's ring, given aromatic, is not kekulized the way it is bonded)
  { label: "Bt", smiles: "*N1N=NC2=C1C=CC=C2", name: "benzotriazol-1-yl" },
  { label: "At", smiles: "*N1N=NC2=C1N=CC=C2", name: "7-azabenzotriazol-1-yl" },
  ]),

  // --- other protecting groups ---------------------------------------------
  ...protecting([
  { label: "NAP", smiles: "*Cc1ccc2ccccc2c1", name: "2-naphthylmethyl" },
  { label: "DMPM", smiles: "*Cc1ccc(OC)c(OC)c1", name: "3,4-dimethoxybenzyl" },
  { label: "PMP", smiles: "*c1ccc(OC)cc1", name: "4-methoxyphenyl" },
  { label: "MTM", smiles: "*CSC", name: "methylthiomethyl" },
  { label: "POM", smiles: "*COC(=O)C(C)(C)C", name: "pivaloyloxymethyl" },
  { label: "EE", smiles: "*C(C)OCC", name: "1-ethoxyethyl" },
  { label: "Lev", smiles: "*C(=O)CCC(C)=O", name: "levulinoyl" },
  { label: "DEIPS", smiles: "*[Si](CC)(CC)C(C)C", name: "diethylisopropylsilyl" },
  { label: "TDS", smiles: "*[Si](C)(C)C(C)(C)C(C)C", name: "thexyldimethylsilyl" },
  { label: "Bs", smiles: "*S(=O)(=O)c1ccc(Br)cc1", name: "4-bromobenzenesulfonyl (brosyl)" },
  { label: "p-Ns", smiles: "*S(=O)(=O)c1ccc([N+](=O)[O-])cc1", name: "4-nitrobenzenesulfonyl" },
  { label: "Ses", smiles: "*S(=O)(=O)CC[Si](C)(C)C", name: "2-(trimethylsilyl)ethanesulfonyl" },
  { label: "Tces", smiles: "*S(=O)(=O)OCC(Cl)(Cl)Cl", name: "2,2,2-trichloroethoxysulfonyl" },
  ]),

  // --- substituents ---------------------------------------------------------
  { label: "All", also: ["allyl"], smiles: "*CC=C", name: "allyl" },
  { label: "Vin", also: ["vinyl"], smiles: "*C=C", name: "vinyl" },
  { label: "Pent", also: ["n-Pent"], smiles: "*CCCCC", name: "pentyl" },
  { label: "Hex", also: ["n-Hex"], smiles: "*CCCCCC", name: "hexyl" },
  { label: "Hept", also: ["n-Hept"], smiles: "*CCCCCCC", name: "heptyl" },
  { label: "Oct", also: ["n-Oct"], smiles: "*CCCCCCCC", name: "octyl" },
  { label: "Ad", smiles: "*C12CC3CC(CC(C3)C1)C2", name: "1-adamantyl" },
  { label: "Dipp", smiles: "*c1c(C(C)C)cccc1C(C)C", name: "2,6-diisopropylphenyl" },
  { label: "Tipp", also: ["Trip"], smiles: "*c1c(C(C)C)cc(C(C)C)cc1C(C)C", name: "2,4,6-triisopropylphenyl" },
  { label: "1-Naph", smiles: "*c1cccc2ccccc12", name: "1-naphthyl" },
  { label: "2-Naph", smiles: "*c1ccc2ccccc2c1", name: "2-naphthyl" },
];

/** Contracted labels written out letter by letter, and some that are not O, S or NH and a group. */
const CONTRACTED: Abbreviation[] = [
  { label: "CO2H", also: ["COOH"], smiles: "*C(=O)O", name: "carboxy" },
  { label: "CHO", smiles: "*C=O", name: "formyl" },
  { label: "CN", smiles: "*C#N", name: "cyano" },
  { label: "NO2", smiles: "*[N+](=O)[O-]", name: "nitro" },
  { label: "N3", smiles: "*N=[N+]=[N-]", name: "azido" },
  { label: "CF3", smiles: "*C(F)(F)F", name: "trifluoromethyl" },
  { label: "CCl3", smiles: "*C(Cl)(Cl)Cl", name: "trichloromethyl" },
  { label: "CONH2", smiles: "*C(N)=O", name: "carbamoyl" },
  { label: "SO3H", smiles: "*S(=O)(=O)O", name: "sulfo" },
  { label: "NMe2", smiles: "*N(C)C", name: "dimethylamino" },
  { label: "NEt2", smiles: "*N(CC)CC", name: "diethylamino" },
  { label: "NHNH2", smiles: "*NN", name: "hydrazinyl" },
  { label: "NPhth", smiles: "*N1C(=O)c2ccccc2C1=O", name: "phthalimido" },
];

/** The dictionary: groups, then contracted labels. */
export const ABBREVIATIONS: Abbreviation[] = [...GROUPS, ...CONTRACTED];

const BY_LABEL = new Map<string, Abbreviation>();
for (const a of ABBREVIATIONS) {
  for (const l of [a.label, ...(a.also ?? [])]) if (!BY_LABEL.has(l)) BY_LABEL.set(l, a);
}
const GROUP_LABELS = new Set(GROUPS.flatMap((g) => [g.label, ...(g.also ?? [])]));
/** The user's own, by each of their names (setCustomAbbreviations). */
const custom = new Map<string, Abbreviation>();
let customList: readonly Abbreviation[] = [];

/**
 * How labels are put together from a group, by rule: the letters written
 * before it, the atoms they stand for, and the word its name takes. A
 * group behind O, S or NH may be any group or contracted label but Cp
 * (bonded to a metal only, IUPAC GR-2.2) and the hydrazinyl; an ester's
 * any group.
 */
const COMPOSED: { prefix: string; smiles: string; word: string; takes: (a: Abbreviation) => boolean }[] = [
  { prefix: "CO2", smiles: "*C(=O)O", word: "oxycarbonyl", takes: (a) => GROUP_LABELS.has(a.label) && a.label !== "Cp" },
  { prefix: "NH", smiles: "*N", word: "amino", takes: (a) => a.label !== "Cp" && a.label !== "NHNH2" },
  { prefix: "O", smiles: "*O", word: "oxy", takes: (a) => a.label !== "Cp" && a.label !== "NHNH2" },
  { prefix: "S", smiles: "*S", word: "sulfanyl", takes: (a) => a.label !== "Cp" && a.label !== "NHNH2" },
];

/**
 * A put-together group's name: the group's, without what it is also called,
 * and the word - an alkyl's and phenyl's as their oxy names are written
 * (methoxy, tert-butoxy, phenoxy; methoxycarbonyl), any other's in full
 * (benzyloxy, trimethylsilyloxy).
 */
function composedName(group: string, word: string): string {
  const name = group.replace(/ \(.*\)$/, "");
  if (word.startsWith("oxy")) {
    const alkyl = /^(.*(?:meth|eth|prop|but))yl$/.exec(name);
    if (alkyl) return alkyl[1] + word;
    if (name === "phenyl") return "phen" + word;
  }
  return name + word;
}

/**
 * A label put together by rule (OTBS, NHBoc, CO2Me, 2,6-diMeBz) - or a
 * ligand (PPh3, dppf, (S,S)-DPEN), a reagent (DMP, (R)-CBS), a complex's
 * formula (Pd(PPh3)4) or a simple formula (Et3N, BF3·OEt2) - or none.
 */
function composedOf(label: string): Abbreviation | undefined {
  const ligand = namedLigand(label);
  if (ligand) {
    const { ligand: l, descriptor } = ligand;
    const d = descriptor ? `${descriptor}-` : "";
    return { label: d + l.label, ...(l.also ? { also: l.also.map((x) => d + x) } : {}), name: d + l.name, smiles: l.smiles, kind: "ligand" };
  }
  const reagent = reagentOf(label);
  if (reagent) {
    const { reagent: r, descriptor } = reagent;
    const d = descriptor ? `${descriptor}-` : "";
    return { label: d + r.label, ...(r.also ? { also: r.also.map((x) => d + x) } : {}), name: d + r.name, smiles: r.smiles ?? "", kind: "reagent" };
  }
  const group = composedGroupOf(label);
  if (group) return group;
  // (a metal's salt of an oxoanion - AgNO3, Cu(NO3)2, CuSO4 - read as its ions, before a complex's formula would read its O across: ./condensed)
  const salt = metalSaltStructure(label, groupStructure);
  if (salt === "unread") return undefined;
  if (salt) return { label, name: salt.name, smiles: "", kind: "reagent" };
  // (a metal oxoacid, as HnMOm or with its hydroxo written out - H2CrO4, CrO2(OH)2 - read as (HO)n-M(=O)(m-n), before a complex's formula
  // would read its H as groups on the metal and every O as oxo)
  const acid = metalOxoacid(label);
  if (acid === "refused") return undefined;
  if (acid) return { label, name: acid.name, smiles: "", kind: "reagent" };
  const complex = complexStructure(label, groupStructure);
  if (complex && (refusedForOO(label, complex) || oxoPastHighest(label, complex))) return undefined;
  if (complex) return { label, name: complex.name, smiles: "", kind: "complex" };
  const made = madeStructure(label);
  if (made && refusedForOO(label, made)) return undefined;
  if (made) return { label, name: made.name, smiles: "", kind: "reagent" };
  // (last of all, after every group and every formula read whole: an atom with its H and the groups it carries,
  // its other bonds the drawing's - SiH(COOH), CH(CO2Me), N(CO2Me), Si(Me)(OMe))
  return atomCarryingGroups(label);
}

/** A generation of Buchwald's precatalysts drawn with its phosphine as L (`precatalystPicture`), or null. */
export function precatalystDrawn(generation: string): GroupStructure | null {
  return precatalystPicture(generation, groupStructure);
}

/** A whole molecule a label stands for: one of the reagents, or one made by rule (`byRule`). */
function madeStructure(label: string): (GroupStructure & { name: string }) | null {
  const reagent = reagentStructure(label, groupStructure);
  if (reagent) return reagent;
  const acid = metalOxoacid(label);
  return (acid !== "refused" ? acid : null) ?? byRule(label);
}

/**
 * A label's parts as an adduct's: split at a middle dot (BF3·OEt2) - or,
 * written with none, at a full stop typed in its place between two parts
 * of a formula (Na2SO4.10H2O, BF3.OEt2): after a letter, a count or a
 * bracket and before a count, a capital or a bracket. A number's decimal
 * point (0.5) is none: nothing but digits before it.
 */
function adductPieces(label: string): string[] {
  const dotted = label.split(/[·•∙]/);
  if (dotted.length > 1 || !label.includes(".")) return dotted;
  const parts = label.split(".");
  const joins = parts.slice(1).every((p, k) => /[A-Za-z)\]]\d*$/.test(parts[k]) && /[A-Za-z]/.test(parts[k]) && /^[\d(A-Z]/.test(p));
  return joins ? parts : [label];
}

/**
 * A whole molecule a label stands for by rule alone - what the reagent
 * dictionary need not hold: a Buchwald precatalyst (XPhos Pd G3,
 * ./reagents), an adduct of known parts joined by a middle dot (BF3·OEt2,
 * CeCl3·7H2O, each part counted), or a simple formula (./condensed). Null
 * for any other label.
 */
export function byRule(label: string): (GroupStructure & { name: string }) | null {
  const precatalyst = precatalystStructure(label, groupStructure);
  if (precatalyst) return precatalyst;
  const pieces = adductPieces(label);
  if (pieces.length > 1) {
    const atoms: GroupStructure["atoms"] = [];
    const bonds: GroupStructure["bonds"] = [];
    const names: string[] = [];
    const axes: NonNullable<GroupStructure["axes"]> = [];
    for (const piece of pieces) {
      const m = /^(\d*)(.+)$/.exec(piece.trim());
      const s = m && moleculeOf(m[2]);
      if (!m || !s) return null;
      for (let k = 0; k < (m[1] ? Number(m[1]) : 1); k++) {
        const at = atoms.length;
        atoms.push(...s.atoms.map((a) => (a.tetra ? { ...a, tetra: { ...a.tetra, neighbours: a.tetra.neighbours.map((n) => (n < 0 ? n : n + at)) } } : { ...a })));
        bonds.push(...s.bonds.map((b) => movedBond(b, (i) => i + at)));
        for (const ax of s.axes ?? []) {
          axes.push({ atoms: [ax.atoms[0] + at, ax.atoms[1] + at], refs: [ax.refs[0] + at, ax.refs[1] + at], sense: ax.sense });
        }
      }
      names.push(`${m[1] ? `${m[1]} ` : ""}${abbreviationOf(m[2])?.name ?? m[2]}`);
    }
    return { atoms, bonds, attach: [], ...(axes.length ? { axes } : {}), name: names.join(" · ") };
  }
  const ion = ionStructure(label);
  if (ion) return ion;
  const salt = metalSaltStructure(label, groupStructure);
  if (salt === "unread") return null;
  const read = salt ?? condensedStructure(label, groupLabels(), groupStructure);
  return read && refusedForOO(label, read) ? null : read;
}

/**
 * Why a label's formula is not read as written, where one of its readers refused it: it would bond two O the label does not write
 * together, take its metal past its highest oxidation state (by so many oxo and other groups), or - a metal oxoacid - give its metal a
 * state other than the one `HIGHEST_STATE` holds for it (`metalOxoacid`). The chemist is told only that it is
 * not read as written (`labelRefused`, the label's notice): what the formula would have been read as is no structure they wrote.
 */
export type LabelRefusal =
  | { why: "two O bonded" }
  | { why: "past the highest state"; metal: string; oxo: number; others: number; state: number; highest: number }
  | { why: "a state not held"; metal: string; oxo: number; hydroxo: number; state: number; held: number };

/** Each label refused, by label. */
const REFUSED = new Map<string, LabelRefusal>();

/**
 * Whether a structure read from a label's formula bonds two O that the label does not write together - "OO" (OOH, OOtBu) or O2 as a
 * peroxo ligand in brackets ((O2), (η2-O2)). MoO2NO3 is no compound; read across it is three O-O-N=O. A peroxide, a superoxide or a
 * peracid from the tables (H2O2, mCPBA, TBHP) is no formula's reading, so never asked. Asked of a complex's, a made formula's and a
 * condensed formula's reading; of today's readers only the complex's ever bonds two O, so the others are asked for a reader yet to come,
 * as is a label that does write its O-O, which no reader yet reads with one.
 */
export function bondsUnwrittenOO(label: string, s: GroupStructure): boolean {
  if (!s.bonds.some((b) => s.atoms[b.a1]?.el === "O" && s.atoms[b.a2]?.el === "O")) return false;
  return !/OO|\((?:[μη]2?-)?O2\)/.test(label);
}

/** Whether a reading bonds two O its label does not write together: so, it is recorded as refused. */
function refusedForOO(label: string, s: GroupStructure): boolean {
  if (!bondsUnwrittenOO(label, s)) return false;
  REFUSED.set(label, { why: "two O bonded" });
  return true;
}

/** The highest oxidation state of the metals an oxo formula is read of, where a count of oxo past it is no reading of what is written. */
const HIGHEST_STATE: ReadonlyMap<string, number> = new Map([
  ["Ti", 4],
  ["Zr", 4],
  ["Hf", 4],
  ["V", 5],
  ["Nb", 5],
  ["Ta", 5],
  ["Tc", 7],
  ["Cr", 6],
  ["Mo", 6],
  ["W", 6],
  ["Mn", 7],
  ["Re", 7],
  ["Ru", 8],
  ["Os", 8],
]);

/**
 * Whether a complex's formula read takes one of `HIGHEST_STATE`'s metals past its highest oxidation state - two for each oxo (O on it by
 * a double bond and on nothing else), one for each other group bound to it by a single bond of its own, not lent: CrO5 read as five oxo
 * would be Cr +10, MoO3Cl2 Mo +8. Not read as written: CrO5 is a compound, CrO(O2)2 with two peroxo ligands, which a formula's O count
 * does not say. (A metal oxoacid, H2CrO4, is read before a complex's formula is: `metalOxoacid`.)
 */
function oxoPastHighest(label: string, s: GroupStructure): boolean {
  for (const [i, a] of s.atoms.entries()) {
    const most = HIGHEST_STATE.get(a.el);
    if (most == null) continue;
    const oxo = s.bonds.filter((b) => {
      if (b.order !== 2 || (b.a1 !== i && b.a2 !== i)) return false;
      const o = b.a1 === i ? b.a2 : b.a1;
      return s.atoms[o].el === "O" && s.bonds.filter((c) => c.a1 === o || c.a2 === o).length === 1;
    }).length;
    // (each other group by a single bond of its own: a halide, an alkyl, an alkoxide - never a donor's lent bond)
    const single = s.bonds.filter((b) => b.order === 1 && !b.coordination && (b.a1 === i || b.a2 === i)).length;
    const state = 2 * oxo + single;
    if (oxo && state > most) {
      REFUSED.set(label, { why: "past the highest state", metal: a.el, oxo, others: single, state, highest: most });
      return true;
    }
  }
  return false;
}

/** Greek multiplying prefixes, by count: an additive name's. */
const MULTIPLIER = ["", "", "di", "tri", "tetra", "penta", "hexa"];

/**
 * A metal oxoacid typed as a label - as HnMOm (H2CrO4, HMnO4, HReO4) or with its hydroxo written out (CrO2(OH)2, MoO2(OH)2, ReO3(OH),
 * ReO3OH, VO(OH)3) - as the molecule (HO)n-M(=O)(m-n): each H on an O of its own, that O bound to the metal by a single bond, and the
 * rest of the O oxo, by a double bond. Only of `HIGHEST_STATE`'s metals, with one oxo or more, and only where the oxidation state the
 * formula gives the metal - two for each oxo, one for each hydroxo - is the one that table holds for it: H2CrO4 Cr(VI), HMnO4 Mn(VII),
 * VO(OH)3 V(V). A formula of this shape at any other state (H2CrO3, Cr(IV); H2MnO4, Mn(VI)) is refused, never read at a state guessed:
 * "refused", and recorded so. Named additively, its ligands in alphabetical order: dihydroxidodioxidochromium (IUPAC, Nomenclature of
 * Inorganic Chemistry, Recommendations 2005, chapter IR-8). Null for any other label: a main-group acid (H2SO4, HNO3) is no such reading.
 */
function metalOxoacid(label: string): (GroupStructure & { name: string }) | "refused" | null {
  const acid = /^H(\d*)([A-Z][a-z]?)O(\d*)$/.exec(label);
  const hydroxo = acid ? null : /^([A-Z][a-z]?)O(\d*)(?:\(OH\)(\d*)|OH)$/.exec(label);
  const metal = acid?.[2] ?? hydroxo?.[1];
  const held = metal == null ? undefined : HIGHEST_STATE.get(metal);
  if (metal == null || held == null) return null;
  const count = (n: string | undefined) => (n ? Number(n) : 1);
  // (HnMOm: n of the O carry the n H, the rest are oxo; MOx(OH)y as written)
  const oh = acid ? count(acid[1]) : count(hydroxo![3]);
  const oxo = acid ? count(acid[3]) - oh : count(hydroxo![2]);
  // (an O count of none, or no oxo left: a hydroxide - H4TiO4, Ti(OH)4 - is no metal oxo form, and not this reader's)
  if (oh < 1 || oxo < 1 || oh >= MULTIPLIER.length || oxo >= MULTIPLIER.length) return null;
  const state = 2 * oxo + oh;
  if (state !== held) {
    REFUSED.set(label, { why: "a state not held", metal, oxo, hydroxo: oh, state, held });
    return "refused";
  }
  const smiles = `[${metal}]${"(O)".repeat(oh)}${"(=O)".repeat(oxo)}`;
  const prefix = (n: number) => MULTIPLIER[n];
  return { ...wholeOf(smiles), name: `${prefix(oh)}hydroxido${prefix(oxo)}oxido${TABLE.find((e) => e.symbol === metal)?.name ?? metal}` };
}

/** Why `label`, typed, is not read as written - where a reader refused it rather than finding nothing - or undefined. */
export function labelRefused(label: string): LabelRefusal | undefined {
  abbreviationOf(label);
  return REFUSED.get(label.trim());
}

/**
 * An ion written as one, a counter-ion set beside a complex or a salt: an
 * anion as one is read in a salt, its charge written (PF6-, BF4-, SbF6-,
 * AlCl4-, ClO4-: ./condensed); a group bound by an O or an S with the
 * charge there (OTf-, OAc-) - and any of these in parentheses, counted, an
 * element's own ion too ((Cl-)2: two; Cl- alone is read as an element is).
 * Null for any other label.
 */
function ionStructure(label: string): (GroupStructure & { name: string }) | null {
  const counted = /^\((.+)\)(\d+)$/.exec(label);
  if (counted) {
    const n = Number(counted[2]);
    const one = n >= 2 && n <= 6 ? oneIon(counted[1], true) : null;
    if (!one) return null;
    const atoms: GroupStructure["atoms"] = [];
    const bonds: GroupStructure["bonds"] = [];
    for (let k = 0; k < n; k++) {
      const at = atoms.length;
      atoms.push(...one.atoms.map((a) => ({ ...a })));
      bonds.push(...one.bonds.map((b) => movedBond(b, (i) => i + at)));
    }
    return { atoms, bonds, attach: [], name: `${n} ${counted[1]}` };
  }
  const one = oneIon(label, false);
  return one && { ...one, attach: [], name: label };
}

/** One ion, as `ionStructure` reads its label - an element alone only where `element` (counted: one alone is read as an element is) - or null. */
function oneIon(label: string, element: boolean): GroupStructure | null {
  const m = /^(.+?)([+\-\u2212])$/.exec(label);
  if (!m) return null;
  const sign = m[2] === "+" ? "+" : "-";
  if (ELEMENTS.has(m[1])) return element ? wholeOf(`[${m[1]}${sign}]`) : null;
  if (sign === "-") {
    const anion = anionStructure(label, groupLabels(), groupStructure);
    if (anion) return anion;
  }
  const g = abbreviationOf(m[1]);
  const first = g && !g.kind && /^\*([OS])(?![a-z])/.exec(g.smiles);
  return first ? wholeOf(`[${first[1]}${sign}]${g.smiles.slice(2)}`) : null;
}

/** A whole molecule's structure from its SMILES: attached by none. */
function wholeOf(smiles: string): GroupStructure {
  return { ...smilesGroup(smiles), attach: [] };
}

/** What a label stands for as a whole molecule - a ligand on its own, a complex, a reagent - or null for a group. */
function moleculeOf(label: string): GroupStructure | null {
  const a = abbreviationOf(label);
  if (!a?.kind) return null;
  const s = abbreviationStructure(label);
  return s && { ...s, attach: [] };
}

/**
 * Atoms that carry halogens as a group, by the valence each is read at -
 * its bond out, its H and its halogens - and what the group is called after
 * it: CF3 trifluoromethyl, SiCl3 trichlorosilyl, SF5 pentafluoro-λ6-sulfanyl.
 */
const HALIDED: Record<string, Record<number, string>> = {
  C: { 4: "methyl" },
  Si: { 4: "silyl" },
  Ge: { 4: "germyl" },
  Sn: { 4: "stannyl" },
  B: { 3: "boranyl" },
  N: { 3: "amino" },
  P: { 3: "phosphanyl", 5: "λ5-phosphanyl" },
  S: { 4: "λ4-sulfanyl", 6: "λ6-sulfanyl" },
  Se: { 4: "λ4-selanyl", 6: "λ6-selanyl" },
  I: { 3: "λ3-iodanyl", 5: "λ5-iodanyl" },
};
const HALO_WORD: Record<string, string> = { F: "fluoro", Cl: "chloro", Br: "bromo", I: "iodo" };
const TIMES = ["", "", "di", "tri", "tetra", "penta", "hexa", "hepta"];

/**
 * An atom and the halogens on it, two or more - CF3, CHF2, CF2Cl, SF5,
 * SiCl3 - its H after it, then each halogen and its count; or none, where
 * the bond out, the H and the halogens make no valence the atom has (PCl3
 * and SiCl4 are molecules).
 */
function halidedGroupOf(label: string): Abbreviation | undefined {
  const m = /^([A-Z][a-z]?)(?:H(\d*))?((?:(?:F|Cl|Br|I)\d*)+)$/.exec(label);
  const parents = m && HALIDED[m[1]];
  if (!m || !parents) return undefined;
  const hs = m[2] == null ? 0 : m[2] === "" ? 1 : Number(m[2]);
  const counts = new Map<string, number>();
  for (const [, x, n] of m[3].matchAll(/(F|Cl|Br|I)(\d*)/g)) counts.set(x, (counts.get(x) ?? 0) + (n ? Number(n) : 1));
  const halogens = [...counts.values()].reduce((t, n) => t + n, 0);
  const parent = parents[1 + hs + halogens];
  if (halogens < 2 || !parent || [...counts.values()].some((n) => n >= TIMES.length)) return undefined;
  const smiles = `*[${m[1]}${hs ? `H${hs > 1 ? hs : ""}` : ""}]` + [...counts].map(([x, n]) => `(${x})`.repeat(n)).join("");
  // (the halogens' prefixes in the order of their names, multiplied)
  const prefix = [...counts]
    .sort(([a], [b]) => HALO_WORD[a].localeCompare(HALO_WORD[b]))
    .map(([x, n]) => TIMES[n] + HALO_WORD[x])
    .join("");
  return { label, smiles, name: parent.startsWith("λ") ? `${prefix}-${parent}` : prefix + parent };
}

/** An atom and as many of one group as fill its valence but its bond out - PPh2, PCy2, NBn2 - or none. */
function carriedGroupOf(label: string): Abbreviation | undefined {
  const m = /^([A-Z][a-z]?)(.+?)([2-3])$/.exec(label);
  const carrier = m && CARRIERS[m[1]];
  if (!m || !carrier || carrier.valence - 1 !== Number(m[3])) return undefined;
  const g = BY_LABEL.get(m[2]) ?? custom.get(m[2]);
  if (!g || g.kind || !g.smiles.startsWith("*") || g.label === "Cp" || CONTRACTED.includes(g)) return undefined;
  const n = Number(m[3]);
  const name = g.name.replace(/ \(.*\)$/, "");
  // (di- and tri- before a plain name, di-tert-butyl; bis() and tris() round any other)
  const times = /^[a-z]+$/.test(name)
    ? (n === 2 ? "di" : "tri") + name
    : /^(tert|sec)-(butyl|pentyl)$/.test(name)
      ? (n === 2 ? "di-" : "tri-") + name
      : `${n === 2 ? "bis" : "tris"}(${name})`;
  return {
    label: m[1] + g.label + m[3],
    smiles: `*[${m[1]}]` + `(${g.smiles.slice(1)})`.repeat(n),
    name: times + carrier.word,
  };
}

/** Atoms that take more than one bond and may carry one group besides, their other bonds the drawing's: each one's name as a diyl. */
const CARRYING: Record<string, string> = { N: "azanediyl", P: "phosphanediyl" };
/** The alkali metals, bound to an O or an S as ions (as NaOMe's sodium is: ./condensed). */
const ALKALI: Record<string, string> = { Li: "lithium", Na: "sodium", K: "potassium", Rb: "rubidium", Cs: "caesium" };

/**
 * An atom that takes more than one bond, written with one group it
 * carries, its other bonds the drawing's - an N in a ring with its
 * protecting group (NBoc, NMOM, NTs, NMe), a P; or an O or an S with
 * an alkali metal on it, bound as an ion as NaOMe's is (ONa, OK, SLi). As
 * drawn on a bond's left (BocN, MOMN, NaO) it is read turned round, as
 * any label is. None for any other label.
 */
function carryingGroupOf(label: string): Abbreviation | undefined {
  const m = /^([A-Z][a-z]?)([A-Z].*)$/.exec(label);
  if (!m) return undefined;
  if ((m[1] === "O" || m[1] === "S") && ALKALI[m[2]]) {
    return { label, smiles: `*[${m[1]}-].[${m[2]}+]`, name: `${ALKALI[m[2]]} ${m[1] === "O" ? "oxido" : "sulfido"}`, carrying: true };
  }
  if (!CARRYING[m[1]]) return undefined;
  const g = BY_LABEL.get(m[2]) ?? custom.get(m[2]);
  // (a group's name of two letters or more: Z, of one, only in a structure, as typed - NZ is no zinc)
  if (!g || g.kind || !g.smiles.startsWith("*") || g.label === "Cp" || m[2].length < 2 || CONTRACTED.includes(g)) return undefined;
  return { label, smiles: `*${m[1]}(${g.smiles.slice(1)})`, name: `(${g.name.replace(/ \(.*\)$/, "")})${CARRYING[m[1]]}`, carrying: true };
}

/**
 * A group put together by rule, as `groupBy` puts it together, kept: a
 * complex's formula is tried part by part, and a long label's parts over
 * and over (forgotten as the user's own change).
 */
function composedGroupOf(label: string): Abbreviation | undefined {
  if (!GROUP_SEEN.has(label)) GROUP_SEEN.set(label, groupBy(label));
  return GROUP_SEEN.get(label);
}

const GROUP_SEEN = new Map<string, Abbreviation | undefined>();

/** A group put together by rule - a substituted aryl group, a group behind O, S or NH, an ester, an atom and the groups or halogens on it - or none. */
function groupBy(label: string): Abbreviation | undefined {
  const aryl = substitutedAryl(label);
  if (aryl) return { label, smiles: aryl.smiles, name: aryl.name };
  const carried = carriedGroupOf(label);
  if (carried) return carried;
  const carrying = carryingGroupOf(label);
  if (carrying) return carrying;
  const halided = halidedGroupOf(label);
  if (halided) return halided;
  const prefixed = prefixedGroupOf(label);
  if (prefixed) return prefixed;
  // (last, a condensed formula: OCH3, CH2OH, COMe, SO2Me, NO - ./chain; Cp in none, only on a metal)
  const chain = chainGroup(label, {
    at: (text, i) => groupLabels().find((l) => l.length > 1 && l !== "Cp" && text.startsWith(l, i)),
    smiles: (l) => (BY_LABEL.get(l) ?? custom.get(l))?.smiles,
  });
  if (chain) return { label, smiles: chain, name: label };
  return undefined;
}

/** A group behind O, S, NH or in an ester (`COMPOSED`) - OMe, SPh, NHBoc, CO2Me - or none. */
function prefixedGroupOf(label: string): Abbreviation | undefined {
  for (const c of COMPOSED) {
    if (!label.startsWith(c.prefix) || label.length === c.prefix.length) continue;
    const rest = label.slice(c.prefix.length);
    const g = BY_LABEL.get(rest) ?? custom.get(rest);
    // (one of the user's own is a group like any other)
    if (!g || !(c.takes(g) || custom.get(rest) === g)) continue;
    // (named by the group's own label: OTBDMS is OTBS)
    const own = c.prefix + g.label;
    return { label: own, ...(own !== label ? { also: [label] } : {}), smiles: c.smiles + g.smiles.slice(1), name: composedName(g.name, c.word) };
  }
  return undefined;
}

/**
 * How many an atom carries - its H and its groups together - where it is
 * written with the groups it carries, its other two bonds the drawing's
 * (`atomCarryingGroups`): its valence (./formula `VALENCE`) but those two -
 * an Si's or a C's two, an N's or a P's one. Only an atom that is no metal
 * and takes three bonds or more; none for any other.
 */
function carriesOf(el: string): number | null {
  const v = VALENCE[el];
  const e = TABLE.find((x) => x.symbol === el);
  if (v == null || v < 3 || !e || !notMetal.has(el)) return null;
  return v - 2;
}

/**
 * An atom written with its H, if it has any, and then the groups it
 * carries, one or more, each a group Meno reads of two letters or more -
 * its other bonds the drawing's: SiHCOOH is Si with an H and a carboxy
 * group, CHCO2Me a CH with a methoxycarbonyl, NCO2Me an N with one,
 * SiMeOMe an Si with a methyl and a methoxy (the maintainer, 2026-10-18: a
 * ring's Si labelled SiHCOOH was read as nothing, and its letters then as
 * S and I). By rule, not by a list: any atom that is no metal and takes
 * three bonds or more, carrying exactly as many - its H and its groups
 * together - as its valence leaves but two bonds (`carriesOf`): an Si's or
 * a C's two, an N's or a P's one; BH2Ph and CH2CO2Me read as they did,
 * whole. None for any other label - one that reads otherwise is read so
 * first - and no part of a formula (`groupStructure`: BPh4 is an anion).
 */
function atomCarryingGroups(label: string): Abbreviation | undefined {
  const m = /^([A-Z][a-z]?)(?:H(\d*))?([A-Z(].*)$/.exec(label);
  const carries = m ? carriesOf(m[1]) : null;
  if (!m || carries == null) return undefined;
  const hs = m[2] == null ? 0 : m[2] === "" ? 1 : Number(m[2]);
  const groupAt = (text: string): Abbreviation | undefined => {
    // (a group named - Meno's, the user's own, one behind O, S or NH: not one put together of bare elements, ICl2 - so that nicl2 is still NiCl2)
    const g = BY_LABEL.get(text) ?? custom.get(text) ?? prefixedGroupOf(text);
    // (a contracted group - CO2H, CN, NO2 - is carried as any other: SiH(COOH))
    return g && !g.kind && !g.carrying && g.smiles.startsWith("*") && g.label !== "Cp" && text.length >= 2 ? g : undefined;
  };
  // (the groups, one after another, each the longest that leaves the rest readable - three at most)
  const split = (text: string, left: number): Abbreviation[] | null => {
    if (!text) return [];
    if (left === 0) return null;
    // (one in brackets, as it is also written: SiH(COOH), Si(Me)(OMe))
    const held = /^\(([^()]+)\)/.exec(text);
    if (held) {
      const g = groupAt(held[1]);
      const rest = g ? split(text.slice(held[0].length), left - 1) : null;
      return g && rest ? [g, ...rest] : null;
    }
    for (let k = text.length; k >= 2; k--) {
      const g = groupAt(text.slice(0, k));
      if (!g) continue;
      const rest = split(text.slice(k), left - 1);
      if (rest) return [g, ...rest];
    }
    return null;
  };
  const groups = split(m[3], 3);
  if (!groups?.length) return undefined;
  // (exactly as many as fill its valence with two bonds of the drawing's - a ring's: BH2Ph, CH2CO2Me read as they were, whole)
  if (hs + groups.length !== carries) return undefined;
  const atom = hs ? `[${m[1]}H${hs > 1 ? hs : ""}]` : m[1].length > 1 || !"BCNP".includes(m[1]) ? `[${m[1]}]` : m[1];
  const smiles = `*${atom}` + groups.map((g) => `(${g.smiles.slice(1)})`).join("");
  // (named for what it is: the groups, and the H, on the atom - SiHCOOH, carboxy and H on silicon)
  const names = [...groups.map((g) => g.name.replace(/ \(.*\)$/, "")), ...(hs ? [hs > 1 ? `${hs} H` : "H"] : [])];
  const element = TABLE.find((x) => x.symbol === m[1])!.name;
  return { label, smiles, name: `${names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0]} on ${element}`, carrying: true };
}

const COMPOSED_SEEN = new Map<string, Abbreviation | undefined>();

/**
 * The abbreviation a label is, as written (OTBS, or OTBDMS): the
 * dictionary's, the user's own, or one put together by rule. None, for any
 * other.
 */
export function abbreviationOf(label: string): Abbreviation | undefined {
  // (a full stop typed for a middle dot read as one: Na2SO4.10H2O, NaBO3.4H2O - `adductPieces`)
  const pieces = adductPieces(label.trim());
  const l = pieces.join("·");
  const listed = BY_LABEL.get(l) ?? custom.get(l);
  if (listed) return listed;
  if (!COMPOSED_SEEN.has(l)) COMPOSED_SEEN.set(l, composedOf(l));
  return COMPOSED_SEEN.get(l);
}

// --- the user's own ------------------------------------------------------------

/**
 * An abbreviation of the user's own (Settings), as one of Meno's: a group,
 * which may stand behind O, S or NH and in an ester as Meno's own may.
 */
export type CustomAbbreviation = Abbreviation;

/** The user's own abbreviations, from now on known as Meno's own are. */
export function setCustomAbbreviations(list: readonly CustomAbbreviation[]): void {
  if (list === customList) return;
  customList = list;
  custom.clear();
  for (const a of list) {
    for (const l of [a.label, ...(a.also ?? [])]) if (!BY_LABEL.has(l) && !custom.has(l)) custom.set(l, a);
  }
  COMPOSED_SEEN.clear();
  GROUP_SEEN.clear();
  NOTHING_SEEN.clear();
  READ_SEEN.clear();
  forgetComplexReadings();
  GROUP_LABELS_SORTED = null;
  setUnits();
}

/** The user's own abbreviations, as last given. */
export function customAbbreviations(): readonly CustomAbbreviation[] {
  return customList;
}

/**
 * Why a label cannot be one of the user's own, or null if it can: it must
 * be written without spaces, and be neither an element's symbol nor a label
 * that already means something - IUPAC (GR-2.2) does not accept an
 * abbreviation written as an element or as another in common use.
 * `except` is the abbreviation being edited, which may keep its names.
 */
export function labelProblem(label: string, except?: CustomAbbreviation): string | null {
  const l = label.trim();
  if (!l) return "Give it a label.";
  if (/\s/.test(l)) return "A label has no spaces.";
  if (l.length > 24) return "A label is at most 24 characters.";
  if (/^[\d,]/.test(l) || /^[+−-]|[+−-]$/.test(l)) return "A label starts with a letter and ends without a charge.";
  if (ELEMENTS.has(l)) return `${l} is an element's symbol.`;
  if (GENERIC_SYMBOLS.has(l)) return `${l} already means ${GENERIC_SYMBOLS.get(l)}.`;
  const own = custom.get(l);
  if (own && own !== except) return `${l} is already one of yours: ${own.name || own.label}.`;
  if (!own) {
    const known = BY_LABEL.get(l) ?? composedOf(l);
    if (known) return `${l} already means ${known.name}.`;
  }
  return null;
}

/**
 * Why a structure cannot be an abbreviation's, or null if it can: SMILES
 * Meno reads, with one "*" - where it is attached - bonded to one atom; and
 * its aromatic rings given single and double bonds as written, never by an
 * H nobody wrote (lib/chem/kekulize `aromaticRefusal`).
 */
export function structureProblem(smiles: string): string | null {
  let read: Smiles;
  try {
    read = readSmiles(smiles.trim());
  } catch (e) {
    return `The SMILES cannot be read: ${e instanceof Error ? e.message : String(e)}`;
  }
  const refused = aromaticRefusal(read.atoms, read.bonds);
  if (refused) return `The SMILES cannot be read: ${typedRingRefused(refused)}`;
  const outside = outsideRingRefusal(read.atoms, read.bonds);
  if (outside) return `The SMILES cannot be read: ${outside}`;
  const stars = read.atoms.flatMap((a, i) => (a.el === "*" ? [i] : []));
  if (stars.length !== 1) return 'Mark where it is attached with one "*".';
  if (read.atoms.length < 2) return "Give it at least one atom besides the *.";
  if (read.bonds.filter((b) => b.a1 === stars[0] || b.a2 === stars[0]).length !== 1) {
    return 'The "*" is bonded to the one atom the group is attached by.';
  }
  return null;
}

/**
 * Whether a label names its ring's substituents before the ring - 2,6-diMeBz,
 * 4-MeOC6H4 - and so is attached at its end as written: it is not read
 * outward, whichever side its bond comes in from.
 */
export function namesRingFirst(label: string): boolean {
  return substitutedAryl(label.trim()) != null;
}

/**
 * The structure an abbreviation stands for: its atoms and bonds, an
 * aromatic ring's in Kekulé form, without the "*" - and where it is
 * attached: a group by one atom, a ligand by its donors (each an atom, or
 * the star at the centre of a pi system), a complex by none.
 */
export function abbreviationStructure(label: string): GroupStructure | null {
  const a = abbreviationOf(label);
  if (!a) return null;
  if (a.kind === "ligand") {
    // a label bonded to a metal as drawn: neutral, as the drawing is (only a
    // complex's formula balances a Cp*- against its metal)
    const named = namedLigand(label.trim()) ?? namedLigand(a.label)!;
    const { anionic, double, ...s } = ligandStructure(named.ligand, named.descriptor);
    // (a neutral donor lends its pair: the bond to it, a coordination bond)
    const pi = new Set((s.haptic ?? []).map((h) => h.star));
    const lends = s.attach.map((at, k) => !anionic[k] && !double[k] && !pi.has(at));
    return { ...s, atoms: s.atoms.map(({ charge: _charge, ...atom }) => atom), ...(lends.some(Boolean) ? { lends } : {}) };
  }
  if (a.kind === "reagent") {
    const made = madeStructure(label.trim());
    if (!made) return null;
    const { name: _name, ...s } = made;
    return s;
  }
  if (a.kind === "complex") {
    const c = complexStructure(label.trim(), groupStructure);
    if (!c) return null;
    const { name: _name, ...s } = c;
    return s;
  }
  return smilesGroup(a.smiles);
}

let GROUP_LABELS_SORTED: string[] | null = null;
/** The labels of the groups (and the user's own), longest first: what a simple formula is read into. */
function groupLabels(): string[] {
  GROUP_LABELS_SORTED ??= [...new Set([...BY_LABEL.keys(), ...custom.keys()])].sort((x, y) => y.length - x.length);
  return GROUP_LABELS_SORTED;
}

/** A group bound by one bond (OAc, OTf, Me) - inside a complex's formula - or null. */
function groupStructure(label: string): GroupStructure | null {
  const a = BY_LABEL.get(label) ?? custom.get(label) ?? composedGroupOf(label);
  // (an atom carrying groups, its other bonds the drawing's, is no part of a formula: BPh4 is an anion, no BPh four times)
  return a && !a.carrying ? smilesGroup(a.smiles) : null;
}

/** A group's SMILES, "*" first, as its structure. */
export function smilesGroup(smiles: string): GroupStructure {
  const read = readSmiles(smiles);
  const star = read.atoms.findIndex((x) => x.el === "*");
  const orders = kekuleOrders(read.atoms, read.bonds);
  const keep = read.atoms.map((_, i) => i).filter((i) => i !== star);
  const index = new Map(keep.map((old, i) => [old, i]));
  let attach = 0;
  const bonds: Smiles["bonds"] = [];
  const around = read.atoms.map(() => [] as number[]);
  for (const b of read.bonds) {
    around[b.a1].push(b.a2);
    around[b.a2].push(b.a1);
  }
  read.bonds.forEach((b, i) => {
    if (b.a1 === star || b.a2 === star) {
      attach = index.get(b.a1 === star ? b.a2 : b.a1) ?? 0;
      return;
    }
    // (a double bond's cis or trans kept: a ref on the "*" moved to its end's other neighbour, the sense turned - or, where
    //  the end has none, -1, the atom outside it is attached to)
    let cisTrans: Smiles["bonds"][number]["cisTrans"];
    if (b.cisTrans) {
      let cis = b.cisTrans.cis;
      const refs = b.cisTrans.refs.map((r, k) => {
        if (r !== star) return index.get(r)!;
        const end = k === 0 ? b.a1 : b.a2;
        const other = around[end].find((n) => n !== star && n !== (k === 0 ? b.a2 : b.a1));
        if (other == null) return -1;
        cis = !cis;
        return index.get(other)!;
      });
      cisTrans = { refs: [refs[0], refs[1]], cis };
    }
    bonds.push({ a1: index.get(b.a1)!, a2: index.get(b.a2)!, order: orders[i], ...(cisTrans ? { cisTrans } : {}) });
  });
  return {
    atoms: keep.map((i) => {
      const { aromatic: _aromatic, cls: _cls, ...atom } = read.atoms[i];
      return atom;
    }),
    bonds,
    attach: [attach],
  };
}

// --- writing a label ---------------------------------------------------------

const ELEMENTS = new Set(TABLE.map((e) => e.symbol));
/**
 * The symbols for a kind of group rather than a group, and what each stands
 * for (the maintainer, 2026-10-13): names, as TBS is - read whole, so never
 * turned round on a bond's left (OPG is PGO there, not GPO), written so
 * however typed (pg is PG), and no label of the user's own - but holding no
 * structure.
 */
export const GENERIC_SYMBOLS: ReadonlyMap<string, string> = new Map([
  ["PG", "a protecting group"],
  ["LG", "a leaving group"],
  ["EWG", "an electron-withdrawing group"],
  ["EDG", "an electron-donating group"],
  ["Nu", "a nucleophile"],
  ["E", "an electrophile"],
  ["Hal", "a halogen"],
  ["Het", "a heteroatom"],
]);
/**
 * The names of a point of variability, as a drawing writes one (Brecher 2008, GR-9.1 and GR-9.2 with Table GR-9.1): a number set after one is part
 * of the name - X1 and X2 are two variables, as R1 and R2 are - never an atom's number. R (with its primes), X, Z and G are GR-9.1's, Alk, Alkyl,
 * Ar, Aryl, E, EWG, M, Nu and Q Table GR-9.1's; PG, LG, EDG, Hal and Het are Meno's own class symbols; Y, A, L and HetAr are a judgement (common
 * use: no text read names them). The figure reader asks of a label only its LAST capital with its small letters (the Ar of OAr, the G of EWG, the Ar
 * of HetAr), so the compound names - EWG, EDG, PG, LG, HetAr - are listed for the record: it is their last capital that decides. B and P are left out: they stay elements (a nucleobase B1, a protecting group P1 are read as boron and
 * phosphorus - a stated limit).
 */
export const VARIABLE_NAMES: ReadonlySet<string> = new Set(["R", "X", "Y", "Z", "G", "A", "L", "M", "Q", "E", "Ar", "Aryl", "Alk", "Alkyl", "Nu", "EWG", "EDG", "PG", "LG", "Hal", "Het", "HetAr"]);

/**
 * What a label is read into: the groups the abbreviations name, longest
 * first - and "pin", for pinacolato - before element symbols.
 */
let UNITS: string[] = [];
/** The units by their first letter, each letter's longest first: what a label is read into at a letter, looked up by it. */
let UNITS_AT = new Map<string, string[]>();
/** The units labels are read into: the groups', the user's own among them, and the symbols for a kind of group. */
function setUnits(): void {
  UNITS = [...new Set([...[...GROUPS, ...custom.values()].flatMap((g) => [g.label, ...(g.also ?? [])]), ...LIGAND_UNITS, ...REAGENT_UNITS, ...GENERIC_SYMBOLS.keys(), "pin", "Phth"])]
    // (Bpin is B and pin, and so on the left pinB; a capital alone - E - is a
    // unit as it is, and here would come before Eu)
    .filter((u) => u.length > 1 && u !== "Bpin")
    .sort((x, y) => y.length - x.length);
  UNITS_AT = new Map();
  for (const u of UNITS) {
    const at = UNITS_AT.get(u[0]);
    if (at) at.push(u);
    else UNITS_AT.set(u[0], [u]);
  }
}
setUnits();

/**
 * Whether a label reads as nothing - no element, no group, ligand, reagent or complex Meno knows (the dictionary, the label
 * grammar, the user's own), no Rgroup, no symbol for a kind of group or a point of variability: words, kept as typed and drawn
 * in the order typed (docs/EDITOR-2D.md, *Labels read as they are meant*, rule 5).
 */
export function readsAsNothing(label: string): boolean {
  const seen = NOTHING_SEEN.get(label);
  if (seen != null) return seen;
  const nothing =
    !TABLE.some((e) => e.symbol === label) &&
    label !== "R#" &&
    !/^R\d+$/.test(label) &&
    !GENERIC_SYMBOLS.has(label) &&
    !VARIABLE_NAMES.has(label) &&
    // (a name the dictionary does not have reads as nothing at once; one it has is asked for its structure)
    (abbreviationOf(label) == null || abbreviationStructure(label) == null);
  NOTHING_SEEN.set(label, nothing);
  return nothing;
}
/** What `readsAsNothing` has answered, by label: asked again as a drawing is laid out, and forgotten as the user's own change. */
const NOTHING_SEEN = new Map<string, boolean>();

/** The names labels are read into - the groups', the user's own among them, ligands', reagents' and the symbols for a kind of group - as they are written. */
export function labelUnitNames(): readonly string[] {
  return UNITS;
}

/**
 * The unit a label's letters at `i` make, where no group's name begins: a
 * capital and the small letters after it - an element, Cl, or a word that
 * names nothing Meno knows, Nu, Hal, Het, read whole (letter by letter, Nu
 * was written uN on a bond's left) - up to a group's name (Bpin is B and
 * pin) or a prefix (Ot-Bu), past an element's own two letters; any other
 * character on its own.
 */
function letters(text: string, i: number): string {
  if (!/[A-Z]/.test(text[i])) return text[i];
  // (an element's two letters first: SnBu3 is Sn and Bu3, not S and nBu3)
  let j = ELEMENTS.has(text.slice(i, i + 2)) && /[a-z]/.test(text[i + 1] ?? "") ? i + 2 : i + 1;
  const prefix = (k: number) => text[k + 1] === "-" && /[A-Za-z(]/.test(text[k + 2] ?? "");
  while (/[a-z]/.test(text[j] ?? "") && !prefix(j) && !UNITS.some((u) => text.startsWith(u, j))) j++;
  return text.slice(i, j);
}

/**
 * A label's units, as a chemist reads it: each element or group with its
 * count - CO2Me is C, O2, Me - parentheses with what they hold, a word
 * Meno does not know whole, and any other character on its own.
 */
export function labelUnits(text: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    let unit = "";
    if (text[i] === "(") {
      // a parenthesis and what it holds, and its count, as one unit
      let depth = 0;
      let j = i;
      for (; j < text.length; j++) {
        if (text[j] === "(") depth++;
        if (text[j] === ")" && --depth === 0) break;
      }
      unit = text.slice(i, j + 1);
    } else {
      // (a symbol for a kind of group only where its word ends: NHallyl is
      // NH and allyl, PGe P and Ge)
      unit =
        UNITS_AT.get(text[i])?.find((u) => text.startsWith(u, i) && !(GENERIC_SYMBOLS.has(u) && /[a-z]/.test(text[i + u.length] ?? ""))) ??
        letters(text, i);
    }
    i += unit.length;
    // its count - after a letter or a bracket, not a ring's position (2,6-)
    const count = /[A-Za-z)\]*]$/.test(unit) ? /^\d+/.exec(text.slice(i)) : null;
    if (count) {
      unit += count[0];
      i += count[0].length;
    }
    out.push(unit);
  }
  return out;
}

/**
 * A label as written when its bond comes in from the right: read outward
 * from the bond, each unit keeping its count (IUPAC GR-2.3.3, GR-2.1.6) - OTBS as TBSO,
 * CO2Me as MeO2C, NHBoc as BocHN - and what parentheses hold the same way.
 */
export function reversedLabel(text: string): string {
  return labelUnits(text)
    .reverse()
    .map((u) => {
      const m = /^\((.*)\)(\d*)$/.exec(u);
      return m ? `(${reversedLabel(m[1])})${m[2]}` : u;
    })
    .join("");
}

/**
 * The units a label is drawn in: those it is read in. A label the reader
 * reads as one atom with its H and the groups on it - a group or a ligand
 * attached by that atom - is that atom, its H and each group with its
 * count: PtBu3 (read as tri-tert-butylphosphine) is P and tBu3, NiPr2 N and
 * iPr2, NHs-Bu N, H and s-Bu - so that turned round at a left end it is
 * tBu3P, iPr2N, s-BuHN, never Bu3Pt. Typed with that atom last - Ph3P,
 * tBu3P, as written on a bond's left - the typed order is the left end's,
 * and turned round it is the right end's: PPh3, PtBu3. `turned` gives the
 * units with the atom last, what parentheses hold turned as
 * `reversedLabel` turns it; else with the atom first. Null for any other
 * label - a metal with its ligands, a formula, a reagent, words - drawn in
 * its `labelUnits`.
 */
export function readUnits(text: string, turned = false): string[] | null {
  if (!READ_SEEN.has(text)) READ_SEEN.set(text, atomAndGroupUnits(text));
  const read = READ_SEEN.get(text);
  if (!read) return null;
  return turned === read.atomLast ? read.units : turnedUnits(read.units);
}
/** What `readUnits` has answered, by label (forgotten as the user's own change). */
const READ_SEEN = new Map<string, { units: string[]; atomLast: boolean } | null>();

/** Units in the other order, what parentheses hold turned as `reversedLabel` turns it. */
const turnedUnits = (units: readonly string[]) =>
  [...units].reverse().map((u) => {
    const m = /^\((.*)\)(\d*)$/.exec(u);
    return m ? `(${reversedLabel(m[1])})${m[2]}` : u;
  });

/** The heavy atoms of a structure. */
const heavyAtoms = (s: GroupStructure) => s.atoms.filter((x) => x.el !== "H").length;

/**
 * A label read as one atom with its H and groups, split as it is read, in
 * the order typed: the atom the reader attaches it by, first in the label
 * (`atomLast` false) or last (true, the H then before it), an H and its
 * count, the groups, each one the reader reads, with its count - their
 * atoms with the atom's exactly the reader's. Null for any other.
 */
function atomAndGroupUnits(text: string): { units: string[]; atomLast: boolean } | null {
  const a = abbreviationOf(text);
  if (!a || (a.kind && a.kind !== "ligand")) return null;
  const s = abbreviationStructure(text);
  if (!s || s.attach.length !== 1 || s.haptic?.length) return null;
  const el = s.atoms[s.attach[0]]?.el;
  if (!el) return null;
  const groupOf = (unit: string): GroupStructure | null => {
    const g = abbreviationOf(unit);
    const gs = g && !g.kind && !g.carrying ? abbreviationStructure(unit) : null;
    return gs && gs.attach.length === 1 ? gs : null;
  };
  // the groups, each read with its count, their atoms and the atom's the reader's - or null (what parentheses hold written as on
  // a bond's left where the atom is typed last: (MeO)3P, (PhO)3P)
  const groupsOf = (rest: string, atomLast = false): string[] | null => {
    const groups = labelUnits(rest);
    let heavy = 1;
    for (const unit of groups) {
      // (a group with its count, or in parentheses with it: tBu3, (t-Bu)3 - a name's own digits kept, C6F5)
      const m = /^(?:\((.+)\)|(.*?\D))(\d*)$/.exec(unit);
      const named = (held: string) => groupOf(held) ?? (atomLast ? groupOf(reversedLabel(held)) : null);
      const [g, n] = groupOf(unit) ? [groupOf(unit), 1] : m ? [m[1] !== undefined ? named(m[1]) : groupOf(m[2]), m[3] ? Number(m[3]) : 1] : [null, 0];
      if (!g) return null;
      heavy += heavyAtoms(g) * n;
    }
    return heavy === heavyAtoms(s) ? groups : null;
  };
  if (text.startsWith(el)) {
    const after = text.slice(el.length);
    const hs = /^H\d*/.exec(after)?.[0];
    // (the H read with the atom, or no H at all: NHex is N and Hex)
    for (const h of [undefined, hs]) {
      if (h === undefined && hs !== undefined && hs.length === after.length) continue;
      const rest = after.slice(h?.length ?? 0);
      const groups = rest ? groupsOf(rest) : null;
      if (groups) return { units: [el, ...(h ? [h] : []), ...groups], atomLast: false };
    }
  }
  // (typed with the atom last, as on a bond's left: Ph3P, tBu3P, and an H before it, tBuHN)
  if (text.endsWith(el) && text.length > el.length) {
    const before = text.slice(0, -el.length);
    const hs = /H\d*$/.exec(before)?.[0];
    for (const h of [undefined, hs]) {
      if (h === undefined && hs !== undefined && hs.length === before.length) continue;
      const rest = before.slice(0, before.length - (h?.length ?? 0));
      const groups = rest ? groupsOf(rest, true) : null;
      if (groups) return { units: [...groups, ...(h ? [h] : []), el], atomLast: true };
    }
  }
  return null;
}

/**
 * The prefixes set in italics, as IUPAC's Table II sets them and names have
 * them: n-, s-, t-, sec-, tert- and i- before a hyphen (t-Bu, but iPr
 * upright, as isopropyl is), and o-, m-, p- (p-Ts, p-MeOPh).
 */
const ITALIC_PREFIX = /^(sec|tert|[nistomp])$/;

/** A stereodescriptor before a label, whose R and S are set in italics: (S,S)-DPEN, (1S)-CSA. */
const DESCRIPTOR_UNIT = /^\((\d*[RS](?:,\d*[RS])*)\)$/;

/**
 * Which of a label's units are such a prefix, or a stereodescriptor: on
 * its own, before a hyphen.
 */
export function italicUnits(units: readonly string[]): boolean[] {
  return units.map((u, k) => (ITALIC_PREFIX.test(u) || DESCRIPTOR_UNIT.test(u)) && (units[k + 1] ?? "").startsWith("-"));
}

/**
 * A label's runs for the drawing: the counts after an element, a group or a
 * parenthesis set as subscripts (CO2Me, CH(CH3)2), a prefix such as the t
 * of t-Bu and a stereodescriptor's R and S in italics, and a sign at its
 * end as a superscript charge (NMe3+: the 3 is the methyls' count).
 */
export function labelRuns(text: string): TextRun[] {
  const charge = /[+−-]$/.exec(text);
  const body = charge && text.length > charge[0].length ? text.slice(0, -charge[0].length) : text;
  const units = labelUnits(body);
  const runs = unitRuns(units, italicUnits(units));
  if (charge && body !== text) runs.push({ text: charge[0].replace("-", "−"), sup: true });
  return runs;
}

const REAGENT_NAMES = new Set(REAGENT_UNITS);

/** The runs `units` are set in, those `italic` marks in italics. */
export function unitRuns(units: readonly string[], italic: readonly boolean[] = []): TextRun[] {
  const runs: TextRun[] = [];
  const push = (t: string, sub = false, it = false) => {
    const last = runs[runs.length - 1];
    if (last && !!last.sub === sub && !!last.italic === it && !last.sup) last.text += t;
    else runs.push({ text: t, ...(sub ? { sub: true } : {}), ...(it ? { italic: true } : {}) });
  };
  units.forEach((unit, k) => {
    // a stereodescriptor: its R and S in italics, its locants and commas not
    const descriptor = italic[k] ? DESCRIPTOR_UNIT.exec(unit) : null;
    if (descriptor) {
      push("(");
      for (const ch of descriptor[1]) push(ch, false, ch === "R" || ch === "S");
      push(")");
      return;
    }
    if (italic[k]) return push(unit, false, true);
    const group = /^\((.*)\)(\d*)$/.exec(unit);
    if (group) {
      // what a parenthesis holds, set the same way
      push("(");
      for (const r of labelRuns(group[1])) push(r.text, !!r.sub, !!r.italic);
      push(")");
      if (group[2]) push(group[2], true);
      return;
    }
    // a group's own prefix, or a reagent's: the t of t-Bu, the p of p-Ts, the m of m-CPBA
    const prefixed = /^(sec|tert|[nistomp])(-.+)$/.exec(unit);
    // a reagent's name: its digits are no counts (T3P, XPhos Pd G3)
    if (REAGENT_NAMES.has(unit)) {
      if (prefixed) push(prefixed[1], false, true);
      return push(prefixed ? prefixed[2] : unit);
    }
    if (prefixed) {
      push(prefixed[1], false, true);
      unit = prefixed[2];
    }
    const m = /^(.*?)(\d+)$/.exec(unit);
    // (a count after something, not a label that is a number)
    if (m && m[1]) {
      push(m[1]);
      push(m[2], true);
    } else push(unit);
  });
  return runs;
}
