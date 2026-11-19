/**
 * The configuration corpus: structures with a configuration of each kind Meno reads, each written as a SMILES and drawn by Meno
 * itself (`drawnFromSmiles`), never another program's drawing. Each is to read back as its SMILES says - read(draw(c)) = c - and
 * the same after Meno's own moves (corpus.test.ts). Each says, by its name, what it is; `labels` are the descriptors its name gives,
 * where it gives them, as a sorted list. Kinds: what each entry is there to hold.
 */
export type CorpusEntry = {
  name: string;
  smiles: string;
  kind: CorpusKind;
  labels?: readonly string[];
  /** Read against its own first drawing, not against the SMILES read directly, where that reading cannot hold it: it says why. */
  self?: string;
  /** Known not to hold yet: what is missing. The corpus asserts that it fails, so that it is noticed when it holds. */
  known?: string;
  /** Drawn with the chair tool, not from its SMILES: each group's ring atom (0 to 5, the tool's order), its place and its element. Its
   *  SMILES is then its flat twin, which is to state the same configuration. */
  chair?: readonly (readonly [number, "axial" | "equatorial", string])[];
  /** Drawn from this SMILES, then changed as said (`group`, `wavy`): `smiles` is then what it is to read as. */
  from?: string;
  /** Its centres - each wedge's narrow end - put in one AND group (a racemate) or one OR group (one of the two, not known which). */
  group?: "and" | "or";
  /** Its wedges made wavy: each centre open. */
  wavy?: true;
  /** Drawn by expanding this label, not from a SMILES; `mirror` is the label of its mirror image. Read against its own first drawing. */
  label?: { label: string; mirror: string };
};

export type CorpusKind =
  | "centre"
  | "heteroatom centre"
  | "no unit"
  | "ring"
  | "double bond"
  | "cumulene"
  | "cage"
  | "isotope"
  | "open"
  | "chair"
  | "group"
  | "axis";

