import { useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import plexRegular from "../../../../assets/fonts/IBMPlexSans-Regular.ttf?url";
import plexMedium from "../../../../assets/fonts/IBMPlexSans-Medium.woff?url";
import plexMono from "../../../../assets/fonts/IBMPlexMono-Regular.ttf?url";
import { TextBatch } from "../components/textBatch";
import { PAGE_GL_ORDER } from "./PageShapes";
import { placed, type PageText } from "./texts";

/** The batches words are drawn in: Plex Sans by its weight, and Plex Mono. */
type Face = 400 | 500 | "mono";
const FACES: readonly Face[] = [400, 500, "mono"];
const faceOf = (t: PageText): Face => (t.mono ? "mono" : (t.weight ?? 400));

/**
 * The page's words drawn by WebGL (`texts`), a batch for each weight - Plex
 * Regular from its TrueType file and Medium from IBM's WOFF of it, the
 * forms troika reads - and one in Plex Mono, over the page's shapes (`PageShapes`), however their
 * `z` stands: a few draw calls for thousands.
 */
export default function PageTexts({ items, order = PAGE_GL_ORDER + 1 }: { items: readonly PageText[]; order?: number }) {
  const invalidate = useThree((s) => s.invalidate);
  const batches = useMemo(
    () => ({ 400: new TextBatch(plexRegular, order, invalidate), 500: new TextBatch(plexMedium, order, invalidate), mono: new TextBatch(plexMono, order, invalidate) }) as Record<Face, TextBatch>,
    [order, invalidate],
  );
  useEffect(() => () => Object.values(batches).forEach((b) => b.dispose()), [batches]);
  // (what each key was last drawn as: one drawn the same is left as it is - troika sets the letters of each one set again)
  const drawn = useRef(new Map<string, { as: string; opacity: number }>());
  useEffect(() => {
    const keep: Record<Face, Set<string>> = { 400: new Set(), 500: new Set(), mono: new Set() };
    const inOrder = items.map((t, i) => [t, i] as const).sort((a, b) => (a[0].z ?? 0) - (b[0].z ?? 0) || a[1] - b[1]);
    for (const [t] of inOrder) {
      const weight = faceOf(t);
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
    for (const f of FACES) batches[f].keepOnly(keep[f]);
    for (const k of [...drawn.current.keys()]) if (!FACES.some((f) => keep[f].has(k))) drawn.current.delete(k);
    invalidate();
  }, [items, batches, invalidate]);
  return (
    <group>
      {FACES.map((f) => (
        <primitive key={f} object={batches[f].root} />
      ))}
    </group>
  );
}
