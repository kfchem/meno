import { useFrame, useThree } from "@react-three/fiber";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import { DURATION } from "../../../theme/motion";
import { useEditor } from "../store";
import { wordsReadAt } from "../utils/pageScale";
import type { Region } from "./hits";
import { usePageHits, type HitHandlers } from "./PageHits";
import PageTip from "../components/PageTip";
import { PORTS_Z } from "../workflow/look";
import type { PageIcon } from "./icons";
import PageIcons from "./PageIcons";
import PagePolys, { type PagePoly } from "./PagePolys";
import PageShapes, { PAGE_GL_ORDER } from "./PageShapes";
import PageTexts from "./PageTexts";
import type { Shape } from "./shapes";
import type { PageText } from "./texts";

/** What the page's hover tip says (components/PageTip), and the middle and size of what it is about, in the page's units. */
export type PageTipAt = { key: string; text: string; x: number; y: number; w: number; h: number };

/**
 * What a placed thing draws where it stands (`at`, the page's units): its
 * boxes, its words, its icons and filled shapes, the places that take the
 * pointer; and what the page's tip says for it, while a part of it is
 * pointed at that says something.
 */
export type Drawn = { shapes: readonly Shape[]; texts: readonly PageText[]; icons?: readonly PageIcon[]; polys?: readonly PagePoly[]; regions?: readonly Region[]; tip?: PageTipAt };

/** How the page is seen as a thing is drawn: its zoom, and the screen's device pixels to its own - what lays a chip's bars on whole device pixels. */
export type PageView = { zoom: number; dpr: number };

/**
 * Where what is raised is drawn among the page's WebGL - an opened chip -
 * over all the rest of it, the words of the chips beside it and R and S
 * beside their molecules (components/StereoInk3D) among them: as its HTML
 * was laid over the rest of the page's HTML.
 */
export const RAISED_ORDER = PAGE_GL_ORDER + 12;

/** Where the page's tip lies among its HTML: over the workflow's ports (`PORTS_Z`) as an opened chip was, so nothing hides it. */
const RAISED_Z: [number, number] = [PORTS_Z + 3, PORTS_Z + 1];

/**
 * A thing placed on the page by something that moves - a molecule's frames
 * chip, hanging below the molecule as it turns - drawn by WebGL with every
 * other such thing at once (`PagePlaced`): where `anchor` is on the page, as
 * `draw` draws it there; its words gone where the page's words are too small
 * to read, as its HTML's were (`words`); gone while a talk is given, where
 * it is something to work the page with (`control`: a frames chip - App.css
 * `.meno-control-chip`, docs/PRESENTING.md); told of the pointer by `on`.
 * `raised`, it is drawn over all the rest (`RAISED_ORDER`: an opened chip);
 * `zoomed`, drawn again as the zoom changes, where how it is drawn depends
 * on it (`PageView`: bars on whole device pixels).
 */
export type Placed = {
  key: string;
  anchor: THREE.Object3D;
  draw: (at: { x: number; y: number }, view: PageView) => Drawn;
  words?: boolean;
  control?: boolean;
  raised?: boolean;
  zoomed?: boolean;
  on?: HitHandlers;
};

type Registry = { set: (key: string, p: Placed | null) => void };
const Placements = createContext<Registry | null>(null);

/** `placed` drawn on the page with the rest (`PagePlaced`) while it is given; none, gone. */
export function usePlaced(placed: Placed | null): void {
  const all = useContext(Placements);
  const key = useRef<string | null>(null);
  useEffect(() => {
    if (!all) return;
    if (placed) {
      key.current = placed.key;
      all.set(placed.key, placed);
    } else if (key.current) {
      all.set(key.current, null);
      key.current = null;
    }
  });
  useEffect(
    () => () => {
      if (all && key.current) all.set(key.current, null);
    },
    [all],
  );
}

const at = new THREE.Vector3();

/**
 * Every thing placed under it (`usePlaced`) drawn by WebGL at once - one set
 * of boxes, one of words, one layer of places taking the pointer - each
 * where its anchor is now: read every frame, drawn again only where one has
 * moved, or one has come or gone, or the page's words have switched; those
 * whose words are read faded in and out with them, over Meno's quick time;
 * those that work the page faded out while a talk is given, and back after.
 */
