/**
 * Icons that keep fine edges (docs/LOOK.md, *Icons*). Where the window draws
 * the paths of small vector icons with coarse edges, though it draws text
 * and a canvas kept for reading back finely, each small one-ink svg of the
 * window's own controls is shown through a picture of itself drawn on such
 * a canvas: the svg keeps its place, its box, its colour and its behaviour;
 * its own ink becomes the background, seen through the picture as a mask.
 * Where the window draws paths finely, nothing here does anything.
 *
 * Started once (main.tsx). `startIconPictures({ force: true })` shows the
 * icons so whatever the window does, for trying it by hand; Meno never
 * passes it.
 */
import { ZIGZAG, cleanCopy, inBetweenAlphas, pathsLookCoarse, picturePixels, whyLive, GEOMETRY, type IconLook, type InkNode, type InkPaint } from "./iconPictureRules";

/** The zigzag's in-between alpha steps, drawn twice its size on a 40 px canvas never put into the page: a plain one, or one kept for reading back. */
function zigzagSteps(kept: boolean): number {
  const canvas = document.createElement("canvas");
  canvas.width = 40;
  canvas.height = 40;
  const ctx = (kept ? canvas.getContext("2d", { willReadFrequently: true }) : canvas.getContext("2d")) as CanvasRenderingContext2D | null;
  if (!ctx) throw new Error("no 2d canvas");
  ctx.scale(2, 2);
  ctx.lineWidth = 1.8;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke(new Path2D(ZIGZAG));
  return inBetweenAlphas(ctx.getImageData(0, 0, 40, 40).data);
}

/** The test at start: whether this window draws paths coarsely. Anything failing reads as not. */
export function drawsPathsCoarsely(): boolean {
  try {
    return pathsLookCoarse(zigzagSteps(false), zigzagSteps(true));
  } catch {
    return false;
  }
}

/** The inline styles that show an svg through its picture. */
const SHOWN = ["background-color", "mask-image", "-webkit-mask-image", "mask-size", "-webkit-mask-size", "mask-repeat", "-webkit-mask-repeat"];
/** How many svgs are looked at, and pictures begun, in one idle moment; how many svgs at most are looked at at once as they come. */
const PER_SLICE = 4;
const AT_ONCE = 32;

interface Picture {
  url: string;
  /** The picture itself, decoded and kept, so showing it again never waits. */
  image: HTMLImageElement;
}

function paintOf(cs: CSSStyleDeclaration): InkPaint {
  const marker = [cs.getPropertyValue("marker-start"), cs.getPropertyValue("marker-mid"), cs.getPropertyValue("marker-end")];
  return {
    fill: cs.fill,
    stroke: cs.stroke,
    strokeWidth: cs.strokeWidth,
    strokeLinecap: cs.strokeLinecap,
    strokeLinejoin: cs.strokeLinejoin,
    strokeMiterlimit: cs.strokeMiterlimit,
    strokeDasharray: cs.strokeDasharray,
    strokeDashoffset: cs.strokeDashoffset,
    opacity: cs.opacity,
    fillOpacity: cs.fillOpacity,
    strokeOpacity: cs.strokeOpacity,
    fillRule: cs.fillRule,
    visibility: cs.visibility,
    display: cs.display,
    clipPath: cs.clipPath || "none",
    mask: (cs.maskImage || cs.getPropertyValue("-webkit-mask-image") || "none") === "none" ? "none" : "mask",
    filter: cs.filter || "none",
    markers: marker.every((m) => m === "" || m === "none") ? "none" : "markers",
    vectorEffect: cs.getPropertyValue("vector-effect") || "none",
    animationName: cs.animationName || "none",
    transform: cs.transform || "none",
  };
}

function nodeOf(el: Element): InkNode {
  const tag = el.localName;
  const attrs: Record<string, string> = {};
  for (const g of GEOMETRY[tag] ?? []) {
    const v = el.getAttribute(g);
    if (v !== null) attrs[g] = v;
  }
  const t = el.getAttribute("transform");
  if (t !== null) attrs.transform = t;
  const node: InkNode = { tag, attrs, paint: paintOf(getComputedStyle(el)), children: Array.from(el.children, nodeOf) };
  // (one of its units in the svg's CSS px: the viewBox's scale with its own and its groups' transforms, read once as it is looked at)
  const m = (el as SVGGraphicsElement).getCTM?.();
  if (m) {
    const scale = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c));
    if (Number.isFinite(scale) && scale > 0) node.scale = scale;
  }
  return node;
}

