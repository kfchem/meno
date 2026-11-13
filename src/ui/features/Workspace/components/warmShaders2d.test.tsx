/**
 * The shaders a drawing is drawn with, made ready as the page starts: a
 * drawing's bonds and caps coloured from the start (`whiteInstances`), and
 * what comes only with a drawing - a label, a plain disc - compiled unseen
 * once the page is idle (WarmShaders2D). Drawn into a scene without WebGL.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { act, type ReactNode } from "react";
import { _roots, advance, createRoot, extend, type RootState } from "@react-three/fiber";
import { EditorProvider, storeOf } from "../store";
import { createWorkspaceDocument } from "../document";
import { DrawnLayoutContext, DrawnZoomContext, drawnZoomOf, type DrawnLayout } from "./drawnLayoutContext";
import { editorLayoutOptions } from "../layoutOptions";
import { DEFAULT_STYLE_CHOICE, styleOf } from "../../../../lib/chem/style";
import { Bonds2D } from "./Bonds2D";
import JoinCaps2D from "./JoinCaps2D";
import WarmShaders2D from "./WarmShaders2D";
import { whiteInstances } from "./instances";

// (the label's typeface, as the page has it once read; and a batch of labels that sets its letters when told)
const fonts = vi.hoisted(() => ({ url: "typeface-a.woff" as string | null, heard: new Set<() => void>(), asked: [] as unknown[][] }));
vi.mock("../../../fonts/typefaces", async () => {
  const { useSyncExternalStore } = await import("react");
  const subscribe = (f: () => void) => (fonts.heard.add(f), () => void fonts.heard.delete(f));
  return { useLabelFontUrl: (...a: unknown[]) => (fonts.asked.push(a), useSyncExternalStore(subscribe, () => fonts.url)) };
});
/** The page's typeface read anew, as its store tells those that use it. */
const typeface = (url: string | null) => {
  fonts.url = url;
  fonts.heard.forEach((f) => f());
};
const batches = vi.hoisted(() => ({ made: [] as { font: string; set: unknown[]; setting: boolean; synced: (() => void)[]; disposed: boolean }[] }));
vi.mock("./textBatch", async () => {
  const THREE = await import("three");
  class TextBatch {
    readonly root = new THREE.Group();
    readonly me: (typeof batches.made)[number];
    constructor(font: string) {
      this.me = { font, set: [], setting: true, synced: [], disposed: false };
      batches.made.push(this.me);
    }
    set(...a: unknown[]) {
      this.me.set.push(a);
    }
    setting() {
      return this.me.setting;
    }
    onSynced(f: () => void) {
      this.me.synced.push(f);
      return () => undefined;
    }
    dispose() {
      this.me.disposed = true;
    }
  }
  return { TextBatch };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
extend(THREE as never);

/** A renderer that draws nothing, and counts what it is asked to compile. */
function nothingDrawn(compileAsync: (o: THREE.Object3D) => Promise<unknown>): object {
  const none = () => undefined;
  const handler: ProxyHandler<object> = {
    get(target, key) {
      if (key === "then" || typeof key === "symbol") return undefined;
      if (key in target) return (target as Record<string, unknown>)[key];
      return new Proxy(none, handler);
    },
    apply: () => undefined,
  };
  const own = { compileAsync, render: none, getPixelRatio: () => 1, domElement: { style: {}, dataset: {}, addEventListener: none, removeEventListener: none }, xr: { enabled: false, isPresenting: false, addEventListener: none, removeEventListener: none, setAnimationLoop: none } };
  return new Proxy(own, handler);
}

/** Callbacks held until a test runs them: the page's idle time, its next frame. */
function held() {
  let id = 0;
  const waiting = new Map<number, () => void>();
  return {
    ask: (f: () => void) => (waiting.set(++id, f), id),
    cancel: (k: number) => void waiting.delete(k),
    run: async () => {
      const now = [...waiting.values()];
      waiting.clear();
      await act(async () => now.forEach((f) => f()));
    },
  };
}

const mounted: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const unmount of mounted.splice(0)) await unmount();
  vi.unstubAllGlobals();
  batches.made.length = 0;
  fonts.url = "typeface-a.woff";
  fonts.heard.clear();
  fonts.asked.length = 0;
  vi.useRealTimers();
});

