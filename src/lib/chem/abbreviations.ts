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
import { condensedStructure } from "./condensed";
import { chainGroup } from "./chain";
import { complexStructure, LIGAND_UNITS, ligandStructure, namedLigand, type GroupStructure } from "./ligands";
import { precatalystPicture, precatalystStructure, REAGENT_UNITS, reagentOf, reagentStructure } from "./reagents";
import { kekuleOrders } from "./kekulize";
import type { TextRun } from "./layout2d";
import { ELEMENTS as TABLE } from "./elements";

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
  const complex = complexStructure(label, groupStructure);
  if (complex) return { label, name: complex.name, smiles: "", kind: "complex" };
  const made = madeStructure(label);
  if (made) return { label, name: made.name, smiles: "", kind: "reagent" };
  return undefined;
}

/** A generation of Buchwald's precatalysts drawn with its phosphine as L (`precatalystPicture`), or null. */
export function precatalystDrawn(generation: string): GroupStructure | null {
  return precatalystPicture(generation, groupStructure);
}

/** A whole molecule a label stands for: one of the reagents, or one made by rule (`byRule`). */
function madeStructure(label: string): (GroupStructure & { name: string }) | null {
  return reagentStructure(label, groupStructure) ?? byRule(label);
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
  const pieces = label.split(/[·•∙]/);
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
        bonds.push(...s.bonds.map((b) => ({ ...b, a1: b.a1 + at, a2: b.a2 + at, ...(b.endpoints ? { endpoints: b.endpoints.map((e) => e + at) } : {}) })));
        for (const ax of s.axes ?? []) {
          axes.push({ atoms: [ax.atoms[0] + at, ax.atoms[1] + at], refs: [ax.refs[0] + at, ax.refs[1] + at], sense: ax.sense });
        }
      }
      names.push(`${m[1] ? `${m[1]} ` : ""}${abbreviationOf(m[2])?.name ?? m[2]}`);
    }
    return { atoms, bonds, attach: [], ...(axes.length ? { axes } : {}), name: names.join(" · ") };
  }
  return condensedStructure(label, groupLabels(), groupStructure);
}

/** What a label stands for as a whole molecule - a ligand on its own, a complex, a reagent - or null for a group. */
function moleculeOf(label: string): GroupStructure | null {
  const a = abbreviationOf(label);
  if (!a?.kind) return null;
  const s = abbreviationStructure(label);
  return s && { ...s, attach: [] };
}

/**
 * Atoms that take as many of one group as fill their valence but the bond
 * out (PPh2, PCy2, NBn2): each one's valence, and the word its group's name
 * ends in.
 */
const CARRIERS: Record<string, { valence: number; word: string }> = {
  B: { valence: 3, word: "boranyl" },
  N: { valence: 3, word: "amino" },
  P: { valence: 3, word: "phosphanyl" },
  As: { valence: 3, word: "arsanyl" },
  Si: { valence: 4, word: "silyl" },
  Ge: { valence: 4, word: "germyl" },
  Sn: { valence: 4, word: "stannyl" },
};

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
  const halided = halidedGroupOf(label);
  if (halided) return halided;
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
  // (last, a condensed formula: OCH3, CH2OH, COMe, SO2Me, NO - ./chain; Cp in none, only on a metal)
  const chain = chainGroup(label, {
    at: (text, i) => groupLabels().find((l) => l.length > 1 && l !== "Cp" && text.startsWith(l, i)),
    smiles: (l) => (BY_LABEL.get(l) ?? custom.get(l))?.smiles,
  });
  if (chain) return { label, smiles: chain, name: label };
  return undefined;
}

const COMPOSED_SEEN = new Map<string, Abbreviation | undefined>();

/**
 * The abbreviation a label is, as written (OTBS, or OTBDMS): the
 * dictionary's, the user's own, or one put together by rule. None, for any
 * other.
 */
export function abbreviationOf(label: string): Abbreviation | undefined {
  const l = label.trim();
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
 * Meno reads, with one "*" - where it is attached - bonded to one atom.
 */
export function structureProblem(smiles: string): string | null {
  let read: Smiles;
  try {
    read = readSmiles(smiles.trim());
  } catch (e) {
    return `The SMILES cannot be read: ${e instanceof Error ? e.message : String(e)}`;
  }
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
  return a ? smilesGroup(a.smiles) : null;
}

/** A group's SMILES, "*" first, as its structure. */
function smilesGroup(smiles: string): GroupStructure {
  const read = readSmiles(smiles);
  const star = read.atoms.findIndex((x) => x.el === "*");
  const orders = kekuleOrders(read.atoms, read.bonds);
  const keep = read.atoms.map((_, i) => i).filter((i) => i !== star);
  const index = new Map(keep.map((old, i) => [old, i]));
  let attach = 0;
  const bonds: Smiles["bonds"] = [];
  read.bonds.forEach((b, i) => {
    if (b.a1 === star || b.a2 === star) {
      attach = index.get(b.a1 === star ? b.a2 : b.a1) ?? 0;
      return;
    }
    bonds.push({ a1: index.get(b.a1)!, a2: index.get(b.a2)!, order: orders[i] });
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
 * What a label is read into: the groups the abbreviations name, longest
 * first - and "pin", for pinacolato - before element symbols.
 */
let UNITS: string[] = [];
/** The units labels are read into: the groups', the user's own among them. */
function setUnits(): void {
  UNITS = [...new Set([...[...GROUPS, ...custom.values()].flatMap((g) => [g.label, ...(g.also ?? [])]), ...LIGAND_UNITS, ...REAGENT_UNITS, "pin", "Phth"])]
    // (Bpin is B and pin, and so on the left pinB)
    .filter((u) => u.length > 1 && u !== "Bpin")
    .sort((x, y) => y.length - x.length);
}
setUnits();

/** The names labels are read into - the groups', the user's own among them, ligands' and reagents' - as they are written. */
export function labelUnitNames(): readonly string[] {
  return UNITS;
}

/**
 * A label's units, as a chemist reads it: each element or group with its
 * count - CO2Me is C, O2, Me - parentheses with what they hold, and any
 * other character on its own.
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
      unit =
        UNITS.find((u) => text.startsWith(u, i)) ??
        (ELEMENTS.has(text.slice(i, i + 2)) && /[a-z]/.test(text[i + 1] ?? "") ? text.slice(i, i + 2) : text[i]);
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
 * from the bond, each unit keeping its count (IUPAC GR-2.3) - OTBS as TBSO,
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
    // a reagent's name: its digits are no counts (T3P, XPhos Pd G3)
    if (REAGENT_NAMES.has(unit)) return push(unit);
    // a group's own prefix: the t of t-Bu, the p of p-Ts
    const prefixed = /^(sec|tert|[nistomp])(-.+)$/.exec(unit);
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
