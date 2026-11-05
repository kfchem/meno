import { describe, expect, it } from "vitest";
import { drawnFromSmiles } from "../chem/testdata/identityCases";
import type { DrawnRecord, Model } from "../store/types";
import type { DrawnEntry } from "./entries";
import { MIRRORS_ON_DRAWN, runDuplicatesDrawnInTurns, runMenoDrawn } from "./meno";

/** Structures drawn as they come into a step, each from its SMILES - drawn afresh, so each in its own layout - with its record, where given. */
const came = (rows: readonly (string | { smiles?: string; drawn?: Model; record?: DrawnRecord })[]): DrawnEntry[] =>
  rows.map((r, place) => {
    const row = typeof r === "string" ? { smiles: r } : r;
    return { place, drawn: row.drawn ?? drawnFromSmiles(row.smiles!), ...(row.record ? { record: row.record } : {}) };
  });
const run = (entries: DrawnEntry[], options: Record<string, string | number | boolean> = {}) => {
  const out = runMenoDrawn("duplicates", entries, options);
  if (!out.ok) throw new Error(out.said);
  return out;
};
const why = (e: DrawnEntry) => (typeof e.record?.status === "object" && "aside" in e.record.status ? e.record.status.aside : undefined);
const num = (n: number): DrawnRecord => ({ properties: { number: { value: n, unit: "none", status: "computed" } } });

describe("Duplicates on structures drawn", () => {
  it("keeps the first of each structure, in the order they came, and sets the rest aside saying which they are the same as", () => {
    // (ethanol written from either end, and acetone twice: the same structures, drawn apart)
    const out = run(came(["CCO", "CC(C)=O", "OCC", "CO", "CC(=O)C"]));
    expect(out.kept.map((e) => e.place)).toEqual([0, 1, 3]);
    expect(out.aside.map((e) => [e.place, why(e)])).toEqual([
      [2, "Same as 1"],
      [4, "Same as 2"],
    ]);
    expect(out.said).toBe("3 of 5 entries kept · rest 2");
  });

  it("tells configurations drawn apart: the two of a stereocentre are not alike; two that leave it open are, and one open is not one given", () => {
    const out = run(came(["F[C@@H](Cl)Br", "F[C@H](Cl)Br", "FC(Cl)Br", "FC(Cl)Br", "F[C@@H](Cl)Br"]));
    expect(out.kept.map((e) => e.place)).toEqual([0, 1, 2]);
    expect(out.aside.map((e) => [e.place, why(e)])).toEqual([
      [3, "Same as 3"],
      [4, "Same as 1"],
    ]);
  });

  it("takes tautomers for the structures they are: never alike", () => {
    expect(run(came(["CC(=O)C", "CC(O)=C"])).aside).toEqual([]);
  });

  it("names the one kept by the number the records carry, where every one carries one - never by a place beside numbers", () => {
    const out = run(came([{ smiles: "CCO", record: num(4) }, { smiles: "CO", record: num(7) }, { smiles: "OCC", record: num(9) }]));
    expect(out.aside.map(why)).toEqual(["Same as 4"]);
    // (one without a number among them: places for all)
    const mixed = run(came([{ smiles: "CCO", record: num(4) }, "OCC"]));
    expect(mixed.aside.map(why)).toEqual(["Same as 1"]);
  });

  it("says its why after an earlier step's, and keeps those it keeps without one", () => {
    const earlier: DrawnRecord = { status: { aside: "kept with a note" } };
    const out = run(came([{ smiles: "CCO", record: earlier }, { smiles: "OCC", record: earlier }]));
    expect(out.kept[0].record).toBeUndefined();
    expect(out.aside.map(why)).toEqual(["kept with a note; Same as 1"]);
  });

  it("compares within each value of a property where one is named - those without it among themselves, said", () => {
    const seed = (v: number | undefined): DrawnRecord => (v == null ? {} : { properties: { seed: { value: v, unit: "none", status: "computed" } } });
    const out = run(
      came([
        { smiles: "CCO", record: seed(1) },
        { smiles: "OCC", record: seed(2) },
        { smiles: "CCO", record: seed(1) },
        { smiles: "CCO", record: seed(undefined) },
        { smiles: "OCC", record: seed(undefined) },
      ]),
      { within: "each value", groupBy: "seed" },
    );
    expect(out.kept.map((e) => e.place)).toEqual([0, 1, 3]);
    expect(out.aside.map((e) => [e.place, why(e)])).toEqual([
      [2, "Same as 1"],
      [4, "Same as 4"],
    ]);
    expect(out.said).toBe("3 of 5 entries kept · rest 2 · 2 without seed, compared among themselves");
    expect(runMenoDrawn("duplicates", came(["CCO"]), { within: "each value", groupBy: " " })).toEqual({ ok: false, said: "Name the property whose values are the groups" });
  });

  it("never sets aside one it cannot be sure of: wedges that do not read keep it, counted", () => {
    const crossed: Model = {
      atoms: [
        { id: 1, el: "C", x: 0, y: 0, r: 0.9 },
        { id: 2, el: "F", x: 1.5, y: 0, r: 0.9 },
        { id: 3, el: "Cl", x: -1.5, y: 0, r: 0.9 },
        { id: 4, el: "Br", x: 0, y: 1.5, r: 0.9 },
        { id: 5, el: "I", x: 0, y: -1.5, r: 0.9 },
      ],
      bonds: [
        { id: 6, a: 1, b: 2, order: 1, stereo: "up" },
        { id: 7, a: 1, b: 3, order: 1, stereo: "down" },
        { id: 8, a: 1, b: 4, order: 1, stereo: "up" },
        { id: 9, a: 1, b: 5, order: 1, stereo: "down" },
      ],
    } as Model;
    const out = run(came([{ drawn: crossed }, { drawn: crossed }]));
    expect(out.aside).toEqual([]);
    expect(out.said).toBe("2 of 2 entries kept · 2 not compared (2: wedges that do not read)");
  });

  it("refuses to count mirror images in: structures drawn keep their configurations", () => {
    expect(runMenoDrawn("duplicates", came(["CCO"]), { mirrors: "counted" })).toEqual({ ok: false, said: MIRRORS_ON_DRAWN });
  });

  it("is done in turns, as on molecules in 3D: the same result, saying how far it is, and given up where it is stopped", async () => {
    const entries = came(["CCO", "CC(C)=O", "OCC", "CO", "CC(=O)C", "CCO"]);
    // (a clock that moves on with each look: every entry its own turn)
    let t = 0;
    const now = () => (t += 10);
    const told: number[] = [];
    const out = await runDuplicatesDrawnInTurns(entries, {}, { now, slice: 1, tell: 0, pause: async () => {}, onDone: (n) => told.push(n) });
    expect(out).toEqual(runMenoDrawn("duplicates", entries, {}));
    expect(told.length).toBeGreaterThan(0);
    expect(Math.max(...told)).toBeLessThanOrEqual(entries.length);
    // (stopped between two turns: nothing)
    t = 0;
    expect(await runDuplicatesDrawnInTurns(entries, {}, { now, slice: 1, pause: async () => {}, stopped: () => true })).toBeNull();
    // (refused at once, as at once)
    expect(await runDuplicatesDrawnInTurns(entries, { mirrors: "counted" })).toEqual({ ok: false, said: MIRRORS_ON_DRAWN });
  });
});
