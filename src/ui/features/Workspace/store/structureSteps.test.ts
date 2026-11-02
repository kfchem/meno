/**
 * Steps on structures drawn, done at once: a plugin's in its worker -
 * *Stereoisomers* and *Descriptors*, RDKit's (docs/PLUGINS.md, *Steps on
 * structures drawn*) - and *Check structures*, Meno's on the facts the
 * plugin that does the checks gives (workflow/checkStructures): each
 * structure given as its MOL blocks; what is said of each taken in, in their
 * order - kept as drawn, made anew (each drawing read as a SMILES's is), or
 * set aside, its record saying why; each made one with the record of the one
 * it was made of; nothing taken in part.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Atom, DrawnRecord, Model } from "./types";

/** What the plugin was asked - the step, each structure's blocks, the options - and what it answers, by the test. */
const asked: { step: string; entries: { molblocks: string[] }[]; options: Record<string, unknown>; holds: string; ms?: number }[] = [];
let answer: (entries: { molblocks: string[] }[]) => unknown = () => ({});

vi.mock("../../../../lib/calc/workers", async (actual) => ({
  ...(await actual<typeof import("../../../../lib/calc/workers")>()),
  pluginClient: async () => ({
    run: async (step: string, entries: { molblocks: string[] }[], options: Record<string, unknown>, holds: string, ms?: number) => {
      asked.push({ step, entries, options, holds, ms });
      return answer(entries);
    },
  }),
}));

/** What the plugin that does the checks makes of each structure, by the test: by default, one carbon with nothing wrong. */
let facts: (structures: { molblocks: string[] }[]) => unknown[] = (structures) => structures.map(() => FINE);
const FINE = { read: true, atoms: [{ el: "C", z: 6, charge: 0, valence: 4, most: 4, radicals: 0, part: 0 }] };

