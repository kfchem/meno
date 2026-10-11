import * as THREE from "three";
import { pageAt } from "../utils/page";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useEditor, useEditorStore } from "../store";
import { COLORS } from "../../../theme/colors";
import { SELECTION_SHADE } from "./selectionShade";
import { sheetMiddle } from "../utils/textSheets";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { ATOM_HOVER_RING_RADIUS_RATIO, DOUBLE_CLICK_MS, FREE_MS, LONG_PRESS_MS, MOV_PX } from "../constants";
import { addsToSelection } from "../../../../lib/doc/shortcuts";
import { pressOnEmpty } from "../utils/clickCount";
import { cornersOf, inBox, inLasso, marksAtOf, middleOf, molecules3dIn, turned, turnedBy } from "../utils/selection";
import { flowIn } from "../workflow/parts";
import type { Style3D } from "../../../../lib/chem/style3d";
import { currentStyle3D, useStyle3D } from "../style3d";
import { lookOf, poseOf, seenBounds, solidOf, standingHeight, turnedInPlane, turnedTogether, type Turning3D } from "../utils/molecule3d";
import { eyeOf } from "../utils/page";
import type { Model, Molecule3D, PictureItem, Turn3D } from "../store/types";
import { useDrawnLayout } from "./drawnLayoutContext";
import { TAU, follow } from "../../../theme/motion";

/** How far above the selection its turning handle stands, as a share of a bond. */
const HANDLE_ABOVE = 0.75;
/** The handle's radius on the screen, in px, and how far off it a press still takes it. */
const HANDLE_PX = 6;
const HANDLE_HIT = 2;
/** Turning snaps to steps of this many degrees, until a pause lets it go. */
const TURN_STEP = 15;

/** A molecule in 3D as a turn takes it, turned as it is now. */
const turningOf =
  (turns: Record<number, Turn3D>, style: Style3D) =>
  (m: Molecule3D): Turning3D => {
    const solid = solidOf(m, style);
    return { id: m.id, at: m.at, turn: turns[m.id], standing: standingHeight(solid, lookOf(m)) };
  };

/**
 * How far the selection reaches on the page, the drawing's atoms, the
 * molecules in 3D - each as it is turned and shown now, seen straight from
 * above (orthographic), or from `eyeHeight` above it by a camera in
 * perspective - and the pictures, and its middle; null with nothing
 * selected.
 */
function selectionExtent(
  model: Model,
  atoms: ReadonlySet<number>,
  molecules: readonly Molecule3D[],
  sel3d: ReadonlySet<number>,
  turns: Record<number, Turn3D>,
  frames: Record<number, number>,
  style: Style3D,
  eyeHeight?: number,
  pictures: readonly PictureItem[] = [],
): { mid: { x: number; y: number }; top: number } | null {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const a of model.atoms) {
    if (!atoms.has(a.id)) continue;
    xs.push(a.x);
    ys.push(a.y);
  }
  for (const m of molecules) {
    if (!sel3d.has(m.id)) continue;
    const pose = poseOf(m, solidOf(m, style), lookOf(m), turns[m.id], frames[m.id]);
    const b = seenBounds(pose, eyeHeight == null ? undefined : { x: m.at.x, y: m.at.y, z: eyeHeight });
    xs.push(b.minX, b.maxX);
    ys.push(b.minY, b.maxY);
  }
  for (const p of pictures) {
    for (const q of cornersOf(p)) {
      xs.push(q.x);
      ys.push(q.y);
    }
  }
  if (!xs.length) return null;
  // (the drawing alone: its atoms' middle, as ever)
  const mid = sel3d.size || pictures.length ? { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 } : middleOf(model, atoms);
  return mid ? { mid, top: Math.max(...ys) } : null;
}

