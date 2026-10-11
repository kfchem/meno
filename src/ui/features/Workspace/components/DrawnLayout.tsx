import * as THREE from "three";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useEditor } from "../store";
import {
  layoutMolecule,
  sameAtZooms,
  type Atom as LAtom,
  type Bond as LBond,
} from "../../../../lib/chem/layout2d";
import { editorLayoutOptions, layoutBonds } from "../layoutOptions";
import { useDrawingStyle } from "../useDrawingStyle";
import { needsFallback, useTypefaces } from "../../../fonts/typefaces";
import { chemistry } from "../../../../lib/chem/molecule";
import { useAppSettings } from "../../../../lib/settings/appSettings";
import { DrawnLayoutContext } from "./drawnLayoutContext";
import { NEW_ATOM } from "../utils/stroke";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { DURATION, easeOut } from "../../../theme/motion";
import { glideAt, partsOf, planGlide, type GlidePlan, type Pt } from "../utils/glide";

/**
 * How far an atom may move in one change, while a button is held, and still
 * be drawn there at once: a drag follows the pointer. Further - a snap of a
 * turn, a drop onto an atom - or with no button held - a Clean-up, an undo -
 * the drawing goes there rather than appearing there. What the pointer
 * carries - the atoms that moved all moved alike, a selection dragged - is
 * drawn there at once however far it went: a quick drag would otherwise
 * glide behind the pointer the whole way (the maintainer, 2026-10-07).
 */
const FOLLOWED = 0.35 * NOMINAL_BOND_LENGTH;
/** Close enough to where it is going to be drawn there. */
const ARRIVED = 1e-3;
/** How long the drawing takes to get where it is going, in ms. */
const GLIDE_MS = DURATION.move * 1000;

/** Whether a pointer button is held anywhere in the window, for what moves the drawing as it is. */
const held = { buttons: 0 };
if (typeof window !== "undefined") {
  const note = (e: PointerEvent) => (held.buttons = e.buttons);
  window.addEventListener("pointerdown", note, true);
  window.addEventListener("pointerup", note, true);
  window.addEventListener("pointercancel", () => (held.buttons = 0), true);
}

/** The id the atom a bond is being drawn out to goes by until it is made. */
export const EXTENDING_ATOM_ID = -1;
/** The new atom a stroke on empty space starts at, while it is drawn. */
const STROKE_START_ID = -100000;

/**
 * The drawing as it stands this frame - the model, with an atom that is being
 * dragged where the drag has put it, and a bond being drawn out of an atom
 * already there with its new atom - laid out once, for every layer to draw
 * from. Neither is drawn any other way: the bonds, wedges, joins and labels
 * of a gesture in progress are the ones it will leave behind, because they
 * come from the same layout.
 */
