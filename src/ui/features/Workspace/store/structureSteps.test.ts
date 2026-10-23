/**
 * A plugin's steps on structures drawn, done at once in its worker - *Check
 * structures* and *Stereoisomers*, RDKit's (docs/PLUGINS.md, *Steps on
 * structures drawn*): each structure given as its MOL blocks; what the
 * plugin says of each taken in, in their order - kept as drawn, made anew
 * (each drawing read as a SMILES's is), or set aside, its record saying
 * why; each made one with the record of the one it was made of; nothing
 * taken in part.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Atom, DrawnRecord, Model } from "./types";

/** What the plugin was asked - the step, each structure's blocks, the options - and what it answers, by the test. */
const asked: { step: string; entries: { molblocks: string[] }[]; options: Record<string, unknown>; holds: string }[] = [];
let answer: (entries: { molblocks: string[] }[]) => unknown = () => ({});

vi.mock("../../../../lib/calc/workers", async (actual) => ({
  ...(await actual<typeof import("../../../../lib/calc/workers")>()),
  pluginClient: async () => ({
    run: async (step: string, entries: { molblocks: string[] }[], options: Record<string, unknown>, holds: string) => {
      asked.push({ step, entries, options, holds });
      return answer(entries);
    },
  }),
}));

/** A drawing made of a block, as Meno's engine lays one out: here, the block's name as its one carbon's label, two atoms apart - one called "undrawable", none. */
vi.mock("../chem/fromSmiles", async (actual) => ({
  ...(await actual<typeof import("../chem/fromSmiles")>()),
  drawingOf: async (block: string): Promise<Model> => {
    if (block === "undrawable") throw new Error("it could not be laid out");
    return {
    atoms: [{ id: 1, el: "C", x: 0, y: 0, label: block } as never, { id: 2, el: "O", x: 1.5, y: 0 } as never],
    bonds: [{ id: 3, a: 1, b: 2, order: 1 } as never],
    };
  },
}));

import { connectStoreToDocument, createEditorStore } from ".";
import { createWorkspaceDocument } from "../document";
import { useReaders } from "../../../../lib/calc/workers";
import { PLUGINS } from "../../../../lib/calc/catalog";
import { setMembers, drawnHash } from "../workflow/entries";
import { resultOf } from "../workflow/flow";
import { drawnSaid, readDrawnAnswers } from "../workflow/programs";
import { drawnFromSmiles } from "../chem/testdata/identityCases";

useReaders.setState({ state: Object.fromEntries(PLUGINS.map((p) => [p.id, "added" as const])), problem: {} });

/** Three structures drawn side by side - ethanol, 2-butanol, propanol - each carbons and an oxygen. */
function drawn() {
  const doc = createWorkspaceDocument();
  const parts = ["CCO", "CC(O)CC", "CCCO"];
  doc.edit("draw", (d) => {
    const atoms: Atom[] = [];
    const bonds = [...d.model.bonds];
    parts.forEach((p, i) => {
      const base = 100 * (i + 1);
      const els = p.replace(/[()]/g, "").split("");
      els.forEach((el, k) => atoms.push({ id: base + k, el, x: -400 + 12 * i + 1.3 * k, y: 0, r: 0.9 }));
      for (let k = 1; k < els.length; k++) bonds.push({ id: base + 50 + k, a: base + k - 1, b: base + k, order: 1 });
    });
    return { ...d, model: { atoms: [...d.model.atoms, ...atoms], bonds }, nextId: 1000 };
  });
  return doc;
}

