import type { Enantiomers } from "./enantiomers";
import { axesWith, splitDescriptor, withConfiguration } from "./enantiomers";
import { kekuleOrders } from "./kekulize";
import { complexStructure, LIGANDS, type GroupStructure, type Ligand, type StructureBond } from "./ligands";
import { readSmiles } from "./smiles";

/**
 * The reagents, catalysts and solvents written over reaction arrows - DMP,
 * HATU, LiHMDS, Grubbs II, Krische's catalyst - read as the molecules they
 * are, so that a scheme says what it uses as structures do.
 *
 * Meno's own list, from what chemists commonly write. Each is the whole
 * molecule: in SMILES, a salt's ions after dots, a tetrahedral centre by @
 * or @@; or, for a metal complex, as its formula, read as complexes are
 * (./ligands) from Meno's ligands and any of its own. A chiral one is given
 * as one enantiomer, with the descriptors that name it and its mirror
 * image (./enantiomers).
 *
 * What is read by rule is not listed: simple formulas - Et3N, n-BuLi, TMSCl,
 * Ac2O, KOt-Bu, HOBt, TsOH - (./condensed), adducts (BF3·OEt2) and
 * Buchwald's precatalysts (below). A reagent named otherwise as well (TEA,
 * LiHMDS) is listed by that name alone.
 */

export type ReagentUse =
  | "oxidation"
  | "reduction"
  | "base"
  | "acid"
  | "coupling"
  | "halogenation"
  | "electrophile"
  | "organometallic"
  | "catalyst"
  | "organocatalyst"
  | "solvent"
  | "other";

/** What each use is called, in the order Settings shows them. */
export const REAGENT_USES: { use: ReagentUse; title: string }[] = [
  { use: "oxidation", title: "Oxidation" },
  { use: "reduction", title: "Reduction" },
  { use: "base", title: "Bases" },
  { use: "acid", title: "Acids" },
  { use: "coupling", title: "Coupling, condensation and the Mitsunobu reaction" },
  { use: "halogenation", title: "Halogenation and fluorination" },
  { use: "electrophile", title: "Acylation, sulfonylation, silylation and alkylation" },
  { use: "organometallic", title: "Organometallic reagents" },
  { use: "catalyst", title: "Metal catalysts" },
  { use: "organocatalyst", title: "Organocatalysts and chiral reagents" },
  { use: "solvent", title: "Solvents" },
  { use: "other", title: "Other named reagents" },
];

export type Reagent = {
  label: string;
  also?: string[];
  name: string;
  use: ReagentUse;
  /** The molecule in SMILES: a salt's ions after dots. */
  smiles?: string;
  /** Or a metal complex's formula (./ligands), naming Meno's ligands and `ligands`. */
  complex?: string;
  /** Ligands of its own, by the names `complex` gives them. */
  ligands?: Record<string, Ligand>;
  enantiomers?: Enantiomers;
  /** Written as a formula: NaBH4, Boc2O. Its counts are set as subscripts; a name's (T3P) are not. */
  formula?: boolean;
};

/** An axially chiral one's: (R) and (S), its axis's - a ligand's own descriptor, in its formula, (R). */
const AXIAL: Enantiomers = { as: ["(R)", "(Ra)"], mirror: ["(S)", "(Sa)"], axial: true };
const BF4 = "F[B-](F)(F)F";
const PF6 = "F[P-](F)(F)(F)(F)F";
const HMDS = "C[Si](C)(C)[N-][Si](C)(C)C";
const SEC_BU3BH = "CCC(C)[BH-](C(C)CC)C(C)CC";
const TBA = "CCCC[N+](CCCC)(CCCC)CCCC";

/** The chelating benzylidene of the Hoveyda–Grubbs catalysts: bound by its carbon (double) and its ether's oxygen. */
const HOVEYDA: Ligand = {
  label: "=CH-o-OiPrC6H4",
  smiles: "[CH:1]c9ccccc9[O:2]C(C)C",
  double: [1],
  name: "2-isopropoxybenzylidene",
};

