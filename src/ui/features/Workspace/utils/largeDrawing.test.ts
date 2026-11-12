import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { BALLS_SETTLE_MS, STICK_EDGE_PX, STICK_TRIANGLES, ballSegmentsFor, ballSegmentsNext, carriedInstanced, carriedSphere, outlineSegments, pxPerWorld, stickSegmentsFor } from "./largeDrawing";
import { bentStickGeometry } from "./stickBend";
import { STYLE_3D } from "../../../../lib/chem/style3d";
import { solidOf } from "./molecule3d";
import { SAMPLE_3D } from "../../StyleEditor/sample3d";
import { FOV, framedAt } from "../../StyleEditor/framing";

describe("a molecule's balls, by their size on the screen", () => {
  it("are given as many segments as their size on the screen wants: 32 from about 40 pixels across, down to 8 under about 8", () => {
    expect(ballSegmentsFor(60, 32)).toBe(32);
    expect(ballSegmentsFor(40, 32)).toBe(32);
    expect(ballSegmentsFor(39, 32)).toBe(24);
    expect(ballSegmentsFor(20, 32)).toBe(16);
    expect(ballSegmentsFor(16, 32)).toBe(16);
    expect(ballSegmentsFor(14, 32)).toBe(12);
    expect(ballSegmentsFor(10, 32)).toBe(12);
    expect(ballSegmentsFor(7.9, 32)).toBe(8);
    expect(ballSegmentsFor(1, 32)).toBe(8);
  });

  it("never more than the style has them", () => {
    expect(ballSegmentsFor(60, 16)).toBe(16);
    expect(ballSegmentsFor(1, 6)).toBe(6);
  });
});

describe("the balls' segments as the zoom changes", () => {
  it("go up at once as the balls grow on the screen", () => {
    expect(ballSegmentsNext(32, 16, 0)).toEqual({ now: 32 });
  });

  it("go down only once the zoom has stayed, as long as it has before", () => {
    expect(ballSegmentsNext(12, 32, 0)).toEqual({ waitMs: BALLS_SETTLE_MS });
    expect(ballSegmentsNext(12, 32, BALLS_SETTLE_MS - 50)).toEqual({ waitMs: 50 });
    expect(ballSegmentsNext(12, 32, BALLS_SETTLE_MS)).toEqual({ now: 12 });
  });

  it("stay where they are wanted", () => {
    expect(ballSegmentsNext(24, 24, 0)).toBeNull();
  });

  it("are fewer for small balls, and never more than the style's, on any canvas", () => {
    for (const most of [6, 8, 16, 32, 48]) {
      for (const px of [0.5, 4, 8, 12, 20, 30, 39, 40, 80, 400]) {
        const n = ballSegmentsFor(px, most);
        expect(n).toBeLessThanOrEqual(most);
        expect(n).toBeLessThanOrEqual(ballSegmentsFor(px * 2, most));
      }
    }
    expect(ballSegmentsFor(10, 32)).toBeLessThan(32);
  });
});

describe("the line round the balls", () => {
  it("is as fine as the balls up to the most atoms, never finer", () => {
    expect(outlineSegments(32, 100, 2000, 16)).toEqual([32, 32]);
    expect(outlineSegments(12, 100, 2000, 16)).toEqual([12, 12]);
    expect(outlineSegments(32, 2000, 2000, 16)).toEqual([32, 32]);
  });

  it("is the coarse one past them, unless the balls are coarser", () => {
    expect(outlineSegments(32, 3000, 2000, 16)).toEqual([16, 8]);
    expect(outlineSegments(12, 3000, 2000, 16)).toEqual([12, 12]);
    expect(outlineSegments(16, 3000, 2000, 16)).toEqual([16, 16]);
  });
});

describe("a molecule's balls made again at another number of segments", () => {
  it("are a unit sphere of that many segments", () => {
    const g = carriedSphere(12, null);
    expect(g.parameters).toMatchObject({ radius: 1, widthSegments: 12, heightSegments: 12 });
  });

  it("keep what each ball carries - its number, whether it is lined - and nothing of the old sphere's shape", () => {
    const was = carriedSphere(32, null);
    const lined = new THREE.InstancedBufferAttribute(new Float32Array([1, 0, 1]), 1);
    const numbers = new THREE.InstancedBufferAttribute(new Float32Array([1, 2, 3]), 1);
    was.setAttribute("ballLined", lined);
    was.setAttribute("ballNumber", numbers);
    const now = carriedSphere(12, was);
    expect(now.getAttribute("ballLined")).toBe(lined);
    expect(now.getAttribute("ballNumber")).toBe(numbers);
    expect(now.getAttribute("position").count).toBeLessThan(was.getAttribute("position").count);
  });
});

