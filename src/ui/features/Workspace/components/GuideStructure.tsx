import { useEffect, useMemo, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type * as THREE from "three";
import { useEditor } from "../store";
import { useGuide, shownStep } from "../../../../lib/plugins/guides";
import { structureAtoms } from "../utils/guided";

/** The room kept round a structure a guide points at, in CSS pixels. */
const PAD = 14;

/**
 * Where on the page a guide's step points at a structure: `place`, an
 * element over the canvas named for the guide (`data-guide="structure"`),
 * kept over the structure as the view moves - shown only while a step
 * points at one, and a structure is drawn. (The element is the workspace's,
 * outside the canvas: what is inside it is drawn in WebGL.)
 */
export default function GuideStructure({ place }: { place: RefObject<HTMLDivElement | null> }) {
  const wanted = useGuide((s) => shownStep(s.open)?.step.at === "structure");
  const model = useEditor((s) => s.model);
  const sel = useEditor((s) => s.sel.atoms);
  const atoms = useMemo(() => (wanted ? structureAtoms(model, sel) : []), [wanted, model, sel]);
  const { camera, size, invalidate } = useThree();
  // (a frame drawn as what it points at changes, so that its place is set at once)
  useEffect(() => {
    if (!atoms.length && place.current) place.current.style.display = "none";
    invalidate();
  }, [atoms, place, invalidate]);
  useFrame(() => {
    const el = place.current;
    if (!el || !atoms.length) return;
    const cam = camera as THREE.OrthographicCamera;
    // (in a loop: a structure of many thousand atoms spread as arguments would overflow the stack)
    let [x0, x1, y0, y1] = [Infinity, -Infinity, Infinity, -Infinity];
    for (const a of atoms) [x0, x1, y0, y1] = [Math.min(x0, a.x), Math.max(x1, a.x), Math.min(y0, a.y), Math.max(y1, a.y)];
    const left = size.width / 2 + (x0 - cam.position.x) * cam.zoom - PAD;
    const right = size.width / 2 + (x1 - cam.position.x) * cam.zoom + PAD;
    const top = size.height / 2 - (y1 - cam.position.y) * cam.zoom - PAD;
    const bottom = size.height / 2 - (y0 - cam.position.y) * cam.zoom + PAD;
    el.style.display = "block";
    el.style.transform = `translate(${left}px, ${top}px)`;
    el.style.width = `${right - left}px`;
    el.style.height = `${bottom - top}px`;
  });
  return null;
}
