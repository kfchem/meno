/**
 * The column lies over the canvas's right side (docs/PDF.md, *One canvas*):
 * what is on the page in HTML - a step's card, a chip, words being written -
 * goes in a layer cut off where the column begins (PageHtml), and the view
 * follows the column as it opens, shuts or is dragged, so that what was in
 * the middle of the view stays in the middle of what can be seen.
 */
import { createContext, useContext, useEffect, useMemo, useRef, type RefObject } from "react";
import type * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { useEditor } from "../store";
import { setViewGoal, viewGoalOf, type ViewGoal } from "./viewGoal";

/** The layer the page's HTML goes in, cut off where the column begins: its element, once it is there. */
export const PageHtmlLayer = createContext<HTMLElement | null>(null);

/**
 * How the layer the page's HTML goes in is laid: over the canvas, its own
 * stacking context and clipped to the canvas's box - and cut off where the
 * column begins. However high what is in it stands among itself (a
 * stereo label's zIndexRange, a chip's, a card's), it is never over what is
 * beside or over the page - the panel beside the canvas, the cards, the
 * menus - and never seen past the canvas's edge, as an atom turned out of
 * view under the panel had its R or S shown over the panel.
 *
 * Clipped, not hidden (`PAGE_HTML_LAYER`, App.css): what is in it is placed
 * by the canvas, where the page has it, and the layer is never scrolled. A
 * box whose overflow is hidden is still one that can be scrolled - by a
 * focus, a scrollIntoView, a selection dragged past its edge - and all it
 * holds would be moved off where the page has it, over what it hangs from
 * (a frames chip's card, opened past the canvas's foot, seen over its own
 * molecule, 2026-10-29). Clipped, it is no box that scrolls at all.
 */
export function pageHtmlLayerStyle(cover: number): { isolation: "isolate"; clipPath?: string } {
  return { isolation: "isolate", ...(cover > 0 ? { clipPath: `inset(0 ${cover}px 0 0)` } : {}) };
}

/** The layer's class: its overflow clipped (App.css). */
export const PAGE_HTML_LAYER = "meno-page-html-layer";

/** The layer, as drei's Html takes a place to go in. */
export function usePageHtmlLayer(): RefObject<HTMLElement> | null {
  const el = useContext(PageHtmlLayer);
  return useMemo(() => (el ? { current: el } : null), [el]);
}

/** The room kept round a PDF brought beside the column, in CSS pixels: its name under it within it. */
const BESIDE_PX = 28;

/**
 * Where the view is to go as the column opens on a PDF - covering `now` CSS
 * pixels of the canvas, and `final` once it is open, the view following it
 * by half of what it comes to cover (`FollowCover`) - so that the PDF, `b`,
 * is all in what is left in view, in its middle: smaller where it would not
 * be, never larger. None, where it would be all in view as it is.
 */
export function viewBesideColumn(
  view: ViewGoal,
  size: { width: number; height: number },
  cover: { now: number; final: number },
  b: { x0: number; x1: number; y0: number; y1: number },
): ViewGoal | null {
  const { zoom } = view;
  const seen = size.width - cover.final;
  if (seen <= 2 * BESIDE_PX || !(zoom > 0)) return null;
  // (the view as it will be once the column is open, followed)
  const x = view.x + (cover.final - cover.now) / 2 / zoom;
  const left = x - size.width / 2 / zoom;
  const right = left + seen / zoom;
  const pad = BESIDE_PX / zoom;
  const inView =
    b.x0 >= left + pad && b.x1 <= right - pad && b.y0 >= view.y - size.height / 2 / zoom + pad && b.y1 <= view.y + size.height / 2 / zoom - pad;
  if (inView) return null;
  const z = Math.min(zoom, (seen - 2 * BESIDE_PX) / Math.max(1e-6, b.x1 - b.x0), (size.height - 2 * BESIDE_PX) / Math.max(1e-6, b.y1 - b.y0));
  // (its middle where the middle of what is seen will be, the following still to come)
  return { zoom: z, x: (b.x0 + b.x1) / 2 + cover.now / 2 / z, y: (b.y0 + b.y1) / 2 };
}

/** The view following the column: as it covers more or less, the view moves by half as much, eased. */
export function FollowCover() {
  const cover = useEditor((s) => s.cover);
  const { camera, invalidate } = useThree();
  const was = useRef<number | null>(null);
  useEffect(() => {
    if (was.current == null) {
      was.current = cover;
      return;
    }
    const d = cover - was.current;
    was.current = cover;
    if (!d) return;
    const cam = camera as THREE.OrthographicCamera;
    const goal = viewGoalOf(cam);
    const zoom = goal?.zoom ?? cam.zoom;
    if (!zoom) return;
    setViewGoal(cam, { zoom, x: (goal?.x ?? cam.position.x) + d / 2 / zoom, y: goal?.y ?? cam.position.y });
    invalidate();
  }, [cover, camera, invalidate]);
  return null;
}
