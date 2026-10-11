import { addAfterEffect, useFrame, useThree } from "@react-three/fiber";
import { setCursor } from "../../../theme/cursors";
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { addsToSelection } from "../../../../lib/doc/shortcuts";
import { bondRadiusOf, KEY_LIGHT_FROM, STYLE_3D, type Style3D } from "../../../../lib/chem/style3d";
import { LONG_PRESS_MS, MOV_PX } from "../constants";
import { useEditor, useEditorStore } from "../store";
import type { EditorState, Molecule3D, Turn3D } from "../store/types";
import { atomAt, bondAt, lookOf, nearestAtom, onMolecule, poseOf, seenBounds, solidOf } from "../utils/molecule3d";
import { movingFor, placesOf, valueOf } from "../utils/edit3d";
import { kindOf, type MeasureKind } from "../utils/measure3d";
import { setViewGoal } from "./viewGoal";
import { Remake3D } from "./remake3d";
import { PageHtmlLayer } from "./coverLayer";
import { linkOf } from "../chem/make3d";
import { useAppSettings } from "../../../../lib/settings/appSettings";
import { eyeOf, pageAt } from "../utils/page";
import { schemeAmong } from "../utils/copyPaste";
import { setMembers } from "../workflow/entries";
import CalcList3D from "./CalcList3D";
import { isAsk, readGrid, resultKey, resultsOn, type Ask, type ListResult } from "../../../../lib/calc/results";
import { askFor, askKey, findOutput, givenValue, useAsks, type AskError } from "../../../../lib/calc/asks";
import { titled } from "../../../../lib/calc/sources";
import type { CalcInfo } from "../../../../lib/calc/output";
import Molecule3DView from "./Molecule3DView";
import { useDrawingStyle } from "../useDrawingStyle";
import { editorLayoutOptions } from "../layoutOptions";
import { MARK_SCALE } from "../chem/marks";
import { fontStack, labelSetOf } from "../../../../lib/chem/layout2d";

/** A turn left to itself stops below this speed, in radians a second. */
const STILL = 0.02;
/** A release this long after the last move leaves the molecule still, in ms. */
const HELD_MS = 80;
/** How far back the moves go that say how fast a molecule was turning when let go, in ms. */
const RECENT_MS = 64;

type Press = {
  /** The molecule pressed on, and with it the others selected with it. */
  id: number;
  group: number[];
  pointerId: number;
  /** Where the press began, on the screen. */
  sx: number;
  sy: number;
  /** The atom pressed on, or else the bond: what a click chooses. */
  atom: number | null;
  bond: number | null;
  /** Ctrl (⌘ on a Mac) held: a click takes the molecule into the selection or out of it. */
  add: boolean;
  moved: boolean;
};

type Gesture =
  | (Press & {
      kind: "press";
      /** Held still long enough, it selected the molecule. */
      held: boolean;
      timer: number | null;
    })
  | (Press & {
      kind: "turn";
      x: number;
      y: number;
      t: number;
      axis: THREE.Vector3;
      /** The latest moves: when, how far each turned, and in how long. */
      recent: { t: number; angle: number; dt: number }[];
    })
  | (Press & {
      kind: "move";
      from: { x: number; y: number };
      /** Where each molecule moved stood when the drag began. */
      ats: { id: number; at: { x: number; y: number } }[];
      /** The drawing selected with it, and the arrows and pluses among it: where they were. */
      drawn: {
        atoms: { id: number; x: number; y: number }[];
        arrows: { id: number; x: number; y: number }[];
        pluses: { id: number; x: number; y: number }[];
        captions: { id: number; x: number; y: number }[];
        /** A workflow's sets and steps selected with it: where their frames and cards were. */
        sets: { id: number; x0: number; y0: number; x1: number; y1: number }[];
        steps: { id: number; x: number; y: number }[];
      };
      key: string;
    });

/** A press that has travelled: turning a molecule, or moving what is selected. */
type Going = Exclude<Gesture, { kind: "press" }>;

