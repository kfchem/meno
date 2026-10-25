import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { ABOVE_GUIDE_LAYER } from "../guide/layers";

type Box = { left: number; top: number; width: number; height: number };

/**
 * What the chemist opens over a part of the window - a canvas's menus,
 * cards and questions - drawn above the first-run guide (ui/guide/layers).
 * A tab's own layer holds all it draws below the guide, so these are drawn
 * in a layer of the window's own, laid exactly over `over` and shown while
 * `shown` - while its tab is in front - their places within it as they
 * were within `over`, and what they say of a click there as before.
 *
 * It is measured again whenever `over` changes size, the window does, or
 * `measureKey` changes - what can move it without changing its size: a
 * panel or the column opening, its tab coming in front. `over` is read at
 * each measure: a canvas made again (its error boundary reset) is watched
 * in place of the one gone.
 */
export default function AboveGuide({ over, shown, measureKey = "", children }: { over: RefObject<HTMLElement | null>; shown: boolean; measureKey?: string; children: ReactNode }) {
  const [box, setBox] = useState<Box | null>(null);
  const watched = useRef<{ el: HTMLElement; resized: ResizeObserver } | null>(null);
  const measure = useCallback(() => {
    const el = over.current;
    if (watched.current && watched.current.el !== el) {
      watched.current.resized.disconnect();
      watched.current = null;
    }
    if (!el || !el.isConnected) {
      setBox(null);
      return;
    }
    if (!watched.current) {
      const resized = new ResizeObserver(() => measure());
      resized.observe(el);
      watched.current = { el, resized };
    }
    const r = el.getBoundingClientRect();
    setBox((b) => (b && b.left === r.left && b.top === r.top && b.width === r.width && b.height === r.height ? b : { left: r.left, top: r.top, width: r.width, height: r.height }));
  }, [over]);
  // (after the first commit: `over` is a parent of this, its ref set only once its children's layout effects have run)
  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("resize", measure);
      watched.current?.resized.disconnect();
      watched.current = null;
    };
  }, [measure]);
  // (and before the paint, whenever what is round it may have moved it)
  useLayoutEffect(() => {
    if (over.current) measure();
  }, [over, measure, shown, measureKey]);
  if (typeof document === "undefined") return null;
  return createPortal(
    // (it lets clicks through to the canvas under it; what is in it takes its own - and, as what is over the canvas, no text of it selected by the page)
    <div
      className="fixed select-none pointer-events-none [&>*]:pointer-events-auto"
      style={{ zIndex: ABOVE_GUIDE_LAYER, ...(box && shown ? box : { display: "none" }) }}
    >
      {children}
    </div>,
    document.body,
  );
}
