import { describe, expect, it, vi } from "vitest";
import { forgetLaidOut } from "../../../../lib/layout/engine";
import { MENO } from "../../../../lib/chem/style";
import { readSmiles } from "../../../../lib/chem/smiles";
import { identityText, type IdentityInput } from "../../../../lib/chem/identity";
import type { Model } from "../store/types";
import { readMarks } from "../utils/figures";
import { ARRANGEMENT_SAID, BONDED_ARRANGEMENT_SAID, arrangementSaid } from "../utils/arrangement";
import { laidOut } from "./cleanUp";
import { arrangementsMarked } from "./arrangementsMarked";
import { arrangementsDrawn, identityOfDrawn } from "./identityOf";
import { drawingOf } from "./drawing";

// What Clean-up and identity read of a centre's arrangement - which of its bonds lie across from each other - beyond the metals of
// four donors: a main-group centre of six bonds (SF4Cl2), a hydride on a metal, a hydrogen bond drawn to a metal, and which bond is
// in front where two cross. Made-up simple compounds; each expected answer counted from the geometry first.

/** What the plugin answers to a SMILES: a block each test sets. */
let blockOf = "";
vi.mock("../../../../lib/roles/worker", () => ({
  chemWorker: async () => ({
    request: async (op: string) => (op === "from_smiles" ? { molblock: blockOf } : { read: true, elements: [] }),
  }),
}));

type Spoke = { el: string; at: number; valence?: number };
/** A centre at the page's origin with an atom at each spoke's angle (degrees). */
function drawn(centre: string, spokes: readonly Spoke[]): Model {
  const atoms = [{ id: 1, x: 0, y: 0, r: 0.9, el: centre }] as Model["atoms"];
  const bonds: Model["bonds"] = [];
  spokes.forEach((s, k) => {
    const t = (s.at * Math.PI) / 180;
    atoms.push({ id: 2 + k, x: 1.5 * Math.cos(t), y: 1.5 * Math.sin(t), r: 0.9, el: s.el, ...(s.valence ? { valence: s.valence } : {}) } as Model["atoms"][number]);
    bonds.push({ id: 100 + k, a: 1, b: 2 + k, order: 1, stereo: "none" } as Model["bonds"][number]);
  });
  return { atoms, bonds } as Model;
}
const six = (els: readonly string[]) => drawn("S", els.map((el, k) => ({ el, at: 60 * k })));

/** The atoms round the centre that lie across from each other as drawn (within 30 degrees of a straight line), each pair by its elements. */
function across(m: Model): string[] {
  const c = m.atoms[0];
  const round = m.bonds.filter((b) => b.a === c.id || b.b === c.id).map((b) => m.atoms.find((a) => a.id === (b.a === c.id ? b.b : b.a))!);
  const t = round.map((a) => Math.atan2(a.y - c.y, a.x - c.x));
  const out: string[] = [];
  for (let i = 0; i < round.length; i++)
    for (let j = i + 1; j < round.length; j++) {
      const off = Math.abs(Math.PI - Math.abs(Math.atan2(Math.sin(t[i] - t[j]), Math.cos(t[i] - t[j]))));
      if (off < Math.PI / 6) out.push([round[i].el, round[j].el].sort().join("-"));
    }
  return out.sort();
}

/** A MOL block of a centre and six atoms round it at `angles`, as a plugin would draw one. */
function block(centre: string, els: readonly string[], angles: readonly number[]): string {
  const f = (v: number) => v.toFixed(4).padStart(10);
  const line = (x: number, y: number, el: string) => `${f(x)}${f(y)}${f(0)} ${el.padEnd(3)} 0  0  0  0  0  0  0  0  0  0  0  0`;
  const atoms = [line(0, 0, centre), ...els.map((el, k) => line(1.5 * Math.cos((angles[k] * Math.PI) / 180), 1.5 * Math.sin((angles[k] * Math.PI) / 180), el))];
  const bonds = els.map((_, k) => `  1${String(k + 2).padStart(3)}  1  0`);
  return ["", "  test", "", `${String(atoms.length).padStart(3)}${String(bonds.length).padStart(3)}  0  0  0  0  0  0  0  0999 V2000`, ...atoms, ...bonds, "M  END", ""].join("\n");
}
const markedAt = (m: Model, el: string) => readMarks(m).atoms.get(m.atoms.find((a) => a.el === el)!.id);

