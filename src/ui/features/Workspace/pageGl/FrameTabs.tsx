import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import { useEasedTo } from "../../../theme/opening";
import { pageScale, wordsReadAt } from "../utils/pageScale";
import { bandAt, type Band } from "./cardBands";
import { useEasedValues } from "./faded";
import PageShapes, { PAGE_GL_ORDER } from "./PageShapes";
import PageTexts from "./PageTexts";
import PageIcons from "./PageIcons";
import { usePageHits, type PagePointer } from "./PageHits";
import type { Side } from "./hits";
import { frameTabParts, tabNamesKept, type FarTabs, type FrameTab } from "./frameParts";

export type { FrameTab } from "./frameParts";

/** What a frame's parts are told: its tab pressed, an edge or a corner pressed, the pointer onto its tab or off it, its menu asked for. */
export type FrameTabsOn = {
  tabDown?: (key: string, e: PagePointer) => void;
  edgeDown?: (key: string, side: Side, e: PagePointer) => void;
  hover?: (key: string, on: boolean) => void;
  menu?: (key: string, e: PagePointer) => void;
};

/**
 * Where frames are drawn among the page's WebGL: under the steps' cards and the molecules' chips, so that a card or a chip in a
 * frame is drawn over its line - as a set's frame lay in HTML, before the cards.
 */
export const FRAMES_ORDER = PAGE_GL_ORDER - 7.5;

/** Frames with their tabs on the page (`FrameTab`), drawn by WebGL from `order` among its WebGL and taken hold of by the page's own regions (./PageHits). */
export default function FrameTabs({ items, on, order = FRAMES_ORDER }: { items: readonly FrameTab[]; on: FrameTabsOn; order?: number }) {
  const camera = useThree((s) => s.camera);
  // (its words read, or its icons alone: switched past their threshold as the zoom goes, as a set's are - utils/pageScale `wordsReadAt`)
  const readRef = useRef(wordsReadAt(camera.zoom, true));
  const [read, setRead] = useState(readRef.current);
  // (zoomed out, a set's name stands for its words, as large on the screen as the page's smallest: the band the page is in - read, named, only marked -
  //  and the scale its name is sized by, as the zoom goes a few per cent)
  const bandRef = useRef<Band>("read");
  const [band, setBand] = useState<Band>("read");
  const [zoom, setZoom] = useState(camera.zoom);
  useFrame(() => {
    const now = wordsReadAt(camera.zoom, readRef.current);
    if (now !== readRef.current) {
      readRef.current = now;
      setRead(now);
    }
    bandRef.current = bandAt(pageScale(camera.zoom), bandRef.current);
    if (bandRef.current !== band) setBand(bandRef.current);
    if (Math.abs(Math.log(camera.zoom / zoom)) > 0.03) setZoom(camera.zoom);
  });
  // (its words fade out as its name fades in, and a name left out where it would lie over one before it fades out)
  const words = useEasedTo(read ? 1 : 0);
  const scale = pageScale(zoom);
  const kept = useMemo(() => (read ? null : tabNamesKept(items, scale, band)), [items, scale, band, read]);
  const labels = useEasedValues(new Map(items.map((it) => [it.key, !kept || kept.has(it.key) ? 1 : 0] as [string, number])));
  const far: FarTabs = useMemo(() => ({ scale, band, words, labels }), [scale, band, words, labels]);
  const parts = useMemo(() => frameTabParts(items, read, far), [items, read, far]);
  usePageHits(parts.regions, {
    down: (key, part, e) => (part === "tab" ? on.tabDown?.(key, e) : part.startsWith("edge:") ? on.edgeDown?.(key, part.slice(5) as Side, e) : undefined),
    hover: (key, part, isOn) => part === "tab" && on.hover?.(key, isOn),
    menu: (key, _part, e) => on.menu?.(key, e),
  });
  return (
    <>
      <PageShapes items={parts.shapes} order={order} />
      <PageTexts items={parts.texts} order={order + 1} />
      <PageIcons items={parts.icons} order={order + 1} />
    </>
  );
}
