import { useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type * as THREE from "three";
import { useLabelFontUrl } from "../../../fonts/typefaces";
import { useDrawnLayout } from "./drawnLayoutContext";
import { TextBatch, type BatchRun } from "./textBatch";
import { useCompiledAfterFrame, useIdleStart } from "./warmShaders";

/**
 * The page's shaders for a drawing made ready before the first is drawn
 * (docs/WORKSPACE.md, *Drawn by WebGL*, *Shaders made ready*), as
 * WarmShaders3D does for molecules in 3D. A drawing's bonds and their caps
 * have theirs from the start (components/instances `whiteInstances`); what
 * comes only with a drawing is made here, unseen and far off the page, once
 * the page is idle as it starts: a label - one letter, in the page's own
 * typeface, set as Labels2D sets its labels (`TextBatch`) - and a plain
 * disc, as the parts drawn over a drawing are. Compiled once the letter is
 * set, after a frame of the page's, never in it; again as the typeface
 * changes. Kept, unseen, so that its shaders are kept: the first drawing
 * draws with them, never waiting a frame on a shader made for it. Its
 * typeface comes with it, before any label asks for it.
 */
export default function WarmShaders2D() {
  const on = useIdleStart();
  return on ? <Warmed /> : null;
}

/** The one letter set, as a label's run is. */
const LETTER: BatchRun[] = [{ text: "O", x: 0, y: 0, size: 1, color: "black", italic: false, bold: false }];
const ITEM = {};

function Warmed() {
  const group = useRef<THREE.Group>(null!);
  const { opts } = useDrawnLayout();
  const font = useLabelFontUrl(opts.fontFamily ?? "Arial", false);
  const invalidate = useThree((st) => st.invalidate);
  // (the batch Labels2D draws its labels by, with one label: its shader the labels')
  const batch = useMemo(() => (font === null ? null : new TextBatch(font, 30, () => invalidate())), [font, invalidate]);
  useEffect(() => () => batch?.dispose(), [batch]);
  const [set, setSet] = useState<TextBatch | null>(null);
  useLayoutEffect(() => {
    if (!batch) return;
    batch.set("warm", ITEM, LETTER, 1);
    // (compiled once its letter is set: what it is drawn with is then as a label's is)
    const check = () => {
      if (!batch.setting()) setSet(batch);
    };
    const stop = batch.onSynced(check);
    check();
    return stop;
  }, [batch]);
  useCompiledAfterFrame(group, !!batch && set === batch, batch);
  return (
    <group ref={group} visible={false} position={[1e6, 1e6, 0]} userData={{ warm: "2d" }}>
      {batch && <primitive object={batch.root} />}
      <mesh>
        <circleGeometry args={[1, 8]} />
        <meshBasicMaterial transparent />
      </mesh>
    </group>
  );
}