const px = (v: string) => parseFloat(v) || 0;

/** The svg described as its picture needs it; `shown` where it is shown through one now (its own background and mask are then ours). */
function lookOf(svg: SVGSVGElement, shown: boolean): IconLook {
  const cs = getComputedStyle(svg);
  const root: InkNode = { tag: "svg", attrs: {}, paint: paintOf(cs), children: Array.from(svg.children, nodeOf) };
  // (the mask the root's own paint reads is ours where it is shown)
  if (shown) root.paint.mask = "none";
  const maskImage = cs.maskImage || cs.getPropertyValue("-webkit-mask-image") || "none";
  return {
    width: px(cs.width),
    height: px(cs.height),
    ratio: window.devicePixelRatio || 1,
    padding: px(cs.paddingTop) + px(cs.paddingRight) + px(cs.paddingBottom) + px(cs.paddingLeft),
    border: px(cs.borderTopWidth) + px(cs.borderRightWidth) + px(cs.borderBottomWidth) + px(cs.borderLeftWidth),
    overflow: cs.overflow,
    color: cs.color,
    background: shown ? "transparent" : cs.backgroundColor,
    backgroundImage: cs.backgroundImage || "none",
    maskImage: shown ? "none" : maskImage,
    viewBox: svg.getAttribute("viewBox"),
    preserveAspectRatio: svg.getAttribute("preserveAspectRatio"),
    live: svg.hasAttribute("data-live"),
    forcedColors: window.matchMedia?.("(forced-colors: active)").matches ?? false,
    animating: (svg.getAnimations?.({ subtree: true }).length ?? 0) > 0,
    root,
  };
}

