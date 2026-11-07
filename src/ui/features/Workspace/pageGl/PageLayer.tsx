import PageTip from "../components/PageTip";
import { useThree } from "@react-three/fiber";
import type * as THREE from "three";
import type { Region } from "./hits";
import type { PageIcon } from "./icons";
import PageIcons from "./PageIcons";
import { usePageHits, type HitHandlers } from "./PageHits";
import type { PageTipAt } from "./PagePlaced";
import PagePolys, { type PagePoly } from "./PagePolys";
import PageShapes, { PAGE_GL_ORDER } from "./PageShapes";
import PageTexts from "./PageTexts";
import type { Shape } from "./shapes";
import type { PageText } from "./texts";

/**
 * A layer of what stands on the page where the page has it - a workflow's
 * cards, its sets' frames, its ports (docs/WORKSPACE.md, *Drawn by WebGL*) -
 * drawn by WebGL at once: its boxes, its filled shapes over them, its words
 * and icons over both, from `order`; the places that take the pointer, over
 * those laid before them; and the page's tip, where it says one.
 */
export default function PageLayer({
  shapes,
  texts,
  icons,
  polys,
  regions,
  on,
  tip,
  order = PAGE_GL_ORDER,
}: {
  shapes: readonly Shape[];
  texts: readonly PageText[];
  icons?: readonly PageIcon[];
  polys?: readonly PagePoly[];
  regions?: readonly Region[];
  on?: HitHandlers;
  tip?: PageTipAt | null;
  order?: number;
}) {
  usePageHits(regions ?? NONE, on ?? NO_HANDLERS);
  const zoom = useThree((s) => (s.camera as THREE.OrthographicCamera).zoom || 1);
  return (
    <group>
      <PageShapes items={shapes} order={order} />
      <PagePolys items={polys ?? NO_POLYS} order={order + 0.5} />
      <PageTexts items={texts} order={order + 1} />
      <PageIcons items={icons ?? NO_ICONS} order={order + 1} />
      {tip && <PageTip tipKey={tip.key} x={tip.x} y={tip.y} w={tip.w} h={tip.h} zoom={zoom} text={tip.text} />}
    </group>
  );
}

const NONE: readonly Region[] = [];
const NO_HANDLERS: HitHandlers = {};
const NO_POLYS: readonly PagePoly[] = [];
const NO_ICONS: readonly PageIcon[] = [];
