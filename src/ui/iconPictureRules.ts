/**
 * The rules behind icons shown through pictures of themselves (./iconPictures,
 * docs/LOOK.md, *Icons*), kept pure: whether the window draws paths coarsely,
 * read from two counts; which icons may be shown so, read from a description
 * of one; and the clean copy each picture is drawn from, which is also the
 * picture's key.
 */

/** Icons larger than this, on either side in CSS px, are left as they are. */
export const LARGEST_ICON = 48;

/** The zigzag the test at start strokes, on Quick Add's 20-unit square, drawn twice its size. */
export const ZIGZAG = "M2 13.5 L6 7.5 L10 13.5 L14 7.5 L18 13.5";

/** How many distinct alpha values lie strictly between none and full in `rgba` (every fourth byte). */
export function inBetweenAlphas(rgba: ArrayLike<number>): number {
  const seen = new Set<number>();
  for (let i = 3; i < rgba.length; i += 4) {
    const a = rgba[i];
    if (a > 0 && a < 255) seen.add(a);
  }
  return seen.size;
}

/**
 * The window draws paths coarsely when a plain canvas grades the zigzag's
 * edges in a few fixed steps while a canvas kept for reading back grades
 * them finely. A web view that draws paths in a few fixed steps gives the
 * first very few; where both give middling counts, or the second few as
 * well, nothing says the first is the coarser.
 */
export function pathsLookCoarse(plain: number, kept: number): boolean {
  return plain <= 5 && kept >= 12;
}

/** What an element of an icon paints with, as computed. */
export interface InkPaint {
  fill: string;
  stroke: string;
  strokeWidth: string;
  strokeLinecap: string;
  strokeLinejoin: string;
  strokeMiterlimit: string;
  strokeDasharray: string;
  strokeDashoffset: string;
  opacity: string;
  fillOpacity: string;
  strokeOpacity: string;
  fillRule: string;
  visibility: string;
  display: string;
  /** What would keep the picture from being the icon: these are `none` on a plain one. */
  clipPath: string;
  mask: string;
  filter: string;
  markers: string;
  vectorEffect: string;
  animationName: string;
  /** The computed CSS transform (`none` where there is none). */
  transform: string;
}

/** One element of an icon: its tag, its geometry attributes (and `transform`), its computed paint, its elements. */
export interface InkNode {
  tag: string;
  attrs: Record<string, string>;
  paint: InkPaint;
  children: InkNode[];
  /** How many of the svg's CSS px one of the element's own units is (its viewBox's scale and its own and its groups' transforms); where not given, the viewBox's. */
  scale?: number;
}

/** An svg as its picture needs it described. */
export interface IconLook {
  /** Its box in CSS px, and the window's device pixels per CSS px. */
  width: number;
  height: number;
  ratio: number;
  /** The sums of its padding and of its border widths, in CSS px. */
  padding: number;
  border: number;
  overflow: string;
  /** Its computed `color`: the one ink it may paint with. */
  color: string;
  /** Its own computed background colour, background image and mask image (left out while it is shown through a picture). */
  background: string;
  backgroundImage: string;
  maskImage: string;
  viewBox: string | null;
  preserveAspectRatio: string | null;
  /** It carries `data-live`: the place refuses a picture. */
  live: boolean;
  forcedColors: boolean;
  /** A CSS animation or a running Web Animation on it or inside it. */
  animating: boolean;
  /** The svg itself: its paint and its elements. */
  root: InkNode;
}

/**
 * Strokes thinner than this, in device pixels, keep their icon as it is: a
 * hairline drawn finely spreads its ink over two pixels and reads lighter
 * than the same line drawn coarsely.
 */
export const THINNEST_STROKE = 1.1;

/** The scale from a viewBox's units to the svg's box (as `xMidYMid meet` fits it), or 1. */
export function viewBoxScale(look: IconLook): number {
  const v = look.viewBox?.trim().split(/[\s,]+/).map(Number);
  if (!v || v.length !== 4 || !(v[2] > 0) || !(v[3] > 0)) return 1;
  return Math.min(look.width / v[2], look.height / v[3]);
}

