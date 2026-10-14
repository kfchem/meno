/**
 * Layers of many parts - shapes, writing by hand, words on the page - drawn
 * into a scene without WebGL (a renderer that draws nothing), and what they
 * make counted: the frame callbacks, the parts with work at each frame, the
 * meshes, geometries and materials, for many parts at rest, one under the
 * pointer, all selected, and all deleted and undone.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { act, type ReactNode } from "react";
import { _roots, advance, createRoot, extend } from "@react-three/fiber";
import { EditorProvider, storeOf } from "../store";
import { createWorkspaceDocument } from "../document";
import { DrawnLayoutContext, DrawnZoomContext, drawnZoomOf, type DrawnLayout } from "./drawnLayoutContext";
import { editorLayoutOptions } from "../layoutOptions";
import { DEFAULT_STYLE_CHOICE, styleOf } from "../../../../lib/chem/style";
import { partFramesRegistered, SQUARE, UNSEEN } from "./partFrames";
import Shapes2D from "./Shapes2D";
import Inks2D from "./Inks2D";
import Captions2D from "./Captions2D";

// (the words' letters are drawn by a typeface loaded in the app: none here)
vi.mock("./Labels2D", () => ({ WholeTexts2D: () => null }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
extend(THREE as never);

/** A renderer that draws nothing: whatever is asked of it, nothing. */
function nothingDrawn(): object {
  const none = () => undefined;
  const handler: ProxyHandler<object> = {
    get(target, key) {
      // (not a promise: R3F waits on one)
      if (key === "then" || typeof key === "symbol") return undefined;
      if (key in target) return (target as Record<string, unknown>)[key];
      return new Proxy(none, handler);
    },
    apply: () => undefined,
  };
  const own = { render: none, getPixelRatio: () => 1, domElement: { style: {}, dataset: {}, addEventListener: none, removeEventListener: none }, xr: { enabled: false, isPresenting: false, addEventListener: none, removeEventListener: none, setAnimationLoop: none } };
  return new Proxy(own, handler);
}

const mounted: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const unmount of mounted.splice(0)) await unmount();
});

/** `layer` drawn for a document of its own; its store, the scene's counts, frames to run. */
async function drawn(layer: ReactNode) {
  const doc = createWorkspaceDocument();
  const store = storeOf(doc);
  const canvas = { style: {}, width: 800, height: 600, addEventListener: () => undefined, removeEventListener: () => undefined } as unknown as HTMLCanvasElement;
  const root = createRoot(canvas);
  const opts = editorLayoutOptions(styleOf(DEFAULT_STYLE_CHOICE));
  const layout: DrawnLayout = { atoms: [], bonds: [], opts, layout: {} as DrawnLayout["layout"], laidAt: 1 };
  const zoom = drawnZoomOf(1);
  await act(async () => {
    await root.configure({ gl: nothingDrawn() as never, size: { width: 800, height: 600, top: 0, left: 0 }, frameloop: "never", orthographic: true, camera: { zoom: 1, position: [0, 0, 100] } });
    root.render(
      <EditorProvider tabId="t" document={doc}>
        <DrawnLayoutContext.Provider value={layout}>
          <DrawnZoomContext.Provider value={zoom}>{layer}</DrawnZoomContext.Provider>
        </DrawnLayoutContext.Provider>
      </EditorProvider>,
    );
  });
  const state = () => (_roots as unknown as Map<HTMLCanvasElement, { store: { getState(): import("@react-three/fiber").RootState } }>).get(canvas)!.store.getState();
  mounted.push(() => act(async () => void root.unmount()));
  const counts = () => {
    let meshes = 0;
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    state().scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      meshes++;
      geometries.add(m.geometry);
      for (const x of [m.material].flat()) materials.add(x);
    });
    return { callbacks: state().internal.subscribers.length, parts: partFramesRegistered(), meshes, geometries: geometries.size, materials: materials.size };
  };
  /** Frames run, `ms` of them apart, for a light to come or go. */
  const frames = async (n: number, ms = 50) => {
    for (let k = 1; k <= n; k++) await act(async () => advance(performance.now() + k * ms, true, state()));
  };
  /** A change to the document or the store, drawn. */
  const change = async (f: () => void) => act(async () => f());
  return { doc, store, st: () => store.getState(), counts, frames, change };
}

const N = 40;

/** All of a layer's parts deleted and undone: all of them back, counted as they were, nothing shared thrown away. */
async function deletedAndUndone(p: Awaited<ReturnType<typeof drawn>>, all: () => number, selectAll: () => void) {
  let thrown = 0;
  const count = () => thrown++;
  SQUARE.addEventListener("dispose", count);
  UNSEEN.addEventListener("dispose", count);
  try {
    const before = p.counts();
    await p.change(() => {
      selectAll();
      p.st().deleteSelection();
    });
    await p.frames(20);
    expect(all()).toBe(0);
    expect(p.counts()).toMatchObject({ callbacks: 1, parts: 0, meshes: 0 });
    await p.change(() => p.doc.undo());
    await p.frames(20);
    expect(all()).toBe(N);
    expect(p.counts()).toEqual(before);
    expect(thrown).toBe(0);
  } finally {
    SQUARE.removeEventListener("dispose", count);
    UNSEEN.removeEventListener("dispose", count);
  }
}

