import { useFrame, useThree } from "@react-three/fiber";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import { DURATION } from "../../../theme/motion";
import { wordsReadAt } from "../utils/pageScale";
import type { Region } from "./hits";
import { usePageHits, type HitHandlers } from "./PageHits";
import PageShapes from "./PageShapes";
import PageTexts from "./PageTexts";
import type { Shape } from "./shapes";
import type { PageText } from "./texts";

/** What a placed thing draws where it stands (`at`, the page's units): its boxes, its words, the places that take the pointer. */
export type Drawn = { shapes: readonly Shape[]; texts: readonly PageText[]; regions?: readonly Region[] };

/**
 * A thing placed on the page by something that moves - a molecule's frames
 * chip, hanging below the molecule as it turns - drawn by WebGL with every
 * other such thing at once (`PagePlaced`): where `anchor` is on the page, as
 * `draw` draws it there; its words gone where the page's words are too small
 * to read, as its HTML's were (`words`); told of the pointer by `on`.
 */
export type Placed = { key: string; anchor: THREE.Object3D; draw: (at: { x: number; y: number }) => Drawn; words?: boolean; on?: HitHandlers };

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
 * whose words are read faded in and out with them, over Meno's quick time.
 */
export default function PagePlaced({ children }: { children?: ReactNode }) {
  const { camera, invalidate } = useThree();
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
  useFrame((_, dt) => {
    const zoom = (camera as THREE.OrthographicCamera).zoom || 1;
    read.current = wordsReadAt(zoom, read.current);
    const to = read.current ? 1 : 0;
    if (shown.current !== to) {
      const step = Math.min(dt, 1 / 20) / DURATION.quick;
      shown.current = to > shown.current ? Math.min(1, shown.current + step) : Math.max(0, shown.current - step);
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
    const shapes: Shape[] = [];
    const texts: PageText[] = [];
    const regions: Region[] = [];
    const handlers = new Map<string, HitHandlers>();
    for (const [key, p] of placed.current) {
      const w = where.current.get(key);
      if (!w) continue;
      const d = p.draw(w);
      const fade = p.words ? shown.current : 1;
      if (fade <= 0) continue;
      for (const s of d.shapes) shapes.push(fade < 1 ? { ...s, opacity: (s.opacity ?? 1) * fade } : s);
      for (const t of d.texts) texts.push(fade < 1 ? { ...t, opacity: (t.opacity ?? 1) * fade } : t);
      // (none taking the pointer while it is not read: as its HTML's took none, faded out)
      if (fade === 1) for (const r of d.regions ?? []) regions.push(r);
      if (p.on) handlers.set(key, p.on);
    }
    return { shapes, texts, regions, handlers };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- version: drawn again as anchors move, things come and go, words switch
  }, [version]);
  usePageHits(drawn.regions, {
    down: (key, part, e) => drawn.handlers.get(key)?.down?.(key, part, e),
    hover: (key, part, on) => drawn.handlers.get(key)?.hover?.(key, part, on),
    menu: (key, part, e) => drawn.handlers.get(key)?.menu?.(key, part, e),
  });
  return (
    <Placements.Provider value={registry}>
      {children}
      <PageShapes items={drawn.shapes} />
      <PageTexts items={drawn.texts} />
    </Placements.Provider>
  );
}
