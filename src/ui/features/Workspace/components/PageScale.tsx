import { useContext, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { PageHtmlLayer } from "./coverLayer";
import { pageScale, pageTold, wordsReadAt, WORDS_LEAST } from "../utils/pageScale";

/**
 * The page's scale, told to what is drawn on it in HTML (utils/pageScale):
 * `--page` on the layer it is drawn in, how many screen pixels a page pixel
 * is - which chips are laid out at (`.meno-page-chip`), written once the
 * zoom stands still - and while it moves, how far it has gone from there,
 * `--page-k` for chips and `--notes-k` for notes, which they are scaled by
 * (`pageTold`, `pageSized`) - `--words`,
 * 1 while their words are read and 0 once they are too small, and
 * `--stand-in` the other way (`wordsReadAt`: switched past a threshold,
 * faded over a short time by CSS), and `data-words-small` while their words
 * are too small.
 */
export default function PageScale() {
  const layer = useContext(PageHtmlLayer);
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  // (what the layer was last told: the layer, the zoom its chips are laid out at, and how far they are scaled from it)
  const told = useRef<{ layer: HTMLElement | null; laid: number; k: number; notesK: number }>({ layer: null, laid: NaN, k: 1, notesK: 1 });
  // (whether the words are read now: switched past their threshold, as the zoom goes)
  const read = useRef(pageScale(camera.zoom || 1) >= WORDS_LEAST);
  // (the zoom the frame before: standing as it was, its chips are laid out at it - utils/pageScale `pageTold`)
  const before = useRef(NaN);
  useFrame(() => {
    if (!layer) return;
    const zoom = camera.zoom || 1;
    const still = zoom === before.current;
    before.current = zoom;
    const t = told.current;
    const fresh = t.layer !== layer;
    const now = pageTold(fresh ? NaN : t.laid, zoom, still);
    if (fresh || now.laid !== t.laid) layer.style.setProperty("--page", now.page.toFixed(4));
    if (fresh || now.k !== t.k) layer.style.setProperty("--page-k", now.k.toFixed(4));
    if (fresh || now.notesK !== t.notesK) layer.style.setProperty("--notes-k", now.notesK.toFixed(4));
    told.current = { layer, laid: now.laid, k: now.k, notesK: now.notesK };
    // (a frame more asked for while they are scaled: the canvas draws only when asked, and standing still they are then laid out as it is)
    if (now.k !== 1) invalidate();
    const words = wordsReadAt(zoom, read.current);
    if (fresh || words !== read.current) {
      read.current = words;
      layer.style.setProperty("--words", words ? "1" : "0");
      layer.style.setProperty("--stand-in", words ? "0" : "1");
      layer.toggleAttribute("data-words-small", !words);
    }
  });
  return null;
}