/** The picture of a clean copy, `w` x `h` device pixels, drawn on a canvas kept for reading back. */
async function drawPicture(copy: string, w: number, h: number): Promise<Picture> {
  const source = new Image();
  source.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(copy)}`;
  await source.decode();
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D | null;
  if (!ctx) throw new Error("no 2d canvas");
  ctx.drawImage(source, 0, 0, w, h);
  const url = canvas.toDataURL("image/png");
  const image = new Image();
  image.src = url;
  await image.decode();
  return { url, image };
}

let running: (() => void) | null = null;

/**
 * Starts showing the window's small icons through pictures of themselves,
 * where the test at start finds the window draws paths coarsely (or always,
 * with `force`). Returns what stops it and gives every icon back as it was.
 */
export function startIconPictures(options: { force?: boolean } = {}): () => void {
  if (running) return running;
  if (typeof document === "undefined" || !document.body) return () => {};
  if (!options.force && !drawsPathsCoarsely()) return () => {};

  /** Every picture made this session, by its clean copy. */
  const pictures = new Map<string, Picture>();
  /** Clean copies whose picture could not be made: not tried again. */
  const failed = new Set<string>();
  /** Each svg shown through a picture, and the observer that watches it. */
  const watched = new Map<SVGSVGElement, MutationObserver>();
  /** The clean copy each svg is waiting to be shown through. */
  const wanted = new WeakMap<SVGSVGElement, string>();
  const queue = new Set<SVGSVGElement>();
  /** The svgs waiting for each picture being made. */
  const making = new Map<string, Set<SVGSVGElement>>();
  let scheduled = false;

  const quiet = (e: unknown) => console.debug("icon picture not made", e);

  const takeOff = (svg: SVGSVGElement) => {
    for (const p of SHOWN) svg.style.removeProperty(p);
    const o = watched.get(svg);
    o?.takeRecords();
  };

  const putOn = (svg: SVGSVGElement, picture: Picture) => {
    const mask = `url("${picture.url}")`;
    svg.style.setProperty("background-color", "currentColor");
    for (const k of ["mask-image", "-webkit-mask-image"]) svg.style.setProperty(k, mask);
    for (const k of ["mask-size", "-webkit-mask-size"]) svg.style.setProperty(k, "100% 100%");
    for (const k of ["mask-repeat", "-webkit-mask-repeat"]) svg.style.setProperty(k, "no-repeat");
    let o = watched.get(svg);
    if (!o) {
      o = new MutationObserver(() => changed(svg));
      o.observe(svg, { attributes: true, childList: true, characterData: true, subtree: true });
      watched.set(svg, o);
    }
    // (what was just written here is not a change of the icon)
    o.takeRecords();
  };

  const letGo = (svg: SVGSVGElement) => {
    watched.get(svg)?.disconnect();
    watched.delete(svg);
    wanted.delete(svg);
    queue.delete(svg);
  };

  /** Looks at the svg as it is now: its picture put on at once where it is made, else asked for; or left as it is. */
  const look = (svg: SVGSVGElement) => {
    if (!svg.isConnected) return letGo(svg);
    const shown = watched.has(svg) && svg.style.getPropertyValue("mask-image") !== "";
    let state: IconLook;
    try {
      state = lookOf(svg, shown);
    } catch (e) {
      quiet(e);
      return;
    }
    const why = whyLive(state);
    if (why) {
      if (shown) takeOff(svg);
      wanted.delete(svg);
      return;
    }
    const copy = cleanCopy(state);
    wanted.set(svg, copy);
    const made = pictures.get(copy);
    if (made) return putOn(svg, made);
    if (failed.has(copy)) return;
    const waiting = making.get(copy);
    if (waiting) return void waiting.add(svg);
    making.set(copy, new Set([svg]));
    const { width, height } = picturePixels(state);
    drawPicture(copy, width, height).then(
      (picture) => {
        const waiters = making.get(copy) ?? [];
        making.delete(copy);
        pictures.set(copy, picture);
        // (each svg still waiting for this one, as it is now: one changed meanwhile wants another)
        for (const s of waiters) if (wanted.get(s) === copy && s.isConnected) putOn(s, picture);
      },
      (e) => {
        making.delete(copy);
        failed.add(copy);
        quiet(e);
      },
    );
  };

  const slice = () => {
    scheduled = false;
    let n = 0;
    for (const svg of queue) {
      queue.delete(svg);
      look(svg);
      if (++n >= PER_SLICE) break;
    }
    if (queue.size) schedule();
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    if (typeof requestIdleCallback === "function") requestIdleCallback(slice, { timeout: 200 });
    else setTimeout(slice, 16);
  };
  const later = (svg: SVGSVGElement) => {
    queue.add(svg);
    schedule();
  };

  /** Something of a shown svg changed: its picture comes off at once, and the new one goes on at once where it is made. */
  const changed = (svg: SVGSVGElement) => {
    takeOff(svg);
    wanted.delete(svg);
    look(svg);
  };

  /** The outermost svgs in what was added. */
  const svgsIn = (node: Node, into: SVGSVGElement[]) => {
    if (node.nodeType !== 1) return;
    const el = node as Element;
    if (el.localName === "svg") {
      if (!(el as SVGSVGElement).ownerSVGElement) into.push(el as SVGSVGElement);
      return;
    }
    for (const s of el.querySelectorAll("svg")) if (!s.ownerSVGElement) into.push(s);
  };

  const body = new MutationObserver((records) => {
    const added: SVGSVGElement[] = [];
    let removed = false;
    for (const r of records) {
      for (const n of r.addedNodes) svgsIn(n, added);
      if (!removed && watched.size) for (const n of r.removedNodes) if (n.nodeType === 1 && ((n as Element).localName === "svg" || (n as Element).querySelector("svg"))) removed = true;
    }
    if (removed) for (const svg of [...watched.keys()]) if (!svg.isConnected) letGo(svg);
    // (an icon seen before is shown through its picture before the next paint; many at once wait their turn)
    added.forEach((svg, i) => (i < AT_ONCE && !watched.has(svg) ? look(svg) : later(svg)));
  });
  body.observe(document.body, { childList: true, subtree: true });

  const everySvg = () => {
    for (const s of document.querySelectorAll("svg")) if (!s.ownerSVGElement) later(s);
  };
  everySvg();

  // The screen's pixels per CSS px, followed as canvasRatio.ts follows them: every svg looked at again.
  let ratioQuery: MediaQueryList | null = null;
  const onRatio = () => {
    follow();
    everySvg();
  };
  const follow = () => {
    ratioQuery?.removeEventListener("change", onRatio);
    ratioQuery = window.matchMedia?.(`(resolution: ${window.devicePixelRatio || 1}dppx)`) ?? null;
    ratioQuery?.addEventListener("change", onRatio);
  };
  follow();

  running = () => {
    body.disconnect();
    ratioQuery?.removeEventListener("change", onRatio);
    for (const svg of [...watched.keys()]) {
      takeOff(svg);
      letGo(svg);
    }
    queue.clear();
    running = null;
  };
  return running;
}
