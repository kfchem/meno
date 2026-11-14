/**
 * A step that holds no options of its own - one put down otherwise than on the canvas, a template's - runs with the
 * values Settings, Calculations, keeps for its kind (workflow/doers `stepValues`), wherever its run reads them: Meno's
 * kinds run at once (workflow/run), in turns (Duplicates) and on what they perceive first, Enumerate, Atom map; and its
 * key (workflow/flow `inputKey`) follows them.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OptionValues } from "../../../../lib/options";

/** What each of Meno's runs was given as its options, by the kind; whether the stereo was perceived; Atom map's plan's options. */
const given: { kind: string; own?: OptionValues }[] = [];
const perceived: number[] = [];
const planned: OptionValues[] = [];

vi.mock("../workflow/meno", async (actual) => {
  const meno = await actual<typeof import("../workflow/meno")>();
  return {
    ...meno,
    runMeno: (...a: Parameters<typeof meno.runMeno>) => (given.push({ kind: a[0], own: a[3] }), meno.runMeno(...a)),
    runMenoDrawn: (...a: Parameters<typeof meno.runMenoDrawn>) => (given.push({ kind: a[0], own: a[2] }), meno.runMenoDrawn(...a)),
    runMenoInTurns: (...a: Parameters<typeof meno.runMenoInTurns>) => (given.push({ kind: a[0], own: a[3] }), meno.runMenoInTurns(a[0], a[1], a[2], a[3], a[4], { ...a[5], slice: 0, tell: 0 }, a[6])),
  };
});
vi.mock("../workflow/configurations", async (actual) => ({
  ...(await actual<typeof import("../workflow/configurations")>()),
  perceiveStereo: async (entries: readonly unknown[]) => void perceived.push(entries.length),
}));
vi.mock("../workflow/structureSteps", async (actual) => ({
  ...(await actual<typeof import("../workflow/structureSteps")>()),
  atomMapPlan: (_e: unknown, _r: unknown, v: OptionValues) => (planned.push(v), { refused: "planned here" }),
}));

import { connectStoreToDocument, createEditorStore } from ".";
import { createWorkspaceDocument } from "../document";
import type { Atom, Molecule3D, WorkflowStep } from "./types";
import { useAppSettings } from "../../../../lib/settings/appSettings";
import { stepRole } from "../workflow/doers";
import { inputKey } from "../workflow/flow";
import type { StepKind } from "../workflow/kinds";

/** Water's three frames, with energies. */
const waters = (at: number): Omit<Molecule3D, "id"> => {
  const xyz = [0, 0, 0, 0.76, 0.59, 0, -0.76, 0.59, 0];
  return {
    atoms: [
      { el: "O", x: 0, y: 0, z: 0 },
      { el: "H", x: 0.76, y: 0.59, z: 0 },
      { el: "H", x: -0.76, y: 0.59, z: 0 },
    ],
    bonds: [
      { a1: 0, a2: 1, order: 1 },
      { a1: 0, a2: 2, order: 1 },
    ],
    frames: [xyz.map((v, i) => v + (i === 3 ? 0.2 : 0)), xyz.map((v, i) => v + (i === 3 ? 0.4 : 0))],
    energies: [-76, -75.999, -75.99],
    conformerSet: true,
    at: { x: at, y: 0 },
  };
};

/** A page with water in 3D (or, `drawn`, ethanol drawn) in a set, and a bare step of `kind` - no options of its own - wired from it into `port`; and a second set wired into `second`, where given. */
function page(kind: StepKind, opts: { drawn?: boolean; second?: string } = {}) {
  const doc = createWorkspaceDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  const st = () => store.getState();
  if (opts.drawn) {
    doc.edit("draw", (d) => {
      const atoms: Atom[] = ["C", "C", "O"].map((el, k) => ({ id: 100 + k, el, x: -400 + 1.3 * k, y: 0, r: 0.9 }));
      return { ...d, model: { atoms, bonds: [0, 1].map((k) => ({ id: 200 + k, a: 100 + k, b: 101 + k, order: 1 as const })) }, nextId: 1000 };
    });
  } else doc.edit("water", (d) => ({ ...d, molecules3d: [{ ...waters(0), id: 1 }, ...(opts.second ? [{ ...waters(40), id: 2 }] : [])], nextMolecule3dId: 3 }));
  const set = opts.drawn ? st().addSet({ x0: -500, y0: -50, x1: -10, y1: 50 }) : st().addSet({ x0: -3, y0: -3, x1: 3, y1: 3 });
  const step = st().addStep(kind, "meno", 10, 0);
  doc.edit("bare", (d) => ({ ...d, steps: d.steps!.map((x) => (x.id === step ? { ...x, options: undefined } : x)) }));
  st().connect({ set }, step, opts.second ? "molecules" : undefined);
  if (opts.second) st().connect({ set: st().addSet({ x0: 37, y0: -3, x1: 43, y1: 3 }) }, step, opts.second);
  return { doc, st, step };
}

