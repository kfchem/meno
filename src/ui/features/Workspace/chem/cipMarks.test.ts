import { describe, expect, it } from "vitest";
import type { Model } from "../store/types";
import { cipMarksFrom, cipMarksOf, cipSaid, turnsSaid, type CipJob } from "./cipMarks";
import { drawnFromSmiles } from "./testdata/identityCases";

/** Butan-2-ol drawn: C1-C2(-O5)-C3-C4, its O on a wedge out of C2, up or down; C2 asked for its R or S. */
const butanol = (stereo?: "up" | "down", shown = true): Model => ({
  atoms: [
    { id: 1, x: 0, y: 0, r: 0.9, el: "C" },
    { id: 2, x: 1.3, y: 0.75, r: 0.9, el: "C", ...(shown ? { stereoShown: true as const } : {}) },
    { id: 3, x: 2.6, y: 0, r: 0.9, el: "C" },
    { id: 4, x: 3.9, y: 0.75, r: 0.9, el: "C" },
    { id: 5, x: 1.3, y: 2.25, r: 0.9, el: "O" },
  ],
  bonds: [
    { id: 11, a: 1, b: 2, order: 1 },
    { id: 12, a: 2, b: 3, order: 1 },
    { id: 13, a: 3, b: 4, order: 1 },
    { id: 14, a: 2, b: 5, order: 1, ...(stereo ? { stereo } : {}) },
  ],
});

describe("R and S, E and Z on the drawing, Meno's own", () => {
  it("gives a wedged centre asked for its R or S - the other wedge, the other one - and none to a centre not asked for", () => {
    const up = cipMarksOf(butanol("up")).centres.get(2);
    const down = cipMarksOf(butanol("down")).centres.get(2);
    expect(up && down && new Set([up, down])).toEqual(new Set(["R", "S"]));
    expect(cipMarksOf(butanol("up", false)).centres.size).toBe(0);
  });

  it("says why one asked for has none: nothing drawn, two groups alike", () => {
    const m = cipMarksOf(butanol());
    expect(m.centres.size).toBe(0);
    expect(m.said.get("centre-2")).toBe(cipSaid("undrawn", "centre"));
    // (propan-2-ol: its two methyls alike, a wedge or not)
    const propanol: Model = { ...butanol("up"), atoms: butanol("up").atoms.filter((a) => a.id !== 4), bonds: butanol("up").bonds.filter((b) => b.id !== 13) };
    expect(cipMarksOf(propanol).said.get("centre-2")).toBe(cipSaid("alike", "centre"));
  });

  it("gives a protonated amine's N no R or S, and says why - its H given up and taken back", () => {
    // (N-ethyl-N-methylpropan-1-aminium, wedged at its N: four different groups, but its H comes and goes)
    const amine: Model = {
      atoms: [
        { id: 1, x: 0, y: 0, r: 0.9, el: "N", charge: 1, stereoShown: true },
        { id: 2, x: -1.3, y: 0.75, r: 0.9, el: "C" },
        { id: 3, x: 1.3, y: 0.75, r: 0.9, el: "C" },
        { id: 4, x: 2.6, y: 0, r: 0.9, el: "C" },
        { id: 5, x: 0, y: -1.5, r: 0.9, el: "C" },
        { id: 6, x: 1.3, y: -2.25, r: 0.9, el: "C" },
        { id: 7, x: 2.6, y: -1.5, r: 0.9, el: "C" },
      ],
      bonds: [
        { id: 11, a: 1, b: 2, order: 1, stereo: "up" },
        { id: 12, a: 1, b: 3, order: 1 },
        { id: 13, a: 3, b: 4, order: 1 },
        { id: 14, a: 1, b: 5, order: 1 },
        { id: 15, a: 5, b: 6, order: 1 },
        { id: 16, a: 6, b: 7, order: 1 },
      ],
    } as Model;
    const m = cipMarksOf(amine);
    expect(m.centres.has(1)).toBe(false);
    expect(m.said.get("centre-1")).toBe(cipSaid("exchanges", "centre"));
  });

  it("gives a double bond asked for its E or Z", () => {
    // (pent-2-ene drawn trans: C1-C2=C3-C4-C5, its double bond asked for)
    const pentene: Model = {
      atoms: [
        { id: 1, x: 0, y: 0, r: 0.9, el: "C" },
        { id: 2, x: 1.3, y: 0.75, r: 0.9, el: "C" },
        { id: 3, x: 2.6, y: 0, r: 0.9, el: "C" },
        { id: 4, x: 3.9, y: 0.75, r: 0.9, el: "C" },
        { id: 5, x: 5.2, y: 0, r: 0.9, el: "C" },
      ],
      bonds: [
        { id: 11, a: 1, b: 2, order: 1 },
        { id: 12, a: 2, b: 3, order: 2, stereoShown: true },
        { id: 13, a: 3, b: 4, order: 1 },
        { id: 14, a: 4, b: 5, order: 1 },
      ],
    } as Model;
    expect(cipMarksOf(pentene).doubleBonds.get(12)).toBe("E");
  });

  it("shows a Z or E that turns in the mirror image (seqCis, seqTrans) as Z or E, saying over it that it turns", () => {
    expect(turnsSaid("Z")).toContain("becomes E in the mirror image");
    expect(turnsSaid("E")).toContain("becomes Z in the mirror image");
    const job: CipJob = { input: { atoms: [], bonds: [] }, centres: [{ at: 0, id: 7 }], bonds: [{ at: 0, id: 30 }] };
    const m = cipMarksFrom([job], [[{ label: "R" }, { label: "Z", turns: true }]]);
    expect(m.doubleBonds.get(30)).toBe("Z");
    expect(m.said.get("bond-30")).toBe(turnsSaid("Z"));
    expect(m.said.has("centre-7")).toBe(false);
  });

  it("shows nothing past the budget, a structure too large - saying so over it, never a guess", () => {
    const job: CipJob = { input: { atoms: [], bonds: [] }, centres: [{ at: 0, id: 7 }], bonds: [{ at: 0, id: 30 }] };
    const m = cipMarksFrom([job], [[{ why: "large" }, { why: "large" }]]);
    expect(m.centres.size + m.doubleBonds.size).toBe(0);
    expect(m.said.get("centre-7")).toBe(cipSaid("large", "centre"));
    expect(m.said.get("bond-30")).toBe(cipSaid("large", "bond"));
  });
});

