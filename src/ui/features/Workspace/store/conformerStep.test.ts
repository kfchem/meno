/**
 * RDKit's conformer search as a workflow's step, on structures drawn
 * (docs/WORKFLOWS.md, *Kinds of step*): one structure it cannot make in 3D
 * leaves the others made, and is said by its place in words - never in the
 * library's own text; and the search is the one *3D structures* makes,
 * with the options chosen in Settings, Molecules in 3D.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readMolfile } from "../../../../lib/chem/ctfile";

/** What RDKit's worker was asked: each structure's molblock, and the options it was given. */
const asked: { molblock: string; options: Record<string, unknown> }[] = [];

vi.mock("../../../../lib/roles/worker", async (actual) => ({
  ...(await actual<typeof import("../../../../lib/roles/worker")>()),
  pluginWorker: async () => ({
    request: async (op: string, payload: { molblock: string; options: Record<string, unknown> }) => {
      if (op !== "conformers") throw new Error(`no ${op} here`);
      asked.push(payload);
      const mol = readMolfile(payload.molblock)!;
      // (one RDKit cannot make: it says so in its own words)
      if (mol.atoms.length === 2 && mol.atoms.every((a) => a.symbol === "C")) throw new Error("Invariant Violation\n\texpected match not found");
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
  }),
}));

import { connectStoreToDocument, createEditorStore } from ".";
import { createWorkspaceDocument } from "../document";
import type { Atom } from "./types";
import { useReaders } from "../../../../lib/calc/workers";
import { PLUGINS } from "../../../../lib/calc/catalog";
import { useAppSettings } from "../../../../lib/settings/appSettings";
import { optionsFor } from "../workflow/doers";
import { kindInfo } from "../workflow/kinds";
import { notMade } from "./slices/stepRuns";

useReaders.setState({ state: Object.fromEntries(PLUGINS.map((p) => [p.id, "added" as const])), problem: {} });

/** Three structures drawn side by side - water, ethane (which RDKit, here, cannot make) and methanol - and a conformer search by RDKit on them. */
async function searched() {
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
  await st().runStep(step);
  return st().steps.find((s) => s.id === step)!;
}

describe("RDKit's conformer search as a step, on structures drawn", () => {
  beforeEach(() => void (asked.length = 0));

  it("makes the others where one cannot be made, and says which by its place - never in the library's words", async () => {
    const step = await searched();
    expect(asked).toHaveLength(3);
    expect(step.ran?.ok).toBe(true);
    expect(step.ran?.said).toMatch(/2 conformers of 2 compounds · structure 2 of 3 could not be made in 3D$/);
    expect(step.ran?.said).not.toMatch(/Invariant|expected match/);
  });

  it("is given the options chosen in Settings, Molecules in 3D, as 3D structures on the canvas is", async () => {
    useAppSettings.setState((s) => ({ ...s, options: { ...s.options, "role:conformers": { count: 12, field: "UFF" } } }));
    await searched();
    expect(asked[0].options).toMatchObject({ count: 12, field: "UFF", iters: 2000, same: 0.5, seed: 19781 });
    // (offered on the step's card as its own, those chosen in Settings its defaults)
    const offered = optionsFor("conformers", "rdkit");
    expect(offered.map((o) => o.id)).toEqual(["count", "field", "iters", "same", "seed"]);
    expect(offered.find((o) => o.id === "count")?.default).toBe(12);
  });

  it("leaves a step whose plugin declares options of its own for it as it was", () => {
    expect(optionsFor("conformers", "crest").map((o) => o.id)).not.toContain("seed");
    // (Render: Meno's own choices first, then the role's)
    expect(optionsFor("render", "blender").slice(0, (kindInfo("render").own ?? []).length)).toEqual(kindInfo("render").own ?? []);
  });

  it("says the structures not made, one or several", () => {
    expect(notMade([3], 4)).toBe("structure 3 of 4 could not be made in 3D");
    expect(notMade([1, 2, 4], 5)).toBe("structures 1, 2 and 4 of 5 could not be made in 3D");
  });
});
