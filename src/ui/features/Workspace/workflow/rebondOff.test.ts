import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The front end never lags: Re-bond's key of each structure it re-bonds onto - which a large one, a metal with its phosphines,
// takes long to work out - is worked out off the drawing thread, and read by the step once it is known.

/** How many keys of a constitution were worked out, and how many of them on the thread the test runs as the drawing's. */
const worked = { all: 0, here: 0 };
let inWorker = false;

vi.mock("../../../../lib/chem/identity", async (actual) => {
  const real = await actual<typeof import("../../../../lib/chem/identity")>();
  return {
    ...real,
    constitutionKey: (...a: Parameters<typeof real.constitutionKey>) => {
      worked.all++;
      if (!inWorker) worked.here++;
      return real.constitutionKey(...a);
    },
  };
});

import { constitutionKey } from "../../../../lib/chem/identity";
import { forgetIdentities } from "../chem/identityOff";
import { connectStoreToDocument, createEditorStore } from "../store";
import { addMolecule3d, createWorkspaceDocument, emptyWorkspaceDocument } from "../document";
import type { Molecule3D } from "../store/types";
import { addSet, addStep, connect } from "./model";
import { kindInfo } from "./kinds";
import { runMenoPair } from "./meno";
import { rebondKeysAsked } from "./structureSteps";
import { runStep, type RunWith } from "./run";
import type { SetEntry } from "./entries";

/**
 * Triphenylphosphine in 3D, made up: P, three rings of six carbons, each with five hydrogens - 34 atoms, past what the drawing
 * thread works out in place. Its rings Kekulé, or, `single`, every bond single (a geometry's bonds as read, before Re-bond).
 */
function pph3(single = false): Pick<Molecule3D, "atoms" | "bonds"> {
  const atoms: Molecule3D["atoms"] = [{ el: "P", x: 0, y: 0, z: 0 }];
  const bonds: Molecule3D["bonds"] = [];
  for (let r = 0; r < 3; r++) {
    const t = (2 * Math.PI * r) / 3;
    const ring: number[] = [];
    for (let i = 0; i < 6; i++) {
      const u = (2 * Math.PI * i) / 6;
      atoms.push({ el: "C", x: Math.cos(t) * (3.2 + 1.4 * Math.cos(u)), y: Math.sin(t) * (3.2 + 1.4 * Math.cos(u)), z: 1.4 * Math.sin(u) - 0.5 });
      ring.push(atoms.length - 1);
    }
    bonds.push({ a1: 0, a2: ring[0], order: 1 });
    for (let i = 0; i < 6; i++) bonds.push({ a1: ring[i], a2: ring[(i + 1) % 6], order: single || i % 2 ? 1 : 2 });
    for (let i = 1; i < 6; i++) {
      const c = atoms[ring[i]];
      atoms.push({ el: "H", x: c.x * 1.3, y: c.y * 1.3, z: c.z * 1.3 });
      bonds.push({ a1: ring[i], a2: atoms.length - 1, order: 1 });
    }
  }
  return { atoms, bonds };
}

const asEntry = (m: Pick<Molecule3D, "atoms" | "bonds">, number = 1): SetEntry =>
  ({ compound: 0, number, atoms: m.atoms.map(({ el }) => ({ el })), bonds: m.bonds, xyz: m.atoms.flatMap((a) => [a.x, a.y, a.z]) }) as unknown as SetEntry;

beforeEach(() => {
  forgetIdentities();
  worked.all = worked.here = 0;
});

describe("Re-bond's keys, as the step reads them", () => {
  it("works out each bonding entry's key once, however many geometries take its bonds", () => {
    const geometries = [1, 2, 3].map((n) => asEntry(pph3(true), n));
    const o = runMenoPair("rebond", { entries: geometries, holds: "molecules" }, { entries: [asEntry(pph3())], holds: "molecules" });
    expect(o.ok && o.kept.length).toBe(3);
    expect(worked.all).toBe(1);
  });

  it("asked first, works out none of them as it runs", async () => {
    const bonding = [asEntry(pph3())];
    await rebondKeysAsked(bonding);
    const asked = worked.all;
    expect(asked).toBe(1);
    const o = runMenoPair("rebond", { entries: [asEntry(pph3(true))], holds: "molecules" }, { entries: bonding, holds: "molecules" });
    expect(o.ok && o.kept.map((e) => e.bonds)).toEqual([pph3().bonds]);
    expect(worked.all).toBe(asked);
  });
});

