import { describe, expect, it } from "vitest";
import { drawnFromSmiles } from "../chem/testdata/identityCases";
import type { DrawnRecord, Model } from "../store/types";
import type { DrawnEntry } from "./entries";
import { kindInfo, optionsTaking } from "./kinds";
import { runDuplicatesDrawnInTurns, runMenoDrawn } from "./meno";

// Every answer here is stated by hand from the chemistry, never read back from Meno.

/** Structures drawn as they come into a step, each from its SMILES - drawn afresh, so each in its own layout - or as drawn by hand, with its record where given. */
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
const places = (es: readonly DrawnEntry[]) => es.map((e) => e.place);
const num = (n: number): DrawnRecord => ({ properties: { number: { value: n, unit: "none", status: "computed" } } });

/**
 * Bromochlorofluoroiodomethane drawn by hand: C at the centre, F up and to the right (60 degrees), I up and to the left
 * (120 degrees), Cl and Br below (210 and 330 degrees), each bond's narrow end at the C. `wedge` and `hash` name the
 * neighbour drawn so; `turn` turns the whole drawing in its plane, `order` lists the atoms in another order.
 */
function cfclbri(o: { wedge?: string; hash?: string; turn?: number; order?: readonly string[] } = {}): Model {
  const at: Record<string, number> = { F: 60, I: 120, Cl: 210, Br: 330 };
  const els = o.order ?? ["C", "F", "I", "Cl", "Br"];
  const id = (el: string) => els.indexOf(el) + 1;
  const t = ((o.turn ?? 0) * Math.PI) / 180;
  const place = (el: string) => {
    if (el === "C") return { x: 0, y: 0 };
    const a = (at[el] * Math.PI) / 180;
    const [x, y] = [1.5 * Math.cos(a), 1.5 * Math.sin(a)];
    return { x: x * Math.cos(t) - y * Math.sin(t), y: x * Math.sin(t) + y * Math.cos(t) };
  };
  return {
    atoms: els.map((el) => ({ id: id(el), el, r: 0.9, ...place(el) })),
    bonds: ["F", "I", "Cl", "Br"].map((el, k) => ({ id: 10 + k, a: id("C"), b: id(el), order: 1, stereo: o.wedge === el ? "up" : o.hash === el ? "down" : "none" })),
  } as Model;
}