describe("an allene's Ra or Sa and an odd cumulene's E or Z on the drawing", () => {
  /** A SMILES drawn by Meno, its first double bond asked for. */
  const asked = (smiles: string): { model: Model; id: number } => {
    const model = drawnFromSmiles(smiles);
    const bond = model.bonds.find((b) => b.order === 2)!;
    return { model: { ...model, bonds: model.bonds.map((b) => (b === bond ? { ...b, stereoShown: true as const } : b)) }, id: bond.id };
  };

  it("gives an allene asked for at a bond of it its axis's, Ra or Sa - its mirror image, the other", () => {
    const one = asked("CC=[C@]=CC");
    const other = asked("CC=[C@@]=CC");
    expect(cipMarksOf(one.model).doubleBonds.get(one.id)).toBe("Ra");
    expect(cipMarksOf(other.model).doubleBonds.get(other.id)).toBe("Sa");
  });

  it("gives an odd cumulene asked for at a bond of it its E or Z", () => {
    const e = asked("F/C=C=C=C/F");
    const z = asked("F/C=C=C=C\\F");
    expect(cipMarksOf(e.model).doubleBonds.get(e.id)).toBe("E");
    expect(cipMarksOf(z.model).doubleBonds.get(z.id)).toBe("Z");
  });

  it("says an allene with none drawn has no Ra or Sa", () => {
    const none = asked("CC=C=CC");
    expect(cipMarksOf(none.model).said.get(`bond-${none.id}`)).toBe(cipSaid("undrawn", "axis"));
  });
});

describe("one mark for each run of cumulated double bonds", () => {
  /** A structure drawn from its SMILES by the engine, every atom and bond asked for its R or S, E or Z - as Show R/S and E/Z asks. */
  const asked = (smiles: string): Model => {
    const m = drawnFromSmiles(smiles);
    return { ...m, atoms: m.atoms.map((a) => ({ ...a, stereoShown: true as const })), bonds: m.bonds.map((b) => ({ ...b, stereoShown: true as const })) };
  };

  it("gives an allene's axis one mark, not one under each of its double bonds - and each handedness its own", () => {
    const marks = ["OC(C)=[C@]=C(Cl)C", "OC(C)=[C@@]=C(Cl)C"].map((smi) => cipMarksOf(asked(smi)).doubleBonds);
    for (const m of marks) expect(m.size).toBe(1);
    expect(new Set(marks.map((m) => [...m.values()][0]))).toEqual(new Set(["Ra", "Sa"]));
  });

  it("gives a butatriene's cis or trans one mark, on its middle double bond, not one on each of its three", () => {
    for (const [smi, label] of [["C/C=C=C=C/C", "E"], ["C/C=C=C=C\\C", "Z"]] as const) {
      const m = asked(smi);
      const marks = cipMarksOf(m).doubleBonds;
      // (alike groups at an end say none: 2-butatriene's ends have a methyl and an H each, so there is a mark)
      expect([...marks.values()], smi).toEqual([label]);
      const middle = m.bonds.find((b) => b.a === 3 && b.b === 4)!;
      expect([...marks.keys()], smi).toEqual([middle.id]);
    }
  });

  it("leaves a plain double bond its own mark, and an allene's with a plain one beside it", () => {
    const marks = cipMarksOf(asked("C/C=C/C=[C@]=C(Cl)C")).doubleBonds;
    expect(marks.size).toBe(2);
  });
});
