import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { ACS_1996 } from "../../../../lib/chem/style";
import { bondLinePtOf, lineWidthOf, strokePieces, strokeTriangles } from "../../../../lib/chem/shapes";
import { editorLayoutOptions, startingZoom } from "../layoutOptions";
import { devicePx, pagePx, thinInk, thinLine } from "../pageGl/units";
import { pairMiddles, ThinStrokes, thinStroke, widensAbout } from "./drawnInk";
import { outlineBand } from "./markBox";

const opts = editorLayoutOptions(ACS_1996);
const pointPx = opts.pointPx!;
/** A rectangle 4 by 2, its line as wide as the bonds' (Shapes2D `asBonds`). */
const rect = { kind: "rect" as const, x0: 0, y0: 0, x1: 4, y1: 2, width: bondLinePtOf(opts) };
const width = lineWidthOf(rect, pointPx);

/** Where the shader puts a corner: about its middle, `widen` times as far from it (drawnInk `widensAbout`). */
const widened = (xy: readonly number[], mid: Float32Array, widen: number) =>
  Array.from({ length: xy.length / 2 }, (_, i) => (widen === 1 ? { x: xy[2 * i], y: xy[2 * i + 1] } : { x: mid[3 * i] + (xy[2 * i] - mid[3 * i]) * widen, y: mid[3 * i + 1] + (xy[2 * i + 1] - mid[3 * i + 1]) * widen }));
/** How wide a stroke's straight side is drawn: from one corner of a pair to the other. */
const drawnAcross = (xy: readonly number[], mid: Float32Array, widen: number) => {
  const p = widened(xy, mid, widen);
  return Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
};

const material = (over: THREE.MeshBasicMaterialParameters = {}) => {
  const m = new THREE.MeshBasicMaterial(over);
  widensAbout(m);
  return m;
};
const widenOf = (m: THREE.Material) => (m.userData.widen as { value: number }).value;

describe("a shape's line as the view zooms", () => {
  const t = strokeTriangles(strokePieces(rect, pointPx)[0].points, true, width);
  const mid = pairMiddles(t.positions);

  it("is as wide as it is and as made well above a device pixel (a device pixel half its width)", () => {
    const m = material();
    expect(thinStroke(m, width, width / 2)).toBe(1);
    expect(widenOf(m)).toBe(1);
    expect(m.opacity).toBe(1);
    expect(m.transparent).toBe(false);
    // (a corner of the rectangle: its two sides a mitre apart, the square root of two line widths)
    expect(drawnAcross(t.positions, mid, widenOf(m))).toBeCloseTo(width * Math.SQRT2, 12);
  });

  it("is as wide as it is and as made at exactly a device pixel", () => {
    const m = material();
    expect(thinStroke(m, width, width)).toBe(1);
    expect(widenOf(m)).toBe(1);
    expect(m.opacity).toBe(1);
    expect(m.transparent).toBe(false);
  });

  it("is a device pixel wide and as much fainter below it: a quarter of a device pixel, a quarter as strong", () => {
    const m = material();
    expect(thinStroke(m, width, 4 * width)).toBe(0.25);
    expect(widenOf(m)).toBe(4);
    expect(m.opacity).toBe(0.25);
    expect(m.transparent).toBe(true);
    expect(drawnAcross(t.positions, mid, widenOf(m))).toBeCloseTo(4 * width * Math.SQRT2, 12);
    // (and as made once more as the view comes back in)
    thinStroke(m, width, width / 3);
    expect([widenOf(m), m.opacity, m.transparent]).toEqual([1, 1, false]);
  });

  it("widens about its middle line: the middles are the shape's own outline, unmoved", () => {
    const outline = strokePieces(rect, pointPx)[0].points;
    for (let i = 0; i < outline.length; i++) {
      expect(mid[6 * i]).toBeCloseTo(outline[i].x, 6);
      expect(mid[6 * i + 1]).toBeCloseTo(outline[i].y, 6);
      expect([mid[6 * i + 3], mid[6 * i + 4]]).toEqual([mid[6 * i], mid[6 * i + 1]]);
    }
  });

  it("keeps a dashed line's dashes where and as long as they were, only wider", () => {
    const dashed = { ...rect, dash: true as const };
    const pieces = strokePieces(dashed, pointPx);
    expect(pieces.length).toBeGreaterThan(4);
    for (const p of pieces) {
      const d = strokeTriangles(p.points, false, width);
      const dm = pairMiddles(d.positions);
      // (each dash from its first middle to its last, as long at any widening)
      const n = d.positions.length / 2;
      expect(Math.hypot(dm[3 * (n - 2)] - dm[0], dm[3 * (n - 2) + 1] - dm[1])).toBeCloseTo(Math.hypot(p.points[p.points.length - 1].x - p.points[0].x, p.points[p.points.length - 1].y - p.points[0].y), 6);
      expect(drawnAcross(d.positions, dm, 3)).toBeCloseTo(3 * width, 9);
    }
  });

  it("keeps a shape being drawn at its own opacity, as much fainter below a device pixel", () => {
    const m = material({ transparent: true, opacity: 0.75 });
    thinStroke(m, width, 2 * width);
    expect([m.opacity, m.transparent]).toEqual([0.375, true]);
    thinStroke(m, width, width);
    expect([m.opacity, m.transparent]).toEqual([0.75, true]);
  });
});

