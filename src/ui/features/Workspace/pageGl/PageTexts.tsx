import { useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import plexRegular from "../../../../assets/fonts/IBMPlexSans-Regular.ttf?url";
import plexMedium from "../../../../assets/fonts/IBMPlexSans-Medium.woff?url";
import { TextBatch } from "../components/textBatch";
import { PAGE_GL_ORDER } from "./PageShapes";
import { placed, type PageText, type Weight } from "./texts";

/**
 * The page's words drawn by WebGL (`texts`), a batch for each weight - Plex
 * Regular from its TrueType file and Medium from IBM's WOFF of it, the
 * forms troika reads - over the page's shapes (`PageShapes`), however their
 * `z` stands: a few draw calls for thousands.
 */
export default function PageTexts({ items, order = PAGE_GL_ORDER + 1 }: { items: readonly PageText[]; order?: number }) {
  const invalidate = useThree((s) => s.invalidate);
  const batches = useMemo(
    () => ({ 400: new TextBatch(plexRegular, order, invalidate), 500: new TextBatch(plexMedium, order, invalidate) }) as Record<Weight, TextBatch>,
    [order, invalidate],
  );
  useEffect(() => () => Object.values(batches).forEach((b) => b.dispose()), [batches]);
  // (what each key was last drawn as: one drawn the same is left as it is - troika sets the letters of each one set again)
  const drawn = useRef(new Map<string, { as: string; opacity: number }>());
  useEffect(() => {
    const keep: Record<Weight, Set<string>> = { 400: new Set(), 500: new Set() };
    const inOrder = items.map((t, i) => [t, i] as const).sort((a, b) => (a[0].z ?? 0) - (b[0].z ?? 0) || a[1] - b[1]);
    for (const [t] of inOrder) {
      const weight = t.weight ?? 400;
      const at = placed(t);
      keep[weight].add(t.key);
      const as = [weight, at.text, at.x, at.y, at.size, t.color].join("|");
      const opacity = t.opacity ?? 1;
      const was = drawn.current.get(t.key);
      if (was?.as === as && batches[weight].holds(t.key)) {
        // (only fading: its letters as they are, only how opaque - a fade at every frame sets nothing again)
        if (was.opacity !== opacity) batches[weight].fadeKey(t.key, opacity);
        drawn.current.set(t.key, { as, opacity });
        continue;
      }
      drawn.current.set(t.key, { as, opacity });
      batches[weight].set(t.key, t, [{ text: at.text, x: at.x, y: at.y, size: at.size, color: t.color, italic: false, bold: false }], opacity);
    }
    for (const w of [400, 500] as const) batches[w].keepOnly(keep[w]);
    for (const k of [...drawn.current.keys()]) if (!keep[400].has(k) && !keep[500].has(k)) drawn.current.delete(k);
    invalidate();
  }, [items, batches, invalidate]);
  return (
    <group>
      <primitive object={batches[400].root} />
      <primitive object={batches[500].root} />
    </group>
  );
}
