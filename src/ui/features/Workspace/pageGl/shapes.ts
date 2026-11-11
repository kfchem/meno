/**
 * Boxes and rings on the page drawn by WebGL (docs/WORKSPACE.md, *Drawn by
 * WebGL*): a set's frame and its tab, a port, a chip's box - each an
 * instance of one quad, its shape worked out in the fragment shader from
 * its distance to the box's edge, so that thousands are a draw call and
 * stay smooth at any zoom (`PageShapes`). Here, what each instance carries,
 * packed into the arrays the shader reads.
 */
import * as THREE from "three";
import { controlOnPage, pagePx, type Control } from "./units";

/** A line round a shape, inside its edge as a CSS inset ring is: `widthPx` page pixels (never under a device pixel), sRGB `color`, solid or dashed. */
export type Line = { widthPx: number; color: string; dashed?: { onPx: number; offPx: number } };

/** A box, its edges in the page's units (y up), its corners rounded `radiusPx` page pixels. */
export type Box = {
  kind: "box";
  key: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  radiusPx: number;
  fill?: string;
  /** How opaque its fill is: 1 unless said. */
  fillAlpha?: number;
  line?: Line;
  /** A soft shadow under it, as CSS's box-shadow: blurred `blurPx` page pixels, `offsetYPx` below it, black at `alpha`. */
  shadow?: Shadow;
  z?: number;
  opacity?: number;
};

/** A soft shadow under a box (`Box.shadow`): as Tailwind's shadow-sm is 1 px down, 2 px blurred, black at 5 %. */
export type Shadow = { blurPx: number; offsetYPx: number; alpha: number };

/**
 * A control's size in the vertex shader (units `controlSize`): the larger of
 * its least on the screen and its size on the page, so that it grows with the
 * page and is not lost zoomed out.
 */
export const CONTROL_SIZE_GLSL = "max(aControl.x * uScreen, aControl.y)";

/**
 * A ring - a circle, filled or not - centred at `x`, `y`: `diameterPx` page
 * pixels across, or, a control (`size`), sized as a control is (units `Control`), its
 * line then as a control's is (units `controlLine`).
 */
export type Ring = {
  kind: "ring";
  key: string;
  x: number;
  y: number;
  diameterPx: number;
  size?: Control;
  fill?: string;
  line?: Line;
  z?: number;
  opacity?: number;
};

export type Shape = Box | Ring;

/** The floats each instance carries, in the shader's order (`PageShapes`). */
export const PER = {
  /** centre x, y */
  centre: 2,
  /** half its width and height, world units (a control's: worked out in the shader) */
  half: 2,
  /** corner radius, world units; line width, world units (0: none) */
  radiusLine: 2,
  /** a control's least screen px, its size on the page in world units, and 1 where it is one */
  control: 3,
  /** fill, linear rgb and alpha */
  fill: 4,
  /** line, linear rgb and alpha */
  stroke: 4,
  /** dash on and off, world units (0: solid) */
  dash: 2,
  /** 1 a ring, 0 a box; how opaque the whole */
  kindOpacity: 2,
  /** its shadow's blur and its offset down, world units, and how dark (0: none) */
  shadow: 3,
} as const;

export type Packed = { -readonly [K in keyof typeof PER]: Float32Array } & { count: number; keys: string[] };

/** Each packed array's attribute in the shader (PageShapes). */
export const SHAPE_ATTRIBUTES: readonly [keyof typeof PER, string][] = [
  ["centre", "aCentre"],
  ["half", "aHalf"],
  ["radiusLine", "aRadiusLine"],
  ["control", "aControl"],
  ["fill", "aFill"],
  ["stroke", "aStroke"],
  ["dash", "aDash"],
  ["kindOpacity", "aKindOpacity"],
  ["shadow", "aShadow"],
];

/**
 * `packed` put into the one geometry the page's shapes are drawn with: in
 * place where its arrays are the ones it holds, told to upload them again.
 * Where they grew - new, longer arrays - the geometry is disposed first:
 * three.js keeps how many instances it may draw from the attributes it was
 * first drawn with, and forgets it only on `dispose` (WebGLGeometries), so
 * that every shape past those would go undrawn; disposing also frees the
 * old arrays' buffers. It is drawn again from what it holds next frame.
 */
