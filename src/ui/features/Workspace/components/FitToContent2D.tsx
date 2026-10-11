import * as THREE from "three";
import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { useEditor, useEditorStore } from "../store";
import {
  labelSetOf,
  layoutMolecule,
  type Atom as LAtom,
  type Bond as LBond,
} from "../../../../lib/chem/layout2d";
import { editorLayoutOptions, layoutBonds, maxFitZoom } from "../layoutOptions";
import { useDrawingStyle } from "../useDrawingStyle";
import { chemistry } from "../../../../lib/chem/molecule";
import { currentStyle3D } from "../style3d";
import { lookOf, poseOf, seenBounds, solidOf } from "../utils/molecule3d";
import { eyeOf } from "../utils/page";
import { setViewGoal } from "./viewGoal";
import { opensWith } from "./openingFit";
import { captionSet } from "../../../../lib/chem/captions";
import { pdfRoom } from "../../../../lib/pdf/layout";
import { cornersOf } from "../utils/selection";
import { sheetRoom } from "../utils/textSheets";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";

export default function FitToContent2D({
  paddingPx = 48,
  trigger = 0,
}: {
  paddingPx?: number;
  trigger?: number;
}) {
  const { model, autoFitSuspended } = useEditor();
  const molecules3d = useEditor((s) => s.molecules3d);
  const captions = useEditor((s) => s.captions);
  const pdfs = useEditor((s) => s.pdfs);
  const pictures = useEditor((s) => s.pictures);
  const texts = useEditor((s) => s.texts);
  const store = useEditorStore();
  const style = useDrawingStyle();
  const { camera, size, invalidate } = useThree();
  // Fit only when asked (the trigger): opening, adding or dropping a
  // structure asks, and so does the fit button. Drawing never does - the
  // first bond on an empty canvas is drawn where it was put, at the zoom
  // the canvas opened at, and the view stays.
  const lastTriggerRef = useRef(trigger);
  // What a canvas opens with is shown whole: on its middle, at the zoom the
  // canvas opens at or as far out as it needs, never further in (./openingFit
  // `opensWith`). (Molecules in 3D stand beside a drawing, where the opening
  // zoom alone may not reach.)
  const opened = useRef(false);
  // (the first fit, of a canvas that has shown nothing yet, is where its
  // view starts; after that a fit goes there)
  const fitted = useRef(false);
  // (whether it has held anything yet: what it is first given is opened)
  const held = useRef(false);
  useEffect(() => {
    const cam = camera as THREE.OrthographicCamera;
    if (autoFitSuspended) return; // skip while suspended
    const atoms = model.atoms;
    const empty = atoms.length === 0 && molecules3d.length === 0 && captions.length === 0 && pdfs.length === 0 && pictures.length === 0 && !texts.some((t) => t.at);
    const firstView = !opened.current;
    opened.current = true;
    const firstContent = !held.current && !empty;
    if (!empty) held.current = true;
    if (firstView && empty) return;
    if (!firstView && trigger === lastTriggerRef.current) return;
    if (empty) {
      lastTriggerRef.current = trigger;
      return;
    }
    const first = opensWith({ firstView, firstContent, asked: trigger !== lastTriggerRef.current, fittedBefore: fitted.current });
    // What the drawing reaches, not where the atoms are: a label hangs off
    // its atom - the H of an OH, the 2 of an NH2 - and fitting to the atoms
    // alone cuts it off at the edge. The layout already works this out.
    const index = new Map<number, number>();
    const la: LAtom[] = atoms.map((a, i) => {
      index.set(a.id, i);
      return { id: a.id, x: a.x, y: a.y, el: a.el, ...chemistry(a), ...(a.chargeAt ? { chargeAt: a.chargeAt } : {}) };
    });
    const lb: LBond[] = layoutBonds(model.bonds, index);
    // The layout's sizes are in world units here, so they do not depend on
    // the zoom: one pass is enough, and there is no bounds-needs-zoom-needs-
    // bounds to untangle.
    const opts = editorLayoutOptions(style);
    const bounds = atoms.length
      ? layoutMolecule(la, lb, opts, cam.zoom || 1).bounds
      : { min: { x: Infinity, y: Infinity }, max: { x: -Infinity, y: -Infinity } };
    // and the words on the page, as they are set
    for (const c of captions) {
      const set = captionSet(c.text, c.x, c.y, opts.fontPx, labelSetOf(opts), c.width, c.align);
      bounds.min = { x: Math.min(bounds.min.x, c.x - set.halfW), y: Math.min(bounds.min.y, c.y - set.halfH) };
      bounds.max = { x: Math.max(bounds.max.x, c.x + set.halfW), y: Math.max(bounds.max.y, c.y + set.halfH) };
    }
    // and the PDFs, as they lie (lib/pdf/layout)
    for (const p of pdfs) {
      const b = pdfRoom(p);
      bounds.min = { x: Math.min(bounds.min.x, b.x0), y: Math.min(bounds.min.y, b.y0) };
      bounds.max = { x: Math.max(bounds.max.x, b.x1), y: Math.max(bounds.max.y, b.y1) };
    }
    // and the pictures, as they are turned
    for (const q of pictures.flatMap(cornersOf)) {
      bounds.min = { x: Math.min(bounds.min.x, q.x), y: Math.min(bounds.min.y, q.y) };
      bounds.max = { x: Math.max(bounds.max.x, q.x), y: Math.max(bounds.max.y, q.y) };
    }
    // and the texts' sheets, and their names under them (an icon's room holds its name)
    for (const t of texts) {
      const b = sheetRoom(t);
      if (!b) continue;
      bounds.min = { x: Math.min(bounds.min.x, b.x0), y: Math.min(bounds.min.y, b.y0 - (t.icon ? 0 : NOMINAL_BOND_LENGTH)) };
      bounds.max = { x: Math.max(bounds.max.x, b.x1), y: Math.max(bounds.max.y, b.y1) };
    }
    // and the molecules in 3D, as each is turned and shown now, as the
    // camera sees them: straight from above, by an orthographic camera (the
    // canvas's); in perspective, first from straight above each, then - as
    // one off to the side is seen further out - from where that first fit
    // put the camera
    const eyeHeight = eyeOf(camera)?.z;
    const { turns3d, frames3d } = store.getState();
    const style3d = currentStyle3D();
    const poses = molecules3d.map((m) =>
      poseOf(m, solidOf(m, style3d), lookOf(m), turns3d[m.id], frames3d[m.id]),
    );
    // (what can be seen: the column, over the canvas's right side, left out)
    const cover = Math.min(store.getState().cover, size.width * 0.8);
    const w = size.width - cover;
    const h = size.height;
    const pad = Math.max(0, Math.min(paddingPx, Math.min(w, h) * 0.45));
    const fitFrom = (over?: { x: number; y: number }) => {
      let minX = bounds.min.x;
      let minY = bounds.min.y;
      let maxX = bounds.max.x;
      let maxY = bounds.max.y;
      for (const pose of poses) {
        const from = over ?? pose.at;
        const b = seenBounds(pose, eyeHeight == null ? undefined : { x: from.x, y: from.y, z: eyeHeight });
        minX = Math.min(minX, b.minX);
        maxX = Math.max(maxX, b.maxX);
        minY = Math.min(minY, b.minY);
        maxY = Math.max(maxY, b.maxY);
      }
      const zx = (w - 2 * pad) / Math.max(maxX - minX, 1e-3);
      const zy = (h - 2 * pad) / Math.max(maxY - minY, 1e-3);
      return { zoom: Math.max(0.01, Math.min(zx, zy, maxFitZoom(style))), cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
    };
    let seen = fitFrom();
    if (!isFinite(seen.cx)) return;
    if (poses.length && eyeHeight != null) seen = fitFrom({ x: seen.cx, y: seen.cy });
    const fit = seen.zoom;
    const z = first ? Math.min(fit, cam.zoom || fit) : fit;
    // (the middle of what can be seen lies half the column to the left of the canvas's)
    const cx = seen.cx + cover / 2 / z;
    const cy = seen.cy;
    if (fitted.current) {
      setViewGoal(cam, { zoom: z, x: cx, y: cy });
    } else {
      cam.zoom = z;
      cam.updateProjectionMatrix();
      cam.position.set(cx, cy, cam.position.z);
      fitted.current = true;
    }
    invalidate();
    lastTriggerRef.current = trigger;
    // size changes should also refit
  }, [
    model.atoms,
    model.bonds,
    molecules3d,
    captions,
    pdfs,
    pictures,
    texts,
    style,
    camera,
    size.width,
    size.height,
    invalidate,
    paddingPx,
    trigger,
    autoFitSuspended,
    store,
  ]);
  return null;
}
