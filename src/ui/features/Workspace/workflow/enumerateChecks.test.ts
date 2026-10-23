import { describe, expect, it } from "vitest";
import type { Analysis } from "../../../../lib/roles/client";
import type { Model } from "../store/types";
import { drawnFromSmiles } from "../chem/testdata/identityCases";
import { valenceFlagged } from "./enumerateChecks";

/** The most bonds, by bond order, a checker of this test lets each element have. */
const MOST: Record<string, number> = { C: 4, N: 3, O: 2, F: 1, Cl: 1 };

/**
 * A checker of valence standing in for the plugin's, for this test alone:
 * each atom of a V3000 molblock flagged where its bonds' orders sum to more
 * than `MOST` says its element takes ("*", an R, is let be). What a plugin's
 * checks would say is theirs; this holds Enumerate to asking and saying.
 */
async function checker(molblock: string): Promise<Analysis> {
  const lines = molblock.split("\n");
  const atoms = lines.flatMap((l) => {
    const m = /^M {2}V30 (\d+) (\S+) -?[\d.]+ -?[\d.]+ -?[\d.]+ /.exec(l);
    return m ? [m[2]] : [];
  });
  const inBonds = lines.slice(lines.findIndex((l) => l.includes("BEGIN BOND")) + 1);
  const sum = atoms.map(() => 0);
  for (const l of inBonds) {
    const m = /^M {2}V30 \d+ (\d) (\d+) (\d+)/.exec(l);
    if (!m) break;
    sum[+m[2] - 1] += +m[1];
    sum[+m[3] - 1] += +m[1];
  }
  return { atoms: atoms.map((el, i) => ({ index: i, hydrogens: 0, ...(MOST[el] != null && sum[i] > MOST[el] ? { valenceError: { valence: sum[i], most: MOST[el] } } : {}) })), bonds: [] } as Analysis;
}

const template = (smiles: string): Model => {
  const m = drawnFromSmiles(smiles);
  let n = 0;
  return { ...m, atoms: m.atoms.map((a) => (a.el === "*" ? { ...a, el: "R#", rgroups: [++n] } : a)) };
};

describe("Enumerate's valence, checked before it runs", () => {
  it("asks about the template and each option, and says nothing where nothing is flagged", async () => {
    const asked: string[] = [];
    const said = await valenceFlagged(template("*c1ccccc1"), "R1: Me\nCl\n*OC", async (mb) => (asked.push(mb), checker(mb)));
    expect(said).toEqual([]);
    // (the template, then each of the three options on an R)
    expect(asked).toHaveLength(4);
  });

  it("names the template or the option the checks flag, in their words", async () => {
    // (an option drawn with a carbon of four single bonds and a double one - six - and a fluorine of two)
    const said = await valenceFlagged(template("*c1ccccc1"), "R1: Me\n*C(C)(C)(C)=C\n*F(C)", checker);
    expect(said).toEqual([
      'R1, option 2 ("*C(C)(C)(C)=C"): Too many bonds: a valence of 6, where carbon takes at most 4.',
      'R1, option 3 ("*F(C)"): Too many bonds: a valence of 2, where fluorine takes at most 1.',
    ]);
    // (an over-valent template)
    const over: Model = { ...template("*c1ccccc1") };
    const c = over.atoms.find((a) => a.el === "C")!;
    over.atoms = [...over.atoms, { id: 900, el: "C", x: c.x + 1.5, y: c.y, r: 0.9 }, { id: 901, el: "C", x: c.x - 1.5, y: c.y, r: 0.9 }];
    over.bonds = [...over.bonds, { id: 902, a: c.id, b: 900, order: 1 }, { id: 903, a: c.id, b: 901, order: 1 }];
    expect((await valenceFlagged(over, "R1: Me", checker))[0]).toMatch(/^The template: Too many bonds: a valence of \d, where carbon takes at most 4\.$/);
  });
});
