/**
 * A plugin's step that holds no options of its own - one put down otherwise than on the canvas, a template's - asks
 * its plugin with the values Settings, Calculations, keeps for its kind done by it (workflow/doers `stepValues`), on
 * every path a plugin's step runs by: on structures drawn at once, made from nothing (Generate), on molecules at once,
 * as jobs, and Render.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** What the plugin was asked, by how and the kind, with the options it was given: each ask then refused, the run ending there. */
const asked: { how: "run" | "prepare"; kind: string; options: Record<string, unknown> }[] = [];
vi.mock("../../../../lib/calc/workers", async (actual) => ({
  ...(await actual<typeof import("../../../../lib/calc/workers")>()),
  pluginClient: async () => ({
    version: "1",
    run: async (kind: string, _entries: unknown, options: Record<string, unknown>) => {
      asked.push({ how: "run", kind, options });
      throw new Error("asked here");
    },
    prepare: async (kind: string, _entries: unknown, options: Record<string, unknown>) => {
      asked.push({ how: "prepare", kind, options });
      throw new Error("asked here");
    },
  }),
}));

import { connectStoreToDocument, createEditorStore } from ".";
import { createWorkspaceDocument } from "../document";
import type { Atom, Molecule3D } from "./types";
import { useReaders } from "../../../../lib/calc/workers";
import { PLUGINS } from "../../../../lib/calc/catalog";
import { useAppSettings } from "../../../../lib/settings/appSettings";
import { stepRole } from "../workflow/doers";
import type { StepKind } from "../workflow/kinds";
import type { Option } from "../../../../lib/options";

useReaders.setState({ state: Object.fromEntries(PLUGINS.map((p) => [p.id, "added" as const])), problem: {} });

const water: Omit<Molecule3D, "id"> = {
  atoms: [
    { el: "O", x: 0, y: 0, z: 0 },
    { el: "H", x: 0, y: 0.76, z: 0.59 },
    { el: "H", x: 0, y: -0.76, z: 0.59 },
  ],
  bonds: [
    { a1: 0, a2: 1, order: 1 },
    { a1: 0, a2: 2, order: 1 },
  ],
  at: { x: 0, y: 0 },
};

/** A bare step of `kind` by `by` - no options of its own - on water in 3D, on ethanol drawn, or on nothing; run. */
async function ranBare(kind: StepKind, by: string, on: "molecules" | "drawn" | "nothing") {
  const doc = createWorkspaceDocument();
  if (on === "molecules") doc.edit("water", (d) => ({ ...d, molecules3d: [{ ...water, id: 1 }], nextMolecule3dId: 2 }));
  if (on === "drawn")
    doc.edit("draw", (d) => {
      const atoms: Atom[] = ["C", "C", "O"].map((el, k) => ({ id: 100 + k, el, x: -400 + 1.3 * k, y: 0, r: 0.9 }));
      return { ...d, model: { atoms, bonds: [0, 1].map((k) => ({ id: 200 + k, a: 100 + k, b: 101 + k, order: 1 as const })) }, nextId: 1000 };
    });
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  const st = () => store.getState();
  const step = st().addStep(kind, by, 10, 0);
  doc.edit("bare", (d) => ({ ...d, steps: d.steps!.map((x) => (x.id === step ? { ...x, options: undefined } : x)) }));
  if (on !== "nothing") st().connect({ set: on === "drawn" ? st().addSet({ x0: -500, y0: -50, x1: -10, y1: 50 }) : st().addSet({ x0: -3, y0: -3, x1: 3, y1: 3 }) }, step);
  await st().runStep(step);
  return st().steps.find((s) => s.id === step)!;
}

const settings = (kind: StepKind, by: string, values: Record<string, string | number | boolean>) => useAppSettings.setState((s) => ({ ...s, options: { [stepRole(kind, by)]: values } }));

/** Sketchkit's Descriptors given an option of its own for the test - it declares none - and that taken away after. */
function withOption(option: Option) {
  const decl = PLUGINS.find((p) => p.id === "sketchkit")!.steps.find((s) => s.kind === "descriptors") as unknown as { options?: Option[] };
  const was = decl.options;
  decl.options = [option];
  return () => (decl.options = was);
}

describe("a plugin's step with no options of its own asks its plugin with Settings' values", () => {
  beforeEach(() => void (asked.length = 0));
  afterEach(() => useAppSettings.setState((s) => ({ ...s, options: {} })));

  it("on structures drawn, at once", async () => {
    const restore = withOption({ id: "depth", label: "Depth", type: "number", default: 1, min: 1, max: 9 });
    try {
      settings("descriptors", "sketchkit", { depth: 5 });
      expect((await ranBare("descriptors", "sketchkit", "drawn")).options).toBeUndefined();
      expect(asked.find((a) => a.kind === "descriptors")).toMatchObject({ how: "run", options: { depth: 5 } });
    } finally {
      restore();
    }
  });

  it("on molecules, at once - a step of its that runs no program of its own", async () => {
    // (Tightbind's Optimise, its programs taken away for the test: asked of its worker at once, not as jobs)
    const decl = PLUGINS.find((p) => p.id === "tightbind")!.steps.find((s) => s.kind === "optimise") as unknown as { programs?: string[] };
    const was = decl.programs;
    decl.programs = [];
    try {
      settings("optimise", "tightbind", { method: "tbff" });
      await ranBare("optimise", "tightbind", "molecules");
      expect(asked.find((a) => a.kind === "optimise")).toMatchObject({ how: "run", options: { method: "tbff" } });
    } finally {
      decl.programs = was;
    }
  });

  it("made from nothing: Generate", async () => {
    settings("generate", "molgen", { count: 33 });
    await ranBare("generate", "molgen", "nothing");
    expect(asked.find((a) => a.kind === "generate")).toMatchObject({ how: "run", options: { count: 33 } });
  });

  it("as jobs", async () => {
    settings("optimise", "tightbind", { method: "tb1" });
    await ranBare("optimise", "tightbind", "molecules");
    expect(asked.find((a) => a.kind === "optimise")).toMatchObject({ how: "prepare", options: { method: "tb1" } });
  });

  it("Render", async () => {
    settings("render", "lumen", { samples: 77 });
    await ranBare("render", "lumen", "molecules");
    expect(asked.find((a) => a.kind === "render")).toMatchObject({ how: "prepare", options: { samples: 77 } });
  });
});
