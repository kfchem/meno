import { describe, expect, it } from "vitest";
import type { Property } from "../../../../lib/entry";
import { emptyWorkspaceDocument, type WorkspaceDocument } from "../document";
import type { DrawnModel, Model } from "../store/types";
import { BEFORE_THE_EDIT, LARGE_SET, setMembers } from "./entries";
import { canWire, inputKey, resultOf } from "./flow";
import { addSet, addStep, connect, setRan } from "./model";
import { placeResults, runStep, type RunResults, type RunWith } from "./run";

const W: RunWith = { extentOf: () => ({ x0: -1, x1: 1, y0: -1, y1: 1 }), byOf: () => "meno", now: 1000 };

/** Descriptors' numbers of a structure drawn, as its plugin gives them: molecular weight in g/mol, polar surface area in Å². */
const BY = { plugin: "rdkit", version: "1", program: "RDKit 2026.03.6" };
const mw = (v: number): Property => ({ value: v, unit: "g/mol", by: { ...BY, method: "molecular weight" }, status: "computed" });
const tpsa = (v: number): Property => ({ value: v, unit: "Å2", by: { ...BY, method: "TPSA" }, status: "computed" });
/** A generative model's NLL of a structure it made: no unit. */
const nll = (v: number): Property => ({ value: v, unit: "none", by: { plugin: "gen", model: "a model", version: "1" }, status: "computed" });

/** Chloroethane as drawn, with a record of `properties` - as Descriptors gives a structure that Generate made. */
const chloroethane = (properties: Record<string, Property>): DrawnModel => ({
  atoms: [
    { id: 1, el: "C", x: 0, y: 0 },
    { id: 2, el: "C", x: 1.56, y: 0.9 },
    { id: 3, el: "Cl", x: 3.12, y: 0 },
  ] as never,
  bonds: [
    { id: 1, a: 1, b: 2, order: 1 },
    { id: 2, a: 2, b: 3, order: 1 },
  ] as never,
  record: { properties, status: "done" },
});

/**
 * A page with a Descriptors step that gave `made` - run on a structure of the
 * chemist's, as nothing has changed since - its result set wired into a
 * Filter with `conditions`.
 */
function filtering(made: DrawnModel[], conditions: string, match: "all" | "any" = "all"): WorkspaceDocument {
  let doc: WorkspaceDocument = { ...emptyWorkspaceDocument(), model: { atoms: [{ id: 1, el: "O", x: -20, y: 0 }] as never, bonds: [] }, nextId: 2 };
  doc = addSet(doc, { x0: -22, y0: -2, x1: -18, y1: 2 });
  doc = addStep(doc, "descriptors", 0, 0);
  doc = connect(doc, { set: doc.sets![0].id }, DESCRIPTORS(doc));
  const results: RunResults = { molecules: [], rest: [], holds: "structures", drawn: { made, rest: [] } };
  doc = placeResults(doc, doc.steps![0], results, W);
  doc = setRan(doc, DESCRIPTORS(doc), { at: 1, ok: true, said: "described", input: inputKey(doc, doc.steps![0], "meno"), kind: "descriptors" });
  doc = addStep(doc, "filter", 40, 0, { conditions, match });
  return connect(doc, { set: resultOf(doc, DESCRIPTORS(doc), "out")!.id }, FILTER(doc));
}

/** The page's Descriptors step and its Filter, by id. */
const DESCRIPTORS = (doc: WorkspaceDocument) => doc.steps![0].id;
const FILTER = (doc: WorkspaceDocument) => doc.steps![1].id;

const ran = (doc: WorkspaceDocument) => doc.steps!.find((s) => s.id === FILTER(doc))!.ran;
/** Each record's properties a Filter exit's set holds, by name: its value, or null where it has none. */
function held(doc: WorkspaceDocument, exit: string, names: string[]) {
  const set = resultOf(doc, FILTER(doc), exit)!;
  const records = set.drawnCollection ? set.drawnCollection.map((m) => m.record) : setMembers(doc, set).records;
  return records.map((r) => names.map((n) => r?.properties?.[n]?.value ?? null));
}

