/**
 * The molecules of large result sets, shown one at a time in their frames
 * (HeldViews3D): drawn into a scene without WebGL, each molecule counted
 * as it is drawn.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { act } from "react";
import { createRoot, extend } from "@react-three/fiber";
import { connectStoreToDocument, EditorProvider, storeOf } from "../store";
import { createWorkspaceDocument } from "../document";
import type { Molecule3D } from "../store/types";
import { STYLE_3D } from "../../../../lib/chem/style3d";
import { addStep } from "../workflow/model";
import { LARGE_SET } from "../workflow/entries";
import { heldViewId, viewShown } from "../workflow/heldView";
import { placeResults, type RunWith } from "../workflow/run";
import HeldViews3D from "./HeldViews3D";

vi.mock("../../../../lib/calc/workers", () => ({ readerClient: () => Promise.reject(new Error("no workers in tests")) }));

// (each molecule and each stack chip drawn, and what it was told)
const drawn = vi.hoisted(() => ({ molecules: [] as Record<string, unknown>[], chips: [] as Record<string, unknown>[], mounted: [] as number[] }));
vi.mock("./Molecule3DView", async () => {
  const { useEffect } = await import("react");
  function Molecule3DView(p: Record<string, unknown>) {
    drawn.molecules.push(p);
    // (each one that comes to stand, once, however often it is drawn again)
    const id = (p.m as { id: number }).id;
    useEffect(() => {
      drawn.mounted.push(id);
    }, [id]);
    return null;
  }
  return { default: Molecule3DView };
});
vi.mock("./StackChip3D", () => ({
  default: (p: Record<string, unknown>) => {
    drawn.chips.push(p);
    return null;
  },
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
extend(THREE as never);

/** A renderer that draws nothing. */
function nothingDrawn(): object {
  const none = () => undefined;
  const handler: ProxyHandler<object> = {
    get(target, key) {
      if (key === "then" || typeof key === "symbol") return undefined;
      if (key in target) return (target as Record<string, unknown>)[key];
      return new Proxy(none, handler);
    },
    apply: () => undefined,
  };
  const own = { render: none, getPixelRatio: () => 1, domElement: { style: {}, dataset: {}, addEventListener: none, removeEventListener: none, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) }, xr: { enabled: false, isPresenting: false, addEventListener: none, removeEventListener: none, setAnimationLoop: none } };
  return new Proxy(own, handler);
}

const lastOf = <T,>(xs: T[]): T => xs[xs.length - 1];
const mounted: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const unmount of mounted.splice(0)) await unmount();
  drawn.molecules.length = 0;
  drawn.chips.length = 0;
  drawn.mounted.length = 0;
});

const extentOf: RunWith["extentOf"] = () => ({ x0: -1, x1: 1, y0: -1, y1: 1 });
const water = (k: number): Omit<Molecule3D, "id" | "at"> => ({
  atoms: [
    { el: "O", x: k / 100, y: 0, z: 0 },
    { el: "H", x: 0.76, y: 0.59, z: 0 },
    { el: "H", x: -0.76, y: 0.59, z: 0 },
  ],
  bonds: [
    { a1: 0, a2: 1, order: 1 },
    { a1: 0, a2: 2, order: 1 },
  ],
});

/** A page with a step's result set of `n` molecules, drawn as the views are: the store and the set. */
async function page(n: number, make: (k: number) => Omit<Molecule3D, "id" | "at"> = water, holds: "molecules" | "conformers" = "molecules") {
  const doc = createWorkspaceDocument();
  const store = storeOf(doc);
  connectStoreToDocument(store, doc);
  doc.edit("run", (d) => {
    const s = addStep(d, "optimise", 0, 0, {}, "xtb");
    return placeResults(s, s.steps![0], { molecules: Array.from({ length: n }, (_, k) => make(k)), rest: [], holds }, { extentOf });
  });
  const canvas = { style: {}, width: 800, height: 600, addEventListener: () => undefined, removeEventListener: () => undefined } as unknown as HTMLCanvasElement;
  const root = createRoot(canvas);
  const stereoFont = { size: 1, units: "world" as const, family: "Arial", parentheses: false, gap: 0.35 };
  await act(async () => {
    await root.configure({ gl: nothingDrawn() as never, size: { width: 800, height: 600, top: 0, left: 0 }, frameloop: "never", orthographic: true });
    root.render(
      <EditorProvider tabId="t" document={doc}>
        <HeldViews3D style={STYLE_3D} hover={null} onHover={() => {}} onTurning={() => {}} stereoFont={stereoFont} />
      </EditorProvider>,
    );
  });
  mounted.push(() => act(async () => void root.unmount()));
  return { store, st: () => store.getState(), set: store.getState().sets[0] };
}

