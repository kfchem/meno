/**
 * RDKit's conformer search as a workflow's step, on structures drawn
 * (docs/WORKFLOWS.md, *Kinds of step*): one structure it cannot make in 3D
 * leaves the others made, and is said by its place in words - never in the
 * library's own text; one whose drawing leaves stereo open is not made, a
 * configuration never chosen for it; and the search is the one *3D structures* makes,
 * with the options chosen in Settings, Chemistry, on its 3D card.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readMolfile } from "../../../../lib/chem/ctfile";

/** What RDKit's worker was asked: each structure's molblock, and the options it was given. */
const asked: { molblock: string; options: Record<string, unknown> }[] = [];
/**
 * How many times RDKit's worker was taken; whether it makes none of methanol, saying nothing of why; whether it
 * holds each structure until stopped, and those it was stopped for; and the structures whose drawing it says leaves
 * stereo open, by what they hold - methanol, or every one.
 */
const worker = { taken: 0, noneOfMethanol: false, holds: false, stopped: [] as string[], open: "" as "" | "methanol" | "all", openAs: {} as { isomers?: number; cumulenes?: number[]; free?: boolean } };
/** Whether a molblock is methanol's, C and O. */
const methanol = (mol: { atoms: { symbol: string }[] }) => mol.atoms.some((a) => a.symbol === "O") && mol.atoms.some((a) => a.symbol === "C");
/** What a held request is let go with: the worker stopped. */
let letGo: ((e: Error) => void) | null = null;

vi.mock("../../../../lib/plugins/process", async (actual) => ({
  ...(await actual<typeof import("../../../../lib/plugins/process")>()),
  stopWorker: async (plugin: string, reason: string) => {
    worker.stopped.push(plugin);
    letGo?.(new Error(reason));
  },
}));

vi.mock("../../../../lib/roles/worker", async (actual) => ({
  ...(await actual<typeof import("../../../../lib/roles/worker")>()),
  pluginWorker: async () => {
    worker.taken++;
    // (the worker goes with the one it cannot make - held past its time, it is stopped: what is asked of it after is refused)
    let gone = false;
    return {
      request: async (op: string, payload: { molblock: string; options: Record<string, unknown> }) => {
        if (gone) throw new Error("The worker was stopped");
        // (what a structure's drawing leaves open: a stereocentre, here, where it is said to)
        if (op === "open_stereo") {
          const open = worker.open === "all" || (worker.open === "methanol" && methanol(readMolfile(payload.molblock)!));
          return open ? { atoms: [0], bonds: [], isomers: 2, cumulenes: [], free: false, ...worker.openAs } : { atoms: [], bonds: [], isomers: 1, cumulenes: [], free: false };
        }
        if (op !== "conformers") throw new Error(`no ${op} here`);
        asked.push(payload);
        if (worker.holds) await new Promise((_, reject) => (letGo = reject));
        const mol = readMolfile(payload.molblock)!;
        // (one RDKit cannot make: it says so in its own words)
        if (mol.atoms.length === 2 && mol.atoms.every((a) => a.symbol === "C")) {
          gone = true;
          throw new Error("Invariant Violation\n\texpected match not found");
        }
        if (worker.noneOfMethanol && methanol(mol)) return { isomers: [] };
        const xyz = mol.atoms.flatMap((a) => [a.x, a.y, 0.1]);
        return {
          isomers: [
            {
              atoms: mol.atoms.map((a) => ({ el: a.symbol, charge: a.charge ?? 0 })),
              bonds: mol.bonds.map((b) => ({ a1: b.a1, a2: b.a2, order: b.type })),
              frames: [xyz],
              energies: [-0.01],
              field: "MMFF94",
              cip: { atoms: {}, bonds: {} },
              chosen: { atoms: {}, bonds: {} },
              smiles: "",
            },
          ],
        };
      },
    };
  },
}));