export const REAGENTS: Reagent[] = [
  // --- oxidation ---------------------------------------------------------------
  { label: "DMP", also: ["Dess–Martin periodinane", "Dess-Martin periodinane", "Dess–Martin"], use: "oxidation", smiles: "CC(=O)O[I]1(OC(C)=O)(OC(C)=O)OC(=O)c2ccccc21", name: "Dess–Martin periodinane" },
  { label: "IBX", use: "oxidation", smiles: "O=[I]1(O)OC(=O)c2ccccc21", name: "2-iodoxybenzoic acid" },
  { label: "PIDA", also: ["PhI(OAc)2", "DIB", "BAIB"], use: "oxidation", smiles: "CC(=O)O[I](OC(C)=O)c1ccccc1", name: "(diacetoxyiodo)benzene" },
  { label: "PIFA", also: ["PhI(OCOCF3)2", "PhI(TFA)2"], use: "oxidation", smiles: "FC(F)(F)C(=O)O[I](OC(=O)C(F)(F)F)c1ccccc1", name: "[bis(trifluoroacetoxy)iodo]benzene" },
  { label: "TEMPO", use: "oxidation", smiles: "CC1(C)CCCC(C)(C)N1[O]", name: "2,2,6,6-tetramethylpiperidin-1-oxyl" },
  { label: "AZADO", use: "oxidation", smiles: "[O]N1C2CC3CC1CC(C3)C2", name: "2-azaadamantane N-oxyl" },
  { label: "PCC", use: "oxidation", smiles: "[O-][Cr](=O)(=O)Cl.c1cc[nH+]cc1", name: "pyridinium chlorochromate" },
  { label: "PDC", use: "oxidation", smiles: "[O-][Cr](=O)(=O)O[Cr](=O)(=O)[O-].c1cc[nH+]cc1.c1cc[nH+]cc1", name: "pyridinium dichromate" },
  { label: "TPAP", use: "oxidation", smiles: "CCC[N+](CCC)(CCC)CCC.[O-][Ru](=O)(=O)=O", name: "tetrapropylammonium perruthenate" },
  { label: "NMO", use: "oxidation", smiles: "C[N+]1([O-])CCOCC1", name: "N-methylmorpholine N-oxide" },
  { label: "mCPBA", also: ["m-CPBA", "MCPBA"], use: "oxidation", smiles: "OOC(=O)c1cccc(Cl)c1", name: "3-chloroperoxybenzoic acid" },
  { label: "DDQ", use: "oxidation", smiles: "N#CC1=C(C#N)C(=O)C(Cl)=C(Cl)C1=O", name: "2,3-dichloro-5,6-dicyano-1,4-benzoquinone" },
  {
    label: "Oxone",
    use: "oxidation",
    smiles: "[K+].[K+].[K+].[K+].[K+].OOS(=O)(=O)[O-].OOS(=O)(=O)[O-].OS(=O)(=O)[O-].[O-]S(=O)(=O)[O-]",
    name: "potassium peroxymonosulfate (2KHSO5·KHSO4·K2SO4)",
  },
  { label: "OsO4", use: "oxidation", smiles: "O=[Os](=O)(=O)=O", name: "osmium tetroxide", formula: true },
  { label: "KMnO4", use: "oxidation", smiles: "[K+].[O-][Mn](=O)(=O)=O", name: "potassium permanganate", formula: true },
  { label: "MnO2", use: "oxidation", smiles: "O=[Mn]=O", name: "manganese dioxide", formula: true },
  { label: "SeO2", use: "oxidation", smiles: "O=[Se]=O", name: "selenium dioxide", formula: true },
  { label: "CrO3", use: "oxidation", smiles: "O=[Cr](=O)=O", name: "chromium trioxide", formula: true },
  {
    label: "CAN",
    use: "oxidation",
    smiles: "[NH4+].[NH4+].[Ce+4].[O-][N+](=O)[O-].[O-][N+](=O)[O-].[O-][N+](=O)[O-].[O-][N+](=O)[O-].[O-][N+](=O)[O-].[O-][N+](=O)[O-]",
    name: "ceric ammonium nitrate",
  },
  { label: "LTA", use: "oxidation", smiles: "CC(=O)O[Pb](OC(C)=O)(OC(C)=O)OC(C)=O", name: "lead(IV) acetate" },
  { label: "SO3·py", also: ["SO3-py", "SO3•py", "SO3·pyridine"], use: "oxidation", smiles: "O=S(=O)=O.c1ccncc1", name: "sulfur trioxide pyridine complex", formula: true },
  { label: "DMDO", use: "oxidation", smiles: "CC1(C)OO1", name: "dimethyldioxirane" },
  { label: "TBHP", use: "oxidation", smiles: "CC(C)(C)OO", name: "tert-butyl hydroperoxide" },
  { label: "H2O2", use: "oxidation", smiles: "OO", name: "hydrogen peroxide", formula: true },
  { label: "O3", use: "oxidation", smiles: "[O-][O+]=O", name: "ozone", formula: true },
  { label: "Davis oxaziridine", also: ["Davis' oxaziridine", "Davis reagent"], use: "oxidation", smiles: "O=S(=O)(N1OC1c1ccccc1)c1ccccc1", name: "2-(phenylsulfonyl)-3-phenyloxaziridine" },

  // --- reduction ---------------------------------------------------------------
  { label: "LAH", use: "reduction", smiles: "[Li+].[AlH4-]", name: "lithium aluminium hydride" },
  { label: "STAB", use: "reduction", smiles: "[Na+].CC(=O)O[BH-](OC(C)=O)OC(C)=O", name: "sodium triacetoxyborohydride" },
  { label: "DIBAL", also: ["DIBAL-H", "DIBALH", "DIBAH"], use: "reduction", smiles: "CC(C)C[AlH]CC(C)C", name: "diisobutylaluminium hydride" },
  { label: "Red-Al", use: "reduction", smiles: "[Na+].COCCO[AlH2-]OCCOC", name: "sodium bis(2-methoxyethoxy)aluminium hydride" },
  { label: "L-Selectride", use: "reduction", smiles: `[Li+].${SEC_BU3BH}`, name: "lithium tri-sec-butylborohydride" },
  { label: "K-Selectride", use: "reduction", smiles: `[K+].${SEC_BU3BH}`, name: "potassium tri-sec-butylborohydride" },
  { label: "Super-Hydride", use: "reduction", smiles: "[Li+].CC[BH-](CC)CC", name: "lithium triethylborohydride" },
  { label: "9-BBN", also: ["9-BBN-H"], use: "reduction", smiles: "[BH]1C2CCCC1CCC2", name: "9-borabicyclo[3.3.1]nonane" },
  { label: "HBcat", also: ["catecholborane"], use: "reduction", smiles: "[BH]1Oc2ccccc2O1", name: "catecholborane" },
  { label: "B2pin2", use: "reduction", smiles: "CC1(C)OB(B2OC(C)(C)C(C)(C)O2)OC1(C)C", name: "bis(pinacolato)diboron", formula: true },
  { label: "TTMSS", also: ["(Me3Si)3SiH"], use: "reduction", smiles: "C[Si](C)(C)[SiH]([Si](C)(C)C)[Si](C)(C)C", name: "tris(trimethylsilyl)silane" },
  { label: "HEH", also: ["Hantzsch ester"], use: "reduction", smiles: "CCOC(=O)C1=C(C)NC(C)=C(C(=O)OCC)C1", name: "diethyl 1,4-dihydro-2,6-dimethylpyridine-3,5-dicarboxylate (Hantzsch ester)" },

  // --- bases -------------------------------------------------------------------
  { label: "DBU", use: "base", smiles: "C1CCC2=NCCCN2CC1", name: "1,8-diazabicyclo[5.4.0]undec-7-ene" },
  { label: "DBN", use: "base", smiles: "C1CN2CCCN=C2C1", name: "1,5-diazabicyclo[4.3.0]non-5-ene" },
  { label: "TBD", use: "base", smiles: "C1CNC2=NCCCN2C1", name: "1,5,7-triazabicyclo[4.4.0]dec-5-ene" },
  { label: "DMAP", use: "base", smiles: "CN(C)c1ccncc1", name: "4-(dimethylamino)pyridine" },
  { label: "DIPEA", also: ["DIEA", "Hünig's base", "Hunig's base"], use: "base", smiles: "CCN(C(C)C)C(C)C", name: "N,N-diisopropylethylamine" },
  { label: "TEA", use: "base", smiles: "CCN(CC)CC", name: "triethylamine" },
  { label: "DABCO", use: "base", smiles: "C1CN2CCN1CC2", name: "1,4-diazabicyclo[2.2.2]octane" },
  { label: "NMM", use: "base", smiles: "CN1CCOCC1", name: "N-methylmorpholine" },
  { label: "2,6-lutidine", also: ["lutidine"], use: "base", smiles: "Cc1cccc(C)n1", name: "2,6-dimethylpyridine" },
  { label: "collidine", also: ["2,4,6-collidine"], use: "base", smiles: "Cc1cc(C)nc(C)c1", name: "2,4,6-trimethylpyridine" },
  { label: "Proton-Sponge", also: ["proton sponge", "DMAN"], use: "base", smiles: "CN(C)c1cccc2cccc(N(C)C)c12", name: "1,8-bis(dimethylamino)naphthalene" },
  { label: "TMG", use: "base", smiles: "CN(C)C(=N)N(C)C", name: "1,1,3,3-tetramethylguanidine" },
  { label: "imidazole", use: "base", smiles: "c1c[nH]cn1", name: "imidazole" },
  { label: "LDA", use: "base", smiles: "[Li+].CC(C)[N-]C(C)C", name: "lithium diisopropylamide" },
  { label: "LiHMDS", also: ["LHMDS"], use: "base", smiles: `[Li+].${HMDS}`, name: "lithium bis(trimethylsilyl)amide" },
  { label: "NaHMDS", use: "base", smiles: `[Na+].${HMDS}`, name: "sodium bis(trimethylsilyl)amide" },
  { label: "KHMDS", use: "base", smiles: `[K+].${HMDS}`, name: "potassium bis(trimethylsilyl)amide" },
  { label: "LiTMP", also: ["LTMP"], use: "base", smiles: "[Li+].CC1(C)CCCC(C)(C)[N-]1", name: "lithium 2,2,6,6-tetramethylpiperidide" },

  // --- acids -------------------------------------------------------------------
  { label: "TFA", use: "acid", smiles: "OC(=O)C(F)(F)F", name: "trifluoroacetic acid" },
  { label: "PTSA", also: ["p-TSA", "PTS"], use: "acid", smiles: "Cc1ccc(cc1)S(=O)(=O)O", name: "p-toluenesulfonic acid" },
  {
    label: "CSA",
    use: "acid",
    smiles: "CC1(C)[C@@H]2CC[C@@]1(CS(=O)(=O)O)C(=O)C2",
    name: "10-camphorsulfonic acid",
    enantiomers: { as: ["(1S)", "(+)", "(1S,4R)"], mirror: ["(1R)", "(−)", "(1R,4S)"] },
  },
  { label: "PPTS", use: "acid", smiles: "Cc1ccc(cc1)S(=O)(=O)[O-].c1cc[nH+]cc1", name: "pyridinium p-toluenesulfonate" },
  { label: "H2SO4", use: "acid", smiles: "OS(=O)(=O)O", name: "sulfuric acid", formula: true },

  // --- coupling, condensation and the Mitsunobu reaction -----------------------
  { label: "DCC", use: "coupling", smiles: "C(=NC1CCCCC1)=NC1CCCCC1", name: "N,N'-dicyclohexylcarbodiimide" },
  { label: "DIC", use: "coupling", smiles: "CC(C)N=C=NC(C)C", name: "N,N'-diisopropylcarbodiimide" },
  { label: "EDC", also: ["EDCI", "WSC", "WSCI"], use: "coupling", smiles: "CCN=C=NCCCN(C)C", name: "1-ethyl-3-(3-dimethylaminopropyl)carbodiimide" },
  // (in Kekulé form: the triazole's ring, given aromatic, is not kekulized the way it is bonded)
  // (the uronium salts as they are, guanidinium N-oxides)
  { label: "HATU", use: "coupling", smiles: `CN(C)C(=[N+](C)C)N1N=[N+]([O-])C2=NC=CC=C21.${PF6}`, name: "1-[bis(dimethylamino)methylene]-1H-1,2,3-triazolo[4,5-b]pyridinium 3-oxide hexafluorophosphate" },
  { label: "HBTU", use: "coupling", smiles: `CN(C)C(=[N+](C)C)N1N=[N+]([O-])C2=CC=CC=C21.${PF6}`, name: "1-[bis(dimethylamino)methylene]-1H-benzotriazolium 3-oxide hexafluorophosphate" },
  { label: "TBTU", use: "coupling", smiles: `CN(C)C(=[N+](C)C)N1N=[N+]([O-])C2=CC=CC=C21.${BF4}`, name: "1-[bis(dimethylamino)methylene]-1H-benzotriazolium 3-oxide tetrafluoroborate" },
  { label: "COMU", use: "coupling", smiles: `CCOC(=O)C(C#N)=NOC(=[N+](C)C)N1CCOCC1.${PF6}`, name: "(1-cyano-2-ethoxy-2-oxoethylideneaminooxy)dimethylaminomorpholinocarbenium hexafluorophosphate" },
  { label: "PyBOP", use: "coupling", smiles: `C1CCN(C1)[P+](N1CCCC1)(N1CCCC1)ON1N=NC2=CC=CC=C21.${PF6}`, name: "(benzotriazol-1-yloxy)tripyrrolidinophosphonium hexafluorophosphate" },
  { label: "BOP", use: "coupling", smiles: `CN(C)[P+](N(C)C)(N(C)C)ON1N=NC2=CC=CC=C21.${PF6}`, name: "(benzotriazol-1-yloxy)tris(dimethylamino)phosphonium hexafluorophosphate" },
  { label: "T3P", use: "coupling", smiles: "CCCP1(=O)OP(=O)(CCC)OP(=O)(CCC)O1", name: "propylphosphonic anhydride" },
  { label: "CDI", use: "coupling", smiles: "O=C(n1ccnc1)n1ccnc1", name: "1,1'-carbonyldiimidazole" },
  { label: "DMTMM", use: "coupling", smiles: "COc1nc(OC)nc([N+]2(C)CCOCC2)n1.[Cl-]", name: "4-(4,6-dimethoxy-1,3,5-triazin-2-yl)-4-methylmorpholinium chloride" },
  { label: "Oxyma", also: ["OxymaPure"], use: "coupling", smiles: "CCOC(=O)C(C#N)=NO", name: "ethyl cyano(hydroxyimino)acetate" },
  { label: "NHS", use: "coupling", smiles: "ON1C(=O)CCC1=O", name: "N-hydroxysuccinimide" },
  { label: "Yamaguchi reagent", also: ["TCBC"], use: "coupling", smiles: "O=C(Cl)c1c(Cl)cc(Cl)cc1Cl", name: "2,4,6-trichlorobenzoyl chloride" },
  { label: "Mukaiyama reagent", also: ["Mukaiyama's reagent"], use: "coupling", smiles: "C[n+]1ccccc1Cl.[I-]", name: "2-chloro-1-methylpyridinium iodide" },
  { label: "DPPA", use: "coupling", smiles: "[N-]=[N+]=NP(=O)(Oc1ccccc1)Oc1ccccc1", name: "diphenyl phosphorazidate" },
  { label: "DEAD", use: "coupling", smiles: "CCOC(=O)N=NC(=O)OCC", name: "diethyl azodicarboxylate" },
  { label: "DIAD", use: "coupling", smiles: "CC(C)OC(=O)N=NC(=O)OC(C)C", name: "diisopropyl azodicarboxylate" },

  // --- halogenation and fluorination -------------------------------------------
  { label: "NBS", use: "halogenation", smiles: "BrN1C(=O)CCC1=O", name: "N-bromosuccinimide" },
  { label: "NCS", use: "halogenation", smiles: "ClN1C(=O)CCC1=O", name: "N-chlorosuccinimide" },
  { label: "NIS", use: "halogenation", smiles: "IN1C(=O)CCC1=O", name: "N-iodosuccinimide" },
  { label: "DBDMH", use: "halogenation", smiles: "CC1(C)N(Br)C(=O)N(Br)C1=O", name: "1,3-dibromo-5,5-dimethylhydantoin" },
  { label: "TCCA", use: "halogenation", smiles: "ClN1C(=O)N(Cl)C(=O)N(Cl)C1=O", name: "trichloroisocyanuric acid" },
  { label: "Selectfluor", use: "halogenation", smiles: `ClC[N+]12CC[N+](F)(CC1)CC2.${BF4}.${BF4}`, name: "1-chloromethyl-4-fluoro-1,4-diazoniabicyclo[2.2.2]octane bis(tetrafluoroborate)" },
  { label: "NFSI", use: "halogenation", smiles: "O=S(=O)(N(F)S(=O)(=O)c1ccccc1)c1ccccc1", name: "N-fluorobenzenesulfonimide" },
  { label: "DAST", use: "halogenation", smiles: "CCN(CC)S(F)(F)F", name: "(diethylamino)sulfur trifluoride" },
  { label: "Deoxo-Fluor", use: "halogenation", smiles: "COCCN(CCOC)S(F)(F)F", name: "bis(2-methoxyethyl)aminosulfur trifluoride" },
  { label: "Togni I", also: ["Togni reagent I", "Togni's reagent I"], use: "halogenation", smiles: "CC1(C)O[I](C(F)(F)F)c2ccccc21", name: "3,3-dimethyl-1-(trifluoromethyl)-1,2-benziodoxole" },
  { label: "Togni II", also: ["Togni reagent II", "Togni's reagent II"], use: "halogenation", smiles: "FC(F)(F)[I]1OC(=O)c2ccccc21", name: "1-(trifluoromethyl)-1,2-benziodoxol-3(1H)-one" },
  { label: "Ruppert–Prakash reagent", also: ["Ruppert-Prakash reagent"], use: "halogenation", smiles: "C[Si](C)(C)C(F)(F)F", name: "(trifluoromethyl)trimethylsilane" },
  { label: "Langlois reagent", also: ["Langlois' reagent"], use: "halogenation", smiles: "[Na+].[O-]S(=O)C(F)(F)F", name: "sodium trifluoromethanesulfinate" },
  { label: "SOCl2", use: "halogenation", smiles: "O=S(Cl)Cl", name: "thionyl chloride", formula: true },
  { label: "POCl3", use: "halogenation", smiles: "O=P(Cl)(Cl)Cl", name: "phosphoryl chloride", formula: true },
  { label: "PCl5", use: "halogenation", smiles: "ClP(Cl)(Cl)(Cl)Cl", name: "phosphorus pentachloride", formula: true },

  // --- acylation, sulfonylation, silylation and alkylation -----------------------
  { label: "TFAA", also: ["(CF3CO)2O"], use: "electrophile", smiles: "O=C(OC(=O)C(F)(F)F)C(F)(F)F", name: "trifluoroacetic anhydride" },
  { label: "Comins' reagent", also: ["Comins reagent", "Comins’ reagent"], use: "electrophile", smiles: "O=S(=O)(N(c1ccc(Cl)cn1)S(=O)(=O)C(F)(F)F)C(F)(F)F", name: "N-(5-chloro-2-pyridyl)bis(trifluoromethanesulfonimide)" },
  { label: "HMDS", use: "electrophile", smiles: "C[Si](C)(C)N[Si](C)(C)C", name: "hexamethyldisilazane" },
  { label: "Meerwein's salt", also: ["Me3OBF4", "Meerwein salt"], use: "electrophile", smiles: `C[O+](C)C.${BF4}`, name: "trimethyloxonium tetrafluoroborate" },
  { label: "Eschenmoser's salt", also: ["Eschenmoser salt"], use: "electrophile", smiles: "C=[N+](C)C.[I-]", name: "N,N-dimethylmethyleneiminium iodide" },
  { label: "TMSCHN2", use: "electrophile", smiles: "C[Si](C)(C)C=[N+]=[N-]", name: "(trimethylsilyl)diazomethane", formula: true },
  { label: "CH2N2", use: "electrophile", smiles: "C=[N+]=[N-]", name: "diazomethane", formula: true },
  { label: "Mander's reagent", also: ["Mander reagent", "NCCO2Me"], use: "electrophile", smiles: "COC(=O)C#N", name: "methyl cyanoformate" },

  // --- organometallic reagents ---------------------------------------------------
  {
    label: "Tebbe reagent",
    also: ["Tebbe's reagent", "Tebbe"],
    use: "organometallic",
    // its methylene and chloride bridging titanium and aluminium
    complex: "Cp2Ti(bridge)",
    ligands: { bridge: { label: "bridge", smiles: "C[Al](C)([CH2:1])[Cl:2]", anionic: [1, 2], name: "μ-chloro-μ-methylene(dimethylaluminium)" } },
    name: "μ-chloro-μ-methylene-bis(cyclopentadienyl)titanium dimethylaluminium",
  },
  { label: "Petasis reagent", also: ["Petasis' reagent"], use: "organometallic", complex: "Cp2TiMe2", name: "dimethyltitanocene" },
  { label: "Schwartz's reagent", also: ["Schwartz reagent"], use: "organometallic", complex: "Cp2ZrHCl", name: "zirconocene chloride hydride" },
  { label: "Stryker's reagent", also: ["Stryker reagent"], use: "organometallic", complex: "[CuH(PPh3)]6", name: "hexa(μ-hydrido)hexakis(triphenylphosphine)hexacopper" },
  { label: "Me2CuLi", also: ["LiCuMe2"], use: "organometallic", smiles: "[Li+].C[Cu-]C", name: "lithium dimethylcuprate (Gilman reagent)", formula: true },

  // --- metal catalysts -----------------------------------------------------------
  { label: "Grubbs I", also: ["Grubbs-I", "G-I", "GI", "Grubbs 1st"], use: "catalyst", complex: "RuCl2(=CHPh)(PCy3)2", name: "first-generation Grubbs catalyst" },
  { label: "Grubbs II", also: ["Grubbs-II", "G-II", "GII", "Grubbs 2nd"], use: "catalyst", complex: "RuCl2(=CHPh)(PCy3)(SIMes)", name: "second-generation Grubbs catalyst" },
  { label: "Grubbs III", also: ["Grubbs-III", "G-III", "GIII", "Grubbs 3rd"], use: "catalyst", complex: "RuCl2(=CHPh)(SIMes)(py)2", name: "third-generation Grubbs catalyst" },
  { label: "HG-I", also: ["HG I", "HGI", "Hoveyda–Grubbs I", "Hoveyda-Grubbs I"], use: "catalyst", complex: "RuCl2(chelate)(PCy3)", ligands: { chelate: HOVEYDA }, name: "first-generation Hoveyda–Grubbs catalyst" },
  { label: "HG-II", also: ["HG II", "HGII", "Hoveyda–Grubbs II", "Hoveyda-Grubbs II"], use: "catalyst", complex: "RuCl2(chelate)(SIMes)", ligands: { chelate: HOVEYDA }, name: "second-generation Hoveyda–Grubbs catalyst" },
  {
    label: "Schrock's catalyst",
    also: ["Schrock catalyst", "Schrock cat."],
    use: "catalyst",
    smiles: "CC(C)c1cccc(C(C)C)c1N=[Mo](=CC(C)(C)c1ccccc1)(OC(C)(C(F)(F)F)C(F)(F)F)OC(C)(C(F)(F)F)C(F)(F)F",
    name: "Schrock's molybdenum alkylidene",
  },
  { label: "Wilkinson's catalyst", also: ["Wilkinson catalyst", "Wilkinson's cat."], use: "catalyst", complex: "RhCl(PPh3)3", name: "chloridotris(triphenylphosphine)rhodium(I)" },
  { label: "Crabtree's catalyst", also: ["Crabtree catalyst", "Crabtree's cat."], use: "catalyst", complex: "[Ir(cod)(PCy3)(py)]PF6", name: "(1,5-cyclooctadiene)(pyridine)(tricyclohexylphosphine)iridium(I) hexafluorophosphate" },
  {
    label: "PEPPSI-IPr",
    also: ["Pd-PEPPSI-IPr"],
    use: "catalyst",
    complex: "PdCl2(IPr)(clpy)",
    ligands: { clpy: { label: "3-Cl-py", smiles: "Clc1ccc[n:1]c1", name: "3-chloropyridine" } },
    name: "[1,3-bis(2,6-diisopropylphenyl)imidazol-2-ylidene](3-chloropyridyl)palladium(II) dichloride",
  },
  {
    label: "Jacobsen's catalyst",
    also: ["Jacobsen catalyst", "Jacobsen's cat."],
    use: "catalyst",
    complex: "MnCl(salen)",
    ligands: {
      salen: {
        label: "salen",
        smiles:
          "CC(C)(C)c9cc(C(C)(C)C)c([O:1])c(c9)C=[N:2][C@@H]9CCCC[C@H]9[N:3]=Cc9cc(C(C)(C)C)cc(C(C)(C)C)c9[O:4]",
        anionic: [1, 4],
        name: "N,N'-bis(3,5-di-tert-butylsalicylidene)-1,2-cyclohexanediamine",
      },
    },
    enantiomers: { as: ["(R,R)"], mirror: ["(S,S)"] },
    name: "N,N'-bis(3,5-di-tert-butylsalicylidene)-1,2-cyclohexanediaminomanganese(III) chloride",
  },
  { label: "Karstedt's catalyst", also: ["Karstedt catalyst", "Karstedt's cat."], use: "catalyst", complex: "Pt2(dvtms)2(μ-dvtms)", name: "platinum(0)-1,3-divinyl-1,1,3,3-tetramethyldisiloxane" },
  {
    label: "Krische's catalyst",
    also: ["Krische catalyst", "Krische's cat."],
    use: "catalyst",
    // as it is sold: its 3-nitrobenzoate bound by its carboxylate and the
    // carbon ortho to that away from the nitro group (para to it)
    complex: "Ir(allyl)[(R)-SEGPHOS](benzoate)",
    ligands: {
      benzoate: { label: "benzoate", smiles: "[O:2]C(=O)c9cc([N+](=O)[O-])cc[c:1]9", anionic: [1, 2], name: "3-nitrobenzoate (C,O)" },
    },
    enantiomers: AXIAL,
    name: "π-allyliridium C,O-benzoate (SEGPHOS, 3-nitrobenzoate)",
  },

  // --- organocatalysts and chiral reagents ---------------------------------------
  { label: "proline", use: "organocatalyst", smiles: "OC(=O)[C@@H]1CCCN1", name: "proline", enantiomers: { as: ["L", "(S)"], mirror: ["D", "(R)"] } },
  {
    label: "MacMillan's catalyst I",
    also: ["MacMillan cat. I", "MacMillan I"],
    use: "organocatalyst",
    smiles: "CN1C(=O)[C@H](Cc2ccccc2)NC1(C)C",
    name: "2,2,3-trimethyl-5-benzylimidazolidin-4-one",
    enantiomers: { as: ["(S)", "(5S)"], mirror: ["(R)", "(5R)"] },
  },
  {
    label: "MacMillan's catalyst II",
    also: ["MacMillan cat. II", "MacMillan II"],
    use: "organocatalyst",
    smiles: "CN1C(=O)[C@H](Cc2ccccc2)N[C@@H]1C(C)(C)C",
    name: "5-benzyl-2-tert-butyl-3-methylimidazolidin-4-one",
    enantiomers: { as: ["(S,S)", "(2S,5S)"], mirror: ["(R,R)", "(2R,5R)"] },
  },
  {
    label: "Hayashi–Jørgensen catalyst",
    also: ["Hayashi-Jørgensen catalyst", "Jørgensen–Hayashi catalyst", "Hayashi–Jørgensen cat."],
    use: "organocatalyst",
    smiles: "C[Si](C)(C)OC(c1ccccc1)(c1ccccc1)[C@@H]1CCCN1",
    name: "α,α-diphenylprolinol trimethylsilyl ether",
    enantiomers: { as: ["(S)"], mirror: ["(R)"] },
  },
  {
    label: "CBS",
    also: ["Me-CBS", "CBS catalyst"],
    use: "organocatalyst",
    smiles: "CB1OC(c2ccccc2)(c2ccccc2)[C@@H]2CCCN12",
    name: "2-methyl-CBS-oxazaborolidine",
    enantiomers: { as: ["(S)"], mirror: ["(R)"] },
  },
  {
    label: "Shi's catalyst",
    also: ["Shi catalyst", "Shi's ketone", "Shi ketone"],
    use: "organocatalyst",
    // made from D-fructose: one enantiomer, as it is named
    smiles: "CC1(C)OC[C@@]2(O1)OC[C@H]3OC(C)(C)O[C@H]3C2=O",
    name: "1,2:4,5-di-O-isopropylidene-β-D-erythro-2,3-hexodiulo-2,6-pyranose",
    enantiomers: { as: [], mirror: [], plain: true },
  },

  // --- solvents ------------------------------------------------------------------
  { label: "DMF", use: "solvent", smiles: "CN(C)C=O", name: "N,N-dimethylformamide" },
  { label: "DMSO", use: "solvent", smiles: "CS(C)=O", name: "dimethyl sulfoxide" },
  { label: "DMA", also: ["DMAc"], use: "solvent", smiles: "CC(=O)N(C)C", name: "N,N-dimethylacetamide" },
  { label: "NMP", use: "solvent", smiles: "CN1CCCC1=O", name: "N-methyl-2-pyrrolidone" },
  { label: "HMPA", use: "solvent", smiles: "CN(C)P(=O)(N(C)C)N(C)C", name: "hexamethylphosphoramide" },
  { label: "DMPU", use: "solvent", smiles: "CN1CCCN(C)C1=O", name: "N,N'-dimethylpropyleneurea" },
  { label: "DME", also: ["glyme"], use: "solvent", smiles: "COCCOC", name: "1,2-dimethoxyethane" },
  { label: "diglyme", use: "solvent", smiles: "COCCOCCOC", name: "bis(2-methoxyethyl) ether" },
  { label: "DCM", use: "solvent", smiles: "ClCCl", name: "dichloromethane" },
  { label: "DCE", use: "solvent", smiles: "ClCCCl", name: "1,2-dichloroethane" },
  { label: "MTBE", also: ["TBME"], use: "solvent", smiles: "COC(C)(C)C", name: "methyl tert-butyl ether" },
  { label: "CPME", use: "solvent", smiles: "COC1CCCC1", name: "cyclopentyl methyl ether" },
  { label: "2-MeTHF", use: "solvent", smiles: "CC1CCCO1", name: "2-methyltetrahydrofuran" },
  { label: "dioxane", also: ["1,4-dioxane"], use: "solvent", smiles: "C1COCCO1", name: "1,4-dioxane" },
  { label: "acetone", use: "solvent", smiles: "CC(C)=O", name: "acetone" },
  { label: "toluene", use: "solvent", smiles: "Cc1ccccc1", name: "toluene" },
  { label: "benzene", use: "solvent", smiles: "c1ccccc1", name: "benzene" },
  { label: "hexane", also: ["n-hexane", "hexanes"], use: "solvent", smiles: "CCCCCC", name: "hexane" },
  { label: "pentane", also: ["n-pentane"], use: "solvent", smiles: "CCCCC", name: "pentane" },
  { label: "IPA", use: "solvent", smiles: "CC(C)O", name: "2-propanol" },
  { label: "HFIP", use: "solvent", smiles: "OC(C(F)(F)F)C(F)(F)F", name: "1,1,1,3,3,3-hexafluoro-2-propanol" },
  { label: "TFE", use: "solvent", smiles: "OCC(F)(F)F", name: "2,2,2-trifluoroethanol" },

  // --- other named reagents --------------------------------------------------------
  { label: "Burgess reagent", also: ["Burgess' reagent"], use: "other", smiles: "CC[N+](CC)(CC)S(=O)(=O)[N-]C(=O)OC", name: "methyl N-(triethylammoniosulfonyl)carbamate" },
  {
    label: "Martin sulfurane",
    also: ["Martin's sulfurane"],
    use: "other",
    smiles: "FC(F)(F)C(O[S](OC(c1ccccc1)(C(F)(F)F)C(F)(F)F)(c1ccccc1)c1ccccc1)(c1ccccc1)C(F)(F)F",
    name: "bis[α,α-bis(trifluoromethyl)benzyloxy]diphenylsulfur",
  },
  { label: "Lawesson's reagent", also: ["Lawesson reagent", "LR"], use: "other", smiles: "COc1ccc(cc1)P1(=S)SP(=S)(c2ccc(OC)cc2)S1", name: "2,4-bis(4-methoxyphenyl)-1,3,2,4-dithiadiphosphetane 2,4-disulfide" },
  { label: "Bestmann–Ohira reagent", also: ["Bestmann-Ohira reagent", "Ohira–Bestmann reagent", "Ohira-Bestmann reagent"], use: "other", smiles: "COP(=O)(OC)C(=[N+]=[N-])C(C)=O", name: "dimethyl (1-diazo-2-oxopropyl)phosphonate" },
  { label: "Me3S(O)I", also: ["TMSOI", "Corey–Chaykovsky reagent"], use: "other", smiles: "C[S+](C)(C)=O.[I-]", name: "trimethylsulfoxonium iodide", formula: true },
  { label: "TBAF", also: ["Bu4NF"], use: "other", smiles: `${TBA}.[F-]`, name: "tetrabutylammonium fluoride" },
  { label: "TBAI", also: ["Bu4NI"], use: "other", smiles: `${TBA}.[I-]`, name: "tetrabutylammonium iodide" },
  { label: "TBAB", also: ["Bu4NBr"], use: "other", smiles: `${TBA}.[Br-]`, name: "tetrabutylammonium bromide" },
];

