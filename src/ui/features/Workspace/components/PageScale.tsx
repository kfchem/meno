import { useContext, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { PageHtmlLayer } from "./coverLayer";
import { pageLayerStep, type PageLayerState } from "../utils/pageScale";

/**
 * The page's scale, told to what is drawn on it in HTML (utils/pageScale):
 * `--page` on the layer it is drawn in, how many screen pixels a page pixel
 * is - which chips are laid out at (`.meno-page-chip`), written once the
 * zoom stands still - and while it moves, how far it has gone from there,
 * `--page-k`, which chips and notes alike are scaled by (`pageTold`,
 * `pageSized`).
 */
export default function PageScale() {
  const layer = useContext(PageHtmlLayer);
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  // (what the layer was last told, and which layer: utils/pageScale `pageLayerStep`)
  const told = useRef<{ layer: HTMLElement | null; state: PageLayerState | null }>({ layer: null, state: null });
  // (the zoom the frame before: standing as it was, its chips are laid out at it)
  const before = useRef(NaN);
  useFrame(() => {
    if (!layer) return;
    const zoom = camera.zoom || 1;
    const still = zoom === before.current;
    before.current = zoom;
    const step = pageLayerStep(told.current.layer === layer ? told.current.state : null, zoom, still);
    for (const [name, value] of step.writes) layer.style.setProperty(name, value);
    told.current = { layer, state: step.now };
    // (a frame more asked for while they are scaled: the canvas draws only when asked, and standing still they are then laid out as it is)
    if (step.again) invalidate();
  });
  return null;
}