/** A step of `kind` by RDKit on the three, its set's members given `records` where any; run. */
async function ran(kind: "stereoisomers" | "check-structures" | "descriptors", records: (DrawnRecord | undefined)[] = []) {
  const doc = drawn();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  const st = () => store.getState();
  const set = st().addSet({ x0: -500, y0: -50, x1: -10, y1: 50 });
  if (records.length) {
    doc.edit("records", (d) => ({
      ...d,
      sets: d.sets!.map((b) => (b.id === set ? { ...b, members: b.members!.map((m, i) => ("structure" in m && records[i] ? { ...m, record: records[i] } : m)) } : b)),
    }));
  }
  const step = st().addStep(kind, "rdkit", 0, 0);
  st().connect({ set }, step);
  await st().runStep(step);
  const d = doc.getState();
  // (each record as compared: without what it is of - each one placed is of its own structure, which its key says)
  const exit = (id: string) => {
    const b = resultOf(d, step, id);
    if (!b) return null;
    const held = setMembers(d, b);
    for (const [i, r] of held.records.entries()) if (r) expect(r.of).toBe(drawnHash(d.model, held.structures[i]));
    return { ...held, records: held.records.map((r) => r && (({ of: _of, ...rest }) => rest)(r)) };
  };
  return { step: d.steps!.find((s) => s.id === step)!, out: exit("out"), rest: exit("rest"), model: d.model };
}

const NLL: DrawnRecord = { from: ["seed-1"], properties: { nll: { value: 23.5, unit: "none", status: "computed" } } };

