import { useThree } from "@react-three/fiber";
import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";
import { CURSORS, setCursor, type CursorName } from "../../../theme/cursors";
import { pageAtScreen } from "../utils/page";
import { cursorChange, hitAt, type Hit, type Region } from "./hits";

/**
 * A press, a move or a menu on a region: where, on the screen and on the
 * page, the zoom then (a screen pixel is 1 / `zoom` of the page's units: a
 * drag's moves on the screen read on the page), and the event itself.
 */
export type PagePointer = { screen: { x: number; y: number }; page: { x: number; y: number }; zoom: number; event: PointerEvent | MouseEvent };

/**
 * What a layer of regions is told (`usePageHits`): a press on one, the
 * pointer coming onto one or leaving it, each move it makes over one (a
 * chip's bars, saying the one under it), its menu asked for.
 */
export type HitHandlers = {
  down?: (key: string, part: string, e: PagePointer) => void;
  hover?: (key: string, part: string, on: boolean) => void;
  move?: (key: string, part: string, e: PagePointer) => void;
  menu?: (key: string, part: string, e: PagePointer) => void;
};

/** A layer of regions, and whether they give way to what of the drawing lies over them (`usePageHits`, `usePageBeneath`). */
type Layer = { regions: readonly Region[]; on: HitHandlers; yields?: boolean };

/** Whether something of the drawing that takes a press lies at a point on the page, at a zoom (`usePageBeneath`). */
export type Beneath = (x: number, y: number, zoom: number) => boolean;

/** The page's layers of regions, in the order they were laid: a later one over an earlier one. */
export class PageRegions {
  private readonly layers = new Map<number, Layer>();
  private next = 0;
  private readonly beneath = new Set<{ current: Beneath }>();
  /** What says where the drawing takes a press, asked where a yielding layer's region would take it; given back by the function returned. */
  under(probe: { current: Beneath }): () => void {
    this.beneath.add(probe);
    return () => this.beneath.delete(probe);
  }
  add(layer: Layer): number {
    const id = this.next++;
    this.layers.set(id, layer);
    return id;
  }
  set(id: number, layer: Layer): void {
    if (this.layers.has(id)) this.layers.set(id, layer);
  }
  remove(id: number): void {
    this.layers.delete(id);
  }
  /**
   * What is under `x`, `y` on the page at `zoom`, and the layer it is in: a
   * yielding layer's region - a frame's tab or edge - only where nothing of
   * the drawing that takes a press lies there (a member's atom or bond, the
   * selection's turn handle), which then has it.
   */
  at(x: number, y: number, zoom: number, accept?: (key: string, part: string) => boolean): (Hit & { on: HitHandlers }) | null {
    const layers = [...this.layers.values()];
    const find = (from: readonly Layer[]) => hitAt(
      from.map((l) => l.regions),
      x,
      y,
      zoom,
      accept,
    );
    let hit = find(layers);
    if (!hit) return null;
    let layer = layers.find((l) => l.regions.includes(hit!.region))!;
    if (layer.yields && [...this.beneath].some((b) => b.current(x, y, zoom))) {
      const firm = layers.filter((l) => !l.yields);
      hit = find(firm);
      if (!hit) return null;
      layer = firm.find((l) => l.regions.includes(hit!.region))!;
    }
    return { ...hit, on: layer.on };
  }
}

const Regions = createContext<PageRegions | null>(null);

/**
 * `regions` taking the pointer on the page, told to `on`: laid once, over
 * those laid before, and taken up again as they change; gone with the
 * component. `yields`: they give way to what of the drawing lies over them
 * (`usePageBeneath`) - a frame's tab and edges to a member's atoms and bonds
 * and the selection's turn handle.
 */
export function usePageHits(regions: readonly Region[], on: HitHandlers, yields = false): void {
  const all = useContext(Regions);
  const id = useRef<number | null>(null);
  useEffect(() => {
    if (!all) return;
    const me = all.add({ regions: [], on: {} });
    id.current = me;
    return () => {
      all.remove(me);
      id.current = null;
    };
  }, [all]);
  useEffect(() => {
    if (all && id.current != null) all.set(id.current, { regions, on, yields });
  });
}

/** Where the drawing takes a press (`probe`, page units), told to the page's regions: a yielding layer gives way to it there. */
export function usePageBeneath(probe: Beneath): void {
  const all = useContext(Regions);
  const latest = useRef(probe);
  latest.current = probe;
  useEffect(() => (all ? all.under(latest) : undefined), [all]);
}