/** `layer` drawn for an empty drawing; the scene, a page frame, the idle time and next frame held, and each compile asked. */
async function drawn(layer: ReactNode, idleCallback = true) {
  const idle = held();
  const frame = held();
  vi.stubGlobal("requestIdleCallback", idleCallback ? idle.ask : undefined);
  vi.stubGlobal("cancelIdleCallback", idleCallback ? idle.cancel : undefined);
  vi.stubGlobal("requestAnimationFrame", frame.ask);
  vi.stubGlobal("cancelAnimationFrame", frame.cancel);
  const compileAsync = vi.fn(async (..._: unknown[]) => undefined);
  const doc = createWorkspaceDocument();
  const canvas = { style: {}, width: 800, height: 600, addEventListener: () => undefined, removeEventListener: () => undefined } as unknown as HTMLCanvasElement;
  const root = createRoot(canvas);
  const opts = editorLayoutOptions(styleOf(DEFAULT_STYLE_CHOICE));
  const layout = { atoms: [], bonds: [], opts, layout: { lines: [], fills: [], zoom: 1 } as unknown as DrawnLayout["layout"], laidAt: 1 } as DrawnLayout;
  const draw = () =>
    root.render(
      <EditorProvider tabId="t" document={doc}>
        <DrawnLayoutContext.Provider value={layout}>
          <DrawnZoomContext.Provider value={drawnZoomOf(1)}>{layer}</DrawnZoomContext.Provider>
        </DrawnLayoutContext.Provider>
      </EditorProvider>,
    );
  void storeOf;
  await act(async () => {
    await root.configure({ gl: nothingDrawn(compileAsync) as never, size: { width: 800, height: 600, top: 0, left: 0 }, frameloop: "never", orthographic: true, camera: { zoom: 1, position: [0, 0, 100] } });
    draw();
  });
  mounted.push(() => act(async () => void root.unmount()));
  const state = () => (_roots as unknown as Map<HTMLCanvasElement, { store: { getState(): RootState } }>).get(canvas)!.store.getState();
  const tick = () => act(async () => advance(performance.now(), true, state()));
  return { state, idle, frame, tick, compileAsync, redraw: () => act(async () => draw()) };
}

describe("a drawing's bonds and caps", () => {
  it("have their colours from the start, white, before any bond is drawn: their shader the one they are drawn with", async () => {
    const p = await drawn(
      <>
        <Bonds2D />
        <JoinCaps2D />
      </>,
    );
    const meshes: THREE.InstancedMesh[] = [];
    p.state().scene.traverse((o) => void ((o as THREE.InstancedMesh).isInstancedMesh && meshes.push(o as THREE.InstancedMesh)));
    expect(meshes).toHaveLength(2);
    for (const m of meshes) {
      expect(m.instanceColor).not.toBeNull();
      expect(m.instanceColor!.count).toBe(m.instanceMatrix.count);
      expect([...(m.instanceColor!.array as Float32Array)].every((v) => v === 1)).toBe(true);
    }
    expect([...whiteInstances(2)]).toEqual([1, 1, 1, 1, 1, 1]);
  });
});

describe("the shaders of a drawing, made ready as the page starts", () => {
  it("are made once the page is idle, its label's letter set, after a frame of the page's - and again with another typeface", async () => {
    const p = await drawn(<WarmShaders2D />);
    expect(batches.made).toHaveLength(0);
    await p.idle.run();
    // (the batch Labels2D draws by, in the page's typeface, one letter set)
    expect(batches.made.map((b) => b.font)).toEqual(["typeface-a.woff"]);
    expect(batches.made[0].set).toHaveLength(1);
    // (not before its letter is set)
    await p.tick();
    await p.frame.run();
    expect(p.compileAsync).not.toHaveBeenCalled();
    batches.made[0].setting = false;
    await act(async () => batches.made[0].synced.forEach((f) => f()));
    expect(p.compileAsync).not.toHaveBeenCalled();
    await p.tick();
    expect(p.compileAsync).not.toHaveBeenCalled();
    await p.frame.run();
    expect(p.compileAsync).toHaveBeenCalledTimes(1);
    // (unseen, far off: the label's batch and a plain disc in it)
    const group = p.compileAsync.mock.calls[0][0] as THREE.Group;
    expect(group.visible).toBe(false);
    // (far off the page, never where a drawing is)
    expect(Math.min(group.position.x, group.position.y)).toBeGreaterThan(1e5);
    // (its letter, an O, needs no fallback face: the typeface asked for without waiting for Plex Sans JP's letters - read at start for nothing otherwise)
    expect(fonts.asked.length).toBeGreaterThan(0);
    expect(fonts.asked.every((a) => a[1] === false)).toBe(true);
    expect(group.children.some((c) => c === (batches.made[0] as unknown as { root?: THREE.Group }).root || c.type === "Group")).toBe(true);
    const disc = group.children.find((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh;
    expect(disc.geometry).toBeInstanceOf(THREE.CircleGeometry);
    expect((disc.material as THREE.MeshBasicMaterial).transparent).toBe(true);
    expect((disc.material as THREE.MeshBasicMaterial).toneMapped).toBe(true);
    // (another typeface: a batch of its own, the first let go, compiled again once set)
    await act(async () => typeface("typeface-b.woff"));
    expect(batches.made.map((b) => [b.font, b.disposed])).toEqual([
      ["typeface-a.woff", true],
      ["typeface-b.woff", false],
    ]);
    batches.made[1].setting = false;
    await act(async () => batches.made[1].synced.forEach((f) => f()));
    await p.tick();
    await p.frame.run();
    expect(p.compileAsync).toHaveBeenCalledTimes(2);
  });

  it("wait a moment where the browser tells no idle time: nothing before it, the batch after", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    await drawn(<WarmShaders2D />, false);
    await act(async () => void vi.advanceTimersByTime(499));
    expect(batches.made).toHaveLength(0);
    await act(async () => void vi.advanceTimersByTime(1));
    expect(batches.made.map((b) => b.font)).toEqual(["typeface-a.woff"]);
  });

  it("wait for the typeface: none read yet, no batch, nothing compiled", async () => {
    fonts.url = null;
    const p = await drawn(<WarmShaders2D />);
    await p.idle.run();
    await p.tick();
    await p.frame.run();
    expect(batches.made).toHaveLength(0);
    expect(p.compileAsync).not.toHaveBeenCalled();
  });
});
