import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import { ChatBubbleLeftRightIcon } from "@heroicons/react/24/outline";
import { wordsReadAt } from "../utils/pageScale";
import PageShapes from "./PageShapes";
import PageTexts from "./PageTexts";
import PageIcons from "./PageIcons";
import { usePageHits, type PagePointer } from "./PageHits";
import { addPageIcon } from "./icons";
import type { Side } from "./hits";
import { frameTabParts, type FrameTab } from "./frameParts";

export type { FrameTab } from "./frameParts";

addPageIcon("chat", (size) => <ChatBubbleLeftRightIcon width={size} height={size} strokeWidth={1.5} />);

/** What a frame's parts are told: its tab pressed, an edge or a corner pressed, the pointer onto its tab or off it, its menu asked for. */
export type FrameTabsOn = {
  tabDown?: (key: string, e: PagePointer) => void;
  edgeDown?: (key: string, side: Side, e: PagePointer) => void;
  hover?: (key: string, on: boolean) => void;
  menu?: (key: string, e: PagePointer) => void;
};

/** Frames with their tabs on the page (`FrameTab`), drawn by WebGL and taken hold of by the page's own regions (./PageHits). */
export default function FrameTabs({ items, on }: { items: readonly FrameTab[]; on: FrameTabsOn }) {
  const camera = useThree((s) => s.camera);
  // (its words read, or its icons alone: switched past their threshold as the zoom goes, as a set's are - utils/pageScale `wordsReadAt`)
  const readRef = useRef(wordsReadAt(camera.zoom, true));
  const [read, setRead] = useState(readRef.current);
  useFrame(() => {
    const now = wordsReadAt(camera.zoom, readRef.current);
    if (now !== readRef.current) {
      readRef.current = now;
      setRead(now);
    }
  });
  const parts = useMemo(() => frameTabParts(items, read), [items, read]);
  usePageHits(parts.regions, {
    down: (key, part, e) => (part === "tab" ? on.tabDown?.(key, e) : part.startsWith("edge:") ? on.edgeDown?.(key, part.slice(5) as Side, e) : undefined),
    hover: (key, part, isOn) => part === "tab" && on.hover?.(key, isOn),
    menu: (key, _part, e) => on.menu?.(key, e),
  });
  return (
    <>
      <PageShapes items={parts.shapes} />
      <PageTexts items={parts.texts} />
      <PageIcons items={parts.icons} />
    </>
  );
}
