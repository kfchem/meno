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
import type { LayoutOptions } from "../../../../lib/chem/layout2d";
import { devicePx, thinLine } from "../pageGl/units";

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
  const thin = ink < 1;
  const transparent = thin || was.transparent;
  if (material.transparent !== transparent) {
    material.transparent = transparent;
    material.needsUpdate = true;
  }
  material.opacity = was.opacity * (thin ? ink : 1);
  material.depthTest = thin || was.depthTest;
  material.depthWrite = thin || was.depthWrite;
  material.depthFunc = thin ? THREE.LessDepth : was.depthFunc;
}
