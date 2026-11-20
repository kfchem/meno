import { afterEach, describe, expect, it, vi } from "vitest";
import { NOMINAL_BOND_LENGTH as L } from "../../../../lib/chem/acs";
import { useNotices } from "../../../notices";
import { createWorkspaceDocument } from "../document";
import { newmanDrawing, spokeAngles } from "../projections/newman";
import { connectStoreToDocument, createEditorStore } from "../store";
import type { Atom, Bond, Model } from "../store/types";

// The guard of a Newman pair's turn (docs/EDITOR-2D.md, *The Newman projection*): a turn about the central bond changes no configuration,
// and one that did - a fault of Meno's - is taken back when the button comes up and said. Made here to fail on purpose: the turn's
// moves stood in for by one that carries a single back group across the other two.

let faulty = false;
vi.mock("../projections/newman", async (original) => {
  const real = await original<typeof import("../projections/newman")>();
  return {
    ...real,
    newmanTurn: (model: Model, group: number, pointer: { x: number; y: number }) => {
      if (!faulty) return real.newmanTurn(model, group, pointer);
      // (the group alone to 200 degrees, between the back's other two: its atom's order round it - and so its hand - turned)
      const t = (200 * Math.PI) / 180;
      return [{ id: group, x: L * Math.cos(t), y: L * Math.sin(t) }];
    },
  };
});

const { newmanTurnGesture } = await import("./newmanTurn");

type Listener = (e: unknown) => void;
const listeners = new Map<string, Set<Listener>>();
const fire = (type: string, e: object) => {
  for (const f of [...(listeners.get(type) ?? [])]) f(e);
};
const was = (globalThis as { window?: unknown }).window;
afterEach(() => {
  listeners.clear();
  (globalThis as { window?: unknown }).window = was;
  faulty = false;
  useNotices.setState({ notices: [] });
});

/** 1,2-dichloro-1,2-difluoroethane as a Newman pair from the tool: front F, Cl at its spokes, back Cl, F at its; an H left undrawn. */
function pair(): Model {
  const d = newmanDrawing({ at: { x: 0, y: 0 }, firstId: 1, firstBondId: 1 });
  const atoms: Atom[] = [...d.atoms];
  const bonds: Bond[] = [...d.bonds];
  let id = 10;
  for (const [els, on, angles] of [
    [["F", "Cl"], 1, spokeAngles("A", false, false)],
    [["Cl", "F"], 2, spokeAngles("B", true, false)],
  ] as const) {
    els.forEach((el, k) => {
      const t = (angles[k] * Math.PI) / 180;
      atoms.push({ id, el, r: 0.9, x: L * Math.cos(t), y: L * Math.sin(t) });
      bonds.push({ id: 100 + id, a: on, b: id, order: 1 });
      id++;
    });
  }
  return { atoms, bonds };
}

describe("a Newman pair's turn, made to change a configuration", () => {
  it("is taken back when the button comes up - every atom where it was - and said as Meno's fault", () => {
    (globalThis as { window?: unknown }).window = {
      addEventListener: (t: string, f: Listener) => void (listeners.get(t) ?? listeners.set(t, new Set()).get(t)!).add(f),
      removeEventListener: (t: string, f: Listener) => void listeners.get(t)?.delete(f),
    };
    const doc = createWorkspaceDocument();
    doc.reset({ ...doc.getState(), model: pair(), nextId: 100 });
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    const before = store.getState().model;
    faulty = true;
    let ended = false;
    // (the back's first group, id 12, pressed and dragged)
    newmanTurnGesture(store, (x, y) => ({ x, y }), 12, () => (ended = true));
    fire("pointermove", { clientX: 0, clientY: -L });
    expect(store.getState().model.atoms.find((a) => a.id === 12)!.y).toBeLessThan(0);
    fire("pointerup", { clientX: 0, clientY: -L });
    expect(ended).toBe(true);
    expect(store.getState().model.atoms.map((a) => [a.id, a.x, a.y])).toEqual(before.atoms.map((a) => [a.id, a.x, a.y]));
    expect(useNotices.getState().notices.map((n) => n.id)).toEqual(["newman-turn"]);
  });

  it("is kept, and nothing said, where it changes none: the same press and drag through the real turn", () => {
    (globalThis as { window?: unknown }).window = {
      addEventListener: (t: string, f: Listener) => void (listeners.get(t) ?? listeners.set(t, new Set()).get(t)!).add(f),
      removeEventListener: (t: string, f: Listener) => void listeners.get(t)?.delete(f),
    };
    const doc = createWorkspaceDocument();
    doc.reset({ ...doc.getState(), model: pair(), nextId: 100 });
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    const at = store.getState().model.atoms.find((a) => a.id === 12)!;
    newmanTurnGesture(store, (x, y) => ({ x, y }), 12, () => undefined);
    // (round the circle by 120 degrees)
    const t = Math.atan2(at.y, at.x) + (2 * Math.PI) / 3;
    fire("pointermove", { clientX: L * Math.cos(t), clientY: L * Math.sin(t) });
    fire("pointerup", { clientX: L * Math.cos(t), clientY: L * Math.sin(t) });
    expect(store.getState().model.atoms.find((a) => a.id === 12)).not.toEqual(at);
    expect(useNotices.getState().notices).toEqual([]);
  });
});