/** A reagent's labels as they are looked up: an apostrophe and a dash as typed or as set. */
function key(label: string): string {
  return label.replace(/[’‘]/g, "'").replace(/[–—]/g, "-");
}

const BY_LABEL = new Map<string, Reagent>();
for (const r of REAGENTS) for (const name of [r.label, ...(r.also ?? [])]) BY_LABEL.set(key(name), r);

/**
 * The reagent a label names, and the descriptor before it, where there is
 * one that names one of its enantiomers: (S)-CBS, L-proline. None for any
 * other label.
 */
export function reagentOf(label: string): { reagent: Reagent; descriptor: string | null } | undefined {
  const r = BY_LABEL.get(key(label));
  if (r) return { reagent: r, descriptor: null };
  const d = splitDescriptor(label);
  const named = d && BY_LABEL.get(key(d.rest));
  if (!d || !named || !withConfiguration([], named.enantiomers, d.descriptor)) return undefined;
  return { reagent: named, descriptor: d.descriptor };
}

/**
 * The reagents' labels that are names, not formulas: each read as one unit
 * of a label, its digits not counts (T3P, not T, 3, P; XPhos Pd G3). Other
 * names written as formulas ((Me3Si)3SiH for TTMSS) are not: their
 * counts are.
 */
export const REAGENT_UNITS = [
  ...REAGENTS.filter((r) => !r.formula).flatMap((r) => [r.label, ...(r.also ?? []).filter((a) => !/[A-Za-z)\]]\d/.test(a))]),
  ...["Pd G2", "Pd G3", "Pd G4", "Pd-G2", "Pd-G3", "Pd-G4"],
];