/** The elements a picture can be drawn from; any other (text, image, use, foreignObject, defs, style, animate...) leaves the icon as it is. */
const DRAWN = new Set(["g", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon"]);
const UNDRAWN = new Set(["title", "desc"]);

/** The geometry attributes of each drawn element. */
export const GEOMETRY: Record<string, readonly string[]> = {
  g: [],
  path: ["d"],
  rect: ["x", "y", "width", "height", "rx", "ry"],
  circle: ["cx", "cy", "r"],
  ellipse: ["cx", "cy", "rx", "ry"],
  line: ["x1", "y1", "x2", "y2"],
  polyline: ["points"],
  polygon: ["points"],
};

const whole = (n: number) => Math.abs(n - Math.round(n)) <= 0.01;

/** A computed colour's alpha, from none to full (`transparent` none; a colour with no alpha written, full). */
export function inkAlpha(color: string): number {
  const c = color.trim().toLowerCase();
  if (c === "transparent" || c === "") return 0;
  const inside = /\(([^)]*)\)/.exec(c)?.[1];
  if (inside === undefined) return 1;
  let alpha: string | undefined;
  if (inside.includes("/")) alpha = inside.split("/")[1];
  else {
    const parts = inside.split(",");
    if (parts.length === 4) alpha = parts[3];
  }
  if (alpha === undefined) return 1;
  const a = alpha.trim().endsWith("%") ? parseFloat(alpha) / 100 : parseFloat(alpha);
  return Number.isFinite(a) ? Math.min(1, Math.max(0, a)) : 0;
}

/** Why a node (not the svg itself) or what is in it keeps the icon as it is, or null. */
function nodeWhyLive(n: InkNode, ink: string, isRoot: boolean, fit: number, ratio: number): string | null {
  if (!isRoot && UNDRAWN.has(n.tag)) return null;
  if (!isRoot && !DRAWN.has(n.tag)) return `holds <${n.tag}>`;
  const p = n.paint;
  // (only shapes paint: the svg's and a group's own fill and stroke are only what their elements inherit, and those are read for each)
  const shape = !isRoot && n.tag !== "g";
  if (shape && p.fill !== "none" && p.fill !== ink) return "a second ink";
  if (shape && p.stroke !== "none" && p.stroke !== ink) return "a second ink";
  if (shape && p.stroke !== "none" && parseFloat(p.strokeWidth) * (n.scale ?? fit) * ratio < THINNEST_STROKE) return "a stroke thinner than a pixel";
  if (p.clipPath !== "none" || p.mask !== "none" || p.filter !== "none") return "a clip, mask or filter";
  if (p.markers !== "none") return "markers";
  if (p.vectorEffect !== "none") return "a vector effect";
  if (p.animationName !== "none") return "an animation";
  if (!isRoot && p.transform !== "none" && !n.attrs.transform) return "a CSS transform";
  for (const c of n.children) {
    const why = nodeWhyLive(c, ink, false, fit, ratio);
    if (why) return why;
  }
  return null;
}

/** Why the described svg is left as it is, or null where it is shown through its picture. */
export function whyLive(look: IconLook): string | null {
  if (look.forcedColors) return "forced colours";
  if (look.live) return "data-live";
  if (!(look.width > 0 && look.height > 0)) return "no box";
  if (look.width > LARGEST_ICON || look.height > LARGEST_ICON) return "larger than an icon";
  if (!whole(look.width * look.ratio) || !whole(look.height * look.ratio)) return "not on whole device pixels";
  if (look.padding !== 0 || look.border !== 0) return "padding or border";
  if (look.overflow === "visible") return "overflow visible";
  if (inkAlpha(look.color) < 1) return "a translucent ink";
  if (inkAlpha(look.background) > 0 || look.backgroundImage !== "none" || look.maskImage !== "none") return "a background or mask of its own";
  if (look.animating) return "an animation";
  return nodeWhyLive(look.root, look.color, true, viewBoxScale(look), look.ratio);
}

const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** A computed length as an attribute wants it: "1.8px" as "1.8", "2px, 3px" as "2, 3". */
const bare = (v: string) => v.replace(/(\d)px\b/g, "$1");

function paintAttrs(p: InkPaint, isRoot: boolean): [string, string][] {
  const out: [string, string][] = [
    ["fill", p.fill === "none" ? "none" : "black"],
    ["stroke", p.stroke === "none" ? "none" : "black"],
    ["stroke-width", bare(p.strokeWidth)],
    ["stroke-linecap", p.strokeLinecap],
    ["stroke-linejoin", p.strokeLinejoin],
    ["stroke-miterlimit", p.strokeMiterlimit],
    ["stroke-dasharray", bare(p.strokeDasharray)],
    ["stroke-dashoffset", bare(p.strokeDashoffset)],
    ["fill-opacity", p.fillOpacity],
    ["stroke-opacity", p.strokeOpacity],
    ["fill-rule", p.fillRule],
  ];
  // (the svg's own opacity, visibility and display are its element's, applied to its picture as to it)
  if (!isRoot) out.push(["opacity", p.opacity], ["visibility", p.visibility], ["display", p.display]);
  return out;
}

function nodeCopy(n: InkNode): string {
  if (UNDRAWN.has(n.tag)) return "";
  const attrs: [string, string][] = [];
  for (const g of GEOMETRY[n.tag] ?? []) if (n.attrs[g] !== undefined) attrs.push([g, n.attrs[g]]);
  if (n.attrs.transform) attrs.push(["transform", n.attrs.transform]);
  attrs.push(...paintAttrs(n.paint, false));
  const open = `<${n.tag}${attrs.map(([k, v]) => ` ${k}="${esc(v)}"`).join("")}`;
  const inner = n.children.map(nodeCopy).join("");
  return inner ? `${open}>${inner}</${n.tag}>` : `${open}/>`;
}

/** The icon's size in device pixels. */
export function picturePixels(look: IconLook): { width: number; height: number } {
  return { width: Math.round(look.width * look.ratio), height: Math.round(look.height * look.ratio) };
}

/**
 * The clean copy the picture is drawn from: the svg's viewBox at its size in
 * device pixels, each element with its geometry and its computed paint
 * written in, its one ink as black - so that no class or inherited style is
 * needed to draw it. It is also the picture's key, the size in it.
 */
export function cleanCopy(look: IconLook): string {
  const { width, height } = picturePixels(look);
  const root: [string, string][] = [
    ["xmlns", "http://www.w3.org/2000/svg"],
    ["viewBox", look.viewBox ?? `0 0 ${look.width} ${look.height}`],
    ["width", String(width)],
    ["height", String(height)],
  ];
  if (look.preserveAspectRatio) root.push(["preserveAspectRatio", look.preserveAspectRatio]);
  root.push(...paintAttrs(look.root.paint, true));
  return `<svg${root.map(([k, v]) => ` ${k}="${esc(v)}"`).join("")}>${look.root.children.map(nodeCopy).join("")}</svg>`;
}