import { connectStoreToDocument, createEditorStore } from ".";
import { createWorkspaceDocument } from "../document";
import type { Atom } from "./types";
import { drawnFromSmiles } from "../chem/testdata/identityCases";
import { useReaders } from "../../../../lib/calc/workers";
import { PLUGINS } from "../../../../lib/calc/catalog";
import { useAppSettings } from "../../../../lib/settings/appSettings";
import { optionsFor } from "../workflow/doers";
import { kindInfo } from "../workflow/kinds";
import { notMade, stereoFree, stereoOpen } from "./slices/stepRuns";

useReaders.setState({ state: Object.fromEntries(PLUGINS.map((p) => [p.id, "added" as const])), problem: {} });

/** Three structures drawn side by side - water, ethane (which RDKit, here, cannot make) and methanol - and a conformer search by RDKit on them. */
async function searched(meanwhile?: (st: () => ReturnType<ReturnType<typeof createEditorStore>["getState"]>, step: number) => Promise<void>) {
  const doc = createWorkspaceDocument();
  const parts: { el: string; at: [number, number] }[][] = [
    [{ el: "O", at: [0, 0] }],
    [
      { el: "C", at: [0, 0] },
      { el: "C", at: [1.5, 0] },
    ],
    [
      { el: "C", at: [0, 0] },
      { el: "O", at: [1.5, 0] },
    ],
  ];
  doc.edit("draw", (d) => {
    const atoms: Atom[] = [];
    const bonds = [...d.model.bonds];
    parts.forEach((p, i) => {
      const base = 100 * (i + 1);
      p.forEach((a, k) => atoms.push({ id: base + k, el: a.el, x: -400 + 12 * i + a.at[0], y: a.at[1], r: 0.9 }));
      // (water as O with two H drawn: a structure needs a bond to be made in 3D)
      if (p.length === 1) {
        atoms.push({ id: base + 1, el: "H", x: -400 + 12 * i + 1, y: 0.8, r: 0.9 }, { id: base + 2, el: "H", x: -400 + 12 * i - 1, y: 0.8, r: 0.9 });
        bonds.push({ id: base + 50, a: base, b: base + 1, order: 1 }, { id: base + 51, a: base, b: base + 2, order: 1 });
      } else bonds.push({ id: base + 50, a: base, b: base + 1, order: 1 });
    });
    return { ...d, model: { atoms: [...d.model.atoms, ...atoms], bonds }, nextId: 1000 };
  });
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  const st = () => store.getState();
  const set = st().addSet({ x0: -500, y0: -50, x1: -10, y1: 50 });
  const step = st().addStep("conformers", "rdkit", 0, 0);
  st().connect({ set }, step);
  const run = st().runStep(step);
  await meanwhile?.(st, step);
  await run;
  // (the sets that hold what was put in: the one that came in, and its exit's once it has run)
  return { step: st().steps.find((s) => s.id === step)!, sets: st().sets.filter((b) => !b.made || b.made.holds).length };
}