/**
 * The molecules in 3D standing on the page: drawn, lit, and worked with the
 * pointer.
 * - Hovered, a molecule's outline lights up, faintly. A drag on it turns it
 *   about its centre, and let go it turns on a little.
 * - Held still (LONG_PRESS_MS), a press selects it, the selection's outline
 *   spreading out from the atom pressed on as it is held; a drag on a
 *   molecule selected moves it - and all that is selected with it - on the
 *   page. The selection's handle turns them (Selection2D).
 * - A click on an atom or a bond chooses it, for a measurement, or lets it
 *   go; with Ctrl (⌘ on a Mac), it takes the molecule into the selection,
 *   or out of it.
 * - A double-click switches it to its other look - the 3D style's
 *   secondary, or back to its primary - and those selected with it; what
 *   its first click chose is let go again (the maintainer, 2026-10-10).
 * - A measurement's value, pointed at, lights the atoms setting it moves; a
 *   drag across it sets it, as the pointer goes, in one undo step; a
 *   double-click opens it to type a value (utils/edit3d).
 * The page itself never tilts, so a drawing beside it stays as drawn.
 */
export default function Molecules3D({ style = STYLE_3D }: { style?: Style3D }) {
  const molecules = useEditor((s) => s.molecules3d);
  const turns = useEditor((s) => s.turns3d);
  const rising = useEditor((s) => s.rising3d);
  const overlay = useEditor((s) => s.overlay3d);
  const lists = useEditor((s) => s.lists3d);
  // promises asked for: what each came to, or is coming to - and those
  // wanted in this render, asked for once it is done (asking sets state)
  const asks = useAsks((s) => s.state);
  const wantAsked = useRef<(() => void)[]>([]);
  wantAsked.current = [];
  useEffect(() => {
    for (const ask of wantAsked.current.splice(0)) ask();
  });
  // the drawing's atom under the pointer: lit in the molecules made from it
  const hoveredDrawn = useEditor((s) => s.hovered.atomId);
  // and the drawing each was made from, which may have changed since
  const drawing = useEditor((s) => s.model);
  const remake = useContext(Remake3D);
  // (R and S on, every molecule's labels; off, a stereoisomer's own, which tell it from the others)
  const stereoLabels = useAppSettings((s) => s.chemistry.stereoLabels);
  // (R and S on them as large as on the drawing, and written as it writes them)
  const drawingStyle = useDrawingStyle();
  const stereoFont = useMemo(() => {
    const opts = editorLayoutOptions(drawingStyle);
    return {
      size: opts.fontPx * MARK_SCALE,
      units: opts.units === "px" ? ("px" as const) : ("world" as const),
      family: fontStack(labelSetOf(opts).fontFamily ?? "Arial"),
      parentheses: !!opts.stereoParentheses,
      gap: opts.stereoGap ?? 0.35,
    };
  }, [drawingStyle]);
  const frames = useEditor((s) => s.frames3d);
  const hovered = useEditor((s) => s.hovered3d);
  const sel3d = useEditor((s) => s.sel3d);
  const chosen = useEditor((s) => s.chosen3d);
  const hoveredMeasure = useEditor((s) => s.hoveredMeasure3d);
  const store = useEditorStore();
  const { camera, gl, invalidate } = useThree();
  const dom = gl.domElement as HTMLCanvasElement;
  // where the measurements' values are put: what the canvas's events are
  // connected to, as drei's Html has it
  const connected = useThree((s) => s.events.connected) as HTMLElement | undefined;
  const valuesHost = useRef<Element | null>(null);
  // (in the layer the page's HTML goes in, where there is one: PageHtml)
  const layer = useContext(PageHtmlLayer);
  valuesHost.current = layer ?? connected ?? dom.parentElement?.parentElement ?? null;
  // molecules turning on by themselves: about which axis, how fast (rad/s)
  const spins = useRef(new Map<number, { axis: THREE.Vector3; speed: number }>());
  const gesture = useRef<Gesture | null>(null);
  // a measurement's value being dragged across, to set it: which, where the
  // drag began and the value then, and the undo step it makes - the
  // molecule edited being a copy, once a result has been edited
  const scrub = useRef<{ id: number; measure: number; pointerId: number; sx: number; start: number; kind: MeasureKind; key: string; moved: boolean } | null>(null);
  const [scrubbing, setScrubbing] = useState<{ id: number; measure: number } | null>(null);
  const measureEdit = useEditor((s) => s.measureEdit3d);
  // what was chosen before each of the last two presses on a molecule: a
  // double-click puts back what its first click changed
  const chosenBefore = useRef<EditorState["chosen3d"][]>([null, null]);
  const [active, setActive] = useState<{ kind: "turn" | "move"; group: number[] } | null>(null);
  // a press being held on a molecule: the atom its selection spreads from, and since when
  const [hold, setHold] = useState<{ id: number; from: number; start: number } | null>(null);
  // molecules taken away, shrinking out of view: as they were, and how they were turned and shown
  const [leaving, setLeaving] = useState<{ m: Molecule3D; turn: Turn3D | undefined; frame: number }[]>([]);
  const before = useRef({ molecules, turns, frames });
  useEffect(() => {
    const now = new Set(molecules.map((m) => m.id));
    const was = before.current;
    const gone = was.molecules.filter((m) => !now.has(m.id));
    if (gone.length) {
      setLeaving((l) => [...l, ...gone.map((m) => ({ m, turn: was.turns[m.id], frame: was.frames[m.id] ?? 0 }))]);
    }
    before.current = { molecules, turns, frames };
  }, [molecules, turns, frames]);
  // (one gone or going: drawn again, so the picture shows it)
  useEffect(() => {
    invalidate();
  }, [leaving, invalidate]);

  useEffect(() => {
    const pageOf = (e: PointerEvent) => {
      const r = dom.getBoundingClientRect();
      return pageAt(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1), camera);
    };
    const poseNow = (m: Molecule3D) => {
      const st = store.getState();
      return poseOf(m, solidOf(m, style), lookOf(m), st.turns3d[m.id], st.frames3d[m.id]);
    };
    // the molecule the pointer is on: the last placed, on top
    const hit = (e: PointerEvent): { id: number } | null => {
      const p = pageOf(e);
      const st = store.getState();
      for (let i = st.molecules3d.length - 1; i >= 0; i--) {
        const m = st.molecules3d[i];
        if (onMolecule(m, poseNow(m), eyeOf(camera), p.x, p.y, camera.zoom, bondRadiusOf(style[lookOf(m)]))) return { id: m.id };
      }
      return null;
    };
    const turnBy = (id: number, axis: THREE.Vector3, angle: number) => {
      const was = store.getState().turns3d[id];
      const q = was ? new THREE.Quaternion(...was) : new THREE.Quaternion();
      q.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, angle)).normalize();
      store.getState().setTurn3d(id, [q.x, q.y, q.z, q.w] as Turn3D);
    };
    // a click that ends a gesture is the gesture's, not the drawing's
    const swallowClick = () => {
      const swallow = (ev: Event) => ev.stopPropagation();
      window.addEventListener("click", swallow, { capture: true, once: true });
      window.setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 0);
    };

    // the measurement whose value the pointer is over: its box, as drawn
    const labelAt = (e: PointerEvent): { id: number; measure: number } | null => {
      const host = valuesHost.current;
      if (!host) return null;
      for (const el of host.querySelectorAll<HTMLElement>("[data-measure3d]")) {
        const r = el.getBoundingClientRect();
        if (Number(el.style.opacity || 1) < 0.5) continue;
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
          const [id, measure] = (el.dataset.measure3d ?? "").split(":").map(Number);
          return { id, measure };
        }
      }
      return null;
    };

    const onMove = (e: PointerEvent) => {
      const s = scrub.current;
      if (s) {
        if (e.pointerId !== s.pointerId) return;
        e.stopPropagation();
        const dx = e.clientX - s.sx;
        if (!s.moved && Math.abs(dx) < MOV_PX) return;
        s.moved = true;
        // (to a hundredth of an ångström, or half a degree, a pixel's worth each)
        const step = s.kind === "distance" ? SCRUB_ANGSTROM : SCRUB_DEGREES;
        const value = Math.round((s.start + dx * step) / step) * step;
        const id = store.getState().setMeasure3d(s.id, s.measure, value, s.key);
        if (id != null && id !== s.id) {
          s.id = id;
          setScrubbing({ id, measure: s.measure });
        }
        invalidate();
        return;
      }
      const g = gesture.current;
      if (!g) {
        // (nothing new is hovered while a button is held for something else)
        if (e.buttons === 0) {
          store.getState().setHovered3d(hit(e));
          store.getState().setHoveredMeasure3d(labelAt(e));
        }
        return;
      }
      if (e.pointerId !== g.pointerId) return;
      e.stopPropagation();
      // (a press that has not travelled is a click's, or a long press's, as yet)
      if (!g.moved && Math.hypot(e.clientX - g.sx, e.clientY - g.sy) < MOV_PX) return;
      g.moved = true;
      if (g.kind === "press") {
        if (g.timer != null) window.clearTimeout(g.timer);
        setHold(null);
        // selected - by the press itself, held, or before - it moves; else it turns
        const next = store.getState().sel3d.has(g.id) ? moveFrom(g, e) : turnFrom(g, e);
        gesture.current = next;
        setActive({ kind: next.kind, group: next.group });
        return;
      }
      if (g.kind === "turn") {
        const dx = e.clientX - g.x;
        const dy = e.clientY - g.y;
        const len = Math.hypot(dx, dy);
        if (len === 0) return;
        const angle = (style.turnPerHalfWidth * len) / Math.max(dom.clientWidth / 2, 1);
        // (a drag to the right turns the near side right; down turns it down)
        const axis = new THREE.Vector3(dy, dx, 0).normalize();
        for (const id of g.group) turnBy(id, axis, angle);
        const recent = [...g.recent, { t: e.timeStamp, angle, dt: e.timeStamp - g.t }].filter(
          (r) => e.timeStamp - r.t <= RECENT_MS,
        );
        gesture.current = { ...g, x: e.clientX, y: e.clientY, t: e.timeStamp, axis, recent };
      } else {
        const p = pageOf(e);
        const dx = p.x - g.from.x;
        const dy = p.y - g.from.y;
        const by = <T extends { id: number; x: number; y: number }>(t: T) => ({ id: t.id, x: t.x + dx, y: t.y + dy });
        const solids = g.ats.map(({ id, at }) => ({ id, at: { x: at.x + dx, y: at.y + dy } }));
        // (the drawing selected with it goes with it, and a workflow's sets and steps, in the same step)
        if (g.drawn.atoms.length || g.drawn.sets.length || g.drawn.steps.length) {
          store.getState().moveAtoms(g.drawn.atoms.map(by), g.key, {
            arrows: g.drawn.arrows.map(by),
            pluses: g.drawn.pluses.map(by),
            captions: g.drawn.captions.map(by),
            molecules3d: solids,
            sets: g.drawn.sets.map((b) => ({ id: b.id, x0: b.x0 + dx, x1: b.x1 + dx, y0: b.y0 + dy, y1: b.y1 + dy })),
            steps: g.drawn.steps.map(by),
          });
        } else store.getState().moveMolecules3d(solids, g.key);
      }
      invalidate();
    };

    // a press that travels: on a molecule not selected, it turns it
    const turnFrom = (g: Press, e: PointerEvent): Going => {
      spins.current.delete(g.id);
      return { ...g, group: [g.id], kind: "turn", x: g.sx, y: g.sy, t: e.timeStamp, axis: new THREE.Vector3(0, 1, 0), recent: [] };
    };
    // ...and on one selected, it moves it and all that is selected with it -
    // the drawing selected, and the arrows and pluses among it, too
    const moveFrom = (g: Press, e: PointerEvent): Going => {
      const st = store.getState();
      // (a set selected takes what it holds along, selected or not)
      const sets = st.sets.filter((b) => st.selFlow.sets.has(b.id));
      const held = sets.map((b) => setMembers(st, b));
      const takenSolids = new Set([...st.sel3d, ...held.flatMap((h) => h.molecules)]);
      const takenAtoms = new Set([...st.sel.atoms, ...held.flatMap((h) => h.structures.flat())]);
      const group = st.molecules3d.filter((x) => takenSolids.has(x.id)).map((x) => x.id);
      const withDrawing = takenAtoms.size > 0;
      const among = withDrawing
        ? schemeAmong({ ...st.model, arrows: st.arrows, pluses: st.pluses, captions: st.captions }, takenAtoms)
        : { arrows: [], pluses: [], captions: [] };
      for (const id of group) spins.current.delete(id);
      const r = dom.getBoundingClientRect();
      const from = pageAt(((g.sx - r.left) / r.width) * 2 - 1, -(((g.sy - r.top) / r.height) * 2 - 1), camera);
      return {
        ...g,
        group,
        kind: "move",
        from: { x: from.x, y: from.y },
        ats: st.molecules3d.filter((x) => group.includes(x.id)).map((x) => ({ id: x.id, at: { ...x.at } })),
        drawn: {
          atoms: withDrawing ? st.model.atoms.filter((a) => takenAtoms.has(a.id)).map((a) => ({ id: a.id, x: a.x, y: a.y })) : [],
          arrows: among.arrows.map((a) => ({ id: a.id, x: a.x, y: a.y })),
          pluses: among.pluses.map((x) => ({ id: x.id, x: x.x, y: x.y })),
          captions: among.captions.map((x) => ({ id: x.id, x: x.x, y: x.y })),
          sets: sets.map((b) => ({ id: b.id, x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 })),
          steps: st.steps.filter((s) => st.selFlow.steps.has(s.id)).map((s) => ({ id: s.id, x: s.x, y: s.y })),
        },
        key: `move-3d-${g.id}-${e.timeStamp}`,
      };
    };

    const onDown = (e: PointerEvent) => {
      if (gesture.current) return;
      // what the press is on, as it is now: a molecule can have come to stand
      // under a pointer that has not moved since - opened, say - and the menu
      // a right press asks for is that molecule's
      store.getState().setHovered3d(hit(e));
      const label = labelAt(e);
      store.getState().setHoveredMeasure3d(label);
      if (e.button !== 0) return;
      // on a measurement's value that can be set: a drag across it sets it
      if (label) {
        const st = store.getState();
        const m = st.molecules3d.find((x) => x.id === label.id);
        const x = m?.measures?.find((k) => k.id === label.measure);
        const frame = st.frames3d[label.id] ?? 0;
        if (m && x && movingFor(m, x.id, frame)) {
          e.stopPropagation();
          try {
            dom.setPointerCapture(e.pointerId);
          } catch {}
          const start = valueOf(placesOf(m, frame), x.atoms);
          scrub.current = { ...label, pointerId: e.pointerId, sx: e.clientX, start, kind: kindOf(x.atoms), key: `set-measure-${label.id}-${x.id}-${e.timeStamp}`, moved: false };
          setScrubbing(label);
          return;
        }
      }
      const h = store.getState().hovered3d;
      if (!h) return;
      const st = store.getState();
      chosenBefore.current = [chosenBefore.current[1], st.chosen3d];
      const m = st.molecules3d.find((x) => x.id === h.id);
      if (!m) return;
      e.stopPropagation();
      try {
        dom.setPointerCapture(e.pointerId);
      } catch {}
      const p = pageOf(e);
      const pose = poseNow(m);
      const atom = atomAt(pose, eyeOf(camera), p.x, p.y);
      const look = lookOf(m);
      const bond = atom == null && style[look].atoms === "balls" ? bondAt(m, pose, eyeOf(camera), p.x, p.y, style[look].bondRadius) : null;
      const press: Press = { id: m.id, group: [m.id], pointerId: e.pointerId, sx: e.clientX, sy: e.clientY, atom, bond, add: addsToSelection(e), moved: false };
      // held still, it selects the molecule - spreading out from the atom pressed on
      const selected = st.sel3d.has(m.id);
      const timer = selected
        ? null
        : window.setTimeout(() => {
            const g = gesture.current;
            if (g?.kind !== "press" || g.moved) return;
            g.held = true;
            g.timer = null;
            setHold(null);
            store.getState().selectMolecules3d([g.id], g.add);
          }, LONG_PRESS_MS);
      if (!selected) {
        const from = atom ?? (bond != null ? m.bonds[bond].a1 : nearestAtom(pose, eyeOf(camera), p.x, p.y));
        setHold({ id: m.id, from, start: performance.now() });
      }
      gesture.current = { ...press, kind: "press", held: false, timer };
    };

    const onUp = (e: PointerEvent) => {
      const s = scrub.current;
      if (s && e.pointerId === s.pointerId) {
        e.stopPropagation();
        try {
          dom.releasePointerCapture(e.pointerId);
        } catch {}
        scrub.current = null;
        setScrubbing(null);
        swallowClick();
        return;
      }
      const g = gesture.current;
      if (!g || e.pointerId !== g.pointerId) return;
      e.stopPropagation();
      try {
        dom.releasePointerCapture(e.pointerId);
      } catch {}
      gesture.current = null;
      setActive(null);
      setHold(null);
      const st = store.getState();
      if (g.kind === "press") {
        if (g.timer != null) window.clearTimeout(g.timer);
        // a click: the molecule taken into the selection or out, or an atom or a bond chosen
        if (!g.held) {
          if (g.add) st.toggleMolecule3dSel(g.id);
          else if (g.atom != null) st.chooseAtom3d(g.id, g.atom);
          else if (g.bond != null) st.chooseBond3d(g.id, g.bond);
        }
      } else if (g.kind === "turn") {
        // let go while still moving, it turns on as fast as it was turning
        // over the last moves, slowing as it goes
        const took = g.recent.reduce((a, r) => a + r.dt, 0);
        const speed = g.recent.reduce((a, r) => a + r.angle, 0) / (Math.max(took, 16) / 1000);
        if (e.timeStamp - g.t < HELD_MS && speed > STILL) {
          for (const id of g.group) spins.current.set(id, { axis: g.axis, speed });
        }
      }
      swallowClick();
      st.setHovered3d(hit(e));
      invalidate();
    };

    // a double-click: on a measurement's value that can be set, typed; on
    // a molecule, it - and those selected with it - in its other look
    const onDouble = (e: MouseEvent) => {
      if (addsToSelection(e) || e.shiftKey) return;
      const p = e as PointerEvent;
      const label = labelAt(p);
      const st = store.getState();
      if (label) {
        const m = st.molecules3d.find((x) => x.id === label.id);
        if (!m || !movingFor(m, label.measure, st.frames3d[label.id] ?? 0)) return;
        e.stopPropagation();
        st.editMeasure3d(label);
        return;
      }
      const h = hit(p);
      if (!h) return;
      e.stopPropagation();
      store.setState({ chosen3d: chosenBefore.current[0] });
      st.switchLook3d(h.id);
      invalidate();
    };

    const onLeave = () => {
      if (gesture.current) return;
      store.getState().setHovered3d(null);
      store.getState().setHoveredMeasure3d(null);
    };

    dom.addEventListener("pointermove", onMove);
    dom.addEventListener("pointerdown", onDown);
    dom.addEventListener("pointerup", onUp);
    dom.addEventListener("pointercancel", onUp);
    dom.addEventListener("pointerleave", onLeave);
    dom.addEventListener("dblclick", onDouble);
    return () => {
      dom.removeEventListener("dblclick", onDouble);
      dom.removeEventListener("pointermove", onMove);
      dom.removeEventListener("pointerdown", onDown);
      dom.removeEventListener("pointerup", onUp);
      dom.removeEventListener("pointercancel", onUp);
      dom.removeEventListener("pointerleave", onLeave);
    };
  }, [dom, camera, store, style, invalidate]);

  // the measurements' values kept clear of one another, once every frame is
  // drawn (and the values placed where their marks are)
  useEffect(
    () =>
      addAfterEffect(() => {
        if (valuesHost.current) separateValues(valuesHost.current);
      }),
    [],
  );

  // the pointer says what a drag does: a molecule selected moves, another
  // turns - Meno's own pointers (theme/cursors)
  // (a measurement's value that can be set, pointed at or dragged across: the
  // atoms setting it moves, lit; and a drag across it slides sideways)
  const settingOn = scrubbing ?? hoveredMeasure;
  const settingMoves = useMemo(() => {
    if (!settingOn) return null;
    const m = molecules.find((x) => x.id === settingOn.id);
    const atoms = m ? movingFor(m, settingOn.measure, frames[settingOn.id] ?? 0) : null;
    return atoms ? { id: settingOn.id, atoms } : null;
  }, [settingOn, molecules, frames]);
  useEffect(() => {
    setCursor(
      dom,
      settingMoves && !active
        ? "sideways"
        : active?.kind === "turn"
        ? "turning"
        : active?.kind === "move" || (hovered && sel3d.has(hovered.id))
          ? "move"
          : hovered
            ? "turn"
            : null,
    );
  }, [dom, hovered, active, sel3d, settingMoves]);

  // a molecule let go while turning turns on, slowing to a stop
  useFrame((_, dt) => {
    if (!spins.current.size) return;
    for (const [id, s] of spins.current) {
      const was = store.getState().turns3d[id];
      const q = was ? new THREE.Quaternion(...was) : new THREE.Quaternion();
      q.premultiply(new THREE.Quaternion().setFromAxisAngle(s.axis, s.speed * dt)).normalize();
      store.getState().setTurn3d(id, [q.x, q.y, q.z, q.w] as Turn3D);
      s.speed *= Math.pow(1 - style.turnDamping, dt * 60);
      if (s.speed < STILL) spins.current.delete(id);
    }
    invalidate();
  });

  // a list opened under a molecule with no room for it below: the view
  // glides - zooming out, where it must - until the molecule and the list,
  // at its full height, are both seen (`bottom`, where the list's card
  // would end, in the window's pixels)
  const makeRoom = (m: Molecule3D, bottom: number) => {
    const cam = camera as THREE.OrthographicCamera;
    const r = dom.getBoundingClientRect();
    if (bottom <= r.bottom - ROOM_PX) return;
    const st = store.getState();
    const b = seenBounds(poseOf(m, solidOf(m, style), lookOf(m), st.turns3d[m.id], st.frames3d[m.id]), eyeOf(camera));
    // (how far below the molecule the list reaches, which no zoom changes)
    const under = bottom - (r.top + r.height / 2 - (b.minY - cam.position.y) * cam.zoom);
    const zoom = Math.max(cam.zoom / 4, Math.min(cam.zoom, (r.height - 2 * ROOM_PX - under) / Math.max(b.maxY - b.minY, 1e-3)));
    setViewGoal(cam, { zoom, x: cam.position.x, y: b.minY + (r.height / 2 - ROOM_PX - under) / zoom });
    invalidate();
  };

  if (!molecules.length && !leaving.length) return null;
  const litOf = (id: number): number => {
    if (active) return active.group.includes(id) ? (active.kind === "move" ? 2 : 1) : 0;
    return hovered?.id === id ? 1 : 0;
  };
  return (
    <group>
      <ambientLight intensity={style.ambientLight} />
      <directionalLight position={KEY_LIGHT_FROM as [number, number, number]} intensity={style.keyLight} />
      {molecules.map((m) => {
        // (one of its lists open under it: the row chosen moves it, the row pointed at - or chosen - marks its atoms)
        const open = lists[m.id];
        const list = open ? resultsOn(m.calc?.results, "list").find((r) => resultKey(r) === open.list) : undefined;
        const row = list && open.row != null ? list.rows[open.row] : undefined;
        const pointed = list && open.pointed != null ? list.rows[open.pointed] : undefined;
        // (the row's motion and surface: given, or asked for)
        const motion =
          list && row?.move
            ? held(m.calc, list, row.move, asks, wantAsked.current, (v) =>
                Array.isArray(v) && v.length === 3 * m.atoms.length && v.every(Number.isFinite) ? (v as number[]) : undefined,
              )
            : undefined;
        const surface = list && row?.surface ? held(m.calc, list, row.surface, asks, wantAsked.current, readGrid) : undefined;
        const asking = [motion, surface].find((h) => h?.state && h.state !== "given")?.state;
        return (
          <Molecule3DView
            key={m.id}
            m={m}
            style={style}
            look={lookOf(m)}
            frame={frames[m.id] ?? 0}
            turn={turns[m.id]}
            lit={litOf(m.id)}
            selected={sel3d.has(m.id)}
            chosen={chosen?.id === m.id ? chosen.atoms : NONE}
            chosenBonds={chosen?.id === m.id ? chosen.bonds : NONE}
            holding={hold?.id === m.id ? hold : null}
            following={active?.kind === "move" && active.group.includes(m.id)}
            framesOpen={hovered?.id === m.id || sel3d.has(m.id)}
            onFrame={(f) => store.getState().setFrame3d(m.id, f)}
            hoveredMeasure={hoveredMeasure?.id === m.id ? hoveredMeasure.measure : null}
            rising={rising[m.id]}
            onRisen={() => store.getState().risen3d(m.id)}
            stereoShown={stereoLabels ? "all" : m.stereo?.chosen ? "chosen" : null}
            stereoFont={stereoFont}
            overlay={!!overlay[m.id]}
            linkedAtom={hoveredDrawn != null && m.drawnFrom ? (m.drawnFrom.indexOf(hoveredDrawn) >= 0 ? m.drawnFrom.indexOf(hoveredDrawn) : null) : null}
            onHoverAtom={(atom) => store.getState().setHoveredAtom3d(m.id, atom)}
            onRemake={remake && linkOf(m, drawing) === "changed" ? () => remake(m.id) : undefined}
            motion={motion?.value ?? null}
            surface={surface?.value ?? null}
            surfaceIso={open?.iso}
            marked={settingMoves?.id === m.id ? settingMoves.atoms : (pointed?.atoms ?? row?.atoms ?? NONE)}
            editingMeasure={measureEdit?.id === m.id ? measureEdit.measure : null}
            onSetMeasure={(measure, value) => {
              const st = store.getState();
              st.editMeasure3d(null);
              st.setMeasure3d(m.id, measure, value);
            }}
            onEditDone={() => store.getState().editMeasure3d(null)}
            list={
              list ? (
                <CalcList3D
                  list={list}
                  title={titled(list, resultsOn(m.calc?.results, "list"))}
                  chosen={open.row}
                  onChoose={(i) => {
                    const st = store.getState();
                    st.chooseRow3d(m.id, i);
                    const f = i != null ? list.rows[i].frame : undefined;
                    if (f != null) st.setFrame3d(m.id, f);
                  }}
                  onPoint={(i) => store.getState().pointRow3d(m.id, i)}
                  asking={asking === "asking" ? "Working it out…" : asking && typeof asking === "object" ? asking.error : null}
                  onFind={
                    asking && typeof asking === "object" && asking.missing && m.calc?.source
                      ? { name: m.calc.source.name, find: () => void findOutput(m.calc!.source!).catch(() => {}) }
                      : undefined
                  }
                  iso={surface?.value ? (open.iso ?? surface.value.iso ?? DEFAULT_ISO) : undefined}
                  onIso={(iso) => store.getState().setIso3d(m.id, iso)}
                  onClose={() => store.getState().closeList3d(m.id)}
                  onRoom={(bottom) => makeRoom(m, bottom)}
                  area={dom}
                />
              ) : undefined
            }
          />
        );
      })}
      {leaving.map(({ m, turn, frame }) => (
        <Molecule3DView
          key={`leaving-${m.id}`}
          m={m}
          style={style}
          look={lookOf(m)}
          frame={frame}
          turn={turn}
          lit={0}
          selected={false}
          chosen={NONE}
          chosenBonds={NONE}
          holding={null}
          following={false}
          framesOpen={false}
          onFrame={() => {}}
          hoveredMeasure={null}
          leaving={() => setLeaving((l) => l.filter((x) => x.m !== m))}
          stereoShown={null}
          stereoFont={stereoFont}
        />
      ))}
    </group>
  );
}

