import { useEffect, useState } from "react";
import { cornerRight, usePageCorner } from "../../pageCorner";
import { useEditor } from "./store";

/**
 * What is seen of the page, as wide as the canvas less the column over its
 * right side: while its tab is in front, how much of the window's right side
 * lies past it - the column, a style panel beside the canvas - is told to
 * what keeps to the page's corner (../../pageCorner). Told again only as that
 * changes size: as a panel slides open or shut, as the column's edge is
 * dragged, as the window is resized.
 */
export default function PageEdge({ tabId, active }: { tabId: string; active: boolean }) {
  // (the column's width as it is now - eased, dragged: TextColumn)
  const cover = useEditor((s) => s.cover);
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!el || !active) return;
    const { say, letGo } = usePageCorner.getState();
    const tell = () => say(tabId, cornerRight(window.innerWidth - el.getBoundingClientRect().right, window.innerWidth));
    const seen = new ResizeObserver(tell);
    seen.observe(el);
    tell();
    return () => {
      seen.disconnect();
      letGo(tabId);
    };
  }, [el, active, tabId]);
  return <div ref={setEl} aria-hidden className="absolute inset-y-0 left-0 pointer-events-none" style={{ right: cover }} />;
}
