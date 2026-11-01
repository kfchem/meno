/**
 * Generate, a step that takes nothing in (docs/PLUGINS.md, *Generate*): the
 * model's SMILES handed on as given, each read as one pasted is - its
 * stereo as written, what it leaves open counted and kept, never chosen -
 * each a structure drawn with its record: the SMILES, the model's own
 * values, named, and what made them; one that cannot be read counted as not
 * read.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Model } from "./types";

/** What the plugin was asked, and what it answers, by the test. */
const run = vi.fn<(step: string, entries: unknown[], options: Record<string, unknown>, holds: string, ms?: number) => Promise<unknown>>();
vi.mock("../../../../lib/calc/workers", async (actual) => ({
  ...(await actual<typeof import("../../../../lib/calc/workers")>()),
  pluginClient: async () => ({ run, version: "4.8.24" }),
}));

/**
 * The roles' worker: a SMILES read as its own block (one it cannot read - "X" in it - refused, saying why, as RDKit's
 * is); and what a block leaves open - a centre for each "?" in the SMILES, here - only where it is, never its
 * stereoisomers tried ("open_stereo" is not asked); one with "!" in it cannot be asked.
 */
const asked: { op: string; args: { smiles?: string; molblock?: string } }[] = [];
vi.mock("../../../../lib/roles/worker", async (actual) => ({
  ...(await actual<typeof import("../../../../lib/roles/worker")>()),
  rolePlugin: () => ({ id: "rdkit", version: "0.1.8", name: "RDKit" }),
  chemWorker: async () => ({
    request: async (op: string, args: { smiles?: string; molblock?: string }) => {
      asked.push({ op, args });
      if (op === "from_smiles") {
        if (args.smiles!.includes("X")) throw new Error("This SMILES could not be read: X is no element.");
        return { molblock: `block:${args.smiles}` };
      }
      if (op === "stereo_left_open") {
        if (args.molblock!.includes("!")) throw new Error("it could not be asked");
        const open = (args.molblock!.match(/\?/g) ?? []).length;
        return { atoms: Array.from({ length: open }, (_, i) => i), bonds: [] };
      }
      throw new Error(`no ${op} here`);
    },
  }),
}));

/** A drawing of a block, as Meno's engine lays one out: here a carbon labelled with the block, and an oxygen. */
vi.mock("../chem/fromSmiles", async (actual) => ({
  ...(await actual<typeof import("../chem/fromSmiles")>()),
  drawingOf: async (block: string): Promise<Model> => ({
    atoms: [{ id: 1, el: "C", x: 0, y: 0, label: block } as never, { id: 2, el: "O", x: 1.5, y: 0 } as never],
    bonds: [{ id: 3, a: 1, b: 2, order: 1 } as never],
  }),
}));

import { connectStoreToDocument, createEditorStore } from ".";
import { createWorkspaceDocument } from "../document";
import { useReaders } from "../../../../lib/calc/workers";
import { setMembers } from "../workflow/entries";
import { inputKey, resultOf, stateOf } from "../workflow/flow";
import { notReadSaid, readGenerated, seedsSaid, unreadWhy } from "../workflow/programs";
import { pluginById } from "../../../../lib/calc/catalog";

/** What REINVENT 4's plugin gives: three SMILES as sampled - one leaving a centre open ("?" here), one RDKit cannot read - each with its NLL and SMILES_state; and what made them. */
const generated = {
  outputs: [
    { smiles: "CCO", properties: { nll: { value: 21.5, unit: "none" }, smiles_state: { value: 1, unit: "none" } } },
    { smiles: "CC(O)CC?", properties: { nll: { value: 30.25, unit: "none" }, smiles_state: { value: 1, unit: "none" } } },
    { smiles: "o1cXc", properties: { nll: { value: 27.4, unit: "none" }, smiles_state: { value: 0, unit: "none" } } },
  ],
  said: "3 sampled from reinvent_pubchem.prior, seed 7, CPU",
  by: { program: "REINVENT 4", version: "4.8.24", model: "reinvent_pubchem.prior", method: "sampled, seed 7, on the CPU" },
};

function page() {
  const doc = createWorkspaceDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  const st = () => store.getState();
  return { doc, st };
}

