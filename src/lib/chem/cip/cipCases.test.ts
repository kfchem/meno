import { describe, expect, it } from "vitest";
import { cipOf } from "./testdata/cipFrom";

/**
 * Cases of the validation suite of Hanson et al. 2018 (J. Chem. Inf. Model.
 * 58, 1755), each redrawn here from its structure - written as our own
 * SMILES, atoms numbered our own way - and each with its suite number, the
 * figure where the paper discusses it, and the Blue Book section the suite
 * gives for it. The descriptors are the suite's (CIP_LABELS), put on our
 * atoms; a case rules 4 to 6 decide says which of its units are not worked
 * out yet, and labels the rest. The whole suite is run locally before each
 * change to lib/chem/cip, never kept in the repo (docs/CIP.md, *How it is
 * checked*).
 */
type Case = { vs: string; cite?: string; smiles: string; said: string[] };

const CASES: Case[] = [
  // no label: no unit, or two ligands alike
  {
    vs: "VS003",
    cite: "BB 2013 P-93.3.3.2 as given in the suite",
    smiles: String.raw`O=[S@](C)C`,
    said: ["S1:alike"],
  },
  {
    vs: "VS009",
    smiles: String.raw`[C@@H]12[C@H]3[C@H]4[C@@H]1[C@@H]5[C@H]4[C@H]3[C@H]25`,
    said: ["C0:later", "C1:later", "C2:later", "C3:later", "C4:later", "C5:later", "C6:later", "C7:later"],
  },
  {
    vs: "VS001",
    cite: "BB 2013 P-93.5.3.3 as given in the suite",
    smiles: String.raw`C1=CC[C@]2(C1)CCCCC2`,
    said: ["C3:symmetric"],
  },
  {
    vs: "VS006",
    smiles: String.raw`[C@H]12C[C@@H]3C[C@H](C1)C[C@H](C2)C3`,
    said: ["C0:later", "C2:later", "C4:later", "C7:later"],
  },
  {
    vs: "VS005",
    cite: "Figs. 4 and 5",
    smiles: String.raw`O[C@H](C1=C(O)C=CC=C1)C1=CC=CC=C1O`,
    said: ["C1:alike"],
  },
  {
    vs: "VS007",
    cite: "Fig. 7",
    smiles: String.raw`O[C@H](C1=[13CH]C=CC=C1)C1=CC=CC=[13CH]1`,
    said: ["C1:alike"],
  },
  // rule 1a, with lone pairs, conventions (b) and (c), and blended rings
  {
    vs: "VS074",
    cite: "BB 2013 P-93.3.4.1 as given in the suite",
    smiles: String.raw`O=[S@](C1=CC=CC=C1)C`,
    said: ["S1:S"],
  },
  {
    vs: "VS138",
    cite: "BB 2013 P-93.3.4.1 as given in the suite",
    smiles: String.raw`CCC[P@@](C)C1=CC=CC=C1`,
    said: ["P3:R"],
  },
  {
    vs: "VS031",
    cite: "BB 2013 P-93.2.2 as given in the suite",
    smiles: String.raw`C=CC[N@+](C)(CC1=CC=CC=C1)C1=CC=CC=C1.[Br-]`,
    said: ["N3:R"],
  },
  {
    vs: "VS096",
    cite: "BB 2013 P-93.4.2.1.3 as given in the suite",
    smiles: String.raw`ClC1=CC=C(C=C1)\C(C1=CC=CC=C1)=N/O`,
    said: ["C7=N14:Z"],
  },
  {
    vs: "VS014",
    cite: "BB 2013 P-93.3.4.1 as given in the suite",
    smiles: String.raw`CCO[S@@](=O)C1=CC=C(C=C1)[N+]([O-])=O`,
    said: ["S3:R"],
  },
  {
    vs: "VS130",
    cite: "BB 2013 P-93.2.5 as given in the suite",
    smiles: String.raw`CO[S@](=O)(=S)C1=CC=CC=C1`,
    said: ["S2:S"],
  },
  { vs: "VS038", smiles: String.raw`O=[P@](F)(C)OC(C)C`, said: ["P1:R"] },
  {
    vs: "VS132",
    cite: "BB 2013 P-93.5.4.1 as given in the suite",
    smiles: String.raw`CC1=CC2=C(C=C1)[N@](C3)C[N@@](C2)C1=CC=C(C)C=C13`,
    said: ["N7:S", "N10:S"],
  },
  {
    vs: "VS032",
    cite: "Fig. 3",
    smiles: String.raw`C\N=C/[C@@H](O)C1=NC=CC=C1`,
    said: ["C3:S", "N1=C2:Z"],
  },
  {
    vs: "VS033",
    cite: "Fig. 3",
    smiles: String.raw`C\N=C/[C@@H](O)C1=CC=CC=N1`,
    said: ["C3:S", "N1=C2:Z"],
  },
  {
    vs: "VS155",
    cite: "BB 2013 P-93.5.5.1 as given in the suite",
    smiles: String.raw`OC(=O)C1=CC2=CC=C1/C=C\C1=CC(Br)=C(/C=C\2)C=C1`,
    said: ["C9=C10:Z", "C16=C17:Z"],
  },
  // (an amidinate's charge drawn on either N: each usual structure gives R, so does the case)
  { vs: "VS097", smiles: String.raw`N#C[C@H]1C(=O)NC(=O)N=C1[N-]C1=CC=CC=C1`, said: ["C2:R"] },
  { vs: "VS097", smiles: String.raw`N#C[C@H]1C(=O)NC(=O)[N-]C1=NC1=CC=CC=C1`, said: ["C2:R"] },
  // rule 1b
  {
    vs: "VS171",
    cite: "BB 2013 P-92.2.2 as given in the suite",
    smiles: String.raw`C1CC1CCC(CCC1CC1)(CCC1CC1)[C@H](O)C12CCC(CC1)CC2`,
    said: ["C16:S"],
  },
  {
    vs: "VS172",
    cite: "Fig. 1; BB 2013 P-92.2.2 as given in the suite",
    smiles: String.raw`C1C=C[C@H]2C[C@@H]12`,
    said: ["C3:S", "C5:R"],
  },
  {
    vs: "VS173",
    smiles: String.raw`O[C@H]([C@]12C=C[C@H](C=C1)C=C2)C(\C=C/C1C=C1)(\C=C/C1C=C1)\C=C/C1C=C1`,
    said: ["C1:S", "C2:later", "C5:later", "C11=C12:Z", "C16=C17:Z", "C21=C22:Z"],
  },
  {
    vs: "VS174",
    smiles: String.raw`C1C[C@@H]2[C@H](C=CCCC2)C1`,
    said: ["C2:R", "C3:R"],
  },
  // rule 2
  { vs: "VS175", smiles: String.raw`OC[C@@](CC)(C)[13CH2]C`, said: ["C2:R"] },
  { vs: "VS180", smiles: String.raw`Cl[C@H]([3H])Br`, said: ["C1:S"] },
  {
    vs: "VS187",
    cite: "BB 2013 P-93.4.1.1 as given in the suite",
    smiles: String.raw`[2H][C@@H](C)C1=CC=CC=C1`,
    said: ["C1:S"],
  },
  // rule 3
  {
    vs: "VS188",
    cite: "BB 2013 P-92.4.2 as given in the suite",
    smiles: String.raw`C\C=C1/C/C(C1)=C/C`,
    said: ["C1=C2:E", "C4=C6:E"],
  },
  {
    vs: "VS189",
    cite: "BB 2013 P-93.5.1.4.2.1 as given in the suite",
    smiles: String.raw`C\C=C1/CC\C(CC1)=C/C`,
    said: ["C1=C2:Z", "C5=C8:Z"],
  },
  {
    vs: "VS191",
    cite: "BB 2013 P-92.4.2.2 as given in the suite",
    smiles: String.raw`O[C@@H](C=C(C/C=C\C)C/C=C\C)\C=C(/C/C=C\C)C/C=C/C`,
    said: ["C1:S", "C5=C6:Z", "C9=C10:Z", "C12=C13:Z", "C15=C16:Z", "C19=C20:E"],
  },
  {
    vs: "VS193",
    cite: "BB 2013 P-92.4.2 as given in the suite",
    smiles: String.raw`O[C@@H](CCC\C(Cl)=C/C)CCC/C(Cl)=C/C`,
    said: ["C1:S", "C5=C7:E", "C12=C14:Z"],
  },
  {
    vs: "VS195",
    cite: "BB 2013 P-93.4.2.4 as given in the suite",
    smiles: String.raw`O[C@@H](C\C=C/C)C/C=C/C`,
    said: ["C1:R", "C3=C4:Z", "C7=C8:E"],
  },
  // rules 4, 5 and 6: not worked out yet, the rest of the structure labelled
  {
    vs: "VS221",
    cite: "BB 2013 P-93.5.1.1.2 as given in the suite",
    smiles: String.raw`O[C@H]1CC[C@H](O)CC1`,
    said: ["C1:later", "C4:later"],
  },
  {
    vs: "VS222",
    cite: "BB 2013 P-93.5.1.1.2 as given in the suite",
    smiles: String.raw`O[C@@H]1CC[C@H](O)CC1`,
    said: ["C1:later", "C4:later"],
  },
  {
    vs: "VS219",
    cite: "BB 2013 P-92.6 as given in the suite",
    smiles: String.raw`C1[C@H](O)C[C@H]1O`,
    said: ["C1:later", "C4:later"],
  },
  {
    vs: "VS236",
    cite: "Fig. 11a; BB 2013 P-92.6 as given in the suite",
    smiles: String.raw`S[C@H](C)[C@H](S)[C@H](C)S`,
    said: ["C1:R", "C3:later", "C5:S"],
  },
  {
    vs: "VS244",
    cite: "Fig. 11b",
    smiles: String.raw`Cl[C@H](C)[C@]([C@H](C)Cl)(C[C@@H](C)Br)C[C@H](C)Br`,
    said: ["C1:R", "C3:later", "C4:S", "C8:R", "C12:S"],
  },
  {
    vs: "VS229",
    cite: "Fig. 11c; BB 2013 P-92.6 as given in the suite",
    smiles: String.raw`Cl[C@H](C)/C(=C/C)[C@H](C)Cl`,
    said: ["C1:R", "C6:S", "C3=C4:later"],
  },
  {
    vs: "VS246",
    smiles: String.raw`C\C=C1/CC[C@H](C)CC1`,
    said: ["C5:R", "C1=C2:later"],
  },
  {
    vs: "VS285",
    cite: "Fig. 12; BB 2013 P-93.5.3.2 as given in the suite",
    smiles: String.raw`O=C1CCN[C@@]12NCCC2=O`,
    said: ["C5:symmetric"],
  },
];

describe("the validation suite's cases, redrawn", () => {
  for (const c of CASES) {
    it(`${c.vs}${c.cite ? ` (${c.cite})` : ""}`, () => {
      expect(cipOf(c.smiles)).toEqual(c.said);
    });
  }
});
