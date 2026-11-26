import { useThree } from "@react-three/fiber";
import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import { DURATION } from "../../../theme/motion";
import { useEditor } from "../store";
import { usePageHtmlLayer } from "./coverLayer";
import { TIP_GAP_PX, TipFade, tipPlace, tipUnder, type ScreenBox, type TipAt } from "./markTip";
import PageHtml from "./PageHtml";

/** How long the tip takes to go, and how: as all that goes out of view (CSS's `meno-fade-out`; docs/LOOK.md, *Motion*). */
const LEAVE_MS = DURATION.quick * 1000;
const LEAVING = `opacity ${LEAVE_MS}ms var(--ease-meno-leave)`;
const BACK = `opacity ${LEAVE_MS}ms var(--ease-meno)`;

/**
 * The page's hover tip (docs/LOOK.md, rule 7: what is not placed on the
 * page - a menu, this tip - may be HTML): what something the page draws
 * says while it is pointed at - a mark's message, why a chip's bar did not
 * finish - under it, or over it where there is no room under it, moved
 * along to lie where it can be seen (markTip). `at` is what it is about -
 * its words, and the middle and size of the thing, in the page's units, at
 * `zoom` - or null where nothing is pointed at (`aboveFirst`: over it
 * first, under it only where there is no room over it). It fades in; with
 * nothing pointed at it fades out where it stood, its last words kept,
 * and is gone (markTip `TipFade`) - pointed at again meanwhile, it is
 * whole again from where it had faded to. A tip of another thing (another
 * `key`) comes in afresh, in place of the one before. Kept by its owner:
 * where its owner goes, it goes with it. It never takes the pointer.
 */
export default function PageTip({ at, zoom, zIndexRange = [20, 10], aboveFirst = false }: { at: TipAt | null; zoom: number; zIndexRange?: [number, number]; aboveFirst?: boolean }) {
  // (what can be seen of the canvas, the column over its right side left out: where it is kept)
  const gl = useThree((s) => s.gl);
  const layer = usePageHtmlLayer();
  const cover = useEditor((s) => s.cover);
  const room = useCallback((): ScreenBox => {
    const r = (layer?.current ?? gl.domElement).getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right - cover, bottom: r.bottom };
  }, [layer, gl, cover]);
  const [, wake] = useReducer((n: number) => n + 1, 0);
  const fade = useRef<TipFade | null>(null);
  fade.current ??= new TipFade(LEAVE_MS, wake);
  const shown = fade.current.shown(at);
  const on = at !== null;
  useEffect(() => fade.current?.follow(on), [on]);
  useEffect(() => () => fade.current?.stop(), []);
  if (!shown) return null;
  const { at: tip, leaving } = shown;
  return (
    <PageHtml key={`tip-${tip.key}`} position={[tip.x, tip.y, 0]} center zIndexRange={zIndexRange} style={{ pointerEvents: "none" }}>
      {/* (its fade out on this box, by CSS, the fade in on the words' own: turned back from where it is, never from nothing) */}
      <div role="img" aria-label={tip.text} aria-hidden={leaving || undefined} className="relative" style={{ width: tip.w * zoom, height: tip.h * zoom, opacity: leaving ? 0 : 1, transition: leaving ? LEAVING : BACK }}>
        <Words text={tip.text} room={room} aboveFirst={aboveFirst} />
      </div>
    </PageHtml>
  );
}

/** What it says, under what it is about - moved along, or put over it, to lie where it can be seen (markTip). */
function Words({ text, room, aboveFirst }: { text: string; room: () => ScreenBox; aboveFirst: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ dx: number; above: boolean } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    const mark = el?.parentElement?.getBoundingClientRect();
    if (!el || !mark) return;
    setPlace(tipPlace(tipUnder(mark, el.offsetWidth, el.offsetHeight), mark, room(), undefined, aboveFirst));
  }, [text, room, aboveFirst]);
  return (
    <div
      ref={ref}
      className={"meno-fade-in absolute left-1/2 w-max max-w-[22rem] whitespace-pre-line rounded-md border border-gh-line bg-white px-2 py-1 text-[11px] text-gh-black shadow-sm " + (place?.above ? "bottom-full" : "top-full")}
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
