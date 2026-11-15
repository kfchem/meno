import { useLayoutEffect, type RefObject } from "react";
import { MENU_OFF, panFor } from "./menuAt";

/** What a menu needs of the canvas to stand at a point on the page and keep it there. */
export type MenuAnchor = {
  /** Where a point on the page is on the canvas now, in px from its top left corner - null before the canvas is drawn. */
  project: (at: { x: number; y: number }) => { x: number; y: number } | null;
  /** The point on the page that a point on the canvas, in px from its top left corner, shows now - null before the canvas is drawn. */
  world: (px: { x: number; y: number }) => { x: number; y: number } | null;
  /** The canvas's size, and how much of its right side the column covers. */
  room: () => { width: number; height: number; cover: number } | null;
  /** The page slid on the screen by so many px, right and down where positive (the view eased along, never zoomed). */
  pan: (dx: number, dy: number) => void;
};

/**
 * A menu opened at `from`, a point on the canvas (docs/EDITOR-2D.md, *Menus*):
 * its top left corner `MENU_OFF` up and to the right of the point, whatever
 * its size, and kept there as the view moves - it is anchored to the page.
 * Where any of it lies past the canvas - the column's cover counted - the
 * view eases along by just that and a margin (`panFor`), as it opens and
 * again as it grows (a panel opened in it); and stays where it went once it
 * is shut. Without `anchor` it stands at `from`, as it first renders.
 */
export function useMenuAt(ref: RefObject<HTMLElement | null>, from: { x: number; y: number }, anchor: MenuAnchor | undefined): void {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !anchor) return;
    let last = "";
    // (the point on the page that it was opened at, taken once)
    const at = anchor.world(from);
    const corner = () => {
      const p = (at && anchor.project(at)) ?? from;
      return { left: p.x + MENU_OFF, top: p.y - MENU_OFF };
    };
    const place = () => {
      const c = corner();
      const key = `${c.left},${c.top}`;
      if (key === last) return;
      last = key;
      el.style.left = `${c.left}px`;
      el.style.top = `${c.top}px`;
    };
    const room = () => {
      const view = anchor.room();
      if (!view) return;
      const c = corner();
      const { dx, dy } = panFor({ left: c.left, top: c.top, right: c.left + el.offsetWidth, bottom: c.top + el.offsetHeight }, { left: 0, top: 0, right: view.width, bottom: view.height }, view.cover);
      if (dx !== 0 || dy !== 0) anchor.pan(dx, dy);
    };
    place();
    room();
    const ro = new ResizeObserver(room);
    ro.observe(el);
    let frame = requestAnimationFrame(function follow() {
      place();
      frame = requestAnimationFrame(follow);
    });
    return () => {
      ro.disconnect();
      cancelAnimationFrame(frame);
    };
    // (the point it was opened at is the one it keeps)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor]);
}
