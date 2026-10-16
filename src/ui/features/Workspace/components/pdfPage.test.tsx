/**
 * A PDF page as it is drawn (pdfPictures `Page`), into a scene without
 * WebGL: what of it is drawn see-through and blended, and what opaque, as its
 * pictures come and once they have faded in - the graphics card leaving out
 * all behind an opaque tile.
 */
import { afterEach, describe, expect, it } from "vitest";
import * as THREE from "three";
import { act } from "react";
import { _roots, createRoot, extend } from "@react-three/fiber";
import { FADE_MS, Page, TILE, type Pic, type Tile } from "./pdfPictures";

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
  const own = { render: none, getPixelRatio: () => 1, domElement: { style: {}, dataset: {}, addEventListener: none, removeEventListener: none }, xr: { enabled: false, isPresenting: false, addEventListener: none, removeEventListener: none, setAnimationLoop: none } };
  return new Proxy(own, handler);
}

const mounted: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const unmount of mounted.splice(0)) await unmount();
});

const pic = (born: number, size = TILE): Pic => ({ tex: Object.assign(new THREE.Texture(), { image: { width: size, height: size } }), born });

/** The meshes a page drawn so makes: each one's picture (none, the sheet), whether it is see-through, and its order. */
async function meshesOf(now: number, preview: Pic | null, tiles: Tile[]) {
  const canvas = { style: {}, width: 800, height: 600, addEventListener: () => undefined, removeEventListener: () => undefined } as unknown as HTMLCanvasElement;
  const root = createRoot(canvas);
  await act(async () => {
    await root.configure({ gl: nothingDrawn() as never, size: { width: 800, height: 600, top: 0, left: 0 }, frameloop: "never", orthographic: true });
    root.render(<Page s={{ x: 0, y: 0, w: 612, h: 792 }} pt={[612, 792]} lift={0} z={0} now={now} px={1} preview={preview} tiles={tiles} />);
  });
  mounted.push(() => act(async () => void root.unmount()));
  const scene = (_roots as unknown as Map<HTMLCanvasElement, { store: { getState(): { scene: THREE.Scene } } }>).get(canvas)!.store.getState().scene;
  const out: { map: boolean; transparent: boolean; order: number }[] = [];
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) out.push({ map: !!(m.material as THREE.MeshBasicMaterial).map, transparent: (m.material as THREE.Material).transparent, order: m.renderOrder });
  });
  return out;
}

describe("a PDF page drawn", () => {
  const tile = (born: number, under?: true): Tile => ({ key: `p:0:2:0:0${under ? "u" : ""}`, pic: pic(born), i: 0, j: 0, level: under ? 1 : 2, ...(under ? { under } : {}) });

  it("blends its pictures over its sheet while they fade in", async () => {
    const meshes = await meshesOf(1000, pic(1000 - FADE_MS / 2, 360), [tile(1000 - FADE_MS / 2)]);
    // (the sheet, opaque; the small picture and the tile, see-through)
    expect(meshes.filter((m) => !m.map)).toEqual([{ map: false, transparent: false, order: 0 }]);
    expect(meshes.filter((m) => m.map).every((m) => m.transparent)).toBe(true);
  });

  it("draws them opaque once faded in - the tiles first - and no sheet under its small picture", async () => {
    const meshes = await meshesOf(10_000, pic(0, 360), [tile(0, true), tile(0)]);
    // (no sheet: the small picture, whole, is white where the page is)
    expect(meshes.some((m) => !m.map)).toBe(false);
    expect(meshes.every((m) => !m.transparent)).toBe(true);
    // (the tiles, under or the level's own, drawn before the small picture, so that it is left out behind them)
    const tiles = meshes.filter((m) => m.order !== 0);
    expect(tiles).toHaveLength(2);
    expect(tiles.every((m) => m.order < 0)).toBe(true);
  });
});