describe("Duplicates on structures drawn", () => {
  it("keeps the first of each structure, in the order they came, and sets the rest aside saying which they are the same as", () => {
    // (ethanol written from either end, and acetone twice: one structure each, drawn apart)
    const out = run(came(["CCO", "CC(C)=O", "OCC", "CO", "CC(=O)C"]));
    expect(places(out.kept)).toEqual([0, 1, 3]);
    expect(out.aside.map((e) => [e.place, why(e)])).toEqual([
      [2, "Same as 1"],
      [4, "Same as 2"],
    ]);
    expect(out.said).toBe("3 of 5 entries kept · rest 2");
  });

  it("takes two drawings of one compound as one: atoms in another order, the drawing turned, a wedge in place of a hash at the other neighbour", () => {
    // (F wedged toward the viewer is the same centre as I, beside it at the top, hashed away from it: the two top bonds are
    //  the pair out of the plane, one up and one down. Worked by hand: the signed volume of F, Cl, Br about I has one sign
    //  in both. F hashed instead is its mirror image.)
    const out = run(
      came([
        { drawn: cfclbri({ wedge: "F" }) },
        { drawn: cfclbri({ wedge: "F", order: ["Br", "Cl", "I", "F", "C"] }) },
        { drawn: cfclbri({ wedge: "F", turn: 90 }) },
        { drawn: cfclbri({ hash: "I" }) },
        { drawn: cfclbri({ hash: "F" }) },
      ]),
    );
    expect(places(out.kept)).toEqual([0, 4]);
    expect(out.aside.map((e) => [e.place, why(e)])).toEqual([
      [1, "Same as 1"],
      [2, "Same as 1"],
      [3, "Same as 1"],
    ]);
  });

  it("takes enantiomers as two, and one with its centre left undrawn as neither of them; two undrawn alike are one", () => {
    // (docs/WORKFLOWS-FOUNDATION.md, *Which structures are the same is judged by Meno's identity*: a place whose two senses
    //  write two texts is open and stays so - the compound with a centre plain stands for two compounds, and is neither)
    const out = run(came(["F[C@@H](Cl)Br", "F[C@H](Cl)Br", "FC(Cl)Br", "FC(Cl)Br", "Br[C@H](Cl)F"]));
    expect(places(out.kept)).toEqual([0, 1, 2]);
    // (Br[C@H](Cl)F is F[C@@H](Cl)Br written from the other end: one)
    expect(out.aside.map((e) => [e.place, why(e)])).toEqual([
      [3, "Same as 3"],
      [4, "Same as 1"],
    ]);
  });

  it("takes E and Z as two, and one of them written from the other end as one", () => {
    // (but-2-ene: C/C=C/C and C\C=C\C are both E; C/C=C\C is Z)
    const out = run(came(["C/C=C/C", "C/C=C\\C", "C\\C=C\\C"]));
    expect(places(out.kept)).toEqual([0, 1]);
    expect(out.aside.map((e) => [e.place, why(e)])).toEqual([[2, "Same as 1"]]);
  });

  it("takes a salt written in either order as one", () => {
    const out = run(came(["CC(=O)[O-].[Na+]", "[Na+].[O-]C(C)=O"]));
    expect(places(out.kept)).toEqual([0]);
    expect(out.aside.map(why)).toEqual(["Same as 1"]);
  });

  it("takes tautomers for the structures drawn: two", () => {
    // (acetone and prop-1-en-2-ol: Meno compares what is drawn)
    expect(run(came(["CC(=O)C", "CC(O)=C"])).aside).toEqual([]);
  });

  it("takes a group written by its label as the same group drawn out", () => {
    // (ethyl methyl ether, its methoxy written "OMe"; propan-1-ol, of the same formula, another structure)
    const labelled: Model = {
      atoms: [
        { id: 1, el: "C", x: 0, y: 0, r: 0.9 },
        { id: 2, el: "C", x: 1.3, y: 0.75, r: 0.9 },
        { id: 3, el: "OMe", x: 2.6, y: 0, r: 0.9 },
      ],
      bonds: [
        { id: 4, a: 1, b: 2, order: 1, stereo: "none" },
        { id: 5, a: 2, b: 3, order: 1, stereo: "none" },
      ],
    } as Model;
    const out = run(came(["CCOC", { drawn: labelled }, "CCCO"]));
    expect(places(out.kept)).toEqual([0, 2]);
    expect(out.aside.map((e) => [e.place, why(e)])).toEqual([[1, "Same as 1"]]);
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
    expect(places(out.kept)).toEqual([0, 1, 3]);
    expect(out.aside.map((e) => [e.place, why(e)])).toEqual([
      [2, "Same as 1"],
      [4, "Same as 4"],
    ]);
    expect(out.said).toBe("3 of 5 entries kept · rest 2 · 2 without seed, compared among themselves");
    expect(runMenoDrawn("duplicates", came(["CCO"]), { within: "each value", groupBy: " " })).toEqual({ ok: false, said: "Name the property whose values are the groups" });
  });

  it("never sets aside one it cannot be sure of: wedges that do not read keep it, counted", () => {
    // (a centre with all four bonds wedged, two up and two down, crossing: no configuration reads from it)
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

  it("never sets aside one whose identity it could not work out in full: kept, counted, with why", () => {
    // (forty methanes apart in one drawing, alike in every way: the identity search runs out of steps)
    const many = Array(40).fill("C").join(".");
    const out = run(came([many, many]));
    expect(out.aside).toEqual([]);
    expect(out.said).toBe("2 of 2 entries kept · 2 not compared (2: its identity not worked out in full)");
  });

  it("does not count mirror images in on structures drawn: a configuration drawn is kept, so enantiomers stay two whatever the option says", () => {
    const out = run(came(["F[C@@H](Cl)Br", "F[C@H](Cl)Br"]), { mirrors: "counted" });
    expect(out.aside).toEqual([]);
  });

  it("shows no Mirror images option for structures drawn - identity decides - and shows it for molecules in 3D", () => {
    const all = kindInfo("duplicates").options ?? [];
    expect(optionsTaking("duplicates", all, "structures").map((o) => o.id)).toEqual(["within", "groupBy"]);
    expect(optionsTaking("duplicates", all, "molecules").map((o) => o.id)).toEqual(["mirrors", "within", "groupBy"]);
    expect(optionsTaking("duplicates", all, "conformers").map((o) => o.id)).toEqual(["mirrors", "within", "groupBy"]);
  });

  it("says nothing came in when nothing did, in turns as at once", async () => {
    expect(await runDuplicatesDrawnInTurns([], {})).toEqual({ ok: false, said: "Nothing came in" });
    expect(runMenoDrawn("duplicates", [])).toEqual({ ok: false, said: "Nothing came in" });
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
  });
});