describe("Re-bond run on the page, with workers", () => {
  /** The identity worker as a stand-in: it works out what it is asked as the real one does, and answers when let (`answer`). */
  const held: (() => void)[] = [];
  const answer = () => held.splice(0).forEach((f) => f());
  class StandIn {
    onmessage: ((e: { data: unknown }) => void) | null = null;
    onerror: ((e: unknown) => void) | null = null;
    postMessage(m: { id: number; input: Parameters<typeof constitutionKey>[0]; kind?: string }) {
      held.push(() => {
        inWorker = true;
        const text = constitutionKey(m.input);
        inWorker = false;
        this.onmessage?.({ data: { id: m.id, ok: true, found: { text, complete: true } } });
      });
    }
    terminate() {}
  }
  beforeEach(() => vi.stubGlobal("Worker", StandIn));
  afterEach(() => {
    vi.unstubAllGlobals();
    held.length = 0;
  });

  /** A geometry of triphenylphosphine with every bond single, and its bonding, each in a set of its own, wired into a Re-bond. */
  function page() {
    let d = addMolecule3d(emptyWorkspaceDocument(), { at: { x: 0, y: 0 }, title: "geometry", ...pph3(true) });
    d = addMolecule3d(d, { at: { x: 40, y: 0 }, title: "bonding", ...pph3() });
    const a = d.nextWorkflowId ?? 1;
    d = addSet(d, { x0: -10, y0: -10, x1: 10, y1: 10 });
    const b = d.nextWorkflowId!;
    d = addSet(d, { x0: 30, y0: -10, x1: 50, y1: 10 });
    const step = d.nextWorkflowId!;
    d = addStep(d, "rebond", 80, 0);
    const [first, second] = kindInfo("rebond").inputs!.map((p) => p.id);
    d = connect(d, { set: a }, step, first);
    d = connect(d, { set: b }, step, second);
    return { d, step };
  }

  it("works out no key on the drawing thread: working meanwhile, then one edit, as Re-bond in place gives", async () => {
    const { d, step } = page();
    const W: RunWith = { extentOf: () => ({ x0: -1, x1: 1, y0: -1, y1: 1 }), byOf: () => "meno", now: 1000 };
    // (what Re-bond gives worked out in place, as it was before workers)
    vi.unstubAllGlobals();
    const inPlace = runStep(d, step, W).steps!.find((s) => s.id === step)!.ran!;
    vi.stubGlobal("Worker", StandIn);
    forgetIdentities();
    worked.all = worked.here = 0;

    const doc = createWorkspaceDocument();
    doc.edit("page", () => d);
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    const st = () => store.getState();
    const run = st().runStep(step);
    await new Promise((r) => setTimeout(r, 0));
    // (asked of the worker, not yet answered: the step working, how many known of how many - nothing yet shown as made)
    expect(st().menoWorking[step]).toMatchObject({ done: 0, total: 1 });
    expect(st().steps.find((s) => s.id === step)!.ran).toBeUndefined();
    answer();
    await run;
    expect(st().menoWorking[step]).toBeUndefined();
    const ran = st().steps.find((s) => s.id === step)!.ran!;
    expect([ran.ok, ran.said]).toEqual([inPlace.ok, inPlace.said]);
    expect(worked).toEqual({ all: 1, here: 0 });
    // (one edit: an undo takes the run away)
    doc.undo();
    expect(doc.getState().steps!.find((s) => s.id === step)!.ran).toBeUndefined();
  });

  it("stopped while its keys are worked out: said stopped, nothing made", async () => {
    const { d, step } = page();
    const doc = createWorkspaceDocument();
    doc.edit("page", () => d);
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    const st = () => store.getState();
    const sets = doc.getState().sets!.length;
    const run = st().runStep(step);
    await new Promise((r) => setTimeout(r, 0));
    st().stopStep(step);
    answer();
    await run;
    const ran = st().steps.find((s) => s.id === step)!.ran!;
    expect([ran.ok, ran.stopped, ran.said.startsWith("Stopped after")]).toEqual([false, true, true]);
    expect(doc.getState().sets!.length).toBe(sets);
  });
});