describe("RDKit's conformer search as a step, on structures drawn", () => {
  beforeEach(() => {
    asked.length = 0;
    Object.assign(worker, { taken: 0, noneOfMethanol: false, holds: false, stopped: [], open: "", openAs: {} });
    letGo = null;
  });

  it("is stopped as Meno's steps are: said to be working, its worker stopped, nothing put in, and said to have stopped", async () => {
    worker.holds = true;
    const { step, sets } = await searched(async (st, id) => {
      // (working on its first structure, as Meno's steps are said to be)
      await vi.waitFor(() => expect(asked).toHaveLength(1));
      expect(st().menoWorking[id]).toMatchObject({ done: 0, total: 3 });
      st().stopStep(id);
    });
    expect(worker.stopped).toEqual(["rdkit"]);
    expect(asked).toHaveLength(1);
    expect(step.ran).toMatchObject({ ok: false, stopped: true });
    expect(step.ran?.said).toMatch(/^Stopped after /);
    // (no result set: only the set that came in)
    expect(sets).toBe(1);
  });

  it("makes the others where one cannot be made, and says which by its place - never in the library's words", async () => {
    const { step } = await searched();
    expect(asked).toHaveLength(3);
    // (the one after it asked of a worker taken again: the one asked before went with it)
    expect(worker.taken).toBe(2);
    expect(step.ran?.ok).toBe(true);
    expect(step.ran?.said).toMatch(/2 conformers of 2 compounds · structure 2 of 3 could not be made in 3D$/);
    expect(step.ran?.said).not.toMatch(/Invariant|expected match/);
  });

  it("takes the structures a large result set holds off the page, each made in 3D linked to no drawing: their ids are none of the page's", async () => {
    const doc = createWorkspaceDocument();
    // (a template of the chemist's, an aryl ether R1-O-Ar-R2, enumerated 3 x 17 = 51 ways, none the same: more than are laid out, so held in its set)
    const drawn = drawnFromSmiles("*Oc1ccc(*)cc1");
    let r = 0;
    const model = { ...drawn, atoms: drawn.atoms.map((a) => (a.el === "*" ? { ...a, el: "R#", rgroups: [++r] } : a)) };
    const r2 = ["F", "Cl", "Br", "I", "*C", "*CC", "*CCC", "*C(C)C", "*C#N", "*N", "*C=O", "*C(F)(F)F", "*S", "*C(=O)C", "*N(C)C", "*C=C", "*C#C"];
    const lists = `R1: *C\n*CC\n*CCC\nR2: ${r2.join("\n")}`;
    doc.edit("draw", (d) => ({ ...d, model, nextId: 5000 }));
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    const st = () => store.getState();
    const template = st().addSet({ x0: -50, y0: -50, x1: 50, y1: 50 });
    const enumerate = st().addStep("enumerate", "meno", 80, 0);
    doc.edit("options", (d) => ({ ...d, steps: d.steps!.map((s) => (s.id === enumerate ? { ...s, options: { lists } } : s)) }));
    st().connect({ set: template }, enumerate);
    const step = st().addStep("conformers", "rdkit", 200, 0);
    // (wired from Enumerate's exit once there is one to wire from: the chain run, Enumerate first)
    await st().runStep(enumerate);
    const held = st().sets.find((b) => b.made?.step === enumerate && b.made.exit === "out")!;
    expect(held.drawnCollection).toHaveLength(51);
    expect(doc.getState().model.atoms).toHaveLength(model.atoms.length);
    st().connect({ set: held.id }, step);
    await st().runStep(step);
    expect(asked).toHaveLength(51);
    expect(st().steps.find((s) => s.id === step)!.ran?.said).toMatch(/ · 51 conformers of 51 compounds$/);
    const made = st().sets.find((b) => b.made?.step === step && b.made.exit === "out")!.collection!;
    expect(made).toHaveLength(51);
    expect(made.every((m) => m.drawnFrom === undefined && m.drawnAs === undefined)).toBe(true);
  });

  it("says one of which none was made as one not made", async () => {
    worker.noneOfMethanol = true;
    const { step } = await searched();
    expect(step.ran?.said).toMatch(/ · 1 conformer · structures 2 and 3 of 3 could not be made in 3D$/);
  });

  it("never chooses a configuration the drawing leaves open: that structure is not made, and is said by its place", async () => {
    worker.open = "methanol";
    const { step } = await searched();
    // (methanol never asked for conformers: only water, and ethane, which RDKit cannot make here)
    expect(asked.map((a) => readMolfile(a.molblock)!.atoms.length)).toEqual([3, 2]);
    expect(step.ran?.ok).toBe(true);
    expect(step.ran?.said).toMatch(/ · 1 conformer · structure 2 of 3 could not be made in 3D · structure 3 of 3 leaves stereo open: draw it, wedges and all$/);
  });

  it("makes one whose open stereo can go one way only in 3D - a bridgehead its rings fix: no choice was made", async () => {
    worker.open = "methanol";
    worker.openAs = { isomers: 1 };
    const { step } = await searched();
    expect(asked.map((a) => readMolfile(a.molblock)!.atoms.length)).toEqual([3, 2, 2]);
    expect(step.ran?.said).toMatch(/ · 2 conformers of 2 compounds · structure 2 of 3 could not be made in 3D$/);
  });

  it("makes one whose open stereo no stereoisomer holds in 3D, and says it was made with its stereo free", async () => {
    worker.open = "methanol";
    worker.openAs = { isomers: 1, free: true };
    const { step } = await searched();
    expect(asked).toHaveLength(3);
    expect(step.ran?.said).toMatch(/ · 2 conformers of 2 compounds · structure 2 of 3 could not be made in 3D · structure 3 of 3 made with its stereo free: no stereoisomer of it holds in 3D$/);
  });

  it("never makes one with an allene's axis left open: its stereoisomers are not counted, so one could be chosen unseen", async () => {
    worker.open = "methanol";
    worker.openAs = { isomers: 1, cumulenes: [0] };
    const { step } = await searched();
    expect(asked.map((a) => readMolfile(a.molblock)!.atoms.length)).toEqual([3, 2]);
    expect(step.ran?.said).toMatch(/ · structure 3 of 3 leaves stereo open: draw it, wedges and all$/);
  });

  it("fails where every structure leaves stereo open, saying so - nothing made, no conformer asked for", async () => {
    worker.open = "all";
    const { step, sets } = await searched();
    expect(asked).toHaveLength(0);
    expect(step.ran).toMatchObject({ ok: false, said: "Structures 1, 2 and 3 of 3 leave stereo open: draw it, wedges and all" });
    expect(sets).toBe(1);
  });

  it("is given the options chosen in Settings, Chemistry, on its 3D card, as 3D structures on the canvas is", async () => {
    useAppSettings.setState((s) => ({ ...s, options: { ...s.options, "role:conformers": { count: 12, field: "UFF" } } }));
    await searched();
    expect(asked[0].options).toMatchObject({ sought: "needed", count: 12, field: "UFF", iters: 2000, seed: 19781 });
    // (offered on the step's card as its own, those chosen in Settings its defaults - how many sought among
    //  them: as many as the molecule needs, or a number, which is shown only when a number is asked for)
    const offered = optionsFor("conformers", "rdkit");
    expect(offered.map((o) => o.id)).toEqual(["sought", "count", "field", "iters", "seed"]);
    expect(offered.find((o) => o.id === "count")?.default).toBe(12);
  });

  it("leaves a step whose plugin declares options of its own for it as it was", () => {
    expect(optionsFor("conformers", "crest").map((o) => o.id)).not.toContain("seed");
    // (Render: Meno's own choices first, then the role's; the look choice offering the canvas's and those the plugin declares)
    const own = kindInfo("render").own ?? [];
    const given = optionsFor("render", "blender");
    const ids = given.map((o) => o.id);
    expect(ids.filter((id) => own.some((o) => o.id === id))).toEqual(own.map((o) => o.id));
    const look = given.find((o) => o.id === "look") as unknown as { choices: { value: string }[] };
    expect(look.choices.map((c) => c.value).slice(0, 3)).toEqual(["meno", "glossy", "matte"]);
  });

  it("says the structures not made, one or several", () => {
    expect(notMade([3], 4)).toBe("structure 3 of 4 could not be made in 3D");
    expect(notMade([1, 2, 4], 5)).toBe("structures 1, 2 and 4 of 5 could not be made in 3D");
    expect(stereoOpen([2], 3)).toBe("structure 2 of 3 leaves stereo open: draw it, wedges and all");
    expect(stereoOpen([1, 3], 3)).toBe("structures 1 and 3 of 3 leave stereo open: draw it, wedges and all");
    expect(stereoFree([2], 3)).toBe("structure 2 of 3 made with its stereo free: no stereoisomer of it holds in 3D");
    expect(stereoFree([1, 2], 3)).toBe("structures 1 and 2 of 3 made with their stereo free: no stereoisomer of them holds in 3D");
  });
});
