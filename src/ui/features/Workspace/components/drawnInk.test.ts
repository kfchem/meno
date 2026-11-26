import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { ACS_1996 } from "../../../../lib/chem/style";
import { editorLayoutOptions } from "../layoutOptions";
import { devicePx } from "../pageGl/units";
import { drawnInk, inkOnce } from "./drawnInk";
import { widenedMaterial } from "./instances";

const opts = editorLayoutOptions(ACS_1996);
const w = opts.lineWidthPx;
// (the zoom at which a bond's line is one device pixel of a screen of two)
const at = 1 / (2 * w);

/** How wide a line `own` world units wide is drawn where a device pixel is `device` (instances `widenedMaterial`'s shader). */
const drawnWidth = (own: number, device: number) => own * Math.max(1, device / own);

describe("the drawing's ink as the view zooms", () => {
  it("is a bond as wide as it is and full above a device pixel", () => {
    for (const z of [at * 1.01, at * 3, at * 40]) {
      const { device, ink } = drawnInk(opts, z, 2);
      expect(device).toBeCloseTo(devicePx(z, 2), 12);
      expect(ink).toBe(1);
      expect(drawnWidth(w, device)).toBeCloseTo(w, 12);
    }
  });

  it("is a bond a device pixel wide and as much fainter below it", () => {
    for (const [z, share] of [
      [at * 0.5, 0.5],
      [at * 0.1, 0.1],
      [at * 0.02, 0.02],
    ]) {
      const { device, ink } = drawnInk(opts, z, 2);
      expect(ink).toBeCloseTo(share, 12);
      expect(drawnWidth(w, device)).toBeCloseTo(device, 12);
      // (as much ink as the true line has: its width times its strength)
      expect(drawnWidth(w, device) * ink).toBeCloseTo(w, 12);
    }
  });

  it("goes over the device pixel with no step: width and strength meet there from either side", () => {
    const below = drawnInk(opts, at * (1 - 1e-9), 2);
    const above = drawnInk(opts, at * (1 + 1e-9), 2);
    expect(below.ink).toBeCloseTo(1, 6);
    expect(above.ink).toBe(1);
    expect(drawnWidth(w, below.device)).toBeCloseTo(drawnWidth(w, above.device), 6);
  });

  it("is the same on a screen of one device pixel to its own, a bond fainter only below that pixel", () => {
    expect(drawnInk(opts, 1 / w, 1).ink).toBe(1);
    expect(drawnInk(opts, 0.25 / w, 1).ink).toBeCloseTo(0.25, 12);
  });

  it("leaves a drawing laid out in pixels as it is", () => {
    expect(drawnInk({ lineWidthPx: 2, units: "px" }, 0.001, 2)).toEqual({ device: 0, ink: 1 });
  });
});

/**
 * One pixel of the page, painted as WebGL paints a fragment of a material
 * at a depth (smaller is nearer): the depth test as the material sets it,
 * the colour blended by its opacity where see-through.
 */
function paint(px: { grey: number; depth: number }, m: THREE.Material, depth: number, grey = 0) {
  if (m.depthTest) {
    const pass = m.depthFunc === THREE.LessDepth ? depth < px.depth : m.depthFunc === THREE.LessEqualDepth ? depth <= px.depth : true;
    if (!pass) return;
  }
  const a = m.transparent ? m.opacity : 1;
  px.grey = px.grey * (1 - a) + grey * a;
  if (m.depthWrite) px.depth = depth;
}