describe("a molecule's balls, given more or fewer segments", () => {
  it("move what each ball carries over to the new sphere: the old one, disposed, lists none of it", () => {
    const g1 = new THREE.SphereGeometry(1, 8, 8);
    const lined = new THREE.InstancedBufferAttribute(new Float32Array([1, 0, 1]), 1);
    const number = new THREE.InstancedBufferAttribute(new Float32Array([3, 7, 9]), 1);
    g1.setAttribute("ballLined", lined);
    g1.setAttribute("ballNumber", number);
    const g2 = carriedSphere(16, g1);
    // (three's dispose deletes the buffer of every attribute the geometry still lists)
    const freed = Object.values(g1.attributes);
    expect(freed).not.toContain(lined);
    expect(freed).not.toContain(number);
    expect(g2.getAttribute("ballLined")).toBe(lined);
    expect(g2.getAttribute("ballNumber")).toBe(number);
    expect(Array.from((g2.getAttribute("ballNumber") as THREE.BufferAttribute).array)).toEqual([3, 7, 9]);
    // (its own sphere kept, to be disposed with it; the new one's its own)
    expect(g1.getAttribute("position")).toBeDefined();
    expect(g2.getAttribute("position")).not.toBe(g1.getAttribute("position"));
  });
});

describe("the pixels a unit of the scene spans at a molecule", () => {
  it("are an orthographic camera's zoom, wherever the molecule stands", () => {
    const c = new THREE.OrthographicCamera(-1, 1, 1, -1);
    c.zoom = 37;
    expect(pxPerWorld(c, 200, 10)).toBe(37);
    expect(pxPerWorld(c, 900, 0.5)).toBe(37);
  });

  it("are a perspective camera's as far off as the molecule stands", () => {
    const c = new THREE.PerspectiveCamera(30);
    // (200 / (2 x 10 x tan 15 degrees))
    expect(pxPerWorld(c, 200, 10)).toBeCloseTo(37.3205, 4);
    expect(pxPerWorld(c, 200, 20)).toBeCloseTo(37.3205 / 2, 4);
  });

  it("are reckoned for Settings' preview with its camera where its framing puts it: 30 degrees, as far off as fits", () => {
    // (1 + 1.15 / tan 15 degrees, for a sample that reaches 1)
    expect(FOV).toBe(30);
    expect(framedAt(1)).toBeCloseTo(5.29186, 4);
    expect(framedAt(2)).toBeCloseTo(10.58372, 4);
  });

  it("give a Settings preview's balls the segments of their own size, not those of a pixel", () => {
    // (the sample in Ball and stick, on a card 176 pixels tall at twice the screen's pixels, its camera where Framing puts it)
    const style = STYLE_3D;
    const solid = solidOf(SAMPLE_3D, style);
    const distance = framedAt(solid.reach.primary);
    const biggest = solid.radii.primary.reduce((a, b) => Math.max(a, b), 0);
    const perUnit = 176 / (2 * distance * Math.tan(((FOV / 2) * Math.PI) / 180));
    const across = 2 * biggest * perUnit * 2;
    const want = ballSegmentsFor(across, style.ballSegments);
    expect(ballSegmentsFor(2 * biggest * pxPerWorld(new THREE.PerspectiveCamera(FOV), 176, distance) * 2, style.ballSegments)).toBe(want);
    // (a perspective camera's zoom, always 1, made each ball about a pixel across: 8)
    expect(ballSegmentsFor(2 * biggest * (new THREE.PerspectiveCamera(FOV).zoom || 1) * 2, style.ballSegments)).toBe(8);
    expect(want).toBeGreaterThan(8);
  });
});