/** A molecule's SMILES as its structure, attached by nothing: its atoms and bonds, Kekulé. */
export function smilesStructure(smiles: string): GroupStructure {
  const read = readSmiles(smiles);
  const orders = kekuleOrders(read.atoms, read.bonds);
  return {
    atoms: read.atoms.map(({ aromatic: _aromatic, cls: _cls, ...a }) => a),
    bonds: read.bonds.map((b, i): StructureBond => ({ ...b, order: orders[i] })),
    attach: [],
  };
}

/**
 * What a label naming one of the reagents stands for - the molecule, with
 * the configuration its descriptor says (./enantiomers) - and its name; or
 * null. `groupOf` gives a group bound by one bond, which a complex's
 * formula may name (OMs).
 */
export function reagentStructure(
  label: string,
  groupOf: (label: string) => GroupStructure | null,
): (GroupStructure & { name: string }) | null {
  const found = reagentOf(label);
  if (found) {
    const { reagent: r, descriptor } = found;
    const made = r.smiles ? smilesStructure(r.smiles) : complexStructure(r.complex!, groupOf, r.ligands);
    if (!made) return null;
    const atoms = withConfiguration(made.atoms, r.enantiomers, descriptor);
    if (!atoms) return null;
    // (its axes as its own descriptor says: Krische's catalyst's SEGPHOS)
    const { axes: _axes, ...rest } = made;
    const axes = axesWith(made.axes, r.enantiomers, descriptor);
    return { ...rest, atoms, attach: [], ...(axes ? { axes } : {}), name: `${descriptor ? `${descriptor}-` : ""}${r.name}` };
  }
  return null;
}

