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

/** The configuration beside each block the step's drawing of a SMILES it made was given. */
const readAsked: unknown[] = [];
/** What the plugin was asked, and what it answers, by the test. */
const run = vi.fn<(step: string, entries: unknown[], options: Record<string, unknown>, holds: string, ms?: number) => Promise<unknown>>();
vi.mock("../../../../lib/calc/workers", async (actual) => ({
  ...(await actual<typeof import("../../../../lib/calc/workers")>()),
  pluginClient: async () => ({ run, version: "4.8.24" }),
}));

/**
 * The roles' worker: a SMILES read as its own block - a carbon, the SMILES its title (one it cannot read - "X" in it -
 * refused, saying why, as Sketchkit's is); and the elements a block leaves open - a centre for each "?" in the SMILES,
 * here - only those, never its stereoisomers tried ("stereoisomers" is not asked); one with "!" in it cannot be asked.
 */
const asked: { op: string; args: { smiles?: string; molblock?: string } }[] = [];
vi.mock("../../../../lib/roles/worker", async (actual) => ({
  ...(await actual<typeof import("../../../../lib/roles/worker")>()),
  rolePlugin: () => ({ id: "sketchkit", version: "0.1.8", name: "Sketchkit" }),
  chemWorker: async () => ({
    request: async (op: string, args: { smiles?: string; molblock?: string }) => {
      asked.push({ op, args });
      if (op === "from_smiles") {
        if (args.smiles!.includes("X")) throw new Error("This SMILES could not be read: X is no element.");
        return { molblock: `block:${args.smiles}\n  Meno\n\n  1  0  0  0  0  0  0  0  0  0999 V2000\n    0.0000    0.0000    0.0000 C   0  0\nM  END\n`, configuration: { centres: [], doubles: [{ bond: 0, ends: [0, 0], cis: true }] } };
      }
      if (op === "stereo_elements") {
        const block = (args as { molblocks: string[] }).molblocks[0];
        if (block.includes("!")) throw new Error("it could not be asked");
        const open = (block.match(/\?/g) ?? []).length;
        return { read: true, elements: Array.from({ length: open }, (_, i) => ({ kind: "centre", at: i, state: "unspecified" })) };
      }
      throw new Error(`no ${op} here`);
    },
  }),
}));

/** A drawing of a block, as Meno's engine lays one out: here a carbon labelled with the block, and an oxygen. */
vi.mock("../chem/fromSmiles", async (actual) => {
  const drawingOf = async (block: string): Promise<Model> => ({
    atoms: [{ id: 1, el: "C", x: 0, y: 0, label: block.split("\n")[0] } as never, { id: 2, el: "O", x: 1.5, y: 0 } as never],
    bonds: [{ id: 3, a: 1, b: 2, order: 1 } as never],
  });
  // (and the step's two ways of drawing what it made, each through that drawing)
  return {
    ...(await actual<typeof import("../chem/fromSmiles")>()),
    drawingOf,
    madeDrawn: (a: { made: readonly string[] }) => Promise.all(a.made.map((block) => drawingOf(block))),
    smilesMadeDrawn: (_smiles: string, read: { molblock: string; configuration?: unknown }) => (readAsked.push(read.configuration), drawingOf(read.molblock)),
  };
});

import { connectStoreToDocument, createEditorStore } from ".";
import { createWorkspaceDocument } from "../document";
import { useReaders } from "../../../../lib/calc/workers";

/** What Molgen's plugin gives: three SMILES as sampled - one leaving a centre open ("?" here), one Sketchkit cannot read - each with its NLL and SMILES_state; and what made them. */
const generated = {
  outputs: [
    { smiles: "CCO", properties: { nll: { value: 21.5, unit: "none" }, smiles_state: { value: 1, unit: "none" } } },
    { smiles: "CC(O)CC?", properties: { nll: { value: 30.25, unit: "none" }, smiles_state: { value: 1, unit: "none" } } },
    { smiles: "o1cXc", properties: { nll: { value: 27.4, unit: "none" }, smiles_state: { value: 0, unit: "none" } } },
  ],
  said: "3 sampled from molgen.prior, seed 7, CPU",
  by: { program: "Molgen", version: "4.8.24", model: "molgen.prior", method: "sampled, seed 7, on the CPU" },
};

function page() {
  const doc = createWorkspaceDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  const st = () => store.getState();
  return { doc, st };
}


describe("a step that makes SMILES hands their drawing the configuration the plugin read beside each block", () => {
  beforeEach(() => {
    run.mockReset();
    asked.length = 0;
    readAsked.length = 0;
    useReaders.setState({ state: { molgen: "added", sketchkit: "added" }, problem: {} });
  });
  it("Generate: each SMILES drawn from the configuration read of it", async () => {
    const { st } = page();
    const step = st().addStep("generate", "molgen", 0, 0);
    st().updateStep(step, { options: { count: 3, seed: 7 } });
    run.mockResolvedValueOnce(generated);
    await st().runStep(step);
    expect(readAsked).toEqual([{ centres: [], doubles: [{ bond: 0, ends: [0, 0], cis: true }] }, { centres: [], doubles: [{ bond: 0, ends: [0, 0], cis: true }] }]);
  });
});