vi.mock("../../../../lib/roles/worker", async (actual) => ({
  ...(await actual<typeof import("../../../../lib/roles/worker")>()),
  rolePlugin: () => ({ id: "rdkit", name: "RDKit", uses: [{ name: "RDKit", version: "1" }] }),
  chemAtHand: async () => true,
  chemWorker: async () => ({
    request: async (op: string, args: { structures: { molblocks: string[] }[] }, ms?: number) => {
      if (op !== "structure_facts") throw new Error(`no ${op} here`);
      asked.push({ step: "check-structures", entries: args.structures, options: {}, holds: "structures", ms });
      return { structures: facts(args.structures) };
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
import { setMembers, drawnHash, TAKEN_AT_THE_EDIT } from "../workflow/entries";
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

/** A step of `kind` on the three - RDKit's, or Meno's Check structures - its set's members given `records` where any; run. */
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
  // (Check structures Meno's, on the checks plugin's facts; the others RDKit's)
  const step = st().addStep(kind, kind === "check-structures" ? "meno" : "rdkit", 0, 0);
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
    facts = (structures) => structures.map(() => FINE);
  });

  it("takes all the structures a large result set holds - those on the page, then those held off it - each given as its blocks, and keeps all it keeps so too", async () => {
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
    // (as many as the page shows on it - look DRAWN_ON_PAGE - the rest held in the set after them: all 51 the set's)
    const shown = setMembers(doc.getState(), held).structures.length;
    expect([shown > 0, held.drawnCollection!.length > 0, shown + held.drawnCollection!.length]).toEqual([true, true, 51]);
    const check = st().addStep("check-structures", "meno", 200, 0);
    st().connect({ set: held.id }, check);
    await st().runStep(check);
    expect(asked).toHaveLength(1);
    expect(asked[0].entries).toHaveLength(51);
    expect(asked[0].entries.every((e) => e.molblocks.length === 1)).toBe(true);
    // (half a minute for each, its stereoisomers each tried in 3D - more than a request's own two minutes - but
    //  never more than ten: a structure looked at too long is set aside alone by the plugin)
    expect(asked[0].ms).toBe(10 * 60_000);
    expect(st().steps.find((s) => s.id === check)!.ran).toMatchObject({ ok: true, said: "51 of 51 kept" });
    // (and its own 51 kept so: those it shows on the page, the rest held)
    const kept = st().sets.find((b) => b.made?.step === check && b.made.exit === "out")!;
    expect(setMembers(doc.getState(), kept).structures.length + kept.drawnCollection!.length).toBe(51);
  });

  it("gives each structure as its blocks, with the step's options - and takes in what it says of each, in their order", async () => {
    answer = () => ({ structures: [{ as: "drawn" }, { made: ["iso-1", "iso-2"] }, { aside: "an allene's axis left open", kind: "axis" }] });
    const { step, out, rest, model } = await ran("stereoisomers");
    expect(asked).toHaveLength(1);
    expect(asked[0]).toMatchObject({ step: "stereoisomers", holds: "structures", options: { open: "every" }, ms: 120_000 });
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
    // (made again of one made: what that one carried as it was, one level, its own values over them - its SMILES -
    //  and which of how many it was left out)
    answer = () => ({ structures: [{ made: ["iso-3"], smiles: ["C[C@H](O)CC"] }, { as: "drawn" }, { as: "drawn" }] });
    const again = await ran("stereoisomers", [out!.records[1]!, NLL, NLL]);
    expect(again.out!.records[0]!.properties).toEqual({
      made: expect.objectContaining({ value: "1 of 1" }),
      smiles: expect.objectContaining({ value: "C[C@H](O)CC" }),
      "made_from.nll": NLL.properties!.nll,
      "made_from.smiles": { value: "C[C@H](O)CC", unit: "none", status: "computed", by },
    });
    // (what it came in with of its status is the earlier step's: this one's own said in its place)
    expect(rest!.records).toEqual([{ from: ["seed-1"], properties: NLL.properties, status: { aside: "a radical" } }]);
  });

  it("keeps what it said of each it made on its record, as of each alike - a C=N whose E/Z it left alone, and why - beside what it was made from", async () => {
    const note = { value: "E/Z of 1 C=N not enumerated: its double bond moves with a hydrogen", unit: "none", method: "C=N bonds whose E/Z moves by tautomerism" };
    answer = () => ({
      structures: [{ as: "drawn", properties: { stereo_not_enumerated: note } }, { made: ["iso-1", "iso-2"], properties: { stereo_not_enumerated: note } }, { as: "drawn" }],
    });
    const { out } = await ran("stereoisomers", [undefined, NLL]);
    const said = { value: note.value, unit: "none", status: "computed", by: { plugin: "rdkit", version: expect.any(String), program: expect.any(String), method: note.method } };
    expect(out!.records[0]).toEqual({ properties: { stereo_not_enumerated: said } });
    for (const k of [1, 2]) {
      expect(out!.records[k]!.properties).toEqual({
        made: expect.objectContaining({ value: `${k} of 2` }),
        stereo_not_enumerated: said,
        "made_from.nll": NLL.properties!.nll,
      });
    }
  });

  it("sets aside, whole, one whose stereoisomers could not be drawn - the rest as they were", async () => {
    answer = () => ({ structures: [{ as: "drawn" }, { made: ["iso-1", "undrawable"] }, { as: "drawn" }] });
    const { out, rest, step } = await ran("stereoisomers");
    expect(out!.structures).toHaveLength(2);
    expect(rest!.records).toEqual([{ status: { aside: "what it was made into could not be drawn" } }]);
    expect(step.ran?.said).toContain("1 set aside (1: drawing)");
  });

  it("checks each structure by Meno's rules on what the plugin makes of it, every finding set aside unless kept", async () => {
    const { step, rest } = await ran("check-structures");
    expect(step.ran).toMatchObject({ ok: true, said: "3 of 3 kept" });
    expect(rest!.structures).toEqual([]);
    // (one a radical, one with a carbon of five bonds: set aside, saying why in Meno's words)
    const radical = { read: true, atoms: [{ el: "C", z: 6, charge: 0, valence: 3, most: 4, radicals: 1, part: 0 }] };
    const five = { read: true, atoms: [{ el: "C", z: 6, charge: 0, valence: 5, most: 4, radicals: 0, part: 0 }], problem: "SANITIZE_PROPERTIES" };
    facts = () => [FINE, radical, five];
    const found = await ran("check-structures");
    expect(found.step.ran).toMatchObject({ ok: true, said: "1 of 3 kept \u00b7 2 set aside (1: radical; 1: valence)" });
    expect(found.rest!.records).toEqual([{ status: { aside: "a radical: unpaired electrons on C" } }, { status: { aside: "an atom with more bonds than it can have (C)" } }]);
    // (one the toolkit could not read at all: said in its name)
    facts = () => [FINE, FINE, { read: false }];
    expect((await ran("check-structures")).rest!.records).toEqual([{ status: { aside: "RDKit could not read it" } }]);
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

  it("keeps none of what an earlier step said of a structure it keeps: not set aside any more, and its new values of it as it is", async () => {
    // (one Enumerate set aside, wired on; one whose record went stale with an edit; one plain)
    const aside: DrawnRecord = { properties: { number: { value: 2, unit: "none", status: "computed" } }, status: { aside: "Same as 1" } };
    const stale: DrawnRecord = { from: ["seed-1"], stale: "its properties were for the structure before the edit" };
    answer = () => ({ structures: [{ as: "drawn", properties: { mw: { value: 46.069, unit: "g/mol" } } }, { as: "drawn", properties: { mw: { value: 74.123, unit: "g/mol" } } }, { as: "drawn" }] });
    const described = await ran("descriptors", [aside, stale]);
    expect(described.out!.records.map((r) => [r?.status, r?.stale, Object.keys(r?.properties ?? {})])).toEqual([
      [undefined, undefined, ["number", "mw"]],
      // (the values it had before the edit still gone, and said so: not read as all it had)
      [undefined, TAKEN_AT_THE_EDIT, ["mw"]],
      [undefined, undefined, []],
    ]);
    // (no value worked out - an empty answer - is nothing new: still said stale as it was)
    answer = () => ({ structures: [{ as: "drawn", properties: {} }, { as: "drawn", properties: {} }, { as: "drawn" }] });
    expect((await ran("descriptors", [aside, stale])).out!.records[1]?.stale).toBe(stale.stale);
    // (kept with nothing worked out - Check structures: not set aside any more, and still said stale)
    const checked = await ran("check-structures", [aside, stale]);
    expect(checked.out!.records.map((r) => [r?.status, r?.stale])).toEqual([
      [undefined, undefined],
      [undefined, stale.stale],
      [undefined, undefined],
    ]);
  });

  it("gives a lone ion as drawn - a block of its own, never none, with no hydrogens a reader would add", async () => {
    // (methylammonium and two chlorides drawn beside it: each a structure of the set, each given as its block -
    //  a chloride before none, read as a structure with no atoms)
    const doc = createWorkspaceDocument();
    doc.edit("draw", (d) => ({
      ...d,
      model: {
        atoms: [
          { id: 1, el: "C", x: -400, y: 0, r: 0.9 },
          { id: 2, el: "N", x: -398.5, y: 0, r: 0.9, charge: 1 },
          { id: 3, el: "Cl", x: -396, y: 0, r: 0.9, charge: -1 },
          { id: 4, el: "Na", x: -380, y: 0, r: 0.9, charge: 1 },
        ],
        bonds: [{ id: 5, a: 1, b: 2, order: 1 }],
      },
      nextId: 100,
    }));
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    const st = () => store.getState();
    const set = st().addSet({ x0: -500, y0: -50, x1: -10, y1: 50 });
    const step = st().addStep("check-structures", "meno", 0, 0);
    st().connect({ set }, step);
    await st().runStep(step);
    expect(asked).toHaveLength(1);
    const blocks = asked[0].entries.map((e) => e.molblocks);
    expect(blocks.map((b) => b.length)).toEqual([1, 1, 1]);
    expect(blocks.flat().filter((b) => /V30 1 Cl \S+ \S+ 0 0 CHG=-1 VAL=-1\n/.test(b))).toHaveLength(1);
    expect(blocks.flat().filter((b) => /V30 1 Na \S+ \S+ 0 0 CHG=1 VAL=-1\n/.test(b))).toHaveLength(1);
    expect(st().steps.find((s) => s.id === step)!.ran).toMatchObject({ ok: true, said: "3 of 3 kept" });
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
    // (values given with those made: each a value, a unit Meno knows and how - one that is not, none taken)
    const note = { value: "E/Z of 1 C=N not enumerated", unit: "none", method: "how" };
    expect(readDrawnAnswers({ structures: [{ made: ["a", "b"], properties: { stereo_not_enumerated: note } }] }, 1)).toEqual([{ made: ["a", "b"], properties: { stereo_not_enumerated: note } }]);
    expect(readDrawnAnswers({ structures: [{ made: ["a"], properties: { x: { value: 1, unit: "furlongs" } } }] }, 1)).toBe("It said nothing Meno can take");
    expect(readDrawnAnswers({ structures: [{ made: ["a"], properties: ["x"] }] }, 1)).toBe("It said nothing Meno can take");
    expect(readDrawnAnswers(null, 0)).toBe("It said nothing Meno can take");
  });

  it("says how many it kept, made and set aside - by kind, the most first", () => {
    expect(drawnSaid([{ as: "drawn" }, { as: "drawn" }])).toBe("2 of 2 kept");
    expect(drawnSaid([{ as: "drawn" }, { aside: "x", kind: "radical" }, { aside: "y", kind: "parts" }, { aside: "z", kind: "parts" }])).toBe("1 of 4 kept · 3 set aside (2: parts; 1: radical)");
    expect(drawnSaid([{ made: ["a", "b", "c", "d"] }, { as: "drawn" }, { aside: "x", kind: "too many" }])).toBe("3 in · 5 out · 4 made from 1 · 1 set aside (1: too many)");
  });
});
