import * as THREE from "three";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useEditor } from "../store";
import {
  sameAtZooms,
  type Atom as LAtom,
  type Bond as LBond,
} from "../../../../lib/chem/layout2d";
import { layoutByStructure, structureLayouts } from "../../../../lib/chem/layoutStructures";
import { editorLayoutOptions, layoutAtomOf, layoutBond } from "../layoutOptions";
import type { Atom, Bond } from "../store/types";
import { useDrawingStyle } from "../useDrawingStyle";
import { needsFallback, useTypefaces } from "../../../fonts/typefaces";
import { useAppSettings } from "../../../../lib/settings/appSettings";
import { DrawnLayoutContext, DrawnZoomContext, drawnZoomOf } from "./drawnLayoutContext";
import { NEW_ATOM, type StrokeNode } from "../utils/stroke";
import { ChainGrow } from "../utils/chainGrow";
import { CHAIN_EASE } from "../constants";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { DURATION, easeOut } from "../../../theme/motion";
import { glideAt, partsOf, planGlide, type GlidePlan, type Pt } from "../utils/glide";
import { nearZoom, SETTLE_MS, zoomedLarge } from "../utils/largeZoom";

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

/** Whether `atoms` are those of `ids`, in that order. */
function sameIds(ids: readonly number[], atoms: readonly { id: number }[]): boolean {
  if (ids.length !== atoms.length) return false;
  for (let i = 0; i < ids.length; i++) if (ids[i] !== atoms[i].id) return false;
  return true;
}