describe("many shapes on the page", () => {
  const page = async () => {
    const p = await drawn(<Shapes2D />);
    await p.change(() => {
      for (let k = 0; k < N; k++) p.st().addShape({ kind: "rect", x0: 10 * k, y0: 0, x1: 10 * k + 5, y1: 5 });
    });
    return p;
  };

  it("at rest: one frame callback for them all, no part's work at each frame, and only each one's own line and what is shared", async () => {
    const p = await page();
    const c = p.counts();
    expect(p.st().shapes).toHaveLength(N);
    expect(c.callbacks).toBe(1);
    expect(c.parts).toBe(0);
    // (each its line, and what a press takes - never drawn, one square shared by all)
    expect(c.meshes).toBe(2 * N);
    expect(c.geometries).toBe(N + 1);
    expect(c.materials).toBe(N + 1);
  });

  it("one under the pointer: its light alone, gone again once the pointer leaves", async () => {
    const p = await page();
    const id = p.st().shapes[3].id;
    await p.change(() => p.st().setHoveredShape(id));
    expect(p.counts()).toMatchObject({ callbacks: 1, parts: 1, meshes: 2 * N + 1 });
    await p.change(() => p.st().setHoveredShape(null));
    await p.frames(20);
    expect(p.counts()).toMatchObject({ callbacks: 1, parts: 0, meshes: 2 * N });
  });

  it("all selected: their handles drawn all together, in three parts", async () => {
    const p = await page();
    await p.change(() => p.st().selectShapes(p.st().shapes.map((s) => s.id)));
    const c = p.counts();
    expect(c.callbacks).toBe(1);
    // (a light each; the handles laid as the zoom is taken up, with no work at each frame)
    expect(c.parts).toBe(N);
    // (each its line, its light, what a press takes; the handles' three)
    expect(c.meshes).toBe(3 * N + 3);
  });

  it("all deleted and undone: all of them back, as they were, nothing shared thrown away", async () => {
    const p = await page();
    await deletedAndUndone(p, () => p.st().shapes.length, () => p.st().selectShapes(p.st().shapes.map((s) => s.id)));
  });
});

describe("much writing by hand on the page", () => {
  const page = async () => {
    const p = await drawn(<Inks2D />);
    await p.change(() => {
      for (let k = 0; k < N; k++) p.st().writeStroke({ pen: "pen", width: 1 }, { points: [100 * k, 0, 0.5, 100 * k + 5, 5, 0.5] }, null);
    });
    return p;
  };

  it("at rest: one frame callback for them all, no part's work at each frame, each piece its strokes and what a press takes", async () => {
    const p = await page();
    const c = p.counts();
    expect(p.st().inks).toHaveLength(N);
    expect(c.callbacks).toBe(1);
    expect(c.parts).toBe(0);
    expect(c.meshes).toBe(2 * N);
    expect(c.geometries).toBe(N + 1);
    expect(c.materials).toBe(N + 1);
  });

  it("one under the pointer, then all selected: a light for each that is lit, and only while it is", async () => {
    const p = await page();
    await p.change(() => p.st().setHoveredInk(p.st().inks[0].id));
    expect(p.counts()).toMatchObject({ callbacks: 1, parts: 1, meshes: 2 * N + 1 });
    await p.change(() => {
      p.st().setHoveredInk(null);
      p.st().selectInks(p.st().inks.map((k) => k.id));
    });
    expect(p.counts()).toMatchObject({ callbacks: 1, parts: N, meshes: 3 * N });
    await p.change(() => p.st().clearSel());
    await p.frames(20);
    expect(p.counts()).toMatchObject({ callbacks: 1, parts: 0, meshes: 2 * N });
  });

  it("all deleted and undone: all of them back, as they were, nothing shared thrown away", async () => {
    const p = await page();
    await deletedAndUndone(p, () => p.st().inks.length, () => p.st().selectInks(p.st().inks.map((k) => k.id)));
  });
});

describe("many words on the page", () => {
  const page = async () => {
    const p = await drawn(<Captions2D />);
    await p.change(() => {
      for (let k = 0; k < N; k++) p.st().addCaption(`words ${k}`, 50 * k, 0);
    });
    return p;
  };

  it("at rest: one frame callback for them all, no part's work at each frame, and what a press takes shared by all", async () => {
    const p = await page();
    const c = p.counts();
    expect(p.st().captions).toHaveLength(N);
    expect(c.callbacks).toBe(1);
    expect(c.parts).toBe(0);
    // (their letters are another layer's: here, what a press takes, one square and one unseen material for all)
    expect(c.meshes).toBe(N);
    expect(c.geometries).toBe(1);
    expect(c.materials).toBe(1);
  });

  it("one under the pointer: its light and its edges; selected, its shade; both gone as they are let go", async () => {
    const p = await page();
    const id = p.st().captions[2].id;
    await p.change(() => p.st().setHoveredCaption(id));
    // (its light and shade, its two edges, each seen and held)
    expect(p.counts()).toMatchObject({ callbacks: 1, parts: 1, meshes: N + 2 + 4 });
    await p.change(() => {
      p.st().setHoveredCaption(null);
      p.st().selectCaptions([id]);
    });
    expect(p.counts()).toMatchObject({ callbacks: 1, parts: 1, meshes: N + 2 });
    await p.change(() => p.st().clearSel());
    await p.frames(20);
    expect(p.counts()).toMatchObject({ callbacks: 1, parts: 0, meshes: N });
  });

  it("all deleted and undone: all of them back, as they were, nothing shared thrown away", async () => {
    const p = await page();
    await deletedAndUndone(p, () => p.st().captions.length, () => p.st().selectCaptions(p.st().captions.map((c) => c.id)));
  });
});
