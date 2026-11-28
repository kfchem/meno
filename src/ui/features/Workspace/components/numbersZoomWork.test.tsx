/**
 * A molecule in 3D showing its atom numbers, zoomed as the page's wheel zooms it (PanZoom2D `zoomAt`: the camera's zoom and, about
 * the pointer, its place): where each number goes on its ball (utils/atomNumbers `numberPlaces`) depends only on how the molecule is
 * turned and shaped - a zoom scales every ball alike - so no zoom step works it out again, in space-filling as in ball and stick; a
 * turn does. And the numbers stand, at rest after the zoom, where they stood before it. Work counted, not timed: drawn into a scene
 * without WebGL.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { act } from "react";
import { _roots, createRoot, extend, type RootState } from "@react-three/fiber";
import { EditorProvider, storeOf, connectStoreToDocument } from "../store";
import { addMolecule3d, createWorkspaceDocument } from "../document";
import type { Look3D, Molecule3D, Turn3D } from "../store/types";
import { STYLE_3D } from "../../../../lib/chem/style3d";
import Molecules3D from "./Molecules3D";

vi.mock("../../../../lib/calc/workers", () => ({ readerClient: () => Promise.reject(new Error("no workers in tests")) }));
vi.mock("./WarmShaders3D", () => ({ default: () => null }));
vi.mock("../utils/occlusions", async (actual) => ({ ...(await actual<object>()), askOcclusion: () => new Promise(() => undefined) }));
// (each time the numbers' places are worked out, and over how many balls)
const placed = vi.hoisted(() => ({ calls: 0, balls: 0 }));
vi.mock("../utils/atomNumbers", async (actual) => {
  const a = await actual<typeof import("../utils/atomNumbers")>();
  return {
    ...a,
    numberPlaces: (...args: Parameters<typeof a.numberPlaces>) => {
      placed.calls++;
      placed.balls += args[1].length;
      return a.numberPlaces(...args);
    },
  };
});
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
  const own = { render: none, getPixelRatio: () => 1, shadowMap: {}, domElement: { style: {}, dataset: {}, addEventListener: none, removeEventListener: none, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) }, xr: { enabled: false, isPresenting: false, addEventListener: none, removeEventListener: none, setAnimationLoop: none } };
  return new Proxy(own, handler);
}

/** A made-up saturated chain of sixteen carbons, zigzag, each with its hydrogens: fifty atoms. */
function chain(): Omit<Molecule3D, "id"> {
  const atoms: Molecule3D["atoms"] = [];
  const bonds: Molecule3D["bonds"] = [];
  const C = 16;
  for (let k = 0; k < C; k++) atoms.push({ el: "C", x: 1.26 * k, y: k % 2 ? 0.44 : -0.44, z: 0 });
  for (let k = 1; k < C; k++) bonds.push({ a1: k - 1, a2: k, order: 1 });
  const h = (c: number, x: number, y: number, z: number) => {
    atoms.push({ el: "H", x: atoms[c].x + x, y: atoms[c].y + y, z: atoms[c].z + z });
    bonds.push({ a1: c, a2: atoms.length - 1, order: 1 });
  };
  for (let k = 0; k < C; k++) {
    const out = k % 2 ? 0.63 : -0.63;
    h(k, 0, out, 0.89);
    h(k, 0, out, -0.89);
  }
  h(0, -1.03, -0.36, 0);
  h(C - 1, 1.03, C % 2 ? -0.36 : 0.36, 0);
  return { atoms, bonds, at: { x: 0, y: 0 }, atomNumbers: { kind: "order" } };
}