describe("Generate: a step that takes nothing in", () => {
  beforeEach(() => {
    run.mockReset();
    asked.length = 0;
    useReaders.setState({ state: { reinvent: "added", rdkit: "added" }, problem: {} });
  });

  it("is ready with nothing wired in, runs on its options alone, and brings in each SMILES as a structure drawn, as given", async () => {
    const { st } = page();
    const step = st().addStep("generate", "reinvent", 0, 0);
    st().updateStep(step, { options: { count: 3, seed: 7 } });
    expect(stateOf(st(), st().steps.find((s) => s.id === step)!, "reinvent")).toBe("ready");
    run.mockResolvedValueOnce(generated);
    await st().runStep(step);
    // (with ten minutes to take, not a request's two: a busy computer fails no sound run)
    expect(run).toHaveBeenCalledWith("generate", [], { count: 3, seed: 7 }, "structures", 600_000);
    // (each SMILES read exactly as the model gave it)
    expect(asked.filter((a) => a.op === "from_smiles").map((a) => a.args.smiles)).toEqual(["CCO", "CC(O)CC?", "o1cXc"]);
    const ran = st().steps.find((s) => s.id === step)!.ran!;
    expect(ran).toMatchObject({ ok: true, said: "3 sampled from reinvent_pubchem.prior, seed 7, CPU · 2 made · 1 with stereo left open · 1 not read: o1cXc (X is no element)" });
    // (only where stereo is left open was asked, never each stereoisomer tried in 3D)
    expect(asked.some((a) => a.op === "open_stereo")).toBe(false);
    const out = resultOf(st(), step)!;
    expect(out.made!.holds).toBe("structures");
    const held = setMembers(st(), out);
    const labels = held.structures.map((ids) => (st().model.atoms.find((a) => a.id === ids[0]) as { label?: string } | undefined)?.label);
    expect(labels).toEqual(["block:CCO", "block:CC(O)CC?"]);
    // (each with its record: the SMILES as given, the model's values - named, as computed, by what made them - and what it leaves open)
    const by = { plugin: "reinvent", version: expect.any(String), program: "REINVENT 4 4.8.24", model: "reinvent_pubchem.prior", method: "sampled, seed 7, on the CPU" };
    expect(held.records[0]).toEqual({
      of: expect.any(String),
      properties: {
        smiles: { value: "CCO", unit: "none", status: "computed", by },
        nll: { value: 21.5, unit: "none", status: "computed", by },
        smiles_state: { value: 1, unit: "none", status: "computed", by },
      },
    });
    expect(held.records[1]!.properties!.stereo_open).toEqual({ value: 1, unit: "none", status: "computed", by: { plugin: "rdkit" } });
    expect(held.records[0]!.properties!.stereo_open).toBeUndefined();
    // (done, as nothing it runs on has changed; changed once its options do)
    expect(stateOf(st(), st().steps.find((s) => s.id === step)!, "reinvent")).toBe("done");
    st().updateStep(step, { options: { count: 4, seed: 7 } });
    expect(stateOf(st(), st().steps.find((s) => s.id === step)!, "reinvent")).toBe("changed");
  });

  it("takes no wire, and fails - saying why - where nothing it gave could be read, or what it gave is not what Meno takes", async () => {
    const { st } = page();
    const set = st().addSet({ x0: -3, y0: -3, x1: 3, y1: 3 });
    const step = st().addStep("generate", "reinvent", 0, 0);
    st().connect({ set }, step);
    expect(st().wires ?? []).toEqual([]);
    run.mockResolvedValueOnce({ ...generated, outputs: [generated.outputs[2]] });
    await st().runStep(step);
    expect(st().steps.find((s) => s.id === step)!.ran).toMatchObject({ ok: false, said: "3 sampled from reinvent_pubchem.prior, seed 7, CPU · none could be read · 1 not read: o1cXc (X is no element)" });
    run.mockResolvedValueOnce({ outputs: [{ smiles: "CCO", properties: { nll: { value: 2, unit: "furlongs" } } }] });
    await st().runStep(step);
    expect(st().steps.find((s) => s.id === step)!.ran).toMatchObject({ ok: false, said: "Structure 1's nll is not one Meno can take" });
  });

  it("takes Seeds where its plugin makes from seeds - structures drawn, each given as its blocks - and each made one keeps what its seed came from and its values, as that one's", async () => {
    useReaders.setState({ state: { crem: "added", rdkit: "added" }, problem: {} });
    const { doc, st } = page();
    // (two seeds drawn: C-O and C-N, apart; the first with a record of its own, as a step before gave it)
    doc.edit("draw", (d) => ({
      ...d,
      model: {
        atoms: [
          { id: 1, el: "C", x: 0, y: 0, r: 0.9 },
          { id: 2, el: "O", x: 1.3, y: 0, r: 0.9 },
          { id: 3, el: "C", x: 12, y: 0, r: 0.9 },
          { id: 4, el: "N", x: 13.3, y: 0, r: 0.9 },
        ] as never,
        bonds: [
          { id: 5, a: 1, b: 2, order: 1 },
          { id: 6, a: 3, b: 4, order: 1 },
        ] as never,
      },
      nextId: 100,
    }));
    const set = st().addSet({ x0: -3, y0: -3, x1: 16, y1: 3 });
    const nll = { value: 21.5, unit: "none" as const, status: "computed" as const, by: { plugin: "reinvent" } };
    doc.edit("records", (d) => ({
      ...d,
      sets: d.sets!.map((b) =>
        b.id === set ? { ...b, members: b.members!.map((m, i) => ("structure" in m && i === 0 ? { ...m, record: { from: ["molecule:7"], properties: { nll, made: { ...nll, value: "1 of 2" } } } } : m)) } : b,
      ),
    }));
    const step = st().addStep("generate", "crem", 20, 0);
    // (nothing wired in: it waits for its seeds - a model's Generate is ready as it is)
    expect(stateOf(st(), st().steps.find((s) => s.id === step)!, "crem")).toBe("no-input");
    st().connect({ set }, step);
    expect(st().wires).toHaveLength(1);
    expect(stateOf(st(), st().steps.find((s) => s.id === step)!, "crem")).toBe("ready");
    run.mockResolvedValueOnce({
      outputs: [
        { smiles: "CCO", properties: { frequency: { value: 120, unit: "none" }, change: { value: "[H][*:1]>>C[*:1]", unit: "none" } }, seed: 0 },
        { smiles: "CCN", properties: { frequency: { value: 45, unit: "none" }, change: { value: "[H][*:1]>>N[*:1]", unit: "none" } }, seed: 1 },
      ],
      seeds: [
        { place: 0, made: 1 },
        { place: 1, made: 1 },
      ],
      said: "2 made from 2 seeds (fragments replaced, radius 3, seed 1)",
      by: { program: "CReM", version: "0.3.2", model: "chembl33_sa2_f5", method: "fragments replaced, radius 3, seed 1" },
    });
    await st().runStep(step);
    const [, given, , holds] = run.mock.calls[0];
    expect(holds).toBe("structures");
    expect((given as { molblocks: string[] }[]).map((g) => g.molblocks.length)).toEqual([1, 1]);
    expect(st().steps.find((s) => s.id === step)!.ran).toMatchObject({ ok: true, said: "2 made from 2 seeds (fragments replaced, radius 3, seed 1) · 2 made" });
    const held = setMembers(st(), resultOf(st(), step)!);
    // (the first seed's: what it came from, its values as that one's - never which of how many it was - beside the model's own)
    expect(held.records[0]).toMatchObject({ from: ["molecule:7"], properties: { "made_from.nll": nll, frequency: expect.objectContaining({ value: 120 }), change: expect.objectContaining({ value: "[H][*:1]>>C[*:1]" }) } });
    expect(held.records[0]!.properties!.nll).toBeUndefined();
    expect(held.records[0]!.properties!["made_from.made"]).toBeUndefined();
    // (the second seed had no record: nothing of it carried but what the plugin said of it)
    expect(held.records[1]!.from).toBeUndefined();
    expect(Object.keys(held.records[1]!.properties!).sort()).toEqual(["change", "frequency", "smiles"]);
    // (another seed wired in: another run)
    const before = inputKey(st(), st().steps.find((s) => s.id === step)!, "crem");
    doc.edit("move", (d) => ({ ...d, model: { ...d.model, bonds: d.model.bonds.map((b) => (b.id === 6 ? { ...b, order: 2 } : b)) } }));
    expect(inputKey(st(), st().steps.find((s) => s.id === step)!, "crem")).not.toBe(before);
    // (a seed it could not read: named on the line, from the tally - not from what it said)
    run.mockResolvedValueOnce({
      outputs: [{ smiles: "CCO", properties: {}, seed: 0 }],
      seeds: [
        { place: 0, made: 1 },
        { place: 1, why: "a part RDKit cannot read" },
      ],
      said: "1 made from 1 seed",
      by: { program: "CReM" },
    });
    await st().runStep(step);
    expect(st().steps.find((s) => s.id === step)!.ran).toMatchObject({ ok: true, said: "1 made from 1 seed · seed 2 not read: a part RDKit cannot read · 1 made" });
  });

  it("names the seeds a generator made none of, or could not read, by their numbers - from its tally, one for each seed", () => {
    const tally = (made: (number | string)[]) => made.map((m, place) => (typeof m === "number" ? { place, made: m } : { place, why: m }));
    expect(seedsSaid(tally([3, 0, "a part RDKit cannot read", 2, 0]))).toBe("seeds 2 and 5 made none; seed 3 not read: a part RDKit cannot read");
    expect(seedsSaid(tally([0, 0, 0, 0, 0, 0, 0, 1]))).toBe("seeds 1, 2, 3, 4, 5 and 2 more made none");
    expect(seedsSaid(tally([1, 2]))).toBe("");
    // (a tally not one for each seed, in their order, or neither made nor why: none of the run taken)
    const out = { outputs: [{ smiles: "C" }] };
    expect(readGenerated({ ...out, seeds: [{ place: 0, made: 1 }] }, 2)).toBe("Its seeds are not told one by one");
    expect(readGenerated({ ...out, seeds: [{ place: 1, made: 1 }] }, 1)).toBe("Its seeds are not told one by one");
    expect(readGenerated({ ...out, seeds: [{ place: 0 }] }, 1)).toBe("Seed 1 is told neither made nor why not");
    expect(readGenerated({ ...out, seeds: [{ place: 0, made: 1 }] }, 1)).toMatchObject({ seeds: [{ place: 0, made: 1 }] });
    // (every one, where the line is pointed at)
    expect(seedsSaid(tally([0, 0, 0, 0, 0, 0, 0, 1]), Infinity)).toBe("seeds 1, 2, 3, 4, 5, 6 and 7 made none");
  });

  it("from seeds: fails where the plugin does not tell each seed, names each where none was read, and keeps every one the line only counts", async () => {
    useReaders.setState({ state: { crem: "added", rdkit: "added" }, problem: {} });
    const { doc, st } = page();
    // (seven seeds drawn, each C-O, apart)
    doc.edit("draw", (d) => ({
      ...d,
      model: {
        atoms: Array.from({ length: 7 }, (_, k) => [
          { id: 10 * k + 1, el: "C", x: 6 * k, y: 0, r: 0.9 },
          { id: 10 * k + 2, el: "O", x: 6 * k + 1.3, y: 0, r: 0.9 },
        ]).flat() as never,
        bonds: Array.from({ length: 7 }, (_, k) => ({ id: 10 * k + 3, a: 10 * k + 1, b: 10 * k + 2, order: 1 })) as never,
      },
      nextId: 100,
    }));
    const set = st().addSet({ x0: -3, y0: -3, x1: 42, y1: 3 });
    const step = st().addStep("generate", "crem", 50, 0);
    st().connect({ set }, step);
    const ran = () => st().steps.find((s) => s.id === step)!.ran!;
    // (no tally: not taken - what became of each seed would go unsaid)
    run.mockResolvedValueOnce({ outputs: [{ smiles: "CCO", properties: {}, seed: 0 }], said: "1 made", by: { program: "CReM" } });
    await st().runStep(step);
    expect(ran()).toMatchObject({ ok: false, said: "Its seeds are not told one by one" });
    // (none read: failed, each seed named with why, from the tally)
    const why = (place: number) => ({ place, why: place % 2 ? "it is a label of no element" : "a part RDKit cannot read" });
    run.mockResolvedValueOnce({ outputs: [], seeds: Array.from({ length: 7 }, (_, k) => why(k)), said: "No seed could be read", by: { program: "CReM" } });
    await st().runStep(step);
    expect(ran()).toMatchObject({ ok: false, said: "No seed could be read · seeds 1, 3, 5 and 7 not read: a part RDKit cannot read; seeds 2, 4 and 6 not read: it is a label of no element" });
    // (six made none: five named on the line, the sixth counted - and every one kept, shown where the line is pointed at)
    run.mockResolvedValueOnce({
      outputs: [{ smiles: "CCO", properties: {}, seed: 0 }],
      seeds: Array.from({ length: 7 }, (_, k) => ({ place: k, made: k === 0 ? 1 : 0 })),
      said: "1 made from 7 seeds",
      by: { program: "CReM" },
    });
    await st().runStep(step);
    expect(ran()).toMatchObject({ ok: true, said: "1 made from 7 seeds · seeds 2, 3, 4, 5, 6 and 1 more made none · 1 made", named: "seeds 2, 3, 4, 5, 6 and 7 made none" });
  });
});