describe("a molecule's sticks, by their size on the screen", () => {
  const rim = (across: number, n: number) => (across / 2) * (1 - Math.cos(Math.PI / n));

  it("are given the fewest segments that keep their rim within a third of a pixel of a circle: 8 where thin, 32 close up", () => {
    expect(stickSegmentsFor(2, 32, 100)).toBe(8);
    expect(stickSegmentsFor(10, 32, 100)).toBe(12);
    expect(stickSegmentsFor(20, 32, 100)).toBe(16);
    expect(stickSegmentsFor(40, 32, 100)).toBe(24);
    expect(stickSegmentsFor(120, 32, 100)).toBe(32);
    expect(stickSegmentsFor(1e6, 32, 100)).toBe(32);
  });

  it("keep the rim within STICK_EDGE_PX at every size up to where 32 is not enough, and never use more segments than that takes", () => {
    const steps = [8, 12, 16, 24, 32];
    for (let across = 0.5; across < 300; across *= 1.07) {
      const n = stickSegmentsFor(across, 32, 100);
      if (n < 32) expect(rim(across, n)).toBeLessThanOrEqual(STICK_EDGE_PX);
      // (the one before it on the ladder is not enough)
      const before = steps[steps.indexOf(n) - 1];
      if (before) expect(rim(across, before)).toBeGreaterThan(STICK_EDGE_PX);
    }
  });

  it("never go down as the stick grows on the screen, and never above the style's own", () => {
    for (const most of [8, 16, 32]) {
      let last = 0;
      for (let across = 0.5; across < 500; across *= 1.05) {
        const n = stickSegmentsFor(across, most, 100);
        expect(n).toBeGreaterThanOrEqual(last);
        expect(n).toBeLessThanOrEqual(most);
        last = n;
      }
    }
    // (a style that has 8 - the old default - keeps 8 however close)
    expect(stickSegmentsFor(500, 8, 100)).toBe(8);
  });

  it("are fewer where a molecule has so many that they would pass the triangles they may come to, never under 8", () => {
    expect(stickSegmentsFor(120, 32, STICK_TRIANGLES / 128)).toBe(32);
    expect(stickSegmentsFor(120, 32, STICK_TRIANGLES / 96)).toBe(24);
    expect(stickSegmentsFor(120, 32, STICK_TRIANGLES / 64)).toBe(16);
    expect(stickSegmentsFor(120, 32, 1_000_000)).toBe(8);
    expect(stickSegmentsFor(120, 32, 0)).toBe(32);
    for (const sticks of [1_000, 10_000, 100_000]) expect(4 * sticks * stickSegmentsFor(500, 32, sticks)).toBeLessThanOrEqual(Math.max(STICK_TRIANGLES, 4 * sticks * 8));
  });

  it("have the default style's finest at 32, the balls' own: a stick as smooth as the ball it enters", () => {
    expect(STYLE_3D.bondSegments).toBe(STYLE_3D.ballSegments);
  });

  it("are settled as the balls' are: more at once, fewer once the zoom has stayed", () => {
    expect(ballSegmentsNext(stickSegmentsFor(120, 32, 100), 8, 0)).toEqual({ now: 32 });
    expect(ballSegmentsNext(stickSegmentsFor(2, 32, 100), 32, 0)).toEqual({ waitMs: BALLS_SETTLE_MS });
  });
});

describe("a molecule's sticks made again at another number of segments", () => {
  it("keep what each carries - its bend, its colours - the old geometry, disposed, listing none of it", () => {
    const was = bentStickGeometry(8);
    const bend = new THREE.InstancedBufferAttribute(new Float32Array([0, 0, 0, 1]), 4);
    const ends = new THREE.InstancedBufferAttribute(new Float32Array([1, 0, 0]), 3);
    was.setAttribute("stickBend", bend);
    was.setAttribute("bondEndA", ends);
    const now = carriedInstanced(bentStickGeometry(24), was);
    expect(now.getAttribute("stickBend")).toBe(bend);
    expect(now.getAttribute("bondEndA")).toBe(ends);
    expect(Object.values(was.attributes)).not.toContain(bend);
    expect(Object.values(was.attributes)).not.toContain(ends);
    // (its own shape: more segments round it, none of the old one's)
    expect(now.getAttribute("position").count).toBeGreaterThan(was.getAttribute("position").count);
    expect(now.getAttribute("position")).not.toBe(was.getAttribute("position"));
  });

  it("carry nothing from nothing, and leave the shape's own attributes where they are", () => {
    const g = carriedInstanced(bentStickGeometry(8), null);
    expect(Object.keys(g.attributes).sort()).toEqual(["normal", "position", "uv"]);
    const plain = bentStickGeometry(8);
    const g2 = carriedInstanced(bentStickGeometry(12), plain);
    expect(plain.getAttribute("position")).toBeDefined();
    expect(Object.keys(g2.attributes).sort()).toEqual(["normal", "position", "uv"]);
  });
});
