import { useContext, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { PageHtmlLayer } from "./coverLayer";
import { pageScale, wordsReadAt, WORDS_LEAST, zoomWritten } from "../utils/pageScale";

/**
 * The page's scale, told to what is drawn on it in HTML (utils/pageScale):
 * `--page` on the layer it is drawn in, how many screen pixels a page pixel
 * is - which chips grow and shrink by (`.meno-page-chip`) - `--words`,
 * 1 while their words are read and 0 once they are too small, and
 * `--stand-in` the other way (`wordsReadAt`: switched past a threshold,
 * faded over a short time by CSS), and `data-words-small` while their words
 * are too small.
 */
export default function PageScale() {
  const layer = useContext(PageHtmlLayer);
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const told = useRef<{ layer: HTMLElement | null; zoom: number }>({ layer: null, zoom: NaN });
  // (whether the words are read now: switched past their threshold, as the zoom goes)
  const read = useRef(pageScale(camera.zoom || 1) >= WORDS_LEAST);
  // (the zoom the frame before: standing as it was, it is written as it is - utils/pageScale `zoomWritten`)
  const before = useRef(NaN);
  useFrame(() => {
    if (!layer) return;
    const zoom = camera.zoom || 1;
    const still = zoom === before.current;
    before.current = zoom;
    if (told.current.layer === layer && !zoomWritten(told.current.zoom, zoom, still)) {
      // (a frame more asked for, where it is not yet as it is: the canvas draws only when asked, and standing still it is then written as it is)
      if (told.current.zoom !== zoom) invalidate();
      return;
    }
    told.current = { layer, zoom };
    layer.style.setProperty("--page", pageScale(zoom).toFixed(4));
    read.current = wordsReadAt(zoom, read.current);
    layer.style.setProperty("--words", read.current ? "1" : "0");
    layer.style.setProperty("--stand-in", read.current ? "0" : "1");
    layer.toggleAttribute("data-words-small", !read.current);
  });
  return null;
}