// --- Buchwald's precatalysts, by rule ---------------------------------------------

/** The palladacycles' 2-aminobiphenyl, bound by its carbon (an anion) and its nitrogen; G4's N-methylated. */
const AMINOBIPHENYL: Record<string, Ligand> = {
  abp: { label: "abp", smiles: "[c:1]9ccccc9-c9ccccc9[NH2:2]", anionic: [1], name: "2'-amino-1,1'-biphenyl-2-yl" },
  mabp: { label: "mabp", smiles: "[c:1]9ccccc9-c9ccccc9[NH:2]C", anionic: [1], name: "2'-(methylamino)-1,1'-biphenyl-2-yl" },
};
/** Each generation's palladacycle, as a complex's formula: its ligand where `L` is. */
const GENERATIONS: Record<string, string> = { G2: "PdCl(L)(abp)", G3: "Pd(OMs)(L)(abp)", G4: "Pd(OMs)(L)(mabp)" };

/** What each generation of Buchwald's precatalysts is, for a list of them. */
export const PRECATALYST_GENERATIONS: { generation: string; name: string }[] = [
  { generation: "G2", name: "the phosphine's palladium(II) chloride, cyclometallated by 2-aminobiphenyl (C,N)" },
  { generation: "G3", name: "the phosphine's palladium(II) methanesulfonate, cyclometallated by 2-aminobiphenyl (C,N)" },
  { generation: "G4", name: "the phosphine's palladium(II) methanesulfonate, cyclometallated by 2'-(methylamino)biphenyl-2-yl (C,N)" },
];