const mounted: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const unmount of mounted.splice(0)) await unmount();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** The chain mounted in the look given, numbers shown, turned a little so that its balls hide some of each other; its frames run by hand. */
async function mount(look: Look3D | undefined) {
  vi.stubGlobal("window", { addEventListener: () => undefined, removeEventListener: () => undefined, setTimeout, clearTimeout, devicePixelRatio: 1 });
  vi.stubGlobal("requestAnimationFrame", () => 0);
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
  const doc = createWorkspaceDocument();
  const store = storeOf(doc);
  connectStoreToDocument(store, doc);
  doc.edit("add", (d) => addMolecule3d(d, { ...chain(), ...(look ? { look } : {}) }));
  const id = store.getState().molecules3d[0].id;
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.5, 0.7, 0.2));
  store.getState().setTurn3d(id, [q.x, q.y, q.z, q.w] as Turn3D);
  const canvas = { style: {}, width: 800, height: 600, addEventListener: () => undefined, removeEventListener: () => undefined } as unknown as HTMLCanvasElement;
  const root = createRoot(canvas);
  await act(async () => {
    await root.configure({ gl: nothingDrawn() as never, size: { width: 800, height: 600, top: 0, left: 0 }, frameloop: "never", orthographic: true });
    root.render(
      <EditorProvider tabId="t" document={doc}>
        <Molecules3D style={STYLE_3D} />
      </EditorProvider>,
    );
  });
  mounted.push(() => act(async () => void root.unmount()));
  const state = (_roots as unknown as Map<HTMLCanvasElement, { store: { getState(): RootState } }>).get(canvas)!.store.getState();
  let clock = performance.now();
  vi.spyOn(performance, "now").mockImplementation(() => clock);
  const camera = state.camera as THREE.OrthographicCamera;
  camera.zoom = 20;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  const frame = async () => {
    clock += 1000 / 60;
    state.advance(clock);
    await act(async () => undefined);
  };
  // (the numbers come in and settle on their balls)
  for (let k = 0; k < 90; k++) await frame();
  const places = () => {
    let at: Float32Array | null = null;
    state.scene.traverse((o) => {
      const a = (o as THREE.Mesh).geometry?.getAttribute?.("ballNumberPlace");
      if (a && !at) at = Float32Array.from(a.array as Float32Array);
    });
    return at as Float32Array | null;
  };
  /** One step of the wheel's zoom: larger by `factor`, about a point off the middle, as the page zooms about the pointer. */
  const zoomStep = async (factor: number) => {
    const before = new THREE.Vector3(0.3, -0.2, 0).unproject(camera);
    camera.zoom *= factor;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    const after = new THREE.Vector3(0.3, -0.2, 0).unproject(camera);
    camera.position.x += before.x - after.x;
    camera.position.y += before.y - after.y;
    camera.updateMatrixWorld();
    await frame();
  };
  const turn = async (angle: number) => {
    const was = new THREE.Quaternion(...store.getState().turns3d[id]!);
    const q = was.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle));
    store.getState().setTurn3d(id, [q.x, q.y, q.z, q.w] as Turn3D);
    await frame();
  };
  return { frame, places, zoomStep, turn };
}

describe("atom numbers while the page zooms", () => {
  for (const [name, look] of [
    ["space-filling", "secondary"],
    ["ball and stick", undefined],
  ] as const) {
    it(`${name}: no zoom step works out again where the numbers go; a turn does`, async () => {
      const v = await mount(look);
      expect(v.places()).not.toBeNull();
      placed.calls = 0;
      placed.balls = 0;
      for (let k = 0; k < 30; k++) await v.zoomStep(k < 15 ? 1.06 : 1 / 1.06);
      expect(placed.calls).toBe(0);
      expect(placed.balls).toBe(0);
      await v.turn(0.3);
      expect(placed.calls).toBeGreaterThan(0);
    });
  }

  it("space-filling: the numbers stand at rest after a zoom where they stood before it, covered ones as they were", async () => {
    const v = await mount("secondary");
    const before = v.places()!;
    // (the turn hides some of some balls: numbers set off their middles, or smaller, or not drawn)
    let covered = 0;
    for (let i = 0; i < before.length / 4; i++) if (before[4 * i + 2] < 1 || before[4 * i] !== 0 || before[4 * i + 1] !== 0) covered++;
    expect(covered).toBeGreaterThan(0);
    for (let k = 0; k < 20; k++) await v.zoomStep(1.08);
    for (let k = 0; k < 60; k++) await v.frame();
    expect(Array.from(v.places()!)).toEqual(Array.from(before));
  });
});
