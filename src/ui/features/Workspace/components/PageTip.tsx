import { useThree } from "@react-three/fiber";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { useEditor } from "../store";
import { usePageHtmlLayer } from "./coverLayer";
import { TIP_GAP_PX, tipPlace, tipUnder, type ScreenBox } from "./markTip";
import PageHtml from "./PageHtml";

/**
 * The page's hover tip (docs/LOOK.md, rule 7: what is not placed on the
 * page - a menu, this tip - may be HTML): what something the page draws
 * says while it is pointed at - a mark's message, why a chip's bar did not
 * finish - under it, or over it where there is no room under it, moved
 * along to lie where it can be seen (markTip); fading in, and gone with
 * the pointer. `x`, `y` is the middle of what it is about and `w`, `h` its
 * size, in the page's units, at `zoom`; `tipKey`, what it is about - a tip
 * of another thing comes in afresh.
 */
export default function PageTip({ tipKey, x, y, w, h, zoom, text, zIndexRange = [20, 10] }: { tipKey: string; x: number; y: number; w: number; h: number; zoom: number; text: string; zIndexRange?: [number, number] }) {
  // (what can be seen of the canvas, the column over its right side left out: where it is kept)
  const gl = useThree((s) => s.gl);
  const layer = usePageHtmlLayer();
  const cover = useEditor((s) => s.cover);
  const room = useCallback((): ScreenBox => {
    const r = (layer?.current ?? gl.domElement).getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right - cover, bottom: r.bottom };
  }, [layer, gl, cover]);
  return (
    <PageHtml key={`tip-${tipKey}`} position={[x, y, 0]} center zIndexRange={zIndexRange} style={{ pointerEvents: "none" }}>
      <div role="img" aria-label={text} className="relative" style={{ width: w * zoom, height: h * zoom }}>
        <Words text={text} room={room} />
      </div>
    </PageHtml>
  );
}

/** What it says, under what it is about - moved along, or put over it, to lie where it can be seen (markTip). */
function Words({ text, room }: { text: string; room: () => ScreenBox }) {
  const ref = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ dx: number; above: boolean } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    const mark = el?.parentElement?.getBoundingClientRect();
    if (!el || !mark) return;
    setPlace(tipPlace(tipUnder(mark, el.offsetWidth, el.offsetHeight), mark, room()));
  }, [text, room]);
  return (
    <div
      ref={ref}
      className={"meno-fade-in absolute left-1/2 w-max max-w-[22rem] rounded-md border border-gh-line bg-white px-2 py-1 text-[11px] text-gh-black shadow-sm " + (place?.above ? "bottom-full" : "top-full")}
      style={{
        [place?.above ? "marginBottom" : "marginTop"]: TIP_GAP_PX,
        transform: `translateX(calc(-50% + ${place?.dx ?? 0}px))`,
        visibility: place ? undefined : "hidden",
      }}
    >
      {text}
    </div>
  );
}