export default function PagePlaced({ children }: { children?: ReactNode }) {
  const { camera, invalidate, gl } = useThree();
  const view = useRef<PageView>({ zoom: 1, dpr: 1 });
  const placed = useRef(new Map<string, Placed>());
  const where = useRef(new Map<string, { x: number; y: number }>());
  const [version, setVersion] = useState(0);
  const dirty = useRef(true);
  const registry = useMemo<Registry>(
    () => ({
      set: (key, p) => {
        if (p) placed.current.set(key, p);
        else {
          placed.current.delete(key);
          where.current.delete(key);
        }
        dirty.current = true;
        invalidate();
      },
    }),
    [invalidate],
  );
  // (whether the page's words are read, and how far shown they are: switched past their threshold, faded over a short time)
  const read = useRef(true);
  const shown = useRef(1);
  // (whether a talk is given, and how far shown what works the page is: faded out over a short time as one begins, and back)
  const talking = useEditor((s) => s.presenting != null);
  const controls = useRef(talking ? 0 : 1);
  useEffect(() => invalidate(), [talking, invalidate]);
  /** `now` a frame of `dt` seconds nearer `to`, over Meno's quick time. */
  const toward = (now: number, to: number, dt: number) => {
    const step = Math.min(dt, 1 / 20) / DURATION.quick;
    return to > now ? Math.min(to, now + step) : Math.max(to, now - step);
  };
  useFrame((_, dt) => {
    const zoom = (camera as THREE.OrthographicCamera).zoom || 1;
    const dpr = gl.getPixelRatio();
    if (zoom !== view.current.zoom || dpr !== view.current.dpr) {
      view.current = { zoom, dpr };
      for (const p of placed.current.values()) if (p.zoomed) dirty.current = true;
    }
    read.current = wordsReadAt(zoom, read.current);
    const to = read.current ? 1 : 0;
    if (shown.current !== to) {
      shown.current = toward(shown.current, to, dt);
      dirty.current = true;
      invalidate();
    }
    const controlsTo = talking ? 0 : 1;
    if (controls.current !== controlsTo) {
      controls.current = toward(controls.current, controlsTo, dt);
      dirty.current = true;
      invalidate();
    }
    for (const [key, p] of placed.current) {
      p.anchor.getWorldPosition(at);
      const was = where.current.get(key);
      if (!was || Math.abs(was.x - at.x) > 1e-5 || Math.abs(was.y - at.y) > 1e-5) {
        where.current.set(key, { x: at.x, y: at.y });
        dirty.current = true;
      }
    }
    if (dirty.current) {
      dirty.current = false;
      setVersion((v) => v + 1);
    }
  });
  const drawn = useMemo(() => {
    // (the rest, and what is raised over it: each its boxes, filled shapes, words and icons)
    const layers = [0, 1].map(() => ({ shapes: [] as Shape[], polys: [] as PagePoly[], texts: [] as PageText[], icons: [] as PageIcon[] }));
    const regions: Region[] = [];
    const handlers = new Map<string, HitHandlers>();
    let tip: PageTipAt | null = null;
    for (const [key, p] of placed.current) {
      const w = where.current.get(key);
      if (!w) continue;
      const d = p.draw(w, view.current);
      const fade = (p.words ? shown.current : 1) * (p.control ? controls.current : 1);
      if (fade <= 0) continue;
      const faded = <T extends { opacity?: number }>(x: T): T => (fade < 1 ? { ...x, opacity: (x.opacity ?? 1) * fade } : x);
      const layer = layers[p.raised ? 1 : 0];
      for (const s of d.shapes) layer.shapes.push(faded(s));
      for (const q of d.polys ?? []) layer.polys.push(faded(q));
      for (const t of d.texts) layer.texts.push(faded(t));
      for (const i of d.icons ?? []) layer.icons.push(faded(i));
      // (none taking the pointer while it is not read: as its HTML's took none, faded out)
      if (fade === 1) for (const r of d.regions ?? []) regions.push(r);
      if (fade === 1 && d.tip) tip = d.tip;
      if (p.on) handlers.set(key, p.on);
    }
    return { layers, regions, handlers, tip };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- version: drawn again as anchors move, things come and go, words switch
  }, [version]);
  usePageHits(drawn.regions, {
    down: (key, part, e) => drawn.handlers.get(key)?.down?.(key, part, e),
    hover: (key, part, on) => drawn.handlers.get(key)?.hover?.(key, part, on),
    move: (key, part, e) => drawn.handlers.get(key)?.move?.(key, part, e),
    menu: (key, part, e) => drawn.handlers.get(key)?.menu?.(key, part, e),
  });
  return (
    <Placements.Provider value={registry}>
      {children}
      {drawn.tip && <PageTip tipKey={drawn.tip.key} x={drawn.tip.x} y={drawn.tip.y} w={drawn.tip.w} h={drawn.tip.h} zoom={view.current.zoom} text={drawn.tip.text} zIndexRange={RAISED_Z} />}
      {drawn.layers.map((l, k) => {
        const order = k ? RAISED_ORDER : PAGE_GL_ORDER;
        // (a layer's filled shapes over its boxes, its words and icons over both; what is raised over all the rest)
        return (
          <group key={k}>
            <PageShapes items={l.shapes} order={order} />
            <PagePolys items={l.polys} order={order + 0.5} />
            <PageTexts items={l.texts} order={order + 1} />
            <PageIcons items={l.icons} order={order + 1} />
          </group>
        );
      })}
    </Placements.Provider>
  );
}