/**
 * The selection, drawn and worked:
 *
 * - what is selected, shaded under the drawing;
 * - a box or a lasso being drawn to select what it holds - from empty
 *   space with Ctrl (⌘ on a Mac) held, or by a double-click there that
 *   drags; with Alt (Option) held, a lasso rather than a box;
 * - a handle above the selection that turns it about its middle, in steps
 *   of 15 degrees, or freely after a pause. Molecules in 3D selected alone
 *   it turns as one body, in 3D - as a drag on a molecule turns it - about
 *   their common centre; selected with the drawing, they are carried round
 *   in its plane and turned with it. With Shift, each molecule turns about
 *   its own centre instead, and the drawing stays.
 */
export default function Selection2D() {
  const { model, sel, boxSelect } = useEditor();
  const sel3d = useEditor((s) => s.sel3d);
  const selPictures = useEditor((s) => s.selPictures);
  const pictures = useEditor((s) => s.pictures);
  const picked = useMemo(() => pictures.filter((p) => selPictures.has(p.id)), [pictures, selPictures]);
  const molecules3d = useEditor((s) => s.molecules3d);
  const turns3d = useEditor((s) => s.turns3d);
  const frames3d = useEditor((s) => s.frames3d);
  const style3d = useStyle3D();
  // where the handle stood when a turn in 3D took it: it stays there till let go
  const [held, setHeld] = useState<{ mid: { x: number; y: number }; top: number } | null>(null);
  const store = useEditorStore();
  const { camera, gl, invalidate } = useThree();
  const handle = useRef<THREE.Group>(null!);

  const toWorld = (cx: number, cy: number) => {
    const rect = gl.domElement.getBoundingClientRect();
    const v = new THREE.Vector3(((cx - rect.left) / rect.width) * 2 - 1, -(((cy - rect.top) / rect.height) * 2 - 1), 0);
    const p = pageAt(v.x, v.y, camera);
    return { x: p.x, y: p.y };
  };

  // --- a box or a lasso ----------------------------------------------------
  useEffect(() => {
    // on the canvas's container, capturing: ahead of the view's own pan and
    // of the drawing's own handlers
    const host = gl.domElement.parentElement ?? gl.domElement;
    // the last press on nothing that was not a drag, and how many came one
    // after another there: a second soon after it, near it, is a
    // double-click's
    let lastEmpty = { t: -Infinity, x: 0, y: 0, count: 0 };
    const none = { t: -Infinity, x: 0, y: 0, count: 0 };
    // A box, or (Alt) a lasso, from a press: drawn as the pointer goes, what
    // it holds selected when the button comes up.
    const box = (e: PointerEvent, sx: number, sy: number, kind: "box" | "lasso", add: boolean) => {
      const st = store.getState();
      const start = toWorld(sx, sy);
      let moved = false;
      let points = [start];
      // the drag is the box's, not the view's
      st.beginPanHold(e.pointerId);
      const onMove = (ev: PointerEvent) => {
        if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < MOV_PX) return;
        moved = true;
        const p = toWorld(ev.clientX, ev.clientY);
        if (kind === "box") points = [start, p];
        else {
          const last = points[points.length - 1];
          if (Math.hypot(p.x - last.x, p.y - last.y) > NOMINAL_BOND_LENGTH * 0.05) points = [...points, p];
        }
        store.getState().setBoxSelect({ active: true, kind, points });
        invalidate();
      };
      const onUp = (ev: PointerEvent) => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp, true);
        const s = store.getState();
        s.endPanHold(ev.pointerId);
        if (!moved) return;
        s.setBoxSelect({ active: false, kind, points: [] });
        invalidate();
        const got = kind === "box" ? inBox(s.model, points[0], points[1]) : inLasso(s.model, points);
        const atoms = add ? new Set([...s.sel.atoms, ...got.atoms]) : got.atoms;
        const bonds = add ? new Set([...s.sel.bonds, ...got.bonds]) : got.bonds;
        const taken = [...got.atoms];
        // (the molecules in 3D whose centres it takes, with the drawing - and pictures, and a workflow's sets and steps, likewise)
        s.selectMolecules3d(molecules3dIn(s.molecules3d, kind, points), add);
        s.selectPictures(molecules3dIn(s.pictures.map((p) => ({ id: p.id, at: p })), kind, points), add);
        // (and texts' sheets, by their middles)
        s.selectTexts(molecules3dIn(s.texts.flatMap((t) => (t.at ? [{ id: t.id, at: sheetMiddle(t.at, t.text, t.name) }] : [])), kind, points), add);
        s.selectFlow(flowIn(s, kind, points), add);
        s.setSel({ atoms, bonds }, taken.length ? taken[taken.length - 1] : s.selAnchor);
        // the box's end is no double-click's, and no click on nothing
        s.suppressDoubleClick(DOUBLE_CLICK_MS);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp, true);
    };

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || e.target !== gl.domElement) return;
      const st = store.getState();
      // (on an arrow, a "+", words, a workflow's wire, a PDF, a picture, a text's sheet or a measurement's value: theirs)
      const onMark =
        st.hoveredArrow != null ||
        st.hoveredPlus != null ||
        st.hoveredCaption != null ||
        st.hoveredWire != null ||
        st.hoveredPdf != null ||
        st.hoveredPicture != null ||
        st.hoveredText != null ||
        st.hoveredMark != null ||
        st.hoveredMeasure3d != null;
      if (st.hovered.atomId != null || st.hovered.bondId != null || st.hovered3d || onMark || st.labelEdit.active || st.extend.active || st.captionEdit) return;
      const add = addsToSelection(e);
      const count = pressOnEmpty(lastEmpty, { t: e.timeStamp, x: e.clientX, y: e.clientY }, DOUBLE_CLICK_MS);
      const sx = e.clientX;
      const sy = e.clientY;
      const kind = e.altKey ? "lasso" : "box";
      // with Ctrl (⌘): a box at once, added to the selection
      if (add) {
        lastEmpty = none;
        box(e, sx, sy, kind, true);
        return;
      }
      // two: Quick Add there as the button comes up - or, with the column
      // open beside the canvas, the column shut, the work coming back to
      // the canvas (docs/PDF.md, *One canvas*); a drag from the second
      // moves the view, as any drag on nothing does
      if (count === 2) {
        lastEmpty = { t: e.timeStamp, x: sx, y: sy, count: 2 };
        const onSecondMove = (ev: PointerEvent) => {
          if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < MOV_PX) return;
          lastEmpty = none;
          done();
        };
        const onSecondUp = () => {
          done();
          if (lastEmpty.count !== 2) return;
          const r = host.getBoundingClientRect();
          store.getState().doubleClickOnEmpty({ at: toWorld(sx, sy), x: sx - r.left, y: sy - r.top, within: { width: r.width, height: r.height } });
        };
        const done = () => {
          window.removeEventListener("pointermove", onSecondMove);
          window.removeEventListener("pointerup", onSecondUp, true);
        };
        window.addEventListener("pointermove", onSecondMove);
        window.addEventListener("pointerup", onSecondUp, true);
        return;
      }
      // A first press: a drag moves the view (PanZoom2D), a click lets the
      // selection go; held still, a box begins where it is, a ring
      // spreading there as it is held (HoldProgress2D).
      lastEmpty = { t: e.timeStamp, x: sx, y: sy, count: 1 };
      st.setPressHold({ at: toWorld(sx, sy), start: performance.now() });
      const hold = window.setTimeout(() => {
        cleanUp();
        store.getState().setPressHold(null);
        lastEmpty = none;
        box(e, sx, sy, kind, false);
      }, LONG_PRESS_MS);
      const onFirstMove = (ev: PointerEvent) => {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < MOV_PX) return;
        // (a pan is no first click)
        lastEmpty = none;
        cleanUp();
      };
      const onFirstUp = () => cleanUp();
      const cleanUp = () => {
        window.clearTimeout(hold);
        store.getState().setPressHold(null);
        window.removeEventListener("pointermove", onFirstMove);
        window.removeEventListener("pointerup", onFirstUp, true);
      };
      window.addEventListener("pointermove", onFirstMove);
      window.addEventListener("pointerup", onFirstUp, true);
    };
    host.addEventListener("pointerdown", onDown, true);
    return () => {
      host.removeEventListener("pointerdown", onDown, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, camera, store, invalidate]);

  // --- turning -------------------------------------------------------------
  // (where the drawing is drawn: on its way somewhere, the handle and the
  // shading go with it)
  const drawn = useDrawnLayout();
  const shownModel = useMemo(() => {
    const at = new Map(drawn.atoms.map((a) => [a.id, a]));
    return { ...model, atoms: model.atoms.map((a) => ({ ...a, x: at.get(a.id)?.x ?? a.x, y: at.get(a.id)?.y ?? a.y })) };
  }, [model, drawn.atoms]);
  const extent = useMemo(
    () => held ?? selectionExtent(shownModel, sel.atoms, molecules3d, sel3d, turns3d, frames3d, style3d, eyeOf(camera)?.z, picked),
    [held, shownModel, sel.atoms, molecules3d, sel3d, turns3d, frames3d, style3d, camera, picked],
  );
  const turnable = extent != null && (sel.atoms.size > 1 || sel3d.size > 0 || picked.length > 0);
  const handleAt = turnable ? { x: extent!.mid.x, y: extent!.top + NOMINAL_BOND_LENGTH * HANDLE_ABOVE } : null;

  const startTurn = (e: PointerEvent) => {
    const st = store.getState();
    const molecules = st.molecules3d.filter((m) => st.sel3d.has(m.id));
    const pics = st.pictures.filter((p) => st.selPictures.has(p.id));
    // molecules alone, or with Shift: turned in 3D, as a drag on one turns it
    if (molecules.length && (e.shiftKey || (!st.sel.atoms.size && !pics.length))) {
      turnInSpace(e, molecules, e.shiftKey);
      return;
    }
    const about = selectionExtent(st.model, st.sel.atoms, st.molecules3d, st.sel3d, st.turns3d, st.frames3d, currentStyle3D(), eyeOf(camera)?.z, pics)?.mid;
    if (!about) return;
    const from = st.model.atoms.filter((a) => st.sel.atoms.has(a.id)).map((a) => ({ id: a.id, x: a.x, y: a.y }));
    // (marks put by hand turned with it: from where they were as the turn began)
    const model0 = st.model;
    const marksAt = (angle: number) => marksAtOf(model0, st.sel.atoms, turnedBy(angle));
    // (pictures carried round, and turned as far)
    const picturesAt = (angle: number) => turned(pics, about, angle).map((q, i) => ({ ...q, turn: (pics[i].turn ?? 0) + angle }));
    const carried = molecules.map(turningOf(st.turns3d, currentStyle3D()));
    const p0 = toWorld(e.clientX, e.clientY);
    const a0 = Math.atan2(p0.y - about.y, p0.x - about.x);
    const gesture = `turn-${performance.now()}`;
    let free = false;
    let pause: number | null = null;
    let frame: number | null = null;
    let last = p0;
    st.beginPanHold(e.pointerId);
    st.suppressDoubleClick(DOUBLE_CLICK_MS);
    const apply = () => {
      frame = null;
      const a = Math.atan2(last.y - about.y, last.x - about.x) - a0;
      const step = (TURN_STEP * Math.PI) / 180;
      const angle = free ? a : Math.round(a / step) * step;
      // (molecules with the drawing: carried round in its plane, and turned with it)
      const markAts = marksAt(angle);
      const marks = pics.length || markAts ? { ...(pics.length ? { pictures: picturesAt(angle) } : {}), ...(markAts ? { markAts } : {}) } : undefined;
      if (carried.length) store.getState().turnMolecules3d(turnedInPlane(carried, about, angle), gesture, turned(from, about, angle), marks);
      else store.getState().moveAtoms(turned(from, about, angle), gesture, marks);
    };
    const onMove = (ev: PointerEvent) => {
      last = toWorld(ev.clientX, ev.clientY);
      // (one turn a frame: every turn lays the drawing out again)
      if (frame == null) frame = window.requestAnimationFrame(apply);
      if (pause != null) window.clearTimeout(pause);
      pause = window.setTimeout(() => {
        free = true;
        apply();
      }, FREE_MS);
    };
    const onUp = (ev: PointerEvent) => {
      if (pause != null) window.clearTimeout(pause);
      if (frame != null) {
        window.cancelAnimationFrame(frame);
        apply();
      }
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp, true);
      const s = store.getState();
      s.endPanHold(ev.pointerId);
      // (and its end is no click on nothing, which would let it go)
      s.suppressDoubleClick(DOUBLE_CLICK_MS);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, true);
  };

  /**
   * Molecules in 3D turned by the handle in space, as a drag on one turns
   * it: as one body about their common centre - which moves them - or,
   * `each`, every one about its own centre. Either is one undo step, which
   * puts the turns back (a drag on a molecule itself turns only the view).
   */
  const turnInSpace = (e: PointerEvent, molecules: Molecule3D[], each: boolean) => {
    const st = store.getState();
    const from = molecules.map(turningOf(st.turns3d, currentStyle3D()));
    const turnsBefore = Object.fromEntries(molecules.map((m) => [m.id, st.turns3d[m.id]]));
    const inPlace = each || from.length === 1;
    let went = false;
    const gesture = `turn-3d-${performance.now()}`;
    const q = new THREE.Quaternion();
    setHeld(selectionExtent(st.model, st.sel.atoms, st.molecules3d, st.sel3d, st.turns3d, st.frames3d, currentStyle3D(), eyeOf(camera)?.z));
    let last = { x: e.clientX, y: e.clientY };
    let frame: number | null = null;
    st.beginPanHold(e.pointerId);
    st.suppressDoubleClick(DOUBLE_CLICK_MS);
    const apply = () => {
      frame = null;
      went = true;
      const s = store.getState();
      if (inPlace) {
        for (const m of from) {
          const t = q.clone().multiply(m.turn ? new THREE.Quaternion(...m.turn) : new THREE.Quaternion()).normalize();
          s.setTurn3d(m.id, [t.x, t.y, t.z, t.w]);
        }
      } else s.turnMolecules3d(turnedTogether(from, q), gesture);
      invalidate();
    };
    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - last.x;
      const dy = ev.clientY - last.y;
      last = { x: ev.clientX, y: ev.clientY };
      const len = Math.hypot(dx, dy);
      if (len === 0) return;
      // (a drag to the right turns the near side right; down turns it down)
      const angle = (currentStyle3D().turnPerHalfWidth * len) / Math.max(gl.domElement.clientWidth / 2, 1);
      q.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(dy, dx, 0).normalize(), angle)).normalize();
      if (frame == null) frame = window.requestAnimationFrame(apply);
    };
    const onUp = (ev: PointerEvent) => {
      if (frame != null) {
        window.cancelAnimationFrame(frame);
        apply();
      }
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp, true);
      setHeld(null);
      const s = store.getState();
      s.endPanHold(ev.pointerId);
      s.suppressDoubleClick(DOUBLE_CLICK_MS);
      if (inPlace && went) s.keepTurns3d(turnsBefore, Object.fromEntries(from.map((m) => [m.id, s.turns3d[m.id]])));
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, true);
  };

  // --- coming and going ------------------------------------------------------
  // What is shaded, the box or lasso, and the handle each come into view and
  // go out of it rather than appear and vanish (TAU.quick): each shaded part
  // and its last place, the last box drawn, and the handle's last place, with
  // how far in view each is.
  const parts = useRef(new Map<string, { level: number; atom?: { x: number; y: number }; bond?: { p: { x: number; y: number }; q: { x: number; y: number } } }>());
  const chosen = useRef(new Set<string>());
  const box = useRef<{ level: number; outline: { line: THREE.LineLoop; fill: THREE.Mesh } | null }>({ level: 0, outline: null });
  const handleSeen = useRef<{ level: number; at: { x: number; y: number } | null }>({ level: 0, at: null });
  const [, setFrame] = useState(0);
  {
    const at = new Map(shownModel.atoms.map((a) => [a.id, a]));
    const now = new Set<string>();
    for (const id of sel.atoms) {
      const a = at.get(id);
      if (!a) continue;
      const e = parts.current.get(`a${id}`) ?? { level: 0 };
      e.atom = { x: a.x, y: a.y };
      parts.current.set(`a${id}`, e);
      now.add(`a${id}`);
    }
    for (const b of model.bonds) {
      if (!sel.bonds.has(b.id)) continue;
      const p = at.get(b.a);
      const q = at.get(b.b);
      if (!p || !q) continue;
      const e = parts.current.get(`b${b.id}`) ?? { level: 0 };
      e.bond = { p: { x: p.x, y: p.y }, q: { x: q.x, y: q.y } };
      parts.current.set(`b${b.id}`, e);
      now.add(`b${b.id}`);
    }
    chosen.current = now;
    if (handleAt) handleSeen.current.at = handleAt;
  }
  useFrame((_, dt) => {
    const d = Math.min(dt, 1 / 20);
    let moving = false;
    for (const [k, e] of parts.current) {
      const to = chosen.current.has(k) ? 1 : 0;
      if (e.level !== to) {
        const n = follow(e.level, to, d, TAU.quick);
        e.level = Math.abs(n - to) < 0.01 ? to : n;
        moving = true;
      }
      if (e.level === 0 && to === 0) parts.current.delete(k);
    }
    const b = box.current;
    const boxTo = b.outline && boxSelect.active ? 1 : 0;
    if (b.level !== boxTo) {
      const n = follow(b.level, boxTo, d, TAU.quick);
      b.level = Math.abs(n - boxTo) < 0.01 ? boxTo : n;
      moving = true;
    }
    if (b.outline) {
      (b.outline.line.material as THREE.LineBasicMaterial).opacity = b.level;
      (b.outline.fill.material as THREE.MeshBasicMaterial).opacity = 0.08 * b.level;
      if (b.level === 0 && !boxSelect.active) {
        b.outline.line.geometry.dispose();
        (b.outline.line.material as THREE.Material).dispose();
        b.outline.fill.geometry.dispose();
        (b.outline.fill.material as THREE.Material).dispose();
        b.outline = null;
        moving = true;
      }
    }
    const h = handleSeen.current;
    const handleTo = turnable ? 1 : 0;
    if (h.level !== handleTo) {
      const n = follow(h.level, handleTo, d, TAU.quick);
      h.level = Math.abs(n - handleTo) < 0.01 ? handleTo : n;
      moving = true;
    }
    // the handle the same size on the screen at any zoom, growing in and shrinking out
    if (handle.current) {
      handle.current.scale.setScalar((HANDLE_PX / Math.max((camera as THREE.OrthographicCamera).zoom, 1e-6)) * (0.6 + 0.4 * h.level));
      handle.current.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined;
        if (m && m.userData.seen) m.opacity = h.level;
      });
    }
    if (moving) {
      setFrame((f) => f + 1);
      invalidate();
    }
  });

  // --- shading -------------------------------------------------------------
  const r = ATOM_HOVER_RING_RADIUS_RATIO * NOMINAL_BOND_LENGTH;
  const shade = useMemo(() => new THREE.Color(SELECTION_SHADE), []);
  // (shading coming or going: the page's white going over to the shade, so
  // that where parts overlap it stays even)
  const shadeAt = (level: number) => new THREE.Color("#ffffff").lerp(shade, level);
  // the box or the lasso being drawn: a pale fill inside a line
  const outline = useMemo(() => {
    if (!boxSelect.active || boxSelect.points.length < 2) return null;
    const pts =
      boxSelect.kind === "box"
        ? [
            boxSelect.points[0],
            { x: boxSelect.points[1].x, y: boxSelect.points[0].y },
            boxSelect.points[1],
            { x: boxSelect.points[0].x, y: boxSelect.points[1].y },
          ]
        : boxSelect.points;
    const line = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(pts.map((p) => new THREE.Vector3(p.x, p.y, 0.005))),
      new THREE.LineBasicMaterial({ color: COLORS.highlight, depthTest: false, toneMapped: false, transparent: true, opacity: 0 }),
    );
    line.renderOrder = 40;
    const fill = new THREE.Mesh(
      new THREE.ShapeGeometry(new THREE.Shape(pts.map((p) => new THREE.Vector2(p.x, p.y)))),
      new THREE.MeshBasicMaterial({
        color: COLORS.highlight,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    fill.position.z = 0.004;
    fill.renderOrder = 39;
    return { line, fill };
  }, [boxSelect]);
  // the box drawn last: kept as the gesture ends, to go out of view
  useEffect(() => {
    if (!outline) return;
    const was = box.current.outline;
    if (was && was !== outline) {
      for (const o of [was.line, was.fill]) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    }
    box.current.outline = outline;
    invalidate();
  }, [outline, invalidate]);

  const shown = [...parts.current.entries()];
  const lastBox = box.current.outline;
  const handlePlace = handleSeen.current.at;
  return (
    <group>
      {shown.map(([k, e]) =>
        e.atom ? (
          <mesh key={k} position={[e.atom.x, e.atom.y, -0.04]} renderOrder={-2}>
            <circleGeometry args={[r, 32]} />
            <meshBasicMaterial color={shadeAt(e.level)} depthWrite={false} toneMapped={false} />
          </mesh>
        ) : e.bond ? (
          <mesh
            key={k}
            position={[(e.bond.p.x + e.bond.q.x) / 2, (e.bond.p.y + e.bond.q.y) / 2, -0.045]}
            rotation={[0, 0, Math.atan2(e.bond.q.y - e.bond.p.y, e.bond.q.x - e.bond.p.x)]}
            renderOrder={-2}
          >
            <planeGeometry args={[Math.hypot(e.bond.q.x - e.bond.p.x, e.bond.q.y - e.bond.p.y), r * 1.1]} />
            <meshBasicMaterial color={shadeAt(e.level)} depthWrite={false} toneMapped={false} />
          </mesh>
        ) : null,
      )}
      {lastBox && <primitive object={lastBox.fill} />}
      {lastBox && <primitive object={lastBox.line} />}
      {handlePlace && (handleAt || handleSeen.current.level > 0) && (
        <group
          ref={handle}
          position={[handlePlace.x, handlePlace.y, 0.006]}
          onPointerDown={(e) => {
            if ((e.nativeEvent?.button ?? 0) !== 0) return;
            if (!handleAt) return;
            e.stopPropagation();
            startTurn(e.nativeEvent);
          }}
        >
          {/* (what a press takes, wider than what is seen) */}
          <mesh>
            <circleGeometry args={[HANDLE_HIT, 24]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
          <mesh renderOrder={41}>
            <circleGeometry args={[1, 24]} />
            <meshBasicMaterial color="#ffffff" depthTest={false} toneMapped={false} transparent opacity={0} userData={{ seen: true }} />
          </mesh>
          <mesh renderOrder={42}>
            <ringGeometry args={[0.68, 1, 24]} />
            <meshBasicMaterial color={COLORS.highlight} depthTest={false} toneMapped={false} transparent opacity={0} userData={{ seen: true }} />
          </mesh>
        </group>
      )}
    </group>
  );
}
