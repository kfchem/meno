/**
 * A molecule's other conformers drawn over it (Overlay3D): drawn into a
 * scene without WebGL, the work of laying them out counted - none while
 * they are off, every bond of every other frame while they are shown.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { act } from "react";
import { _roots, advance, createRoot, extend, type RootState } from "@react-three/fiber";
import { STYLE_3D } from "../../../../lib/chem/style3d";
import type { Molecule3D } from "../store/types";
import { solidOf } from "../utils/molecule3d";
import Overlay3D from "./Overlay3D";

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

const mounted: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const unmount of mounted.splice(0)) await unmount();
  vi.restoreAllMocks();
});

/** Ethanol in four frames: its two bonds between heavy atoms, three frames other than the one shown. */
function ethanol(frames: number): Molecule3D {
  const atoms = [
    { el: "C", x: -1.17, y: 0.18, z: 0 },
    { el: "C", x: 0.29, y: -0.34, z: 0 },
    { el: "O", x: 1.15, y: 0.78, z: 0 },
    { el: "H", x: -1.79, y: -0.71, z: 0 },
    { el: "H", x: 2.06, y: 0.45, z: 0 },
  ];
  const at = atoms.flatMap((a) => [a.x, a.y, a.z]);
  return {
    id: 1,
    at: { x: 0, y: 0 },
    atoms,
    bonds: [
      { a1: 0, a2: 1, order: 1 },
      { a1: 1, a2: 2, order: 1 },
      { a1: 0, a2: 3, order: 1 },
      { a1: 2, a2: 4, order: 1 },
    ],
    frames: Array.from({ length: frames - 1 }, (_, k) => at.map((v, i) => (i % 3 === 2 ? v + 0.1 * (k + 1) : v))),
  };
}

async function overlay(m: Molecule3D, on: boolean) {
  const canvas = { style: {}, width: 800, height: 600, addEventListener: () => undefined, removeEventListener: () => undefined } as unknown as HTMLCanvasElement;
  const root = createRoot(canvas);
  // (its elements one list for each molecule, as the molecule's view keeps them)
  const elsOf = new WeakMap<Molecule3D, string[]>();
  const draw = (m: Molecule3D, on: boolean) => {
    if (!elsOf.has(m)) elsOf.set(m, m.atoms.map((a) => a.el));
    const els = elsOf.get(m)!;
    root.render(<Overlay3D solid={solidOf(m, STYLE_3D)} bonds={m.bonds} els={els} frame={0} on={on} radius={0.1} />);
  };
  await act(async () => {
    await root.configure({ gl: nothingDrawn() as never, size: { width: 800, height: 600, top: 0, left: 0 }, frameloop: "never", orthographic: true });
    draw(m, on);
  });
  mounted.push(() => act(async () => void root.unmount()));
  const state = () => (_roots as unknown as Map<HTMLCanvasElement, { store: { getState(): RootState } }>).get(canvas)!.store.getState();
  const mesh = () => {
    let found: THREE.InstancedMesh | null = null;
    state().scene.traverse((o) => {
      if ((o as THREE.InstancedMesh).isInstancedMesh) found = o as THREE.InstancedMesh;
    });
    return found! as THREE.InstancedMesh;
  };
  let t = performance.now();
  const frames = async (n: number) => {
    for (let k = 0; k < n; k++) await act(async () => advance((t += 50), true, state()));
  };
  return { mesh, frames, redraw: (m: Molecule3D, on: boolean) => act(async () => draw(m, on)) };
}

describe("a molecule's other conformers drawn over it", () => {
  it("are laid out only while shown or fading out: none off, every bond of every other frame on, let go once faded out", async () => {
    const laid = vi.spyOn(THREE.InstancedMesh.prototype, "setColorAt");
    const m = ethanol(4);
    const o = await overlay(m, false);
    await o.frames(3);
    expect(laid).not.toHaveBeenCalled();
    expect(o.mesh().count).toBe(0);
    // (shown: two bonds between heavy atoms, in each of the three other frames)
    await o.redraw(m, true);
    await o.frames(3);
    expect(laid).toHaveBeenCalledTimes(6);
    expect(o.mesh().count).toBe(6);
    expect(o.mesh().visible).toBe(true);
    // (off: faded out, still drawn as it goes; then let go)
    laid.mockClear();
    await o.redraw(m, false);
    expect(o.mesh().count).toBe(6);
    await o.frames(30);
    expect(o.mesh().count).toBe(0);
    expect(o.mesh().visible).toBe(false);
    expect(laid).not.toHaveBeenCalled();
  });

  it("lay nothing out as the molecule's frames change while they are off - a conformer set growing", async () => {
    const laid = vi.spyOn(THREE.InstancedMesh.prototype, "setColorAt");
    const o = await overlay(ethanol(4), false);
    for (const n of [8, 40, 200]) await o.redraw(ethanol(n), false);
    await o.frames(3);
    expect(laid).not.toHaveBeenCalled();
    expect(o.mesh().count).toBe(0);
    // (and, shown then, as the frames are now)
    await o.redraw(ethanol(200), true);
    expect(o.mesh().count).toBe(2 * 199);
  });
});