export const CORPUS: readonly CorpusEntry[] = [
  // centres: C with its H left out, and with four drawn groups; a ring atom's two groups; ring fusions; a quaternary centre in a chain
  { name: "(R)-butan-2-ol", smiles: "CC[C@@H](C)O", kind: "centre", labels: ["R"] },
  { name: "(S)-butan-2-ol", smiles: "CC[C@H](C)O", kind: "centre", labels: ["S"] },
  { name: "L-alanine", smiles: "N[C@@H](C)C(=O)O", kind: "centre", labels: ["S"] },
  { name: "(S)-2-phenylbutan-2-ol", smiles: "C[C@](O)(CC)c1ccccc1", kind: "centre", labels: ["S"] },
  { name: "(R)-4-ethyl-4-methyloctane: a quaternary centre in a chain", smiles: "CC[C@](C)(CCC)CCCC", kind: "centre", labels: ["R"] },
  { name: "(1R,2R)-trans-1,2-dimethylcyclohexane", smiles: "C[C@@H]1CCCC[C@H]1C", kind: "ring", labels: ["R", "R"] },
  { name: "cis-1,2-dimethylcyclohexane", smiles: "C[C@@H]1CCCC[C@@H]1C", kind: "ring", labels: ["R", "S"] },
  { name: "cis-decalin", smiles: "C1CC[C@H]2CCCC[C@H]2C1", kind: "ring" },
  { name: "trans-decalin", smiles: "C1CC[C@@H]2CCCC[C@H]2C1", kind: "ring" },
  { name: "testosterone (8R,9S,10R,13S,14S,17S)", smiles: "C[C@]12CC[C@H]3[C@H]([C@@H]1CC[C@@H]2O)CCC4=CC(=O)CC[C@]34C", kind: "ring", labels: ["R", "R", "S", "S", "S", "S"] },
  // other elements
  { name: "a quaternary ammonium, one hand", smiles: "C[N@+](CC)(CCC)Cc1ccccc1", kind: "heteroatom centre" },
  { name: "an amine oxide's N, one hand", smiles: "C[N@+]([O-])(CC)c1ccccc1", kind: "heteroatom centre" },
  { name: "a phosphine oxide, one hand", smiles: "C[P@](=O)(CC)c1ccccc1", kind: "heteroatom centre" },
  { name: "a phosphonium, one hand", smiles: "C[P@+](CC)(CCC)c1ccccc1", kind: "heteroatom centre" },
  { name: "a phosphine (its lone pair), one hand", smiles: "C[P@](CC)c1ccccc1", kind: "heteroatom centre" },
  { name: "methyl p-tolyl sulfoxide, one hand", smiles: "C[S@](=O)c1ccc(C)cc1", kind: "heteroatom centre" },
  { name: "a sulfonium, one hand", smiles: "C[S@+](CC)c1ccccc1", kind: "heteroatom centre" },
  { name: "methyl p-toluenesulfinate, one hand", smiles: "CO[S@](=O)c1ccc(C)cc1", kind: "heteroatom centre", known: "a sulfinate ester's S is not yet drawn with its configuration, as a sulfoxide's is" },
  { name: "a sulfoximine, one hand", smiles: "C[S@](=O)(=N)c1ccccc1", kind: "heteroatom centre" },
  { name: "a silane with four groups, one hand", smiles: "C[Si@](CC)(CCC)c1ccccc1", kind: "heteroatom centre" },
  { name: "a stannane with four groups, one hand", smiles: "C[Sn@](CC)(CCC)c1ccccc1", kind: "heteroatom centre" },
  // no unit
  { name: "a phosphate diester anion's P", smiles: "COP(=O)([O-])OCC", kind: "no unit" },
  { name: "a sulfinate anion's S", smiles: "CS(=O)[O-]", kind: "no unit" },
  { name: "an amine's N", smiles: "CN(CC)CCC", kind: "no unit" },
  { name: "an N+ with an H", smiles: "C[NH+](CC)CCC", kind: "no unit" },
  // the hard ring and spiro cases
  { name: "all-cis-1,3,5-trimethylcyclohexane", smiles: "C[C@H]1C[C@@H](C)C[C@@H](C)C1", kind: "ring", labels: ["s", "s", "s"] },
  { name: "cis,trans-1,3,5-trimethylcyclohexane", smiles: "C[C@H]1C[C@H](C)C[C@H](C)C1", kind: "ring", labels: ["r"] },
  { name: "scyllo-inositol", smiles: "O[C@H]1[C@H](O)[C@@H](O)[C@H](O)[C@@H](O)[C@@H]1O", kind: "ring", labels: ["r", "r", "r", "r", "r", "r"] },
  { name: "myo-inositol (1R,2S,3r,4R,5S,6s)", smiles: "O[C@H]1[C@H](O)[C@@H](O)[C@H](O)[C@@H](O)[C@H]1O", kind: "ring", labels: ["R", "R", "S", "S", "r", "s"] },
  { name: "cis-1,4-dimethylcyclohexane", smiles: "C[C@H]1CC[C@@H](C)CC1", kind: "ring" },
  { name: "trans-1,4-dimethylcyclohexane", smiles: "C[C@H]1CC[C@H](C)CC1", kind: "ring" },
  { name: "2,6-dimethylspiro[3.3]heptane, one hand", smiles: "C[C@H]1CC2(C1)C[C@@H](C)C2", kind: "ring" },
  { name: "2,6-dimethylspiro[3.3]heptane, the other hand", smiles: "C[C@H]1CC2(C1)C[C@H](C)C2", kind: "ring" },
  { name: "(2R,3R)-tartaric acid", smiles: "O[C@H]([C@@H](O)C(=O)O)C(=O)O", kind: "centre", labels: ["R", "R"] },
  { name: "(2S,3S)-tartaric acid", smiles: "O[C@@H]([C@H](O)C(=O)O)C(=O)O", kind: "centre", labels: ["S", "S"] },
  { name: "meso-tartaric acid", smiles: "O[C@H]([C@H](O)C(=O)O)C(=O)O", kind: "centre", labels: ["R", "S"] },
  { name: "(2R,3s,4S)-2,3,4-trihydroxypentanedioic acid, a meso form", smiles: "OC(=O)[C@H](O)[C@@H](O)[C@H](O)C(=O)O", kind: "centre", labels: ["R", "S", "s"] },
  { name: "(2R,3r,4S)-2,3,4-trihydroxypentanedioic acid, the other meso form", smiles: "OC(=O)[C@H](O)[C@H](O)[C@H](O)C(=O)O", kind: "centre", labels: ["R", "S", "r"] },
  { name: "(2R,4R)-2,3,4-trihydroxypentanedioic acid, the chiral form, its C3 drawn (it sets nothing)", smiles: "OC(=O)[C@H](O)[C@H](O)[C@@H](O)C(=O)O", kind: "centre", labels: ["R", "R"] },
  // double bonds
  { name: "(E)-but-2-ene", smiles: "C/C=C/C", kind: "double bond", labels: ["E"] },
  { name: "(Z)-but-2-ene", smiles: "C/C=C\\C", kind: "double bond", labels: ["Z"] },
  { name: "(E)-cyclooctene", smiles: "C1CCC/C=C/CC1", kind: "double bond", labels: ["E"] },
  { name: "(Z)-cyclooctene", smiles: "C1CCC/C=C\\CC1", kind: "double bond", labels: ["Z"] },
  { name: "cycloheptene (no unit at its double bond)", smiles: "C1CCC=CCC1", kind: "no unit" },
  { name: "(E)-acetophenone oxime", smiles: "C/C(=N\\O)c1ccccc1", kind: "double bond", labels: ["E"] },
  { name: "(Z)-acetophenone oxime", smiles: "C/C(=N/O)c1ccccc1", kind: "double bond", labels: ["Z"] },
  { name: "(E)-azobenzene", smiles: "c1ccc(cc1)/N=N/c1ccccc1", kind: "double bond", labels: ["E"] },
  { name: "(Z)-azobenzene", smiles: "c1ccc(cc1)/N=N\\c1ccccc1", kind: "double bond", labels: ["Z"] },
  { name: "acetamidine (never a unit)", smiles: "CC(=N)N", kind: "no unit" },
  // cumulated runs
  { name: "an allene, one hand", smiles: "OC(Cl)=[C@]=C(C)F", kind: "cumulene" },
  { name: "the same allene, the other hand", smiles: "OC(Cl)=[C@@]=C(C)F", kind: "cumulene" },
  { name: "(E)-hexa-2,3,4-triene", smiles: "C/C=C=C=C/C", kind: "cumulene" },
  { name: "(Z)-hexa-2,3,4-triene", smiles: "C/C=C=C=C\\C", kind: "cumulene" },
  // cages
  { name: "(1R,4R)-camphor", smiles: "CC1(C)[C@@H]2CC[C@@]1(C)C(=O)C2", kind: "cage", labels: ["R", "R"] },
  { name: "(1S,4S)-camphor", smiles: "CC1(C)[C@H]2CC[C@]1(C)C(=O)C2", kind: "cage", labels: ["S", "S"] },
  { name: "(1S,2R,4R)-endo-norborneol", smiles: "O[C@@H]1C[C@@H]2CC[C@H]1C2", kind: "cage", labels: ["R", "R", "S"] },
  { name: "(1S,2S,4R)-exo-norborneol", smiles: "O[C@H]1C[C@@H]2CC[C@H]1C2", kind: "cage", labels: ["R", "S", "S"] },
  { name: "cocaine (1R,2R,3S,5S)", smiles: "COC(=O)[C@H]1[C@@H](OC(=O)c2ccccc2)C[C@@H]2CC[C@H]1N2C", kind: "cage", labels: ["R", "R", "S", "S"] },
  // chairs drawn with the tool, each against its flat twin
  { name: "trans-1,4-dimethylcyclohexane as a chair, both groups equatorial", smiles: "C[C@H]1CC[C@H](C)CC1", kind: "chair", chair: [[0, "equatorial", "C"], [3, "equatorial", "C"]] },
  { name: "trans-1,4-dimethylcyclohexane as a chair, both groups axial", smiles: "C[C@H]1CC[C@H](C)CC1", kind: "chair", chair: [[0, "axial", "C"], [3, "axial", "C"]] },
  { name: "cis-1,4-dimethylcyclohexane as a chair, one group axial", smiles: "C[C@H]1CC[C@@H](C)CC1", kind: "chair", chair: [[0, "equatorial", "C"], [3, "axial", "C"]] },
  { name: "cis-1,3-dimethylcyclohexane as a chair, both groups equatorial", smiles: "C[C@H]1CCC[C@@H](C)C1", kind: "chair", chair: [[0, "equatorial", "C"], [2, "equatorial", "C"]], labels: ["R", "S"] },
  { name: "trans-1,3-dimethylcyclohexane as a chair, one group axial, one hand", smiles: "C[C@@H]1CCC[C@@H](C)C1", kind: "chair", chair: [[0, "equatorial", "C"], [2, "axial", "C"]], labels: ["R", "R"] },
  { name: "cyclohexanol as a chair, its OH axial (no centre)", smiles: "OC1CCCCC1", kind: "chair", chair: [[0, "axial", "O"]] },
  // AND and OR groups
  { name: "rac-(2R,3R)-tartaric acid: its two centres in one AND group", smiles: "O[C@H]([C@@H](O)C(=O)O)C(=O)O", kind: "group", group: "and", self: "a SMILES says no group" },
  { name: "(2R,3R)- or (2S,3S)-tartaric acid: its two centres in one OR group", smiles: "O[C@H]([C@@H](O)C(=O)O)C(=O)O", kind: "group", group: "or", self: "a SMILES says no group" },
  { name: "rac-trans-1,2-dimethylcyclohexane: AND", smiles: "C[C@@H]1CCCC[C@H]1C", kind: "group", group: "and", self: "a SMILES says no group" },
  // axes, drawn from the label's own structure
  { name: "(R)-BINAP", smiles: "", kind: "axis", label: { label: "(R)-BINAP", mirror: "(S)-BINAP" }, self: "a SMILES says no axis" },
  { name: "(S)-BINAP", smiles: "", kind: "axis", label: { label: "(S)-BINAP", mirror: "(R)-BINAP" }, self: "a SMILES says no axis" },
  // a wavy bond: open
  { name: "butan-2-ol drawn with its OH on a wavy bond: open", from: "CC[C@@H](C)O", smiles: "CCC(C)O", kind: "open", wavy: true },
  // an isotope centre; open
  { name: "(2-2H1)butane, one hand: CHD", smiles: "C[C@H]([2H])CC", kind: "isotope", self: "the SMILES read directly leaves its isotopes out" },
  { name: "(1-13C)-2-methylbutane, one hand: a centre by its isotope", smiles: "[13CH3][C@H](C)CC", kind: "isotope", self: "the SMILES read directly leaves its isotopes out" },
  { name: "butan-2-ol with its centre open", smiles: "CCC(C)O", kind: "open" },
  { name: "but-2-ene, either", smiles: "CC=CC", kind: "open" },
];