describe("a plugin's step on structures drawn", () => {
  beforeEach(() => {
    asked.length = 0;
    answer = () => ({});
  });

  it("takes the structures a large result set holds off the page, each given as its blocks - and holds what it keeps off the page too", async () => {
    // (Enumerate's 51 products, an aryl ether R1-O-Ar-R2 made 3 x 17 ways, none the same: held in its set)
    const doc = createWorkspaceDocument();
    const drawnT = drawnFromSmiles("*Oc1ccc(*)cc1");
    let r = 0;
    const model = { ...drawnT, atoms: drawnT.atoms.map((a) => (a.el === "*" ? { ...a, el: "R#", rgroups: [++r] } : a)) };
    const r2 = ["F", "Cl", "Br", "I", "*C", "*CC", "*CCC", "*C(C)C", "*C#N", "*N", "*C=O", "*C(F)(F)F", "*S", "*C(=O)C", "*N(C)C", "*C=C", "*C#C"];
    doc.edit("draw", (d) => ({ ...d, model, nextId: 5000 }));
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    const st = () => store.getState();
    const template = st().addSet({ x0: -50, y0: -50, x1: 50, y1: 50 });
    const enumerate = st().addStep("enumerate", "meno", 80, 0);
    st().updateStep(enumerate, { options: { lists: `R1: *C\n*CC\n*CCC\nR2: ${r2.join("\n")}` } });
    st().connect({ set: template }, enumerate);
    await st().runStep(enumerate);
    const held = st().sets.find((b) => b.made?.step === enumerate && b.made.exit === "out")!;
    expect(held.drawnCollection).toHaveLength(51);
    answer = (entries) => ({ structures: entries.map(() => ({ as: "drawn" })) });
    const check = st().addStep("check-structures", "rdkit", 200, 0);
    st().connect({ set: held.id }, check);
    await st().runStep(check);
    expect(asked).toHaveLength(1);
    expect(asked[0].entries).toHaveLength(51);
    expect(asked[0].entries.every((e) => e.molblocks.length === 1)).toBe(true);
    expect(st().steps.find((s) => s.id === check)!.ran).toMatchObject({ ok: true, said: "51 of 51 kept" });
    expect(st().sets.find((b) => b.made?.step === check && b.made.exit === "out")!.drawnCollection).toHaveLength(51);
  });

  it("gives each structure as its blocks, with the step's options - and takes in what it says of each, in their order", async () => {
    answer = () => ({ structures: [{ as: "drawn" }, { made: ["iso-1", "iso-2"] }, { aside: "an allene's axis left open", kind: "axis" }] });
    const { step, out, rest, model } = await ran("stereoisomers");
    expect(asked).toHaveLength(1);
    expect(asked[0]).toMatchObject({ step: "stereoisomers", holds: "structures", options: { open: "every" } });
    expect(asked[0].entries.map((e) => e.molblocks.length)).toEqual([1, 1, 1]);
    expect(asked[0].entries[1].molblocks[0]).toMatch(/V3000|V2000/);
    expect(step.ran).toMatchObject({ ok: true, said: "3 in · 3 out · 2 made from 1 · 1 set aside (1: axis)" });
    // (ethanol as drawn, then 2-butanol's two drawings in its place; propanol in the second exit's set)
    const labels = (ids: number[]) => ids.map((id) => model.atoms.find((a) => a.id === id)! as { label?: string; el: string }).map((a) => a.label ?? a.el);
    expect(out!.structures.map(labels)).toEqual([["C", "C", "O"], ["iso-1", "O"], ["iso-2", "O"]]);
    expect(rest!.structures.map((ids) => ids.length)).toEqual([4]);
    expect(rest!.records).toEqual([{ status: { aside: "an allene's axis left open" } }]);
  });

  it("keeps each one's record: as drawn, its own; made anew, one of its own - what it came from, which of how many, its SMILES, and the values of the one it was made of as that one's, never its own; set aside, saying why", async () => {
    answer = () => ({ structures: [{ as: "drawn" }, { made: ["iso-1", "iso-2"], smiles: ["C[C@H](O)CC", "C[C@@H](O)CC"] }, { aside: "a radical", kind: "radical" }] });
    const old: DrawnRecord = { ...NLL, status: { aside: "an earlier step's word" } };
    const parent: DrawnRecord = { from: ["seed-1"], properties: { ...NLL.properties, smiles: { value: "CC(O)CC", unit: "none", status: "computed" } } };
    const { out, rest } = await ran("stereoisomers", [NLL, parent, old]);
    const by = { plugin: "rdkit", version: expect.any(String), program: expect.any(String), method: "Stereoisomers: 2 made of one" };
    const own = (k: string, smiles: string) => ({
      from: ["seed-1"],
      properties: {
        made: { value: k, unit: "none", status: "computed", by },
        smiles: { value: smiles, unit: "none", status: "computed", by },
        // (the one it was made of: its values as they were, by what worked them out then - named as that one's)
        "made_from.nll": NLL.properties!.nll,
        "made_from.smiles": { value: "CC(O)CC", unit: "none", status: "computed" },
      },
    });
    // (the NLL was the one's it was made of, its stereo left open: never the stereoisomer's own `nll`)
    expect(out!.records).toEqual([NLL, own("1 of 2", "C[C@H](O)CC"), own("2 of 2", "C[C@@H](O)CC")]);
    // (what it came in with of its status is the earlier step's: this one's own said in its place)
    expect(rest!.records).toEqual([{ from: ["seed-1"], properties: NLL.properties, status: { aside: "a radical" } }]);
  });

  it("sets aside, whole, one whose stereoisomers could not be drawn - the rest as they were", async () => {
    answer = () => ({ structures: [{ as: "drawn" }, { made: ["iso-1", "undrawable"] }, { as: "drawn" }] });
    const { out, rest, step } = await ran("stereoisomers");
    expect(out!.structures).toHaveLength(2);
    expect(rest!.records).toEqual([{ status: { aside: "what it was made into could not be drawn" } }]);
    expect(step.ran?.said).toContain("1 set aside (1: drawing)");
  });

  it("is given the options the plugin declares for Check structures, every finding set aside unless kept", async () => {
    answer = (entries) => ({ structures: entries.map(() => ({ as: "drawn" })) });
    const { step, rest } = await ran("check-structures");
    expect(asked[0].options).toEqual({ parts: "aside", valence: "aside", electrons: "aside", radicals: "aside" });
    expect(step.ran).toMatchObject({ ok: true, said: "3 of 3 kept" });
    expect(rest!.structures).toEqual([]);
  });

  it("keeps what a step worked out of each structure on its record, beside what it had, saying what worked it out", async () => {
    answer = () => ({
      structures: [
        { as: "drawn", properties: { mw: { value: 46.069, unit: "g/mol", method: "average molecular weight" }, hbd: { value: 1, unit: "none" } } },
        { as: "drawn", properties: { mw: { value: 74.123, unit: "g/mol" } } },
        { aside: "RDKit cannot make sense of it", kind: "valence" },
      ],
    });
    const { step, out, rest } = await ran("descriptors", [NLL]);
    expect(step.ran).toMatchObject({ ok: true, said: "2 of 3 kept · 1 set aside (1: valence)" });
    const by = { plugin: "rdkit", version: expect.any(String), program: expect.stringMatching(/^RDKit /) };
    expect(out!.records[0]).toEqual({
      from: ["seed-1"],
      properties: {
        ...NLL.properties,
        mw: { value: 46.069, unit: "g/mol", status: "computed", by: { ...by, method: "average molecular weight" } },
        hbd: { value: 1, unit: "none", status: "computed", by },
      },
    });
    expect(out!.records[1]).toEqual({ properties: { mw: { value: 74.123, unit: "g/mol", status: "computed", by } } });
    expect(rest!.records).toEqual([{ status: { aside: "RDKit cannot make sense of it" } }]);
    // (a value in a unit Meno does not know: none of it taken)
    answer = () => ({ structures: [{ as: "drawn", properties: { mw: { value: 1, unit: "Da" } } }, { as: "drawn" }, { as: "drawn" }] });
    expect((await ran("descriptors")).step.ran).toMatchObject({ ok: false, said: "It said nothing Meno can take" });
  });

  it("takes in nothing where the plugin says nothing Meno can take, saying so", async () => {
    answer = () => ({ structures: [{ as: "drawn" }] });
    const { step, out } = await ran("stereoisomers");
    expect(step.ran).toMatchObject({ ok: false, said: "It said nothing Meno can take" });
    expect(out?.structures ?? []).toEqual([]);
  });
});

