/**
 * The page the still-picture script loads in a browser without a window
 * (../README.md): given one figure (../still.ts `StillInput`), it gives back
 * the PNG Meno itself puts on the clipboard for molecules in 3D alone - the
 * same calls, in the same order, as Workspace/picture's `pictureItems`: the
 * drawing laid out (`laidOut`), its molecules drawn by WebGL as the canvas
 * draws them (render3d `solidsDrawnInSteps`), and that canvas with the
 * measurements' values written over it (`solidsPng`). Nothing is drawn here:
 * where Meno cannot draw the picture, none is given, and why is said - never
 * another drawing in its place.
 */
import { emptyWorkspaceDocument } from "../../../../src/ui/features/Workspace/document";
import { laidOut, onlySolids, solidsPng } from "../../../../src/ui/features/Workspace/picture";
import { solidsDrawnInSteps } from "../../../../src/ui/features/Workspace/render3d";
import { style3dOf } from "../../../../src/ui/features/Workspace/style3dOf";
import type { PictureState } from "../../../../src/ui/features/Workspace/fileActions";
import { styleOf } from "../../../../src/lib/chem/style";
import { withDpi } from "../../../../src/lib/binary/png";
import type { StillInput } from "../still";

/** What the page gives back: the PNG, as base64, its resolution and size; or why there is none. */
export type StillOutput = { png: string; dpi: number; width: number; height: number } | { why: string };

/** The WebGL this page has, as the browser names it; none, where it has none. */
function webglSaid(): string | null {
  const gl = document.createElement("canvas").getContext("webgl2");
  if (!gl) return null;
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  const said = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
  gl.getExtension("WEBGL_lose_context")?.loseContext();
  return said;
}

async function stillPicture(input: StillInput): Promise<StillOutput> {
  const gl = webglSaid();
  if (!gl) return { why: "the browser gives this page no WebGL 2, which Meno draws molecules in 3D with" };
  // (a new workspace's styles: its drawing style, its aromatic circles, its styles in 3D)
  const doc = emptyWorkspaceDocument();
  const picture: PictureState = { aromaticEnabled: doc.aromaticEnabled, aromaticRings: doc.aromaticRings, docStyle3d: input.docStyle3d ?? doc.style3d };
  const style = styleOf(doc.style);
  const { molecules3d, layout, opts, reach } = laidOut({ atoms: [], bonds: [], molecules3d: [input.molecule] }, picture, style);
  const drawn = await solidsDrawnInSteps(molecules3d, layout, style3dOf(picture), input.dpi, reach);
  if (!drawn) return { why: `Meno did not draw the molecule (WebGL: ${gl})` };
  if (!onlySolids(layout)) return { why: "the picture holds more than the molecule in 3D" };
  const own = await solidsPng(layout, opts, drawn, input.dpi);
  if (!own) return { why: `Meno did not make the picture (WebGL: ${gl})` };
  const png = withDpi(own.png, own.dpi);
  let text = "";
  for (let i = 0; i < png.length; i += 0x8000) text += String.fromCharCode(...png.subarray(i, i + 0x8000));
  const view = new DataView(png.buffer, png.byteOffset);
  return { png: btoa(text), dpi: own.dpi, width: view.getUint32(16), height: view.getUint32(20) };
}

/** For the script: the WebGL the page has, and the picture of one figure. */
Object.assign(window, { stillPicture, stillWebgl: webglSaid });
