/**
 * The view following the drawing style's bond (docs/WORKSPACE.md, *Drawing
 * style*). As the bond comes to print k times shorter - a change of style,
 * its ease, its undo, its redo - the page's places and sizes in units grow
 * by k (restyle), and the camera's place grows by k and its zoom shrinks by
 * k with them, at once, so that slides, words and pictures hold still on the
 * screen while the structures grow or shrink about their middles. A view
 * on its way somewhere goes on to the same place.
 */
import * as THREE from "three";
import { useLayoutEffect, useMemo, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { useEditor } from "../store";
import { bondPtOf } from "../restyle";
import { setViewGoal, viewGoalOf } from "./viewGoal";

export function FollowStyle() {
  const style = useEditor((s) => s.docStyle);
  // (another page - a file opened in the tab, or that undone - is not this one re-laid: the view goes with it as it is)
  const pageId = useEditor((s) => s.pageId);
  const page = useRef(pageId);
  const bondPt = useMemo(() => (style ? bondPtOf(style) : null), [style]);
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const was = useRef<number | null>(null);
  // (before the frame that draws the page converted: never a frame of the one without the other)
  useLayoutEffect(() => {
    const before = was.current;
    was.current = bondPt;
    const samePage = page.current === pageId;
    page.current = pageId;
    if (!samePage || before == null || bondPt == null || before === bondPt) return;
    const k = before / bondPt;
    const cam = camera as THREE.OrthographicCamera;
    cam.position.x *= k;
    cam.position.y *= k;
    cam.zoom /= k;
    cam.updateProjectionMatrix();
    const goal = viewGoalOf(cam);
    if (goal) setViewGoal(cam, { zoom: goal.zoom / k, x: goal.x * k, y: goal.y * k });
    invalidate();
  }, [bondPt, pageId, camera, invalidate]);
  return null;
}