/**
 * A Buchwald precatalyst named by its phosphine and its generation - XPhos
 * Pd G2, SPhos-Pd-G3, RuPhos Pd G4 - as the palladacycle it is: the
 * phosphine (any of Meno's ligands bound by one atom) with a
 * 2-aminobiphenyl's carbon and nitrogen and a chloride (G2) or a mesylate
 * (G3; G4 with the amine N-methylated). Null for any other label.
 */
export function precatalystStructure(
  label: string,
  groupOf: (label: string) => GroupStructure | null,
): (GroupStructure & { name: string }) | null {
  const m = /^(.+?)[ -]Pd[ -](G[234])$/.exec(label);
  const ligand = m && LIGANDS.find((l) => l.label === m[1] || l.also?.includes(m[1]));
  if (!m || !ligand || /:2\]/.test(ligand.smiles)) return null;
  const made = complexStructure(GENERATIONS[m[2]], groupOf, { ...AMINOBIPHENYL, L: ligand });
  return made && { ...made, name: `${ligand.label} Pd ${m[2]} (${made.name})` };
}

/**
 * A generation of Buchwald's precatalysts drawn as itself: its palladacycle,
 * the phosphine an atom L - whichever one names it (XPhos Pd G3). For the
 * dictionary's list of them; null for no generation.
 */
export function precatalystPicture(generation: string, groupOf: (label: string) => GroupStructure | null): GroupStructure | null {
  if (!GENERATIONS[generation]) return null;
  const made = complexStructure(GENERATIONS[generation], groupOf, { ...AMINOBIPHENYL, L: { label: "L", smiles: "[P:1]", name: "the phosphine" } });
  if (!made) return null;
  // (the stand-in phosphine's P, the only P there is, labelled L)
  const { name: _name, ...s } = made;
  return { ...s, atoms: s.atoms.map((a) => (a.el === "P" ? { el: "L", hs: 0 } : a)) };
}