export function fillShapesGeometry(geometry: THREE.InstancedBufferGeometry, packed: Packed): void {
  const grew = SHAPE_ATTRIBUTES.some(([k, name]) => geometry.getAttribute(name)?.array !== packed[k]);
  if (grew) geometry.dispose();
  for (const [k, name] of SHAPE_ATTRIBUTES) {
    const was = geometry.getAttribute(name) as THREE.InstancedBufferAttribute | undefined;
    if (was && was.array === packed[k]) was.needsUpdate = true;
    else geometry.setAttribute(name, new THREE.InstancedBufferAttribute(packed[k], PER[k]));
  }
  geometry.instanceCount = packed.count;
}

const colour = new THREE.Color();
/** An sRGB hex as the shader takes it: linear, as the page's colours are drawn (components/textBatch `PageBatch`). */
function linear(hex: string, out: Float32Array, at: number, alpha: number): void {
  colour.set(hex);
  out[at] = colour.r;
  out[at + 1] = colour.g;
  out[at + 2] = colour.b;
  out[at + 3] = alpha;
}

/** `shapes` in the order they are drawn: by `z`, then as given - one drawn later over one before. */
export function inDrawOrder(shapes: readonly Shape[]): Shape[] {
  return shapes
    .map((s, i) => [s, i] as const)
    .sort((a, b) => (a[0].z ?? 0) - (b[0].z ?? 0) || a[1] - b[1])
    .map(([s]) => s);
}

/** `shapes` packed for the shader, in the order they are drawn; into `into` where it has room. */
export function packShapes(shapes: readonly Shape[], into?: Packed): Packed {
  const order = inDrawOrder(shapes);
  const n = order.length;
  const out = into && into.centre.length / PER.centre >= n ? into : allocate(Math.max(n, 16));
  out.count = n;
  out.keys = order.map((s) => s.key);
  order.forEach((s, i) => {
    const line = s.line;
    if (s.kind === "box") {
      out.centre.set([(s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2], i * PER.centre);
      out.half.set([Math.abs(s.x1 - s.x0) / 2, Math.abs(s.y1 - s.y0) / 2], i * PER.half);
      out.radiusLine.set([pagePx(s.radiusPx), line ? pagePx(line.widthPx) : 0], i * PER.radiusLine);
      out.control.set([0, 0, 0], i * PER.control);
    } else {
      const r = pagePx(s.diameterPx) / 2;
      out.centre.set([s.x, s.y], i * PER.centre);
      out.half.set([r, r], i * PER.half);
      out.radiusLine.set([r, line ? pagePx(line.widthPx) : 0], i * PER.radiusLine);
      // (a control: its size and line worked out in the shader from the zoom, as `controlSize` and `controlLine` do)
      out.control.set(s.size ? [s.size.leastScreenPx, controlOnPage(s.size), 1] : [0, 0, 0], i * PER.control);
    }
    if (s.fill) linear(s.fill, out.fill, i * PER.fill, s.kind === "box" ? (s.fillAlpha ?? 1) : 1);
    else out.fill.fill(0, i * PER.fill, (i + 1) * PER.fill);
    if (line) linear(line.color, out.stroke, i * PER.stroke, 1);
    else out.stroke.fill(0, i * PER.stroke, (i + 1) * PER.stroke);
    out.dash.set(line?.dashed ? [pagePx(line.dashed.onPx), pagePx(line.dashed.offPx)] : [0, 0], i * PER.dash);
    out.kindOpacity.set([s.kind === "ring" ? 1 : 0, s.opacity ?? 1], i * PER.kindOpacity);
    const sh = s.kind === "box" ? s.shadow : undefined;
    out.shadow.set(sh ? [pagePx(sh.blurPx), pagePx(sh.offsetYPx), sh.alpha] : [0, 0, 0], i * PER.shadow);
  });
  return out;
}

function allocate(n: number): Packed {
  const out = { count: 0, keys: [] as string[] } as Packed;
  for (const k of Object.keys(PER) as (keyof typeof PER)[]) out[k] = new Float32Array(n * PER[k]);
  return out;
}