describe("a layer's lines set together (ThinStrokes)", () => {
  it("sets them only as a device pixel changes, a new one at once", () => {
    const lines = new ThinStrokes();
    const a = new THREE.MeshBasicMaterial();
    lines.add(a, 0.1);
    lines.at(0.4);
    expect([widenOf(a), a.opacity]).toEqual([4, 0.25]);
    // (at rest: nothing touched)
    a.opacity = 0.9;
    lines.at(0.4);
    expect(a.opacity).toBe(0.9);
    const b = new THREE.MeshBasicMaterial();
    lines.add(b, 0.2);
    expect([widenOf(b), b.opacity]).toEqual([2, 0.5]);
    lines.delete(a);
    lines.at(0.05);
    expect(a.opacity).toBe(0.9);
    expect([widenOf(b), b.opacity]).toEqual([1, 1]);
  });

  it("tells the shader to widen about the middle only where it is wider than drawn", () => {
    const m = new THREE.MeshBasicMaterial();
    widensAbout(m);
    const shader = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: THREE.ShaderLib.basic.vertexShader, fragmentShader: THREE.ShaderLib.basic.fragmentShader };
    m.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as unknown as THREE.WebGLRenderer);
    expect(shader.uniforms.uWiden).toBe(m.userData.widen);
    expect(shader.vertexShader).toContain("attribute vec3 middle;");
    expect(shader.vertexShader).toContain("if (uWiden != 1.0) transformed = middle + (transformed - middle) * uWiden;");
    expect(shader.vertexShader.indexOf("#include <begin_vertex>")).toBeLessThan(shader.vertexShader.indexOf("uWiden != 1.0"));
  });
});

describe("a mark's box outline as the view zooms", () => {
  const border = pagePx(1.5);
  const box = { w: 2, h: 1, radius: pagePx(3), round: false };
  const middles: number[] = [];
  const band = outlineBand(box, border, undefined, middles);

  it("tells each corner of its band the point of its middle line, half the band away", () => {
    expect(middles).toHaveLength(band.length);
    for (let i = 0; i < band.length; i += 2) expect(Math.hypot(band[i] - middles[i], band[i + 1] - middles[i + 1])).toBeCloseTo(border / 2, 9);
  });

  it("is as it was above and at a device pixel, a device pixel wide and as much fainter below it, at the strength it is coming in at", () => {
    for (const [device, ink] of [
      [border / 2, 1],
      [border, 1],
      [5 * border, 0.2],
    ]) {
      const m = material({ transparent: true, opacity: 0 });
      expect(thinStroke(m, border, device, 0.8)).toBeCloseTo(ink, 12);
      expect(m.opacity).toBeCloseTo(0.8 * ink, 12);
      expect(border * widenOf(m)).toBeCloseTo(Math.max(border, device), 12);
      expect(m.transparent).toBe(true);
    }
  });
});

describe("a guide's and a slide's join line as the view zooms", () => {
  it("is thinInk's width and ink, thinLine's", () => {
    for (const w of [pagePx(1), pagePx(1.5)])
      for (const device of [w / 2, w, 5 * w]) {
        const t = thinLine(w, device);
        expect(t.ink).toBe(thinInk(w, device));
        expect(t.width).toBeCloseTo(w / thinInk(w, device), 12);
      }
    expect(thinLine(pagePx(1), pagePx(5)).width).toBe(pagePx(5));
    expect(thinLine(pagePx(1), pagePx(5)).ink).toBeCloseTo(0.2, 12);
  });
});

describe("every line exactly as it was at ordinary scales", () => {
  it("from the start scale to close up, on a screen of one device pixel or two: full, unwidened, as made", () => {
    const start = startingZoom(ACS_1996);
    for (const zoom of [start, 2 * start, 8 * start])
      for (const dpr of [1, 2]) {
        const device = devicePx(zoom, dpr);
        // a shape's line, a mark's box, a guide, a slide's join
        for (const [w, base] of [
          [width, undefined],
          [pagePx(1.5), 0.6],
          [pagePx(1), undefined],
        ] as const) {
          const m = material({ transparent: base != null, opacity: base ?? 1 });
          expect(thinStroke(m, w, device, base)).toBe(1);
          expect(widenOf(m)).toBe(1);
          expect(m.opacity).toBe(base ?? 1);
          expect(m.transparent).toBe(base != null);
          expect(m.version).toBe(0);
          expect(thinLine(w, device)).toEqual({ width: w, ink: 1 });
        }
      }
  });
});