describe("what a plugin's step on structures drawn says", () => {
  it("reads each answer, or none at all where one is not one", () => {
    expect(readDrawnAnswers({ structures: [{ as: "drawn" }, { made: ["a"] }, { aside: " why ", kind: "radical" }, { aside: "no kind" }] }, 4)).toEqual([
      { as: "drawn" },
      { made: ["a"] },
      { aside: "why", kind: "radical" },
      { aside: "no kind", kind: "other" },
    ]);
    expect(readDrawnAnswers({ structures: [{ as: "drawn" }] }, 2)).toBe("It said nothing Meno can take");
    expect(readDrawnAnswers({ structures: [{ made: [] }] }, 1)).toBe("It said nothing Meno can take");
    expect(readDrawnAnswers({ structures: [{ made: Array(65).fill("b") }] }, 1)).toBe("It said nothing Meno can take");
    expect(readDrawnAnswers({ structures: [{ as: "kept" }] }, 1)).toBe("It said nothing Meno can take");
    expect(readDrawnAnswers(null, 0)).toBe("It said nothing Meno can take");
  });

  it("says how many it kept, made and set aside - by kind, the most first", () => {
    expect(drawnSaid([{ as: "drawn" }, { as: "drawn" }])).toBe("2 of 2 kept");
    expect(drawnSaid([{ as: "drawn" }, { aside: "x", kind: "radical" }, { aside: "y", kind: "parts" }, { aside: "z", kind: "parts" }])).toBe("1 of 4 kept · 3 set aside (2: parts; 1: radical)");
    expect(drawnSaid([{ made: ["a", "b", "c", "d"] }, { as: "drawn" }, { aside: "x", kind: "too many" }])).toBe("3 in · 5 out · 4 made from 1 · 1 set aside (1: too many)");
  });
});