describe("what a Generate could not read, and its stereo not examined", () => {
  it("names the first few not read, each with why, and counts the rest; keeps one whose stereo could not be asked, saying so", async () => {
    expect(unreadWhy("This SMILES could not be read: a ring left open.")).toBe("a ring left open");
    expect(unreadWhy("something else")).toBe("not read");
    const seven = Array.from({ length: 7 }, (_, i) => ({ smiles: `X${i}`, why: "X is no element" }));
    expect(notReadSaid(seven)).toBe("7 not read: X0 (X is no element), X1 (X is no element), X2 (X is no element), X3 (X is no element), X4 (X is no element), and 2 more");
    expect(notReadSaid([{ smiles: "C".repeat(50), why: "w" }])).toBe(`1 not read: ${"C".repeat(39)}\u2026 (w)`);
    const { st } = page();
    const step = st().addStep("generate", "reinvent", 0, 0);
    run.mockResolvedValueOnce({ ...generated, outputs: [generated.outputs[0], { smiles: "CC!", properties: {} }] });
    await st().runStep(step);
    expect(st().steps.find((s) => s.id === step)!.ran).toMatchObject({ ok: true, said: "3 sampled from reinvent_pubchem.prior, seed 7, CPU · 2 made · 1 with stereo not examined" });
  });

  it("is keyed by its plugin's version and the files it was set up with: another prior is another run", () => {
    const { st, doc } = page();
    const step = st().addStep("generate", "reinvent", 0, 0);
    const key = () => inputKey(doc.getState(), doc.getState().steps!.find((s) => s.id === step)!, "reinvent");
    const plugin = pluginById("reinvent")! as unknown as { version: string; downloads: { sha256: string }[] };
    const [version, sha] = [plugin.version, plugin.downloads[0].sha256];
    const before = key();
    try {
      plugin.version = "9.9.9";
      expect(key()).not.toBe(before);
      plugin.version = version;
      plugin.downloads[0].sha256 = "0".repeat(64);
      expect(key()).not.toBe(before);
    } finally {
      plugin.version = version;
      plugin.downloads[0].sha256 = sha;
    }
    expect(key()).toBe(before);
  });
});