const settings = (kind: StepKind, values: OptionValues) => useAppSettings.setState((s) => ({ ...s, options: { [stepRole(kind, "meno")]: values } }));

describe("a step with no options of its own, run", () => {
  beforeEach(() => {
    given.length = 0;
    perceived.length = 0;
    planned.length = 0;
  });
  afterEach(() => useAppSettings.setState((s) => ({ ...s, options: {} })));

  it("of Meno's run at once - an Energy window - is given Settings' window", async () => {
    settings("energy-window", { window: 2.5 });
    const { st, step } = page("energy-window");
    expect(st().steps.find((s) => s.id === step)!.options).toBeUndefined();
    await st().runStep(step);
    expect(given.find((g) => g.kind === "energy-window")?.own).toMatchObject({ window: 2.5 });
  });

  it("Duplicates, in turns: given Settings' values, and its stereo perceived first where they count mirror images", async () => {
    settings("duplicates", { mirrors: "counted" });
    const counted = page("duplicates");
    await counted.st().runStep(counted.step);
    expect(given.find((g) => g.kind === "duplicates")?.own).toMatchObject({ mirrors: "counted" });
    expect(perceived).toHaveLength(1);
    // (kept apart, the option's own default: nothing perceived first)
    settings("duplicates", { mirrors: "apart" });
    perceived.length = 0;
    const apart = page("duplicates");
    await apart.st().runStep(apart.step);
    expect(perceived).toHaveLength(0);
  });

  it("Enumerate: made from Settings' lists", async () => {
    settings("enumerate", { way: "rgroups", lists: "R1: C" });
    const { st, step } = page("enumerate", { drawn: true });
    await st().runStep(step);
    expect(given.find((g) => g.kind === "enumerate")?.own).toMatchObject({ way: "rgroups", lists: "R1: C" });
  });

  it("Atom map: planned with Settings' values", async () => {
    settings("atom-map", { reference: "property", property: "tag" });
    const { st, step } = page("atom-map", { second: "reference" });
    await st().runStep(step);
    expect(planned[0]).toMatchObject({ reference: "property", property: "tag" });
  });

  it("Number, from its options alone: Settings' value", async () => {
    settings("number", { what: "typed", value: 4.25, unit: "kcal/mol" });
    const doc = createWorkspaceDocument();
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    const step = store.getState().addStep("number", "meno", 0, 0);
    doc.edit("bare", (d) => ({ ...d, steps: d.steps!.map((x) => (x.id === step ? { ...x, options: undefined } : x)) }));
    await store.getState().runStep(step);
    expect(store.getState().steps.find((s) => s.id === step)!.ran).toMatchObject({ ok: true });
    expect(store.getState().steps.find((s) => s.id === step)!.ran?.said).toContain("4.25");
  });

  it("is keyed by those values: a change to Settings changes its key, as it changes what it would run with - one with its own, not", () => {
    const { doc, step } = page("energy-window");
    const bare = doc.getState().steps!.find((s) => s.id === step)! as WorkflowStep;
    settings("energy-window", { window: 2.5 });
    const before = inputKey(doc.getState(), bare, "meno");
    settings("energy-window", { window: 4 });
    expect(inputKey(doc.getState(), bare, "meno")).not.toBe(before);
    const own = { ...bare, options: { window: 3 } };
    const kept = inputKey(doc.getState(), own, "meno");
    settings("energy-window", { window: 5 });
    expect(inputKey(doc.getState(), own, "meno")).toBe(kept);
  });
});