const NONE: number[] = [];
/** How much a measurement's value changes for each pixel a drag across it goes: in ångströms, and in degrees. */
const SCRUB_ANGSTROM = 0.01;
const SCRUB_DEGREES = 0.5;
/** The value a surface is drawn at where its grid says none. */
const DEFAULT_ISO = 0.05;

/**
 * A row's motion or surface (`v`), as it can be shown: given in the row,
 * or a promise's value once given - asked for the first time it is wanted,
 * once the render is done (`toAsk`) - read by `read`; and the promise's
 * state, where it is one.
 */
function held<T>(
  calc: CalcInfo | undefined,
  list: ListResult,
  v: T | Ask,
  asks: ReturnType<typeof useAsks.getState>["state"],
  toAsk: (() => void)[],
  read: (v: unknown) => T | undefined,
): { value?: T; state?: "asking" | "given" | AskError } {
  if (!isAsk(v)) return { value: read(v) };
  if (!calc) return {};
  const key = askKey(calc.source, list.from, v.ask);
  const state = asks[key];
  if (state === "given") {
    const value = read(givenValue(calc.source, list.from, v.ask));
    return value === undefined ? { state: { error: "The reader gave nothing that can be shown." } } : { value, state };
  }
  // (asked for once: an answer, or a failure, stands)
  if (state === undefined) toAsk.push(() => void askFor(calc, list.from, v.ask).catch(() => {}));
  return { state: state ?? "asking" };
}
/** What a list opened under a molecule is kept clear of the canvas's edges by, and the molecule too, in pixels. */
const ROOM_PX = 24;

