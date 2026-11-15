import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { TIP_GAP_PX } from "./markTip";

/** How long the pointer rests on an icon before its name is shown, in ms: long enough that passing over a row of icons shows none. */
export const ICON_TIP_REST_MS = 450;
/** How often, while a name is up, Meno looks whether its icon is still there, in ms. */
const ICON_TIP_GONE_MS = 200;

/**
 * Where an icon's name goes, on the screen: under the icon, centred on it - over it where there is no room under it - and moved
 * along to lie inside the window. `icon` is the icon's box, `w` and `h` the name's size, `win` the window's.
 */
export function iconTipPlace(icon: { left: number; top: number; right: number; bottom: number }, w: number, h: number, win: { width: number; height: number }): { left: number; top: number } {
  const below = icon.bottom + TIP_GAP_PX;
  const top = below + h <= win.height - TIP_GAP_PX ? below : Math.max(TIP_GAP_PX, icon.top - TIP_GAP_PX - h);
  const centred = (icon.left + icon.right) / 2 - w / 2;
  const left = Math.min(Math.max(TIP_GAP_PX, centred), Math.max(TIP_GAP_PX, win.width - TIP_GAP_PX - w));
  return { left, top };
}

/**
 * The names of icon-only controls, in Meno's own look (as the page's tip, PageTip): an element carrying `data-tip` - an icon of
 * Quick Add, of a right-click menu's rows, of the menu on empty space - has its name shown under it once the pointer has rested
 * on it a moment (`ICON_TIP_REST_MS`), fading in, and gone as the pointer leaves it, presses, a key is pressed or the view
 * scrolls. Mounted once; the icons need only say their name. The system's own tooltip (`title`) is not used for them: it
 * looks like no other part of Meno, and in some views it is not shown at all.
 */
export default function IconTips() {
  const [tip, setTip] = useState<{ text: string; box: DOMRect } | null>(null);
  const timer = useRef<number | null>(null);
  const over = useRef<Element | null>(null);
  useEffect(() => {
    const clear = () => {
      if (timer.current != null) window.clearTimeout(timer.current);
      timer.current = null;
    };
    const hide = () => {
      clear();
      over.current = null;
      setTip(null);
    };
    const onOver = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const el = (e.target as Element | null)?.closest?.("[data-tip]") ?? null;
      if (el === over.current) return;
      hide();
      if (!el) return;
      over.current = el;
      timer.current = window.setTimeout(() => {
        timer.current = null;
        const text = el.getAttribute("data-tip");
        if (text && el.isConnected && over.current === el) setTip({ text, box: el.getBoundingClientRect() });
      }, ICON_TIP_REST_MS);
    };
    const onOut = (e: PointerEvent) => {
      // (left for nothing, or for something that is not the icon: gone)
      const to = (e.relatedTarget as Element | null)?.closest?.("[data-tip]") ?? null;
      if (to !== over.current) hide();
    };
    window.addEventListener("pointerover", onOver, true);
    window.addEventListener("pointerout", onOut, true);
    window.addEventListener("pointerdown", hide, true);
    window.addEventListener("keydown", hide, true);
    window.addEventListener("wheel", hide, true);
    window.addEventListener("blur", hide);
    return () => {
      clear();
      window.removeEventListener("pointerover", onOver, true);
      window.removeEventListener("pointerout", onOut, true);
      window.removeEventListener("pointerdown", hide, true);
      window.removeEventListener("keydown", hide, true);
      window.removeEventListener("wheel", hide, true);
      window.removeEventListener("blur", hide);
    };
  }, []);
  // (an icon taken away under a resting pointer sends no pointerout: its name goes with it, looked for while it is up)
  useEffect(() => {
    if (!tip) return;
    const look = window.setInterval(() => {
      if (!over.current?.isConnected) {
        over.current = null;
        setTip(null);
      }
    }, ICON_TIP_GONE_MS);
    return () => window.clearInterval(look);
  }, [tip]);
  if (!tip || typeof document === "undefined") return null;
  return createPortal(<Name key={`${tip.text}:${tip.box.left},${tip.box.top}`} text={tip.text} box={tip.box} />, document.body);
}

/** The name, placed once it is measured (`iconTipPlace`). */
function Name({ text, box }: { text: string; box: DOMRect }) {
  const ref = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setAt(iconTipPlace(box, el.offsetWidth, el.offsetHeight, { width: window.innerWidth, height: window.innerHeight }));
  }, [box]);
  return (
    <div
      ref={ref}
      role="tooltip"
      className="meno-fade-in fixed z-[1000] w-max max-w-[22rem] rounded-md border border-gh-line bg-white px-2 py-1 text-[11px] text-gh-black shadow-sm pointer-events-none"
      style={{ left: at?.left ?? 0, top: at?.top ?? 0, visibility: at ? undefined : "hidden" }}
    >
      {text}
    </div>
  );
}
