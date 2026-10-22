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
 * The roles' worker: a SMILES read as its own block (one it cannot read - "X" in it - refused, as RDKit's is); and
 * what a block leaves open - a centre for each "?" in the SMILES, here.
 */
const asked: { op: string; args: { smiles?: string; molblock?: string } }[] = [];
vi.mock("../../../../lib/roles/worker", async (actual) => ({
  ...(await actual<typeof import("../../../../lib/roles/worker")>()),
  rolePlugin: () => ({ id: "rdkit", version: "0.1.8", name: "RDKit" }),
  chemWorker: async () => ({
    request: async (op: string, args: { smiles?: string; molblock?: string }) => {
      asked.push({ op, args });
      if (op === "from_smiles") {
        if (args.smiles!.includes("X")) throw new Error("This SMILES could not be read.");
        return { molblock: `block:${args.smiles}` };
      }
      if (op === "open_stereo") {
        const open = (args.molblock!.match(/\?/g) ?? []).length;
        return { atoms: Array.from({ length: open }, (_, i) => i), bonds: [], isomers: 2 ** open, cumulenes: [], free: false };
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
import { resultOf, stateOf } from "../workflow/flow";
import { readGenerated } from "../workflow/programs";

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
    expect(ran).toMatchObject({ ok: true, said: "3 sampled from reinvent_pubchem.prior, seed 7, CPU · 2 made · 1 with stereo left open · 1 not read" });
    const out = resultOf(st(), step)!;
    expect(out.made!.holds).toBe("structures");
    const held = setMembers(st(), out);
    const labels = held.structures.map((ids) => (st().model.atoms.find((a) => a.id === ids[0]) as { label?: string } | undefined)?.label);
    expect(labels).toEqual(["block:CCO", "block:CC(O)CC?"]);
    // (each with its record: the SMILES as given, the model's values - named, as computed, by what made them - and what it leaves open)
    const by = { plugin: "reinvent", version: expect.any(String), program: "REINVENT 4 4.8.24", model: "reinvent_pubchem.prior", method: "sampled, seed 7, on the CPU" };
    expect(held.records[0]).toEqual({
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
    expect(st().steps.find((s) => s.id === step)!.ran).toMatchObject({ ok: false, said: "3 sampled from reinvent_pubchem.prior, seed 7, CPU · none could be read" });
    run.mockResolvedValueOnce({ outputs: [{ smiles: "CCO", properties: { nll: { value: 2, unit: "furlongs" } } }] });
    await st().runStep(step);
    expect(st().steps.find((s) => s.id === step)!.ran).toMatchObject({ ok: false, said: "Structure 1's nll is not one Meno can take" });
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
    expect(readGenerated({ outputs: [{ smiles: "" }] })).toBe("Structure 1 has no SMILES Meno can take");
    expect(readGenerated({ outputs: [{ smiles: "C", properties: { nll: { value: Infinity, unit: "none" } } }] })).toBe("Structure 1's nll is not one Meno can take");
    expect(readGenerated({ outputs: [{ smiles: "C", properties: [1] }] })).toBe("Structure 1's values are not named");
    expect(readGenerated({ outputs: Array(1001).fill({ smiles: "C" }) })).toBe("It made more than 1000");
    expect(readGenerated({})).toBe("It said nothing Meno can take");
  });
});