/** How far apart two values are kept, in pixels, and how many passes it takes to part them. */
const VALUE_GAP = 2;
const VALUE_PASSES = 8;

/**
 * The measurements' values on the canvas `host`, parted where they overlap:
 * each moved up or down - half the overlap each way, a few passes over - from
 * where its marks put it. Done afresh from where they are put, so a value
 * that no longer overlaps goes back.
 */
function separateValues(host: Element) {
  const els = [...host.querySelectorAll<HTMLElement>("[data-measure3d]")].filter((el) => Number(el.style.opacity || 1) > 0.05);
  if (!els.length) return;
  const boxes = els.map((el) => {
    const r = el.getBoundingClientRect();
    const was = Number(el.dataset.parted ?? 0);
    return { el, left: r.left, right: r.right, top: r.top - was, bottom: r.bottom - was, dy: 0 };
  });
  boxes.sort((a, b) => a.top + a.bottom - (b.top + b.bottom));
  for (let pass = 0; pass < VALUE_PASSES; pass++) {
    let moved = false;
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        if (a.right <= b.left || b.right <= a.left) continue;
        const over = a.bottom + a.dy + VALUE_GAP - (b.top + b.dy);
        if (over <= 0 || b.bottom + b.dy + VALUE_GAP <= a.top + a.dy) continue;
        a.dy -= over / 2;
        b.dy += over / 2;
        moved = true;
      }
    }
    if (!moved) break;
  }
  for (const b of boxes) {
    const dy = Math.round(b.dy * 2) / 2;
    if (Number(b.el.dataset.parted ?? 0) === dy) continue;
    b.el.dataset.parted = String(dy);
    b.el.style.translate = dy ? `0 ${dy}px` : "";
  }
}