describe("what a Generate gives, read", () => {
  it("takes each SMILES as given, its values named, a seed only where one came in - else none of it", () => {
    expect(readGenerated({ outputs: [{ smiles: " C[C@H](O)CC ", properties: { nll: { value: 3, unit: "none" }, sim: { value: 0.5, unit: "none" } }, seed: 1 }], by: { program: "P", junk: 3 } }, 2)).toEqual({
      made: [{ smiles: "C[C@H](O)CC", properties: { nll: { value: 3, unit: "none" }, sim: { value: 0.5, unit: "none" } }, seed: 1 }],
      by: { program: "P" },
      said: "1 made",
    });
    expect(readGenerated({ outputs: [{ smiles: "C", seed: 0 }] }, 0)).toBe("Structure 1 names a seed that did not come in");
    // (a value the model gave none of - an NLL that was no number, written as none - not kept, the rest taken)
    expect(readGenerated({ outputs: [{ smiles: "C", properties: { nll: { value: null, unit: "none" }, smiles_state: { value: 1, unit: "none" } } }] })).toMatchObject({ made: [{ smiles: "C", properties: { smiles_state: { value: 1, unit: "none" } } }] });
    expect(readGenerated({ outputs: [{ smiles: "" }] })).toBe("Structure 1 has no SMILES Meno can take");
    expect(readGenerated({ outputs: [{ smiles: "C", properties: { nll: { value: Infinity, unit: "none" } } }] })).toBe("Structure 1's nll is not one Meno can take");
    expect(readGenerated({ outputs: [{ smiles: "C", properties: [1] }] })).toBe("Structure 1's values are not named");
    expect(readGenerated({ outputs: Array(1001).fill({ smiles: "C" }) })).toBe("It made more than 1000");
    expect(readGenerated({})).toBe("It said nothing Meno can take");
  });
});