/** The region under a point on the screen - a wire let go there, say: only those `accept` takes. */
export function useHitAt(): (screen: { x: number; y: number }, accept?: (key: string, part: string) => boolean) => Hit | null {
  const all = useContext(Regions);
  const { camera, gl } = useThree();
  return (screen, accept) => {
    if (!all) return null;
    const p = pageAtScreen(screen, gl.domElement, camera);
    return all.at(p.x, p.y, (camera as THREE.OrthographicCamera).zoom || 1, accept);
  };
}

const isMeno = (c: string): c is CursorName => c in CURSORS;

/**
 * The page's regions (`usePageHits`), asked before anything else on the
 * canvas - the molecules, the drawing, the view's pan - as the page's HTML
 * was over them: a press, a move, a click or a double-click on one is
 * its, and goes no further - heard above the canvas, before the selection's
 * own listeners on its wrapper hear it. The
 * pointer over one shows its cursor; leaving it, or another coming over it,
 * says so (`hover`).
 */
export default function PageHits({ children }: { children?: ReactNode }) {
  const all = useMemo(() => new PageRegions(), []);
  const { gl, camera } = useThree();
  useEffect(() => {
    const dom = gl.domElement as HTMLCanvasElement;
    // (heard before anything else on the canvas hears it: before what listens on the canvas's own wrapper as it is pressed - the
    //  selection's box, a double-click's Quick Add - two elements up, as a press goes down; only what lands on the canvas)
    const host = dom.parentElement?.parentElement ?? dom.parentElement ?? dom;
    const onCanvas = (e: Event) => e.target === dom;
    let over: (Hit & { on: HitHandlers }) | null = null;
    const find = (e: PointerEvent | MouseEvent) => {
      const screen = { x: e.clientX, y: e.clientY };
      const page = pageAtScreen(screen, dom, camera);
      const zoom = (camera as THREE.OrthographicCamera).zoom || 1;
      return { hit: all.at(page.x, page.y, zoom), at: { screen, page, zoom, event: e } as PagePointer };
    };
    const show = (hit: (Hit & { on: HitHandlers }) | null) => {
      const change = cursorChange(over, hit);
      if (!change) return;
      if (over) over.on.hover?.(over.key, over.part, false);
      if (change.clear) {
        setCursor(dom, null);
        dom.style.cursor = "";
      }
      over = hit;
      if (!hit) return;
      const c = change.set;
      if (c && isMeno(c)) setCursor(dom, c);
      else if (c) dom.style.cursor = c;
      hit.on.hover?.(hit.key, hit.part, true);
    };
    const onMove = (e: PointerEvent) => {
      // (a press held - a drag under way - is its own: nothing hovered meanwhile; nor over what lies over the canvas)
      if (e.buttons || !onCanvas(e)) return;
      const { hit, at } = find(e);
      show(hit);
      if (!hit) return;
      e.stopImmediatePropagation();
      hit.on.move?.(hit.key, hit.part, at);
    };
    const onDown = (e: PointerEvent) => {
      if (!onCanvas(e)) return;
      const { hit, at } = find(e);
      if (!hit) return;
      e.stopImmediatePropagation();
      if (e.button === 0) hit.on.down?.(hit.key, hit.part, at);
    };
    const onMenu = (e: MouseEvent) => {
      if (!onCanvas(e)) return;
      const { hit, at } = find(e);
      if (!hit) return;
      e.stopImmediatePropagation();
      e.preventDefault();
      hit.on.menu?.(hit.key, hit.part, at);
    };
    // (a click and a double-click on one are its too: the page's own - Quick Add on a double-click on empty space - never hears them)
    const onClick = (e: MouseEvent) => {
      if (onCanvas(e) && find(e).hit) e.stopImmediatePropagation();
    };
    const onLeave = () => show(null);
    host.addEventListener("pointermove", onMove, true);
    host.addEventListener("pointerdown", onDown, true);
    host.addEventListener("contextmenu", onMenu, true);
    dom.addEventListener("pointerleave", onLeave, true);
    host.addEventListener("click", onClick, true);
    host.addEventListener("dblclick", onClick, true);
    return () => {
      host.removeEventListener("pointermove", onMove, true);
      host.removeEventListener("pointerdown", onDown, true);
      host.removeEventListener("contextmenu", onMenu, true);
      dom.removeEventListener("pointerleave", onLeave, true);
      host.removeEventListener("click", onClick, true);
      host.removeEventListener("dblclick", onClick, true);
      show(null);
    };
  }, [all, gl, camera]);
  return <Regions.Provider value={all}>{children}</Regions.Provider>;
}
