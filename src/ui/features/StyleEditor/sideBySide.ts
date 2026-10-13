import { useLayoutEffect, useState } from "react";

/**
 * The least width a style editor is laid out in beside its preview: the
 * preview's 26rem, the 2rem between, and 30rem for the settings - a
 * setting's words beside its slider, number and unit. Narrower (Settings in
 * a window under about 980 px wide), the preview goes above the settings and
 * each setting's control under its words, as in the canvas's style column:
 * side by side there, a setting's words were squeezed to a word a line, and
 * a slider ran over its name.
 */
export const SIDE_BY_SIDE_PX = 928;

/** Whether `el` is at least `px` wide, as it is and as it changes - measured before it is first shown. */
export function useAtLeastWide(el: HTMLElement | null, px = SIDE_BY_SIDE_PX): boolean {
  const [wide, setWide] = useState(true);
  useLayoutEffect(() => {
    if (!el) return;
    const look = () => setWide(el.getBoundingClientRect().width >= px);
    look();
    if (typeof ResizeObserver === "undefined") return;
    const watch = new ResizeObserver(look);
    watch.observe(el);
    return () => watch.disconnect();
  }, [el, px]);
  return wide;
}
