import { afterEach, describe, expect, it, vi } from "vitest";
import { solidsBounds } from "../../../lib/chem/layout2d";
import { ACS_1996 } from "../../../lib/chem/style";

/** The densities each maker of a copied picture was given: the molecules' (render3d's `solidsDrawn`) and the PNG's frame. */
const given = vi.hoisted(() => ({ solids: [] as number[] }));

// (no WebGL here: the molecules' canvas stood in for, its pixels as solidsDrawn makes them below its cap - the page's size x dpi / 96: render3d.ts)
vi.mock("./render3d", async (actual) => ({
  ...(await actual<typeof import("./render3d")>()),
  solidsDrawn: (_ms: unknown, layout: { zoom: number; solids?: Parameters<typeof solidsBounds>[0] }, _style: unknown, dpi: number) => {
    given.solids.push(dpi);
    const bounds = solidsBounds(layout.solids ?? [])!;
    const pxPerWorld = layout.zoom * (dpi / 96);
    const canvas = { width: Math.ceil((bounds.max.x - bounds.min.x) * pxPerWorld), height: Math.ceil((bounds.max.y - bounds.min.y) * pxPerWorld) };
    return { canvas, bounds, pxPerWorld };
  },
}));

const { pictureItems } = await import("./picture");

const PIXEL = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC"),
  (c) => c.charCodeAt(0),
);

/** A page to draw on: the canvas the PNG is made on, and each drawImage on it. */
function page() {
  const made: { width: number; height: number; draws: unknown[][] }[] = [];
  vi.stubGlobal("document", {
    createElement: () => {
      const canvas = {
        width: 0,
        height: 0,
        draws: [] as unknown[][],
        getContext: () => ({ drawImage: (...args: unknown[]) => canvas.draws.push(args) }),
        toBlob: (done: (b: Blob) => void) => done(new Blob([PIXEL])),
      };
      made.push(canvas);
      return canvas;
    },
  });
  return made;
}

/** The dots to the inch a PNG says it is (its pHYs chunk, in dots to the metre). */
function dpiOf(png: Uint8Array): number {
  const at = new TextDecoder("latin1").decode(png).indexOf("pHYs");
  return new DataView(png.buffer, png.byteOffset).getUint32(at + 4) * 0.0254;
}

const water = {
  atoms: [
    { el: "O", x: 0, y: 0, z: 0 },
    { el: "H", x: 0.76, y: 0.59, z: 0 },
    { el: "H", x: -0.76, y: 0.59, z: 0.3 },
  ],
  bonds: [
    { a1: 0, a2: 1, order: 1 },
    { a1: 0, a2: 2, order: 1 },
  ],
  at: { x: 0, y: 0 },
  turn: [0, 0, 0, 1] as [number, number, number, number],
};
const aromatic = { aromaticEnabled: false, aromaticRings: {} };

afterEach(() => {
  vi.unstubAllGlobals();
  given.solids.length = 0;
});

describe("a small molecule in 3D, copied", () => {
  it("is made with at least 2400 pixels on its long side, the molecules and the PNG at one density: its canvas copied pixel for pixel", async () => {
    const made = page();
    const items = await pictureItems({ atoms: [], bonds: [], molecules3d: [water] }, aromatic, ACS_1996, new Set(["png"] as const), 600);
    const png = items.find((i) => i.flavor === "png")!.bytes!;
    const [picture] = made;
    // (water is well under an inch on the page: at 600 dpi it was fewer than 2400 pixels; now its long side is the floor, 2400,
    //  or at most a pixel more for each inch of it - the density is a whole number of dots to the inch, rounded up)
    const long = Math.max(picture.width, picture.height);
    expect(long).toBeGreaterThanOrEqual(2400);
    expect(long).toBeLessThan(2402);
    // (the density stated with the PNG is the one the molecules were drawn at, and more than the setting's 600)
    expect(given.solids).toHaveLength(1);
    expect(given.solids[0]).toBeGreaterThan(600);
    expect(dpiOf(png)).toBeCloseTo(given.solids[0], 0);
    // (the molecules' canvas drawn at its own size - three arguments, no width and height to scale it to)
    expect(picture.draws).toHaveLength(1);
    expect(picture.draws[0]).toHaveLength(3);
  });
});