describe("the drawing's ink painted once", () => {
  it("is as it was made at full strength", () => {
    const line = widenedMaterial("y", { transparent: true }).material;
    inkOnce(line, 1);
    expect([line.opacity, line.depthTest, line.depthWrite, line.depthFunc]).toEqual([1, true, true, THREE.LessEqualDepth]);
    const caps = widenedMaterial("xy", { transparent: true, depthTest: false, depthWrite: false }).material;
    inkOnce(caps, 1);
    expect([caps.opacity, caps.depthTest, caps.depthWrite]).toEqual([1, false, false]);
  });

  it("paints a pixel where two bonds and their cap meet no darker than a bond's own (white page, black ink)", () => {
    const line = widenedMaterial("y", { transparent: true }).material;
    const caps = widenedMaterial("xy", { transparent: true, depthTest: false, depthWrite: false }).material;
    const wedge = new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false });
    for (const m of [line, caps, wedge]) inkOnce(m, 0.3);
    // (the drawing's plane, nearer than all under it: a picture's, a shape's)
    const own = { grey: 1, depth: 1 };
    paint(own, line, 0.5);
    const met = { grey: 1, depth: 1 };
    paint(met, line, 0.5);
    paint(met, line, 0.5);
    paint(met, caps, 0.5);
    paint(met, wedge, 0.5);
    expect(own.grey).toBeCloseTo(0.7, 12);
    expect(met.grey).toBe(own.grey);
    // (opacity the ink's share of what it was made with; depth tested "nearer" and written)
    expect([line.opacity, line.transparent, line.depthTest, line.depthWrite, line.depthFunc]).toEqual([0.3, true, true, true, THREE.LessDepth]);
    expect([caps.depthTest, caps.depthWrite, caps.depthFunc]).toEqual([true, true, THREE.LessDepth]);
  });

  it("paints over what lies under the drawing, and is hidden by what stands nearer, as at full strength", () => {
    const line = widenedMaterial("y", { transparent: true }).material;
    inkOnce(line, 0.5);
    const over = { grey: 0.6, depth: 0.7 };
    paint(over, line, 0.5);
    expect(over.grey).toBeCloseTo(0.3, 12);
    const under = { grey: 0.6, depth: 0.2 };
    paint(under, line, 0.5);
    expect(under.grey).toBe(0.6);
  });

  it("makes two structures that overlap one ink: where they cross, painted once", () => {
    const line = widenedMaterial("y", { transparent: true }).material;
    inkOnce(line, 0.4);
    const crossed = { grey: 1, depth: 1 };
    paint(crossed, line, 0.5); // one structure's bond
    paint(crossed, line, 0.5); // another's, across it
    expect(crossed.grey).toBeCloseTo(0.6, 12);
  });

  it("is as it was made again once full: an opaque one opaque, its program changed only as it crosses", () => {
    const plus = new THREE.MeshBasicMaterial({ depthTest: false, depthWrite: false });
    const v0 = plus.version;
    inkOnce(plus, 1);
    expect(plus.version).toBe(v0);
    inkOnce(plus, 0.5);
    expect([plus.transparent, plus.opacity, plus.depthTest, plus.depthWrite]).toEqual([true, 0.5, true, true]);
    const v1 = plus.version;
    expect(v1).toBeGreaterThan(v0);
    inkOnce(plus, 0.25);
    expect(plus.version).toBe(v1);
    inkOnce(plus, 1);
    expect([plus.transparent, plus.opacity, plus.depthTest, plus.depthWrite, plus.depthFunc]).toEqual([false, 1, false, false, THREE.LessEqualDepth]);
  });
});

describe("the drawing's lines widened on the graphics card", () => {
  it("draws no instance thinner than a device pixel: its own width, at least `uDevice`", () => {
    for (const across of ["y", "xy"] as const) {
      const { material, device } = widenedMaterial(across, {});
      expect(device.value).toBe(0);
      const shader = { vertexShader: THREE.ShaderLib.basic.vertexShader, fragmentShader: THREE.ShaderLib.basic.fragmentShader, uniforms: {} } as unknown as THREE.WebGLProgramParametersWithUniforms;
      material.onBeforeCompile(shader, undefined as unknown as THREE.WebGLRenderer);
      expect((shader.uniforms as Record<string, unknown>).uDevice).toBe(device);
      expect(shader.vertexShader).toContain("widen = max(widen, uDevice / own)");
      expect(shader.vertexShader).toContain(`float own = ${across === "y" ? "1.0" : "2.0"} * length(instanceMatrix[1].xyz)`);
      expect(shader.vertexShader).toContain(`transformed.${across} *= widen;`);
    }
  });
});
