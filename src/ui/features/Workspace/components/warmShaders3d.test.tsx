/**
 * The shaders a molecule in 3D is drawn with, made ready as the page starts
 * (WarmShaders3D): drawn into a scene without WebGL, the unseen molecule
 * counted as it is put in, and each compile it asks of the renderer.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { act } from "react";
import { _roots, advance, createRoot, extend, type RootState } from "@react-three/fiber";
import { STYLE_3D, type Style3D } from "../../../../lib/chem/style3d";
import WarmShaders3D from "./WarmShaders3D";

const drawn = vi.hoisted(() => ({ molecules: [] as Record<string, unknown>[] }));
vi.mock("./Molecule3DView", () => ({
  default: (p: Record<string, unknown>) => {
    drawn.molecules.push(p);
    return <mesh />;
  },
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
extend(THREE as never);

/** A renderer that draws nothing, and counts what it is asked to compile. */
function nothingDrawn(compileAsync: (o: THREE.Object3D, camera: THREE.Camera, scene: THREE.Scene) => Promise<unknown>): object {
  const none = () => undefined;
  const handler: ProxyHandler<object> = {
    get(target, key) {
      if (key === "then" || typeof key === "symbol") return undefined;
      if (key in target) return (target as Record<string, unknown>)[key];
      return new Proxy(none, handler);
    },
    apply: () => undefined,
  };
  const own = { compileAsync, render: none, getPixelRatio: () => 1, domElement: { style: {}, dataset: {}, addEventListener: none, removeEventListener: none, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) }, xr: { enabled: false, isPresenting: false, addEventListener: none, removeEventListener: none, setAnimationLoop: none } };
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
    get count() {
      return waiting.size;
    },
  };
}

const mounted: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const unmount of mounted.splice(0)) await unmount();
  vi.unstubAllGlobals();
  drawn.molecules.length = 0;
});

const stereoFont = { size: 1, units: "world" as const, family: "Arial", parentheses: false, gap: 0.35 };

async function page(compileAsync = vi.fn(async (..._: unknown[]) => undefined), withIdle = true) {
  const idle = held();
  const frame = held();
  if (withIdle) vi.stubGlobal("requestIdleCallback", idle.ask);
  if (withIdle) vi.stubGlobal("cancelIdleCallback", idle.cancel);
  vi.stubGlobal("requestAnimationFrame", frame.ask);
  vi.stubGlobal("cancelAnimationFrame", frame.cancel);
  const canvas = { style: {}, width: 800, height: 600, addEventListener: () => undefined, removeEventListener: () => undefined } as unknown as HTMLCanvasElement;
  const root = createRoot(canvas);
  const draw = (style: Style3D) => root.render(<WarmShaders3D style={style} stereoFont={stereoFont} />);
  await act(async () => {
    await root.configure({ gl: nothingDrawn(compileAsync) as never, size: { width: 800, height: 600, top: 0, left: 0 }, frameloop: "never", orthographic: true });
    draw(STYLE_3D);
  });
  const state = () => (_roots as unknown as Map<HTMLCanvasElement, { store: { getState(): RootState } }>).get(canvas)!.store.getState();
  // (a frame of the page's: its callbacks run, the key light's among them)
  const tick = () => act(async () => advance(performance.now(), true, state()));
  let gone = false;
  const unmount = async () => {
    if (!gone) await act(async () => void root.unmount());
    gone = true;
  };
  mounted.push(unmount);
  return { idle, frame, tick, compileAsync, redraw: (style: Style3D) => act(async () => draw(style)), unmount };
}

describe("the shaders of molecules in 3D, made ready as the page starts", () => {
  it("are made once the page is idle, a frame after the unseen molecule stands, and again as the style changes", async () => {
    const p = await page();
    // (nothing as the page starts)
    expect(drawn.molecules).toHaveLength(0);
    expect(p.compileAsync).not.toHaveBeenCalled();
    await p.idle.run();
    expect(drawn.molecules.length).toBeGreaterThan(0);
    expect(drawn.molecules[0].style).toBe(STYLE_3D);
    // (compiled after the page's next frame - its effects run, the key light's state set - never in it, nor before)
    expect(p.compileAsync).not.toHaveBeenCalled();
    expect(p.frame.count).toBe(0);
    await p.tick();
    expect(p.compileAsync).not.toHaveBeenCalled();
    expect(p.frame.count).toBe(1);
    await p.frame.run();
    expect(p.compileAsync).toHaveBeenCalledTimes(1);
    const [group, camera, scene] = p.compileAsync.mock.calls[0] as [THREE.Group, THREE.Camera, THREE.Scene];
    expect(group).toBeInstanceOf(THREE.Group);
    expect(group.visible).toBe(false);
    expect(group.children).toHaveLength(1);
    expect(camera).toBeInstanceOf(THREE.Camera);
    expect(scene).toBeInstanceOf(THREE.Scene);
    // (the same style drawn again: nothing more)
    await p.redraw(STYLE_3D);
    await p.tick();
    await p.frame.run();
    expect(p.compileAsync).toHaveBeenCalledTimes(1);
    // (another style: compiled again, the same unseen molecule in it)
    const other = { ...STYLE_3D, ballSegments: STYLE_3D.ballSegments + 4 };
    await p.redraw(other);
    await p.tick();
    await p.frame.run();
    expect(p.compileAsync).toHaveBeenCalledTimes(2);
    expect(p.compileAsync.mock.calls[1][0]).toBe(group);
    expect(drawn.molecules[drawn.molecules.length - 1].style).toBe(other);
  });

  it("are not asked for once the page is gone, before or after the unseen molecule is put in", async () => {
    const before = await page();
    await before.unmount();
    expect(before.idle.count).toBe(0);
    expect(drawn.molecules).toHaveLength(0);
    const after = await page();
    await after.idle.run();
    await after.tick();
    expect(after.frame.count).toBe(1);
    await after.unmount();
    expect(after.frame.count).toBe(0);
    await after.frame.run();
    expect(after.compileAsync).not.toHaveBeenCalled();
  });

  it("take a compile that fails as nothing: the page goes on, its shaders made when first drawn", async () => {
    // (the failed compile handled where it is asked for, its only handler: nothing left unhandled)
    const handled: ReturnType<typeof vi.fn>[] = [];
    const p = await page(
      vi.fn(() => {
        const failed = Promise.reject(new Error("no parallel compiling here"));
        handled.push(vi.spyOn(failed, "catch") as unknown as ReturnType<typeof vi.fn>);
        return failed;
      }),
    );
    await p.idle.run();
    await p.tick();
    await p.frame.run();
    expect(p.compileAsync).toHaveBeenCalledTimes(1);
    expect(handled[0]).toHaveBeenCalledTimes(1);
  });

  it("are made after a short wait where the browser tells no idle time", async () => {
    const p = await page(undefined, false);
    expect(drawn.molecules).toHaveLength(0);
    await act(async () => new Promise((r) => setTimeout(r, 600)));
    expect(drawn.molecules.length).toBeGreaterThan(0);
    await p.tick();
    await p.frame.run();
    expect(p.compileAsync).toHaveBeenCalledTimes(1);
  });
});