export function DrawnLayoutProvider({ children }: { children: ReactNode }) {
  const { camera, invalidate } = useThree();
  const [zoom, setZoom] = useState(
    () => (camera as THREE.OrthographicCamera).zoom || 1,
  );
  useFrame(() => {
    const z = (camera as THREE.OrthographicCamera).zoom || 1;
    if (z !== zoom) setZoom(z);
  });
  const model = useEditor((s) => s.model);
  const moveDrag = useEditor((s) => s.moveDrag);
  const extend = useEditor((s) => s.extend);
  const aromaticEnabled = useEditor((s) => s.aromaticEnabled);
  const aromaticRings = useEditor((s) => s.aromaticRings);
  const ringFills = useEditor((s) => s.ringFills);
  const style = useDrawingStyle();

  const draggedId =
    moveDrag.active && moveDrag.preview ? moveDrag.atomId : null;
  const dragX = moveDrag.preview?.x;
  const dragY = moveDrag.preview?.y;
  // A stroke under way: the atoms it has laid down, and the bond the pointer
  // is leading, to a new atom or onto one already there.
  const stroke = extend.active ? extend.stroke : null;
  const preview = extend.active ? extend.preview : null;
  const atoms: LAtom[] = useMemo(() => {
    // (with its depth, where it is drawn in perspective: a bond behind
    // another is broken where they cross)
    const out: LAtom[] = model.atoms.map((a) => ({
      id: a.id,
      ...(a.id === draggedId && dragX != null && dragY != null ? { x: dragX, y: dragY } : { x: a.x, y: a.y }),
      el: a.el,
      ...chemistry(a),
      ...(a.z != null ? { z: a.z } : {}),
      // (its charge where a hand put it)
      ...(a.chargeAt ? { chargeAt: a.chargeAt } : {}),
      // (its colour, and its highlight)
      ...(a.color ? { color: a.color } : {}),
      ...(a.highlight ? { highlight: a.highlight } : {}),
    }));
    // (a stroke on empty space: its own new atom where it starts)
    if (stroke && stroke.baseId === NEW_ATOM && stroke.start) {
      out.push({ id: STROKE_START_ID, x: stroke.start.x, y: stroke.start.y, el: "C" });
    }
    stroke?.nodes.forEach((n, i) => {
      if (n.atomId == null && n.pathIndex == null) {
        out.push({ id: EXTENDING_ATOM_ID - i, x: n.x, y: n.y, el: "C" });
      }
    });
    if (preview && preview.atomId == null && preview.pathIndex == null) {
      out.push({ id: EXTENDING_ATOM_ID - 1000, x: preview.x, y: preview.y, el: "C" });
    }
    return out;
  }, [model.atoms, draggedId, dragX, dragY, stroke, preview]);
  // Where each atom is drawn: where it is, or - after a Clean-up, an undo, a
  // snap - on its way there, each structure turning as a whole and settling
  // into its new shape (utils/glide) rather than jumping. An atom being
  // dragged, and what a stroke is laying down, are drawn where the gesture
  // has them.
  const shown = useRef(new Map<number, Pt>());
  const glide = useRef<{ plan: GlidePlan; from: Map<number, Pt>; start: number } | null>(null);
  const planned = useRef<LAtom[] | null>(null);
  const [step, setStep] = useState(0);
  const drawnAtoms: LAtom[] = useMemo(() => {
    const was = shown.current;
    if (planned.current !== atoms) {
      // what changed: drawn there at once, or on its way
      planned.current = atoms;
      let far = 0;
      // (the one way every atom that moved went, where they all went alike)
      let shift: { dx: number; dy: number } | null | undefined;
      for (const a of atoms) {
        const s = a.id === draggedId || a.id < 0 ? undefined : was.get(a.id);
        if (!s) continue;
        const dx = a.x - s.x;
        const dy = a.y - s.y;
        const d = Math.hypot(dx, dy);
        far = Math.max(far, d);
        if (d <= ARRIVED || shift === null) continue;
        if (shift === undefined) shift = { dx, dy };
        else if (Math.hypot(dx - shift.dx, dy - shift.dy) > ARRIVED) shift = null;
      }
      const carried = held.buttons !== 0 && shift != null;
      const atOnce = carried || (!glide.current && (far <= ARRIVED || (held.buttons !== 0 && far <= FOLLOWED)));
      if (atOnce) {
        glide.current = null;
      } else {
        const from = new Map<number, Pt>();
        const to = new Map<number, Pt>();
        for (const a of atoms) {
          const s = was.get(a.id);
          if (!s || a.id === draggedId || a.id < 0) continue;
          from.set(a.id, s);
          to.set(a.id, { x: a.x, y: a.y, ...(a.z != null ? { z: a.z } : {}) });
        }
        glide.current = { plan: planGlide(from, to, partsOf(model.atoms, model.bonds)), from, start: performance.now() };
      }
    }
    const g = glide.current;
    const on = g ? glideAt(g.plan, g.from, easeOut((performance.now() - g.start) / GLIDE_MS)) : null;
    const next = new Map<number, Pt>();
    const out = atoms.map((a) => {
      const p = on?.get(a.id);
      if (!p) {
        next.set(a.id, { x: a.x, y: a.y, ...(a.z != null ? { z: a.z } : {}) });
        return a;
      }
      next.set(a.id, p);
      return { ...a, x: p.x, y: p.y, ...(a.z != null && p.z != null ? { z: p.z } : {}) };
    });
    shown.current = next;
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- step: a frame of the way there; model: its structures, read as the way is planned
  }, [atoms, draggedId, step]);
  // On the way: drawn again every frame until there.
  useFrame(() => {
    const g = glide.current;
    if (!g) return;
    if (performance.now() - g.start >= GLIDE_MS) glide.current = null;
    setStep((n) => n + 1);
    invalidate();
  });
  useEffect(() => {
    if (glide.current) invalidate();
  });
  const bonds: LBond[] = useMemo(() => {
    const index = new Map<number, number>();
    drawnAtoms.forEach((a, i) => index.set(a.id, i));
    const out = layoutBonds(model.bonds, index);
    if (!stroke) return out;
    // where each node of the stroke is drawn: its own atom, or the one it
    // closed onto
    const baseIndex = index.get(stroke.baseId === NEW_ATOM ? STROKE_START_ID : stroke.baseId);
    // (a path index of -1 is the stroke's own start)
    const ofPath = (i: number) => (i === -1 ? baseIndex : index.get(EXTENDING_ATOM_ID - i));
    const at = (n: { atomId?: number; pathIndex?: number }, i: number) =>
      n.atomId != null
        ? index.get(n.atomId)
        : n.pathIndex != null
          ? ofPath(n.pathIndex)
          : index.get(EXTENDING_ATOM_ID - i);
    let from = baseIndex;
    stroke.nodes.forEach((n, i) => {
      if (n.from != null) from = ofPath(n.from) ?? from;
      const to = at(n, i);
      if (from != null && to != null && from !== to) {
        out.push({ a1: from, a2: to, order: 1, stereo: "none" });
      }
      from = to;
    });
    if (preview && from != null) {
      const to =
        preview.atomId != null || preview.pathIndex != null
          ? at(preview, -1)
          : index.get(EXTENDING_ATOM_ID - 1000);
      if (to != null && to !== from) {
        out.push({ a1: from, a2: to, order: 1, stereo: "none" });
      }
    }
    return out;
  }, [drawnAtoms, model.bonds, stroke, preview]);
  const opts = useMemo(() => {
    const keys = Object.keys(aromaticRings || {}).filter(
      (k) => aromaticRings[k],
    );
    const aromaticCircle =
      keys.length > 0
        ? { enabled: new Set(keys) }
        : aromaticEnabled
          ? true
          : false;
    return editorLayoutOptions(style, { aromaticCircle, ringFills });
  }, [style, aromaticEnabled, aromaticRings, ringFills]);
  // The typeface's own letters, and Japanese ones when a label has any, are
  // read when first needed; the layout is redone as they come in.
  const fonts = useTypefaces(
    style.fontFamily,
    needsFallback(model.atoms.map((a) => a.el)),
  );
  // (a label is read by the abbreviations Meno knows, the user's among them)
  const abbreviations = useAppSettings((s) => s.abbreviations);
  // The zoom it is laid out at: the view's - or, where the layout made at
  // the zoom it was last laid out at is the drawing at this one as well
  // (sameAtZooms), that one. A zoom then moves the view and leaves the
  // drawing as it is, rather than laying a drawing of thousands of atoms out
  // again at every frame of it.
  const laidAt = useRef<number | null>(null);
  const layoutZoom =
    laidAt.current != null && sameAtZooms(opts, bonds, laidAt.current, zoom) ? laidAt.current : zoom;
  laidAt.current = layoutZoom;
  const layout = useMemo(
    () => layoutMolecule(drawnAtoms, bonds, opts, layoutZoom),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fonts, abbreviations: see above
    [drawnAtoms, bonds, opts, layoutZoom, fonts, abbreviations],
  );
  const value = useMemo(
    () => ({ atoms: drawnAtoms, bonds, opts, layout, zoom }),
    [drawnAtoms, bonds, opts, layout, zoom],
  );
  return (
    <DrawnLayoutContext.Provider value={value}>
      {children}
    </DrawnLayoutContext.Provider>
  );
}