describe("the molecules of a large result set, on a page", () => {
  it("are drawn one at a time: 51 held, one molecule drawn, its stack chip saying which of how many", async () => {
    const { set } = await page(LARGE_SET + 1);
    expect(set.collection).toHaveLength(51);
    expect(drawn.mounted).toEqual([heldViewId(set.id, 0)]);
    expect(new Set(drawn.molecules.map((p) => (p.m as Molecule3D).id))).toEqual(new Set([heldViewId(set.id, 0)]));
    expect(new Set(drawn.chips.map((p) => (p.shown as Molecule3D).id)).size).toBe(1);
    expect([drawn.chips[0].index, drawn.chips[0].count]).toEqual([0, 51]);
    // (it is not a molecule of the page's, selected, moved or deleted: nothing of it selected or following a move)
    expect([drawn.molecules[0].selected, drawn.molecules[0].following]).toEqual([false, false]);
  });

  it("draw as many as a page lays out, none: a set of 50 molecules is the page's own", async () => {
    await page(LARGE_SET);
    expect(drawn.mounted).toHaveLength(0);
    expect(drawn.molecules).toHaveLength(0);
    expect(drawn.chips).toHaveLength(0);
  });

  it("go over to the next as the stack chip is slid: the next one drawn, the one let go of going out", async () => {
    const { st, set } = await page(118);
    expect(drawn.mounted).toHaveLength(1);
    drawn.molecules.length = 0;
    drawn.mounted.length = 0;
    const onShow = lastOf(drawn.chips).onShow as (k: number) => void;
    await act(async () => onShow(2));
    expect(st().heldShown).toEqual({ [set.id]: 2 });
    // (the view of molecule 3, and the view of molecule 1 as it goes out: each drawn, and no more)
    const ids = drawn.molecules.map((p) => `${(p.m as Molecule3D).id}:${(p.swap as { dir: string } | undefined)?.dir ?? "-"}`);
    expect(new Set(ids)).toEqual(new Set([`${heldViewId(set.id, 2)}:in`, `${heldViewId(set.id, 0)}:out`]));
    expect(drawn.mounted.sort()).toEqual([heldViewId(set.id, 0), heldViewId(set.id, 2)].sort());
    expect(lastOf(drawn.chips).index).toBe(2);
    // (and a slider dragged to the one it is on, or past the end: nothing goes over)
    const before = drawn.molecules.length;
    await act(async () => (lastOf(drawn.chips).onShow as (k: number) => void)(2));
    await act(async () => (lastOf(drawn.chips).onShow as (k: number) => void)(500));
    expect(drawn.molecules.length).toBe(before);
    expect(st().heldShown[set.id]).toBe(2);
  });

  it("show a conformer set's molecule with its own frames chip hanging under the stack chip, and the compound's letter in the stack's", async () => {
    const conformers = (k: number) => ({ ...water(k), conformerSet: true, frames: [water(k + 1).atoms.flatMap((a) => [a.x, a.y, a.z])] });
    const { set } = await page(LARGE_SET + 2, conformers, "conformers");
    const p = lastOf(drawn.molecules);
    expect((p.m as Molecule3D).conformerSet).toBe(true);
    // (not told it is stacked: the frames chip is the molecule's own, a row lower than the stack chip)
    expect(p.stacked).toBeUndefined();
    expect(p.chipDrop as number).toBeGreaterThan(0);
    expect((drawn.chips[0].shown as Molecule3D).title).toBe("compound a");
    expect(set.collection).toHaveLength(52);
  });
});

describe("what a view's stack chip says of its molecule", () => {
  const m = (extra: Partial<Molecule3D>) => ({ ...water(0), id: -1, at: { x: 0, y: 0 }, ...extra }) as Molecule3D;
  it("is its title, or - of a conformer set's - the letter of its compound, or nothing", () => {
    expect(viewShown({ molecule: m({ title: "aspirin", conformerSet: true }), index: 2 }).title).toBe("aspirin");
    expect(viewShown({ molecule: m({ conformerSet: true }), index: 2 }).title).toBe("compound c");
    expect(viewShown({ molecule: m({ conformerSet: true }), index: 27 }).title).toBe("compound ab");
    expect(viewShown({ molecule: m({}), index: 2 }).title).toBeUndefined();
  });
});
