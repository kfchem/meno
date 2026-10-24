import { useContext, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { PageHtmlLayer } from "./coverLayer";
import { pageScale, wordsShown, wordsTooSmall } from "../utils/pageScale";

/**
 * The page's scale, told to what is drawn on it in HTML (utils/pageScale):
 * `--page` on the layer it is drawn in, how many screen pixels a page pixel
 * is - which chips grow and shrink by (`.meno-page-chip`) - `--words`,
 * how much of their words is shown (`wordsShown`), and `data-words-small`
 * there while their words would be too small to read.
 */
export default function PageScale() {
  const layer = useContext(PageHtmlLayer);
  const camera = useThree((s) => s.camera);
  const told = useRef<{ layer: HTMLElement | null; zoom: number }>({ layer: null, zoom: NaN });
  useFrame(() => {
    if (!layer) return;
    const zoom = camera.zoom || 1;
    if (told.current.layer === layer && told.current.zoom === zoom) return;
    told.current = { layer, zoom };
    layer.style.setProperty("--page", pageScale(zoom).toFixed(4));
    layer.style.setProperty("--words", wordsShown(zoom).toFixed(3));
    layer.toggleAttribute("data-words-small", wordsTooSmall(zoom));
  });
  return null;
}