/** Whether two lists hold the same objects, in order. */
function sameList<T>(a: readonly T[], b: readonly T[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
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
  // (the same zoom for the layers that read it, each drawn again only as
  // what it reads of it changes: not in the layout's context, which every
  // layer reads - drawnLayoutContext `useDrawnZoom`)
  const [drawnZoom] = useState(() => drawnZoomOf(zoom));
  // (passed on once it is taken up - in the same commit as a layout laid out at it)
  useLayoutEffect(() => drawnZoom.set(zoom), [drawnZoom, zoom]);
  const take = setZoom;
  // The zoom it is laid out for (utils/largeZoom): the view's, taken up as
  // the view moves a hundredth from it (`nearZoom`) - the last of a wheel's
  // zoom, in steps too small to see, lays nothing out again; and, for a very
  // large drawing, only once the view has stayed within a hundredth of one
  // zoom for `SETTLE_MS` (the maintainer, 2026-10-13).
  const large = useRef(false);
  const settle = useRef<number | null>(null);
  // (the zoom the wait was last begun at: the view moving on from it by
  // less than a hundredth - a label fading in, the pointer lighting an
  // atom - waits for nothing)
  const from = useRef(zoom);
  useEffect(() => () => void (settle.current != null && window.clearTimeout(settle.current)), []);
  useFrame(() => {
    const z = (camera as THREE.OrthographicCamera).zoom || 1;
    if (!large.current) {
      if (settle.current != null) window.clearTimeout(settle.current);
      settle.current = null;
      from.current = z;
      if (!nearZoom(z, zoom)) take(z);
      return;
    }
    if (nearZoom(z, from.current)) return;
    from.current = z;
    if (settle.current != null) window.clearTimeout(settle.current);
    settle.current = window.setTimeout(() => {
      settle.current = null;
      const now = (camera as THREE.OrthographicCamera).zoom || 1;
      from.current = now;
      take(now);
    }, SETTLE_MS);
  });
  const shownModel = useEditor((s) => s.model);
  const fullModel = useEditor((s) => s.fullModel);
  // (a record coming into view in its stack drawn as it comes, not here, until it is there: StackSwap2D)
  const swaps = useEditor((s) => s.recordSwaps);
  const model = useMemo(() => {
    const coming = new Set(Object.values(swaps).flatMap((w) => w.to));
    if (!coming.size) return shownModel;
    return { atoms: shownModel.atoms.filter((a) => !coming.has(a.id)), bonds: shownModel.bonds.filter((b) => !coming.has(b.a) && !coming.has(b.b)) };
  }, [shownModel, swaps]);
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
  // A chain's new bonds grow out of the last, and one taken back goes back the same way (utils/chainGrow)
  const grow = useRef<ChainGrow | null>(null);
  if (!grow.current) grow.current = new ChainGrow(CHAIN_EASE);
  const [growStep, setGrowStep] = useState(0);
  const growing = useRef(false);
  const hadChain = useRef(false);
  const chainNodes = stroke?.kind === "chain" ? stroke.nodes : null;
  const basePlace = (() => {
    if (!stroke) return null;
    if (stroke.baseId === NEW_ATOM) return stroke.start ?? null;
    const a = model.atoms.find((x) => x.id === stroke.baseId);
    return a ? { x: a.x, y: a.y } : null;
  })();
  const grownNodes: { node: StrokeNode; i: number; x: number; y: number }[] | null = (() => {
    const g = grow.current!;
    const now = performance.now();
    if (!chainNodes) {
      // (no chain: what was held of one that ended is let go, once)
      if (hadChain.current) {
        grow.current = new ChainGrow(CHAIN_EASE);
        hadChain.current = false;
      }
      growing.current = false;
      return null;
    }
    hadChain.current = true;
    g.set(chainNodes, now);
    const { out, moving } = g.at(now, (n, i, shown) => {
      const parent = n.from != null ? (n.from === -1 ? basePlace : shown[n.from]) : i > 0 ? shown[i - 1] : basePlace;
      return parent ?? n;
    });
    growing.current = moving;
    return out.map((h) => ({ node: h.node, i: h.i, x: h.x, y: h.y }));
    // (taken again at each frame it is on its way: growStep)
  })();
  void growStep;
  // (each atom and bond as the layout takes it, the same object while it is
  // the same: what the layout made of a structure none of whose atoms and
  // bonds changed is taken again - lib/chem/layoutStructures)
  const takenAtoms = useRef(new WeakMap<Atom, LAtom>());
  const takenBonds = useRef(new WeakMap<Bond, LBond>());
  const atoms: LAtom[] = useMemo(() => {
    const kept = takenAtoms.current;
    const out: LAtom[] = model.atoms.map((a) => {
      if (a.id === draggedId && dragX != null && dragY != null) return layoutAtomOf(a, { x: dragX, y: dragY });
      let l = kept.get(a);
      if (!l) kept.set(a, (l = layoutAtomOf(a)));
      return l;
    });
    // (a stroke on empty space: its own new atom where it starts)
    if (stroke && stroke.baseId === NEW_ATOM && stroke.start) {
      out.push({ id: STROKE_START_ID, x: stroke.start.x, y: stroke.start.y, el: "C" });
    }
    (grownNodes ?? stroke?.nodes.map((n, i) => ({ node: n, i, x: n.x, y: n.y })) ?? []).forEach(({ node: n, i, x, y }) => {
      if (n.atomId == null && n.pathIndex == null) {
        out.push({ id: EXTENDING_ATOM_ID - i, x, y, el: "C" });
      }
    });
    if (preview && preview.atomId == null && preview.pathIndex == null) {
      out.push({ id: EXTENDING_ATOM_ID - 1000, x: preview.x, y: preview.y, el: "C" });
    }
    return out;
  }, [model.atoms, draggedId, dragX, dragY, stroke, preview, growStep]);
  // Where each atom is drawn: where it is, or - after a Clean-up, an undo, a
  // snap - on its way there, each structure turning as a whole and settling
  // into its new shape (utils/glide) rather than jumping. An atom being
  // dragged, and what a stroke is laying down, are drawn where the gesture
  // has them.
  // (each atom as it was drawn last)
  const shown = useRef<LAtom[]>([]);
  const glide = useRef<{ plan: GlidePlan; from: Map<number, Pt>; start: number; sizes?: Map<number, number> } | null>(null);
  const planned = useRef<LAtom[] | null>(null);
  // (the whole drawing as it was when last planned: a record of a stack of
  // drawings coming into sight - its stack laid out as a grid - goes from
  // where it stood in the stack, out of sight: utils/stacks)
  const fullBefore = useRef(fullModel);
  const [step, setStep] = useState(0);
  const drawnAtoms: LAtom[] = useMemo(() => {
    if (planned.current !== atoms) {
      // what changed: drawn there at once, or on its way
      planned.current = atoms;
      // (where each atom was drawn: by its place, where the atoms are the
      // ones there were - an atom moved, at every frame of a drag - else by
      // its id; an atom the same object as before is where it was)
      const last = shown.current;
      const aligned = last.length === atoms.length && atoms.every((a, i) => last[i].id === a.id);
      let byId: Map<number, Pt> | null = null;
      const lastById = () => (byId ??= new Map(last.map((a) => [a.id, a])));
      const before = fullBefore.current;
      fullBefore.current = fullModel;
      if (!aligned && before !== fullModel && atoms.some((a) => !lastById().has(a.id) && a.id >= 0)) {
        const stacked = new Map(before.atoms.filter((a) => a.stack && !lastById().has(a.id)).map((a) => [a.id, { x: a.x, y: a.y }]));
        if (stacked.size) byId = new Map([...stacked, ...lastById()]);
      }
      const was = (a: LAtom, i: number): Pt | undefined => (aligned ? last[i] : lastById().get(a.id));
      let far = 0;
      // (the one way every atom that moved went, where they all went alike)
      let shift: { dx: number; dy: number } | null | undefined;
      const moved = new Set<number>();
      for (let i = 0; i < atoms.length; i++) {
        const a = atoms[i];
        const s = a.id === draggedId || a.id < 0 ? undefined : was(a, i);
        if (!s || s === a) continue;
        const dx = a.x - s.x;
        const dy = a.y - s.y;
        const d = Math.hypot(dx, dy);
        far = Math.max(far, d);
        if (d <= ARRIVED) continue;
        moved.add(a.id);
        if (shift === null) continue;
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
        for (let i = 0; i < atoms.length; i++) {
          const a = atoms[i];
          const s = was(a, i);
          if (!s || a.id === draggedId || a.id < 0) continue;
          from.set(a.id, { x: s.x, y: s.y, ...(s.z != null ? { z: s.z } : {}) });
          to.set(a.id, { x: a.x, y: a.y, ...(a.z != null ? { z: a.z } : {}) });
        }
        // (the structures that moved: the rest stay as they are drawn, laid out as they were)
        const parts = partsOf(model.atoms, model.bonds).filter((part) => part.some((id) => moved.has(id)));
        // (and how large each was shown, where that changes: it goes over to it as it goes - docs/WORKSPACE.md, *Magnified display*)
        const sizes = new Map<number, number>();
        for (let i = 0; i < atoms.length; i++) {
          const s = was(atoms[i], i) as (Pt & { magnified?: number }) | undefined;
          if (s && (s.magnified ?? 1) !== (atoms[i].magnified ?? 1)) sizes.set(atoms[i].id, s.magnified ?? 1);
        }
        glide.current = { plan: planGlide(from, to, parts), from, start: performance.now(), sizes };
      }
    }
    const g = glide.current;
    const e = g ? easeOut((performance.now() - g.start) / GLIDE_MS) : 1;
    const on = g ? glideAt(g.plan, g.from, e) : null;
    const out = on
      ? atoms.map((a) => {
          const p = on.get(a.id);
          const k0 = g?.sizes?.get(a.id);
          // (as large as it is shown on its way: k going over with its places)
          const k = k0 == null ? null : Math.round((k0 + ((a.magnified ?? 1) - k0) * Math.min(1, e)) * 100) / 100;
          return p ? { ...a, x: p.x, y: p.y, ...(a.z != null && p.z != null ? { z: p.z } : {}), ...(k != null ? { magnified: k } : {}) } : a;
        })
      : atoms;
    shown.current = out;
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- step: a frame of the way there; model: its structures, and fullModel, where what comes into sight stood, read as the way is planned
  }, [atoms, draggedId, step]);
  // A chain's bonds on their way out (or back): drawn again every frame until they are.
  useFrame(() => {
    if (!growing.current) return;
    setGrowStep((n) => n + 1);
    invalidate();
  });
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
  // (the model's bonds as the layout takes them, the same list while the
  // bonds and the atoms' places are: a drag moves atoms and keeps both)
  const modelBonds = useRef<{ ids: number[]; from: readonly Bond[]; out: LBond[]; index: Map<number, number> } | null>(null);
  const bonds: LBond[] = useMemo(() => {
    let laid = modelBonds.current;
    if (!laid || !sameIds(laid.ids, drawnAtoms) || !sameList(laid.from, model.bonds)) {
      const index = new Map<number, number>();
      drawnAtoms.forEach((a, i) => index.set(a.id, i));
      const kept = takenBonds.current;
      const out: LBond[] = [];
      for (const b of model.bonds) {
        const a1 = index.get(b.a);
        const a2 = index.get(b.b);
        if (a1 == null || a2 == null) continue;
        let l = kept.get(b);
        if (!l || l.a1 !== a1 || l.a2 !== a2) kept.set(b, (l = layoutBond(b, a1, a2)));
        out.push(l);
      }
      modelBonds.current = laid = { ids: drawnAtoms.map((a) => a.id), from: model.bonds, out, index };
    }
    if (!stroke) return laid.out;
    const index = laid.index;
    const out = [...laid.out];
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
    (grownNodes ?? stroke.nodes.map((n, i) => ({ node: n, i }))).forEach(({ node: n, i }) => {
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
  }, [drawnAtoms, model.bonds, stroke, preview, growStep]);
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
  // (whether any label needs them: worked out as the atoms change, not at every render - every frame of a drag over a large drawing)
  const anyJapanese = useMemo(() => needsFallback(model.atoms.map((a) => a.el)), [model.atoms]);
  const fonts = useTypefaces(style.fontFamily, anyJapanese);
  // (a label is read by the abbreviations Meno knows, the user's among them)
  const abbreviations = useAppSettings((s) => s.abbreviations);
  large.current = zoomedLarge(drawnAtoms.length);
  // The zoom it is laid out at: the view's - or, where the layout made at
  // the zoom it was last laid out at is the drawing at this one as well
  // (sameAtZooms), that one. A zoom then moves the view and leaves the
  // drawing as it is, rather than laying a drawing of thousands of atoms out
  // again at every frame of it.
  const laidAt = useRef<number | null>(null);
  const layoutZoom =
    laidAt.current != null && sameAtZooms(opts, bonds, laidAt.current, zoom) ? laidAt.current : zoom;
  laidAt.current = layoutZoom;
  const laid = useRef(structureLayouts());
  const layout = useMemo(
    () => layoutByStructure(drawnAtoms, bonds, opts, layoutZoom, laid.current, [fonts, abbreviations]),
    [drawnAtoms, bonds, opts, layoutZoom, fonts, abbreviations],
  );
  const value = useMemo(
    () => ({ atoms: drawnAtoms, bonds, opts, layout, laidAt: layoutZoom }),
    [drawnAtoms, bonds, opts, layout, layoutZoom],
  );
  return (
    <DrawnZoomContext.Provider value={drawnZoom}>
      <DrawnLayoutContext.Provider value={value}>
        {children}
      </DrawnLayoutContext.Provider>
    </DrawnZoomContext.Provider>
  );
}