describe("a Filter step on structures drawn", () => {
  it("is wired after Descriptors, and keeps the structures whose records meet its conditions, in their units - the rest each saying why, one with no value for a property named", () => {
    const doc0 = filtering(
      [
        chloroethane({ mw: mw(64.51), tpsa: tpsa(0), nll: nll(12) }),
        chloroethane({ mw: mw(612.4), tpsa: tpsa(40), nll: nll(18) }),
        chloroethane({ mw: mw(320), tpsa: tpsa(120), nll: nll(20) }),
        chloroethane({ mw: mw(250), tpsa: tpsa(60) }),
      ],
      "mw < 500 g/mol; tpsa < 90 Å²; nll < 30",
    );
    expect(canWire(doc0, { set: resultOf(doc0, DESCRIPTORS(doc0), "out")!.id }, FILTER(doc0))).toBe(true);
    const doc = runStep(doc0, FILTER(doc0), W);
    expect(ran(doc)).toMatchObject({
      ok: true,
      said: "1 of 4 entries kept · rest 3 (1: not mw < 500 g/mol (612.4 g/mol); 1: not tpsa < 90 Å² (120 Å²); 1: it has no nll)",
    });
    expect(resultOf(doc, FILTER(doc), "out")!.made?.holds).toBe("structures");
    // (each as it came, its properties as given)
    expect(held(doc, "out", ["mw", "tpsa", "nll"])).toEqual([[64.51, 0, 12]]);
    expect(held(doc, "rest", ["mw", "tpsa", "nll"])).toEqual([
      [612.4, 40, 18],
      [320, 120, 20],
      [250, 60, null],
    ]);
    // (the rest's records say why each was set aside)
    const rest = setMembers(doc, resultOf(doc, FILTER(doc), "rest")!).records;
    expect(rest.map((r) => r?.status)).toEqual([{ aside: "not mw < 500 g/mol (612.4 g/mol)" }, { aside: "not tpsa < 90 Å² (120 Å²)" }, { aside: "it has no nll" }]);
  });

  it("keeps where any is met, saying a condition not asked of one kept - its property not there", () => {
    let doc = filtering([chloroethane({ tpsa: tpsa(50) }), chloroethane({ tpsa: tpsa(100), nll: nll(10) })], "tpsa < 60 Å2\nnll < 5", "any");
    doc = runStep(doc, FILTER(doc), W);
    expect(ran(doc)?.said).toBe("1 of 2 entries kept \u00b7 1 of them with a condition not asked (1: it has no nll) \u00b7 rest 1 (1: not tpsa < 60 Å² (100 Å²); not nll < 5 (10))");
    expect(held(doc, "out", ["tpsa"])).toEqual([[50]]);
  });

  it("sets a structure edited since its properties were given aside saying so - none of them read - counted by that on the line", () => {
    let doc = filtering([chloroethane({ mw: mw(64.51) }), chloroethane({ mw: mw(64.51) })], "mw < 500 g/mol");
    // (the second edited on the page: a chlorine made a bromine)
    const set = resultOf(doc, DESCRIPTORS(doc), "out")!;
    const second = new Set(setMembers(doc, set).structures[1]);
    doc = { ...doc, model: { ...doc.model, atoms: doc.model.atoms.map((a) => (second.has(a.id) && a.el === "Cl" ? { ...a, el: "Br" } : a)) } as Model };
    expect(setMembers(doc, set).records[1]?.stale).toBe(BEFORE_THE_EDIT);
    doc = runStep(doc, FILTER(doc), W);
    expect(ran(doc)?.said).toBe(`1 of 2 entries kept · rest 1 (1: ${BEFORE_THE_EDIT})`);
    expect(setMembers(doc, resultOf(doc, FILTER(doc), "rest")!).records.map((r) => r?.status)).toEqual([{ aside: BEFORE_THE_EDIT }]);
  });

  it("keeps a structure without what an earlier step said of it, and sets one aside after an earlier step's why", () => {
    // (as Enumerate's rest comes: each set aside as the same as another)
    const aside = (p: Record<string, Property>, why: string): DrawnModel => ({ ...chloroethane(p), record: { properties: p, status: { aside: why } } });
    const doc0 = filtering([aside({ mw: mw(64.51) }, "Same as 1"), aside({ mw: mw(612.4) }, "Same as 2"), chloroethane({ mw: mw(70) })], "mw < 500 g/mol");
    const doc = runStep(doc0, FILTER(doc0), W);
    expect(ran(doc)?.said).toBe("2 of 3 entries kept · rest 1 (1: not mw < 500 g/mol (612.4 g/mol))");
    const kept = setMembers(doc, resultOf(doc, FILTER(doc), "out")!).records;
    expect(kept.map((r) => [r?.properties?.mw?.value, r?.status])).toEqual([
      [64.51, undefined],
      [70, undefined],
    ]);
    const rest = setMembers(doc, resultOf(doc, FILTER(doc), "rest")!).records;
    expect(rest.map((r) => r?.status)).toEqual([{ aside: "Same as 2; not mw < 500 g/mol (612.4 g/mol)" }]);
  });

  it("takes a set held whole (more than are laid out on the page), and holds its own so where it keeps as many", () => {
    const many = Array.from({ length: LARGE_SET + 10 }, (_, k) => chloroethane({ mw: mw(100 + k), nll: nll(k % 7) }));
    const doc0 = filtering(many, "nll < 6");
    const doc = runStep(doc0, FILTER(doc0), W);
    // (k % 7 is 6 for 8 of the 60)
    expect(ran(doc)?.said).toBe(`${LARGE_SET + 2} of ${LARGE_SET + 10} entries kept · rest 8 (8: not nll < 6 (6))`);
    const out = resultOf(doc, FILTER(doc), "out")!;
    expect(out.drawnCollection).toHaveLength(LARGE_SET + 2);
    expect(held(doc, "out", ["mw"]).slice(0, 7)).toEqual([[100], [101], [102], [103], [104], [105], [107]]);
    expect(held(doc, "rest", ["mw"])).toEqual(Array.from({ length: 8 }, (_, k) => [106 + 7 * k]));
  });
});
