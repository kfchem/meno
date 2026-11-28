import { useLayoutEffect, type RefObject } from "react";
import { placeMenu } from "./menuAt";

/** What a menu needs of the canvas to stand at a point on the page and keep it there. */
export type MenuAnchor = {
  /** Where a point on the page is on the canvas now, in px from its top left corner - null before the canvas is drawn. */
  project: (at: { x: number; y: number }) => { x: number; y: number } | null;
  /** The point on the page that a point on the canvas, in px from its top left corner, shows now - null before the canvas is drawn. */
  world: (px: { x: number; y: number }) => { x: number; y: number } | null;
  /** The canvas's size, and how much of its right side the column covers. */
  room: () => { width: number; height: number; cover: number } | null;
};

/**
 * A menu opened at `from`, a point on the canvas (docs/EDITOR-2D.md, *Menus*):
 * its top left corner up and to the right of the point, whatever its size,
 * and kept at that point on the page as the view moves - it is anchored to
 * the page. Where it would lie past the canvas - the column's cover counted -
 * it places itself otherwise (`placeMenu`): upward, or to the left, or slid
 * in; as it opens, as it grows (a panel opened in it), and as the chemist
 * moves the view. The view is never moved for it.
 * Without `anchor` it stands at `from`, as it first renders.
 */
export function useMenuAt(ref: RefObject<HTMLElement | null>, from: { x: number; y: number }, anchor: MenuAnchor | undefined): void {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !anchor) return;
    return standMenu(el, from, anchor);
    // (the point it was opened at is the one it keeps)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor]);
}

/**
 * A menu's element `el` stood at `from` on the canvas (`useMenuAt`), and kept
 * there frame by frame, and as it grows, until the stop it returns is called.
 */
export function standMenu(el: HTMLElement, from: { x: number; y: number }, anchor: MenuAnchor): () => void {
  let last = "";
  // (the point on the page that it was opened at, taken once)
  const at = anchor.world(from);
  const place = () => {
    const p = (at && anchor.project(at)) ?? from;
    const view = anchor.room() ?? { width: Infinity, height: Infinity, cover: 0 };
    const c = placeMenu(p, { width: el.offsetWidth, height: el.offsetHeight }, view, view.cover);
    const key = `${c.left},${c.top},${c.up},${c.leftward}`;
    if (key === last) return;
    last = key;
    el.style.left = `${c.left}px`;
    el.style.top = `${c.top}px`;
    // (it grows in from the corner nearest its point: from below where it opened upward)
    el.style.transformOrigin = `${c.up ? "bottom" : "top"} ${c.leftward ? "right" : "left"}`;
  };
  place();
  const ro = new ResizeObserver(place);
  ro.observe(el);
  let frame = requestAnimationFrame(function follow() {
    place();
    frame = requestAnimationFrame(follow);
  });
  return () => {
    ro.disconnect();
    cancelAnimationFrame(frame);
  };
}
