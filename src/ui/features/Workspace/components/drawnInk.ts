/**
 * The drawing's ink as the view zooms (docs/WORKSPACE.md, *Drawn by WebGL*):
 * its lines scale with the page as every line on it does, and one thinner
 * than a device pixel is drawn a device pixel wide and as much fainter
 * (pageGl/units `thinLine`) - the whole drawing's ink as one: its bonds,
 * the caps where they meet, wedges, hashes, rings, labels, pluses and
 * arrows all fainter by the same share, a bond's.
 *
 * Its parts overlap - two bonds at an atom and the cap over them, the lines
 * of a double bond widened to a device pixel, a wedge where it meets its
 * bond - and drawn fainter one by one, each overlap would come out darker.
 * So while it is fainter, each pixel of its ink is painted once (`inkOnce`):
 * the drawing lies in one plane, and the first of its ink to reach a pixel
 * leaves its depth there, which turns away the rest of the drawing's ink at
 * that height (a test of "nearer", not "as near"). Two structures that
 * overlap are the one ink as well: where they cross, painted once.
 */
import * as THREE from "three";
import { createContext } from "react";
import type { LayoutOptions } from "../../../../lib/chem/layout2d";
import { devicePx, thinInk, thinLine } from "../pageGl/units";

/**
 * The drawing's line (a bond's, `opts.lineWidthPx` in world units) at a zoom
 * on a screen of `dpr` device pixels to its own: how wide a device pixel is,
 * in world units (`device`: no line of the drawing drawn thinner), and how
 * much of its colour the drawing's ink keeps (`ink`: one, or its line's
 * share of a device pixel).
 */
export function drawnInk(opts: Pick<LayoutOptions, "lineWidthPx" | "units">, zoom: number, dpr: number): { device: number; ink: number } {
  const device = devicePx(zoom, dpr);
  // (a drawing laid out in pixels is not zoomed: as it is)
  if ((opts.units ?? "px") !== "world") return { device: 0, ink: 1 };
  return { device, ink: thinLine(opts.lineWidthPx, device).ink };
}

/** What a material of the drawing's ink was made with, before `inkOnce` changed it. */
type Was = { transparent: boolean; depthTest: boolean; depthWrite: boolean; depthFunc: THREE.DepthModes; opacity: number };

/**
 * A material of the drawing's ink, `ink` strong: as it was made at one;
 * fainter, see-through, its opacity that share of its own and each pixel
 * painted once - depth tested and written, a fragment passing only where
 * nothing of the ink is yet as near. (One made opaque changes its program
 * as it crosses a device pixel, to the plain see-through one the page has
 * drawn with already; a line drawn with a shader of its own is made
 * see-through from the start, so that nothing is made ready as it crosses.)
 */
export function inkOnce(material: THREE.Material, ink: number): void {
  const was: Was = (material.userData.inkWas ??= {
    transparent: material.transparent,
    depthTest: material.depthTest,
    depthWrite: material.depthWrite,
    depthFunc: material.depthFunc,
    opacity: material.opacity,
  });
  const thin = seeThrough(material, ink, was.transparent, was.opacity);
  material.depthTest = thin || was.depthTest;
  material.depthWrite = thin || was.depthWrite;
  material.depthFunc = thin ? THREE.LessDepth : was.depthFunc;
}

/** A material `ink` strong, its opacity `base` as strong at one: see-through below one, as made at one. Whether it is fainter. */
function seeThrough(material: THREE.Material, ink: number, madeSeeThrough: boolean, base: number): boolean {
  const thin = ink < 1;
  const transparent = thin || madeSeeThrough;
  if (material.transparent !== transparent) {
    material.transparent = transparent;
    material.needsUpdate = true;
  }
  material.opacity = base * (thin ? ink : 1);
  return thin;
}

/**
 * The other lines on the page - a shape's, a mark's box, a guide, the line
 * from a slide to the next - by the same rule (`thinLine`): one thinner
 * than a device pixel drawn a device pixel wide and as much fainter, its
 * fill as it is and its dashes along it as long. Each is one piece of ink
 * whose parts meet edge to edge, so nothing of it is painted twice; it is
 * not painted once by depth as the drawing is - shapes lie nearer each
 * other than the depth buffer tells apart, and a mark or a guide is drawn
 * over everything, the drawing too.
 *
 * A line drawn as triangles set out either side of its middle line, each
 * corner told the point of that line it is set out from (an attribute
 * `middle`, `pairMiddles`): `widensAbout` has its material widen it about
 * that line in the vertex shader, so a zoom makes nothing again (where
 * it is a device pixel or wider, its corners exactly as they were).
 */
export function widensAbout(material: THREE.Material): void {
  if (material.userData.widen) return;
  const widen = (material.userData.widen = { value: 1 });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWiden = widen;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec3 middle;\nuniform float uWiden;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nif (uWiden != 1.0) transformed = middle + (transformed - middle) * uWiden;");
  };
  material.customProgramCacheKey = () => "widensAbout";
}

/**
 * A line `width` wide where a device pixel is `device`, drawn with a
 * material `widensAbout` made: as made where it is a device pixel or wider;
 * thinner, widened about its middle to a device pixel and as much fainter,
 * its opacity that share of `base` (as made, where none is given: a line
 * whose opacity comes and goes gives it). Its ink, nothing made for it.
 */
export function thinStroke(material: THREE.Material, width: number, device: number, base?: number): number {
  const was: Pick<Was, "transparent" | "opacity"> = (material.userData.strokeWas ??= { transparent: material.transparent, opacity: material.opacity });
  const ink = thinInk(width, device);
  const widen = material.userData.widen as { value: number } | undefined;
  if (widen) widen.value = 1 / ink;
  seeThrough(material, ink, was.transparent, base ?? was.opacity);
  return ink;
}

/** The middles of a line's triangles where its corners come in pairs, one either side of a point of its middle line (lib/chem/shapes `strokeTriangles`): `xy` two numbers a corner, three a middle. */
export function pairMiddles(xy: readonly number[]): Float32Array {
  const out = new Float32Array((xy.length / 2) * 3);
  for (let i = 0; i + 3 < xy.length; i += 4) {
    const x = (xy[i] + xy[i + 2]) / 2;
    const y = (xy[i + 1] + xy[i + 3]) / 2;
    const k = (i / 2) * 3;
    out[k] = out[k + 3] = x;
    out[k + 1] = out[k + 4] = y;
  }
  return out;
}

/**
 * The lines of a layer, each a material and the width it is (`thinStroke`),
 * set again only as a device pixel changes - at rest nothing at all - and a
 * new one at once, as wide and as faint as the rest.
 */
export class ThinStrokes {
  private device = 0;
  private readonly lines = new Map<THREE.Material, number>();
  add(material: THREE.Material, width: number): void {
    widensAbout(material);
    this.lines.set(material, width);
    if (this.device > 0) thinStroke(material, width, this.device);
  }
  delete(material: THREE.Material): void {
    this.lines.delete(material);
  }
  /** A device pixel `device` wide, in world units: each line as it is drawn there. */
  at(device: number): void {
    if (device === this.device) return;
    this.device = device;
    this.lines.forEach((w, m) => void thinStroke(m, w, device));
  }
}

/** The layer's `ThinStrokes`, for its parts. */
export const ThinStrokesContext = createContext<ThinStrokes | null>(null);
