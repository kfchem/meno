/**
 * Steps on structures drawn: a plugin's at once in its worker - *Descriptors*,
 * Sketchkit's (docs/PLUGINS.md, *Steps on structures drawn*) - *Check structures*,
 * Meno's on the facts the plugin that does the checks gives
 * (workflow/checkStructures), and *Stereoisomers*, Meno's on what the plugin
 * that finds stereoisomers perceives and makes, one at a time
 * (workflow/stereoisomers, its answers scripted here): each
 * structure given as its MOL blocks; what is said of each taken in, in their
 * order - kept as drawn, made anew (each drawing read as a SMILES's is), or
 * set aside, its record saying why; each made one with the record of the one
 * it was made of; nothing taken in part.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Atom, DrawnRecord, Model } from "./types";

/** What the step's drawing of what it made was asked. */
const madeAsked: { made: readonly string[]; configurations?: unknown }[] = [];
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

/** What Meno's *Stereoisomers* was asked of each structure - its blocks, the step's options, the toolkit - and what it says, by the test (`answer`'s, in turn). */
const stereoAsked: { molblocks: readonly string[]; options: Record<string, unknown>; program: string }[] = [];
vi.mock("../workflow/stereoisomers", async (actual) => ({
  ...(await actual<typeof import("../workflow/stereoisomers")>()),
  stereoisomersAnswer: async (_chem: unknown, molblocks: readonly string[], options: Record<string, unknown>, program: string) => {
    stereoAsked.push({ molblocks, options, program });
    return (answer([]) as { structures: unknown[] }).structures[stereoAsked.length - 1];
  },
}));

vi.mock("../../../../lib/roles/worker", async (actual) => ({
  ...(await actual<typeof import("../../../../lib/roles/worker")>()),
  rolePlugin: () => ({ id: "sketchkit", name: "Sketchkit", version: "0.3.0", uses: [{ name: "Sketchkit", version: "1" }] }),
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
vi.mock("../chem/fromSmiles", async (actual) => {
  const drawingOf = async (block: string): Promise<Model> => {
    if (block === "undrawable") throw new Error("it could not be laid out");
    return {
      atoms: [{ id: 1, el: "C", x: 0, y: 0, label: block } as never, { id: 2, el: "O", x: 1.5, y: 0 } as never],
      bonds: [{ id: 3, a: 1, b: 2, order: 1 } as never],
    };
  };
  // (and the step's two ways of drawing what it made, each through that drawing)
  return {
    ...(await actual<typeof import("../chem/fromSmiles")>()),
    drawingOf,
    madeDrawn: (a: { made: readonly string[]; configurations?: unknown }) => (madeAsked.push({ made: a.made, configurations: a.configurations }), Promise.all(a.made.map((block) => drawingOf(block)))),
    smilesMadeDrawn: (_smiles: string, read: { molblock: string }) => drawingOf(read.molblock),
  };
});

import { connectStoreToDocument, createEditorStore } from ".";
import { createWorkspaceDocument } from "../document";
import { useReaders } from "../../../../lib/calc/workers";
import { PLUGINS } from "../../../../lib/calc/catalog";
import { setMembers, drawnHash } from "../workflow/entries";
import { resultOf } from "../workflow/flow";

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

/** A step of `kind` on the three - Sketchkit's, or Meno's Check structures - its set's members given `records` where any; run. */
async function ran(kind: "stereoisomers" | "check-structures" | "descriptors", records: (DrawnRecord | undefined)[] = [], bare = false) {
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
  // (Check structures and Stereoisomers Meno's, on the plugins' facts; Descriptors Sketchkit's)
  stereoAsked.length = 0;
  const step = st().addStep(kind, kind === "descriptors" ? "sketchkit" : "meno", 0, 0);
  // (one put down otherwise than on the canvas - a template's: no options of its own)
  if (bare) doc.edit("bare", (d) => ({ ...d, steps: d.steps!.map((x) => (x.id === step ? { ...x, options: undefined } : x)) }));
  st().connect({ set }, step);
  await st().runStep(step);
  const d = doc.getState();
  // (each record as compared: without what it is of - each one placed is of its own structure, which its key says - nor its lasting id, each one
  //  given one: workflow/lasting.test)
  const exit = (id: string) => {
    const b = resultOf(d, step, id);
    if (!b) return null;
    const held = setMembers(d, b);
    for (const [i, r] of held.records.entries()) if (r) expect([r.of, typeof r.id]).toEqual([drawnHash(d.model, held.structures[i]), "string"]);
    return { ...held, records: held.records.map((r) => r && (({ of: _of, id: _id, ...rest }) => (Object.keys(rest).length ? rest : undefined))(r)) };
  };
  return { step: d.steps!.find((s) => s.id === step)!, out: exit("out"), rest: exit("rest"), model: d.model };
}


describe("a step that makes structures hands their drawing the configurations its answer carried", () => {
  beforeEach(() => {
    asked.length = 0;
    madeAsked.length = 0;
    facts = (structures) => structures.map(() => FINE);
  });
  it("Stereoisomers: each made one drawn from its own configuration", async () => {
    const first = { centres: [{ atom: 1, neighbours: [0, 2, 4], sense: -1 }], doubles: [] };
    const second = { centres: [{ atom: 1, neighbours: [0, 2, 4], sense: 1 }], doubles: [] };
    answer = () => ({ structures: [{ as: "drawn" }, { made: ["iso-1", "iso-2"], smiles: ["C[C@@H](O)CC", "C[C@H](O)CC"], configurations: [first, second] }, { as: "drawn" }] });
    await ran("stereoisomers");
    expect(madeAsked).toEqual([{ made: ["iso-1", "iso-2"], configurations: [first, second] }]);
  });
});