describe("a main-group centre of six bonds: its bonds across kept as drawn, and said not given where nobody gave them", () => {
  // (counted first: octahedral SA6 and SA5B one arrangement each; SA4B2 two - the two B across, or beside - and SA3B3 two, fac and mer)
  it("Clean-up keeps trans-SF4Cl2 drawn by hand trans, and cis cis", { timeout: 120000 }, async () => {
    forgetLaidOut();
    const trans = await laidOut(six(["Cl", "F", "F", "Cl", "F", "F"]), MENO);
    expect(across(trans)).toEqual(["Cl-Cl", "F-F", "F-F"]);
    const cis = await laidOut(six(["Cl", "Cl", "F", "F", "F", "F"]), MENO);
    expect(across(cis)).toEqual(["Cl-F", "Cl-F", "F-F"]);
    // (drawn by the chemist: no mark, whichever)
    expect(markedAt(trans, "S")).toBeUndefined();
  });

  it("a drawing nobody made marks SF4Cl2 and fac/mer-SF3Cl3 not given, never SF6 or SF5Cl", () => {
    const angles = [0, 60, 120, 180, 240, 300];
    const kept = (els: string[]) => markedAt(arrangementsMarked(drawn("S", els.map((el, k) => ({ el, at: angles[k] })))), "S");
    expect(kept(["F", "F", "F", "F", "F", "F"])).toBeUndefined();
    expect(kept(["Cl", "F", "F", "F", "F", "F"])).toBeUndefined();
    expect(kept(["Cl", "F", "F", "Cl", "F", "F"])).toBe(BONDED_ARRANGEMENT_SAID);
    expect(kept(["Cl", "Cl", "Cl", "F", "F", "F"])).toBe(BONDED_ARRANGEMENT_SAID);
    // (a carbon's or a boron's six neighbours are a cage's: no mark)
    const cage = drawn("B", ["H", "C", "B", "B", "C", "B"].map((el, k) => ({ el, at: angles[k] })));
    expect(readMarks(arrangementsMarked(cage)).atoms.get(1)).toBeUndefined();
  });

  it("trans-SF4Cl2 typed with its octahedral mark, which Meno does not keep, comes marked not given - not drawn cis with nothing said", { timeout: 120000 }, async () => {
    forgetLaidOut();
    const { structureFromSmiles } = await import("./fromSmiles");
    // (the mark: OH1 puts the first neighbour across the last - the two Cl across each other)
    const smiles = "Cl[S@OH1](F)(F)(F)(F)Cl";
    expect(() => readSmiles(smiles, { metalMarks: true })).toThrow(/only a metal's is read/);
    blockOf = block("S", ["Cl", "F", "F", "F", "F", "Cl"], [180, 60, 120, 240, 300, 0]);
    const typed = await structureFromSmiles(smiles, MENO);
    expect(markedAt(typed, "S")).toBe(BONDED_ARRANGEMENT_SAID);
    // (and SF6 typed: one arrangement, nothing to say)
    blockOf = block("S", ["F", "F", "F", "F", "F", "F"], [180, 60, 120, 240, 300, 0]);
    expect(markedAt(await structureFromSmiles("F[S@OH1](F)(F)(F)(F)F", MENO), "S")).toBeUndefined();
  });
});

describe("the mark's words by the centre: a metal's donors, any other centre's bonded atoms", () => {
  it("one line for a metal, another for S, Si, P or I", () => {
    expect(BONDED_ARRANGEMENT_SAID).toBe("Which of its bonded atoms are next to each other is not given.");
    for (const el of ["Pt", "Co", "Pd"]) expect(arrangementSaid(el)).toBe(ARRANGEMENT_SAID);
    for (const el of ["S", "Si", "P", "I"]) expect(arrangementSaid(el)).toBe(BONDED_ARRANGEMENT_SAID);
  });
  it("a metal kept as it came keeps the donors' line", () => {
    const co = drawn("Co", ["Cl", "Cl", "N", "N", "N", "N"].map((el, k) => ({ el, at: 60 * k, ...(el === "N" ? { valence: 4 } : {}) })));
    expect(markedAt(arrangementsMarked({ ...co, atoms: co.atoms.map((a, i) => (i ? a : { ...a, charge: 1 })) }), "Co")).toBe(ARRANGEMENT_SAID);
  });
});

describe("a hydrogen bond drawn to a metal is none of its donors, for Clean-up as for identity", () => {
  it("cisplatin drawn as the X with a water's H bonded to the Pt: Clean-up keeps it cis or moves nothing - never the arrangement lost unsaid", { timeout: 120000 }, async () => {
    forgetLaidOut();
    const cis = drawn("Pt", ["Cl", "Cl", "N", "N"].map((el, k) => ({ el, at: 45 + 90 * k, ...(el === "N" ? { valence: 4 } : {}) })));
    const withWater: Model = {
      atoms: [...cis.atoms, { id: 50, x: 0.4, y: -1.6, r: 0.9, el: "H" }, { id: 51, x: 0.9, y: -2.4, r: 0.9, el: "O" }] as Model["atoms"],
      bonds: [...cis.bonds, { id: 150, a: 50, b: 51, order: 1, stereo: "none" }, { id: 151, a: 1, b: 50, order: 1, stereo: "none", hydrogen: true }] as Model["bonds"],
    };
    const before = identityOfDrawn(withWater).text;
    expect(arrangementsDrawn(drawingOf(withWater), withWater)).toHaveLength(1);
    let after: Model | null = null;
    try {
      after = await laidOut(withWater, MENO);
    } catch (e) {
      expect(String(e)).toMatch(/nothing was moved/);
    }
    if (after) expect(identityOfDrawn(after).text).toBe(before);
  });
});

describe("a hydride on the metal is one of its donors", () => {
  // (counted first: square-planar PtHCl(L)2 - H across Cl, or H across L - two compounds)
  const x = (els: string[]) => drawn("Pt", els.map((el, k) => ({ el, at: 45 + 90 * k })));
  it("cis- and trans-PtHCl(PH3)2 drawn as the X, the H an atom: two identities, each kept by Clean-up", { timeout: 120000 }, async () => {
    forgetLaidOut();
    const cis = x(["H", "Cl", "P", "P"]);
    const trans = x(["H", "P", "Cl", "P"]);
    expect(identityOfDrawn(cis).text).not.toBe(identityOfDrawn(trans).text);
    expect(identityOfDrawn(await laidOut(cis, MENO)).text).toBe(identityOfDrawn(cis).text);
    expect(identityOfDrawn(await laidOut(trans, MENO)).text).toBe(identityOfDrawn(trans).text);
  });
  it("written with the H an atom, @SP1 to @SP3: two identities - H across Cl in one of the three", () => {
    const of = (s: string) => {
      const r = readSmiles(s, { metalMarks: true });
      const input: IdentityInput = { atoms: r.atoms.map((a) => ({ el: a.el, hs: a.hs ?? (a.el === "P" ? 2 : 0) })), bonds: r.bonds.map((b) => ({ a: b.a1, b: b.a2, order: b.order })), arrangements: r.arrangements };
      return identityText(input);
    };
    const texts = ["[H][Pt@SP1](Cl)(P)P", "[H][Pt@SP2](Cl)(P)P", "[H][Pt@SP3](Cl)(P)P"].map(of);
    expect(new Set(texts).size).toBe(2);
    expect(texts[0]).toBe(texts[2]);
  });
});

describe("which bond is in front where two cross is a look: identity does not read it", () => {
  it("two drawings that differ only by the bond said behind at a crossing are one identity", () => {
    // (a ring of four with both diagonals: A-C and B-D cross at the middle)
    const atoms = [
      { id: 1, x: 0, y: 0, r: 0.9, el: "C" },
      { id: 2, x: 2, y: 0, r: 0.9, el: "C" },
      { id: 3, x: 2, y: 2, r: 0.9, el: "C" },
      { id: 4, x: 0, y: 2, r: 0.9, el: "C" },
    ] as Model["atoms"];
    const bonds = (behind?: number[]) =>
      [
        [1, 2],
        [2, 3],
        [3, 4],
        [4, 1],
        [1, 3],
        [2, 4],
      ].map(([a, b], k) => ({ id: 10 + k, a, b, order: 1, stereo: "none", ...(k === 4 && behind ? { behind } : {}) })) as Model["bonds"];
    expect(identityOfDrawn({ atoms, bonds: bonds([15]) } as Model).text).toBe(identityOfDrawn({ atoms, bonds: bonds() } as Model).text);
  });
});
