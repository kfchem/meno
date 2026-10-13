import { useEffect, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { ABOVE_GUIDE_LAYER } from "../guide/layers";

/**
 * What the chemist opens over a part of the window - a canvas's menus,
 * cards and questions - drawn above the first-run guide (ui/guide/layers).
 * A tab's own layer holds all it draws below the guide, so these are drawn
 * in a layer of the window's own, laid exactly over `over` and shown while
 * `shown` - while its tab is in front - their places within it as they
 * were within `over`, and what they say of a click there as before.
 */
export default function AboveGuide({ over, shown, children }: { over: RefObject<HTMLElement | null>; shown: boolean; children: ReactNode }) {
  const [box, setBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  // (after the commit: `over` is a parent of this, and its ref is set only once its children's layout effects have run)
  useEffect(() => {
    const el = over.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setBox((b) => (b && b.left === r.left && b.top === r.top && b.width === r.width && b.height === r.height ? b : { left: r.left, top: r.top, width: r.width, height: r.height }));
    };
    measure();
    const resized = new ResizeObserver(measure);
    resized.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      resized.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [over, shown]);
  if (typeof document === "undefined") return null;
  return createPortal(
    // (it lets clicks through to the canvas under it; what is in it takes its own)
    <div
      className="fixed pointer-events-none [&>*]:pointer-events-auto"
      style={{ zIndex: ABOVE_GUIDE_LAYER, ...(box && shown ? box : { display: "none" }) }}
    >
      {children}
    </div>,
    document.body,
  );
}
