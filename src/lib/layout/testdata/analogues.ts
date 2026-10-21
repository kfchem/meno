/**
 * A thousand analogues, as a workflow that varies the groups on a core
 * makes them: ten cores, each with two places for a group, and a hundred
 * pairs of groups on each. The groups bring what a laid-out drawing must
 * keep as given: stereocentres (a wedge, an H drawn on a ring), E double
 * bonds, charges, rings of their own. Each a SMILES as SMILES is written -
 * one pair of brackets to a branch - and read the same by another reader:
 * RDKit's reading of each (formula, charge, the centres and double bonds it
 * gives a configuration) is kept beside it, analogues.facts.json, written
 * by scripts/layout/analogues.py, and Meno's reading is tested against it.
 * The molecule each one is, is its SMILES - the known answer a drawing of
 * it is read back against.
 */

/** The cores, `{1}` and `{2}` where the groups go. */
export const CORES = [
  "c1cc({1})ccc1C(=O)N{2}",
  "c1cc2c(cc1{1})[nH]cc2C{2}",
  "O=C1N({1})CC[C@@H]1{2}",
  "c1ccc2c(c1)nc({1})n2{2}",
  "C1CN(CCC1{1}){2}",
  "c1nc({1})sc1C(=O){2}",
  "c1cc(ccc1{1})S(=O)(=O)N{2}",
  "C[C@H](N{1})c1ccc(cc1){2}",
  "O=C(N{2})/C=C/c1ccc(cc1){1}",
  "c1c({2})c2c(cc1{1})OCO2",
] as const;

/** Each core on its own, as what made the series would give it: the cores above with no group (an H where a group goes). */
export const CORE_SMILES = [
  "c1ccccc1C(=O)N",
  "c1cc2c(cc1)[nH]cc2C",
  "O=C1NCCC1",
  "c1ccc2c(c1)nc[nH]2",
  "C1CNCCC1",
  "c1ncsc1C=O",
  "c1ccccc1S(=O)(=O)N",
  "CC(N)c1ccccc1",
  "O=C(N)/C=C/c1ccccc1",
  "c1cc2c(cc1)OCO2",
] as const;

/** The groups, each written to follow the atom it is on. */
export const GROUPS = [
  "C",
  "CC",
  "C(C)C",
  "Cl",
  "F",
  "OC",
  "C(F)(F)F",
  "[C@@H](O)C",
  "[C@H](N)C(=O)O",
  "c1ccccc1",
  "C1CC1",
  "N1CCOCC1",
  "C#N",
  "[N+](=O)[O-]",
  "C(=O)[O-]",
  "CC[NH3+]",
  "/C=C/C",
  "OCc1ccncc1",
  "S(C)(=O)=O",
  "[C@H]1CCCO1",
] as const;

/** The analogues: each its core's index, the two groups' and its SMILES - a hundred to a core, the cores in order. */
export function analogues(): { core: number; groups: [number, number]; smiles: string }[] {
  const out: { core: number; groups: [number, number]; smiles: string }[] = [];
  CORES.forEach((core, c) => {
    for (let i = 0; i < 10; i++)
      for (let j = 0; j < 10; j++) {
        const g1 = (i + c) % GROUPS.length;
        const g2 = (10 + j + 3 * c) % GROUPS.length;
        // (a group's own ring closed by 9, never by a number the core has open where the group goes)
        const group = (g: number) => GROUPS[g].replace(/1/g, "9");
        // (the first group in one pair of brackets: the core's own where it has them round its place)
        const first = core.includes("({1})") ? core.replace("({1})", `(${group(g1)})`) : core.replace("{1}", `(${group(g1)})`);
        out.push({ core: c, groups: [g1, g2], smiles: first.replace("{2}", group(g2)) });
      }
  });
  return out;
}
