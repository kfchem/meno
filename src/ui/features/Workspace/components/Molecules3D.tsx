import { addAfterEffect, useFrame, useThree } from "@react-three/fiber";
import { longPressMs } from "../longPress";
import { setCursor } from "../../../theme/cursors";
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { addsToSelection } from "../../../../lib/doc/shortcuts";
import { bondRadiusOf, STYLE_3D, type Style3D } from "../../../../lib/chem/style3d";
import KeyLight3D from "./KeyLight3D";
import ScreenShade3D from "./ScreenShade3D";
import { MOV_PX } from "../constants";
import { useEditor, useEditorStore } from "../store";
import type { EditorState, Molecule3D, Turn3D } from "../store/types";
import { atomAt, bondAt, frameOf, lookOf, nearestAtom, onMolecule, poseOf, seenBounds, solidOf } from "../utils/molecule3d";
import { movingFor, placesOf, valueOf } from "../utils/edit3d";
import { kindOf, type MeasureKind } from "../utils/measure3d";
import { movedUnderPointer, pressMovedUnder, setViewGoal } from "./viewGoal";
import { hiddenInStacks, placeInStack, STACK_SWAP_MS } from "../utils/stacks";
import { stepTurnsOnce, stopTurnsOnce, turningOnce } from "../utils/turnOnce";
import { Remake3D } from "./remake3d";
import { PageHtmlLayer } from "./coverLayer";
import { linkOf } from "../chem/make3d";
import { useProtonationMark } from "../chem/protonate";
import { eyeOf, pageAt } from "../utils/page";
import { guideMove } from "../utils/guiding";
import { selectionScheme } from "../utils/selectionScheme";
import { setMembers } from "../workflow/entries";
import CalcList3D from "./CalcList3D";
import { isAsk, readGrid, resultKey, resultsOn, type Ask, type ListResult } from "../../../../lib/calc/results";
import { askFor, askKey, findOutput, givenValue, useAsks, type AskError } from "../../../../lib/calc/asks";
import { titled } from "../../../../lib/calc/sources";
import { gridAbout, isoOf, type GridPlace } from "../../../../lib/calc/grids";
import type { CalcInfo } from "../../../../lib/calc/output";
import Molecule3DView, { type Split3D } from "./Molecule3DView";
import { stereoShownOf } from "../document";
import { viewBack, viewShowingCopy } from "../utils/copySeen";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import StackChip3D from "./StackChip3D";
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
/**
 * A copy splitting off the molecule it was made from (a value set on a
 * result): how long it takes, in seconds - `SPLIT_LEAST` at least, and no
 * faster than `SPLIT_SPEED` bond lengths a second where its place is far,
 * past a set, up to `SPLIT_MOST` - and how long it is lit once there, in ms.
 */
const SPLIT_LEAST = 0.45;
const SPLIT_MOST = 1.1;
const SPLIT_SPEED = 14;
const SPLIT_LIT_MS = 900;

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
      /** What it lines up with as it goes (docs/PRESENTING.md, *Guides*). */
      guide: ReturnType<typeof guideMove>;
    });

/** A press that has travelled: turning a molecule, or moving what is selected. */
type Going = Exclude<Gesture, { kind: "press" }>;

/**
 * The molecules in 3D standing on the page: drawn, lit, and worked with the
 * pointer.
 * - Hovered, a molecule's outline lights up, faintly. A drag on it turns it
 *   about its centre, and let go it turns on a little.
 * - Held still (longPressMs()), a press selects it, the selection's outline
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
  // (those a set holds on the page: their notes kept short, within their room under its name)
  const sets = useEditor((s) => s.sets);
  const inSets = useMemo(() => new Set(sets.flatMap((b) => (b.members ?? []).flatMap((m) => ("molecule" in m ? [m.molecule] : [])))), [sets]);
  // (the foot of the set each is in - the least that holds it - where its frames chip, opened, goes clear of the set: Molecule3DView `setFoot`)
  const setFeet = useMemo(() => {
    const feet = new Map<number, { foot: number; area: number }>();
    for (const b of sets) {
      const area = Math.abs((b.x1 - b.x0) * (b.y1 - b.y0));
      for (const m of b.members ?? []) {
        if (!("molecule" in m)) continue;
        const had = feet.get(m.molecule);
        if (!had || area < had.area) feet.set(m.molecule, { foot: Math.min(b.y0, b.y1), area });
      }
    }
    return feet;
  }, [sets]);
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
  // and the drawing each was made from, which may have changed since (a
  // record of a stack of drawings out of sight still there: utils/stacks)
  const drawing = useEditor((s) => s.fullModel);
  const remake = useContext(Remake3D);
  // (R and S on, every molecule's labels; off, a stereoisomer's own, which tell it from the others)
  // (R and S on them as large as on the drawing, and written as it writes them)
  const drawingStyle = useDrawingStyle();
  const stereoFont = useMemo(() => {
    const opts = editorLayoutOptions(drawingStyle);
    return {
      size: opts.fontPx * MARK_SCALE,
      units: opts.units === "px" ? ("px" as const) : ("world" as const),
      family: fontStack(labelSetOf(opts).fontFamily ?? "Arial"),
      parentheses: !!opts.stereoParentheses,
      // (and set as the drawing's are: StereoInk3D)
      opts,
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
  const [leaving, setLeaving] = useState<{ m: Molecule3D; turn: Turn3D | undefined; frame: number; split?: Split3D }[]>([]);
  // copies splitting off the molecules they were made from, by id (Split3D); the one lit a moment once there;
  // and the view a copy's split took it to, and from - to go back to as it is undone
  const [splits, setSplits] = useState<Record<number, Split3D>>({});
  const [freshCopy, setFreshCopy] = useState<number | null>(null);
  const copyView = useRef<{ copy: number; before: { zoom: number; x: number; y: number }; went: { zoom: number; x: number; y: number } } | null>(null);
  const copied = useEditor((s) => s.copied3d);
  // of each stack, the molecule it shows (utils/stacks): those out of sight not drawn; and a stack
  // going over to another, the one let go of drawn as it goes (`receding`), the next as it comes (`arriving`)
  const stacksShown = useEditor((s) => s.stacksShown);
  const hiddenStacked = useMemo(() => hiddenInStacks(molecules, stacksShown), [molecules, stacksShown]);
  // (each molecule made from the drawing, whether the drawing has changed since: worked out as either changes,
  // not at every render - a pointer moving over the drawing renders this - for every one of them)
  const changedSince = useMemo(() => new Set(molecules.filter((m) => m.drawnFrom && linkOf(m, drawing) === "changed").map((m) => m.id)), [molecules, drawing]);
  const [receding, setReceding] = useState<{ m: Molecule3D; turn: Turn3D | undefined; frame: number; start: number }[]>([]);
  const arriving = useRef(new Map<number, number>());
  const showingBefore = useRef<{ shown: Map<number, number>; turns: typeof turns; frames: typeof frames } | null>(null);
  useEffect(() => {
    const shown = new Map<number, number>();
    for (const m of molecules) if (m.stack && !m.stack.spread && !hiddenStacked.has(m.id)) shown.set(m.stack.id, m.id);
    const was = showingBefore.current;
    showingBefore.current = { shown, turns, frames };
    if (!was) return;
    const now = performance.now();
    const going: typeof receding = [];
    for (const [stack, id] of shown) {
      const before = was.shown.get(stack);
      const m = before != null && before !== id ? molecules.find((x) => x.id === before) : undefined;
      if (!m) continue;
      // (one let go of before it had all come into view goes from as far as it had come)
      const came = arriving.current.get(before!);
      const t = came != null ? Math.min(1, (now - came) / STACK_SWAP_MS) : 1;
      going.push({ m, turn: was.turns[before!], frame: was.frames[before!] ?? 0, start: now - (1 - t) * STACK_SWAP_MS });
      arriving.current.set(id, now);
    }
    // (gone through quickly, a stack draws the last two it let go of as they go, no more)
    const stacks = new Set(going.map((g) => g.m.stack?.id));
    if (going.length)
      setReceding((r) => {
        const last = new Map<number | undefined, (typeof r)[number]>();
        for (const x of r) if (stacks.has(x.m.stack?.id)) last.set(x.m.stack?.id, x);
        return [...r.filter((x) => !stacks.has(x.m.stack?.id) || last.get(x.m.stack?.id) === x), ...going];
      });
    const start = now;
    for (const [id, at] of arriving.current) if (start - at > 1000) arriving.current.delete(id);
  }, [molecules, hiddenStacked, turns, frames]);
  const before = useRef({ molecules, turns, frames });
  useEffect(() => {
    const now = new Set(molecules.map((m) => m.id));
    const was = before.current;
    const gone = was.molecules.filter((m) => !now.has(m.id));
    if (gone.length) {
      // (a copy a value set on a result made, undone: back into the one it came from, as it split off it)
      const c = store.getState().copied3d;
      const back = (m: Molecule3D): Split3D | undefined => {
        const from = c?.undone != null && c.copy === m.id ? molecules.find((k) => k.id === c.from) : undefined;
        if (!from) return undefined;
        const solid = solidOf(from, style);
        return { places: solid.frames[frameOf(solid, frames[from.id] ?? 0)], at: from.at, start: performance.now(), seconds: splitSeconds(from, m), back: true };
      };
      setLeaving((l) => [...l, ...gone.map((m) => ({ m, turn: was.turns[m.id], frame: was.frames[m.id] ?? 0, split: back(m) }))]);
      // (and the view, where it went to show the copy, back where it was - if it is still there)
      const v = copyView.current;
      if (v && gone.some((m) => m.id === v.copy) && c?.undone != null) {
        const cam = camera as THREE.OrthographicCamera;
        const goal = viewBack(v.before, v.went, { zoom: cam.zoom, x: cam.position.x, y: cam.position.y });
        if (goal) setViewGoal(cam, goal);
        copyView.current = null;
      }
    }
    before.current = { molecules, turns, frames };
  }, [molecules, turns, frames, store, style, camera]);
  // A copy a value set on a result made - or its redo: it splits off the
  // one it was made from, over it at first, out to its own place, as its
  // value goes over to the new one; the view glides as far as shows it, as
  // it goes; and once there, it is lit a moment, as anything just put down.
  const splitFor = useRef<number | null>(null);
  useEffect(() => {
    if (!copied || copied.undone != null || splitFor.current === copied.at) return;
    splitFor.current = copied.at;
    const st = store.getState();
    const from = st.molecules3d.find((k) => k.id === copied.from);
    const copy = st.molecules3d.find((k) => k.id === copied.copy);
    if (!from || !copy) return;
    const solid = solidOf(from, style);
    const seconds = splitSeconds(from, copy);
    setSplits((x) => ({ ...x, [copy.id]: { places: solid.frames[frameOf(solid, st.frames3d[from.id] ?? 0)], at: from.at, start: performance.now(), seconds } }));
    const cam = camera as THREE.OrthographicCamera;
    const r = dom.getBoundingClientRect();
    const boxOf = (k: Molecule3D) => seenBounds(poseOf(k, solidOf(k, style), lookOf(k), st.turns3d[k.id] ?? st.turns3d[from.id], st.frames3d[k.id]), eyeOf(camera));
    const before = { zoom: cam.zoom, x: cam.position.x, y: cam.position.y };
    const goal = viewShowingCopy(before, { width: r.width, height: r.height, cover: st.cover }, boxOf(from), boxOf(copy));
    if (goal) {
      setViewGoal(cam, goal);
      copyView.current = { copy: copy.id, before, went: goal };
    } else copyView.current = null;
    invalidate();
    const lit = window.setTimeout(() => setFreshCopy(copy.id), seconds * 1000);
    const unlit = window.setTimeout(() => setFreshCopy((f) => (f === copy.id ? null : f)), seconds * 1000 + SPLIT_LIT_MS);
    return () => {
      window.clearTimeout(lit);
      window.clearTimeout(unlit);
    };
  }, [copied, store, style, camera, dom, invalidate]);
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
      // (of a stack, only the one it shows: utils/stacks)
      const hidden = hiddenInStacks(st.molecules3d, st.stacksShown);
      for (let i = st.molecules3d.length - 1; i >= 0; i--) {
        const m = st.molecules3d[i];
        if (hidden.has(m.id)) continue;
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
        const d = g.guide.step(p.x - g.from.x, p.y - g.from.y, e);
        const dx = d.x;
        const dy = d.y;
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
      // (the arrows, "+" signs and words among the atoms taken, and those selected for themselves)
      const among = selectionScheme(st, takenAtoms);
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
        guide: guideMove(store, (cx, cy) => {
          const q = pageAt(((cx - r.left) / r.width) * 2 - 1, -(((cy - r.top) / r.height) * 2 - 1), camera);
          return { x: q.x, y: q.y };
        }, { x: g.sx, y: g.sy }),
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
          spins.current.delete(m.id);
          try {
            dom.setPointerCapture(e.pointerId);
          } catch {}
          const start = valueOf(placesOf(m, frame), x.atoms);
          scrub.current = { ...label, pointerId: e.pointerId, sx: e.clientX, start, kind: kindOf(x.atoms), key: `set-measure-${label.id}-${x.id}-${e.timeStamp}`, moved: false };
          // (a press held: the store sees it, and undo lets it be - store/gesture)
          st.beginPanHold(e.pointerId);
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
      // (turning on after it was let go, it is caught: what the press is on stays under the pointer)
      spins.current.delete(m.id);
      try {
        dom.setPointerCapture(e.pointerId);
      } catch {}
      const p = pageOf(e);
      const pose = poseNow(m);
      const atom = atomAt(pose, eyeOf(camera), p.x, p.y);
      const look = lookOf(m);
      const bond = atom == null && style[look].atoms !== "space" ? bondAt(m, pose, eyeOf(camera), p.x, p.y, style[look].bondRadius) : null;
      const press: Press = { id: m.id, group: [m.id], pointerId: e.pointerId, sx: e.clientX, sy: e.clientY, atom, bond, add: addsToSelection(e), moved: false };
      // held still, it selects the molecule - spreading out from the atom pressed on
      const selected = st.sel3d.has(m.id);
      const timer = selected
        ? null
        : window.setTimeout(() => {
            const g = gesture.current;
            // (nor where the view has moved under the press: viewGoal)
            if (g?.kind !== "press" || g.moved || pressMovedUnder(camera)) return;
            g.held = true;
            g.timer = null;
            setHold(null);
            store.getState().selectMolecules3d([g.id], g.add);
          }, longPressMs());
      if (!selected) {
        const from = atom ?? (bond != null ? m.bonds[bond].a1 : nearestAtom(pose, eyeOf(camera), p.x, p.y));
        setHold({ id: m.id, from, start: performance.now() });
      }
      gesture.current = { ...press, kind: "press", held: false, timer };
      st.beginPanHold(e.pointerId);
    };

    const onUp = (e: PointerEvent) => {
      const s = scrub.current;
      if (s && e.pointerId === s.pointerId) {
        e.stopPropagation();
        try {
          dom.releasePointerCapture(e.pointerId);
        } catch {}
        scrub.current = null;
        store.getState().endPanHold(e.pointerId);
        setScrubbing(null);
        swallowClick();
        // (the moves went to the value set: what is under the pointer is found once it is let go)
        movedUnderPointer(camera);
        invalidate();
        return;
      }
      const g = gesture.current;
      if (!g || e.pointerId !== g.pointerId) return;
      e.stopPropagation();
      try {
        dom.releasePointerCapture(e.pointerId);
      } catch {}
      gesture.current = null;
      store.getState().endPanHold(e.pointerId);
      if (g.kind === "move") g.guide.end();
      setActive(null);
      setHold(null);
      const st = store.getState();
      if (g.kind === "press") {
        if (g.timer != null) window.clearTimeout(g.timer);
        // a click: the molecule taken into the selection or out, or an atom or a bond chosen
        // (not where the view has moved under the press: what it was on is no longer under it)
        if (!g.held && !pressMovedUnder(camera)) {
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
      // (the moves went to the gesture: which atom is under the pointer is found once it is let go)
      movedUnderPointer(camera);
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
      // (a press held as the listening goes: let be)
      const held = scrub.current?.pointerId ?? gesture.current?.pointerId;
      if (held != null) store.getState().endPanHold(held);
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
  // (a site of a molecule being protonated, its row on the card pointed at: its atoms lit - chem/protonate)
  const protonationMark = useProtonationMark((x) => x.marked);
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

  // any press - on the page, in a talk, anywhere - or Escape stops the molecules turning once, gently (utils/turnOnce)
  useEffect(() => {
    const stop = () => {
      if (!turningOnce(store)) return;
      stopTurnsOnce(store);
      invalidate();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") stop();
    };
    window.addEventListener("pointerdown", stop, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", stop, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [store, invalidate]);

  // a molecule let go while turning turns on, slowing to a stop; one turning once round, round (utils/turnOnce)
  useFrame((_, dt) => {
    if (turningOnce(store)) {
      stepTurnsOnce(store, performance.now(), new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion));
      movedUnderPointer(camera);
      invalidate();
    }
    if (!spins.current.size) return;
    for (const [id, s] of spins.current) {
      const was = store.getState().turns3d[id];
      const q = was ? new THREE.Quaternion(...was) : new THREE.Quaternion();
      q.premultiply(new THREE.Quaternion().setFromAxisAngle(s.axis, s.speed * dt)).normalize();
      store.getState().setTurn3d(id, [q.x, q.y, q.z, q.w] as Turn3D);
      s.speed *= Math.pow(1 - style.turnDamping, dt * 60);
      if (s.speed < STILL) spins.current.delete(id);
    }
    // (turning on under a pointer resting on it: the atom under it changes)
    movedUnderPointer(camera);
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

  if (!molecules.length && !leaving.length && !receding.length) return null;
  const litOf = (id: number): number => {
    if (active) return active.group.includes(id) ? (active.kind === "move" ? 2 : 1) : 0;
    return hovered?.id === id || freshCopy === id ? 1 : 0;
  };
  return (
    <group>
      <ambientLight intensity={style.ambientLight} />
      <KeyLight3D
        intensity={style.keyLight}
        shadows={style.shadows}
        large={style.largeDrawings}
        screen={style.primary.occlusionBy === "screen" || style.secondary.occlusionBy === "screen"}
      />
      <ScreenShade3D />
      {molecules.map((m) => {
        if (hiddenStacked.has(m.id)) return null;
        const inStack = placeInStack(molecules, m);
        const arrived = arriving.current.get(m.id);
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
        // (a surface's grid, where its reader works one out: about the atoms of the row's frame, laid as Meno lays one)
        const place = () => gridAbout(row?.frame ? (m.frames?.[row.frame - 1] ?? []) : m.atoms.flatMap((a) => [a.x, a.y, a.z]));
        const surface = list && row?.surface ? held(m.calc, list, row.surface, asks, wantAsked.current, readGrid, place) : undefined;
        // (and what colours it, where another grid does)
        const colourBy = list && row?.colour ? held(m.calc, list, row.colour.by, asks, wantAsked.current, readGrid, place) : undefined;
        const asking = [motion, surface, colourBy].find((h) => h?.state && h.state !== "given")?.state;
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
            inSet={inSets.has(m.id)}
            setFoot={setFeet.get(m.id)?.foot}
            onFrame={(f) => store.getState().setFrame3d(m.id, f)}
            // (from its mark: it, and those selected with it - each about its own place)
            onMagnify={(k, gesture) => {
              const { sel3d } = store.getState();
              store.getState().setMagnified3d(sel3d.has(m.id) ? [...sel3d] : [m.id], k, gesture);
            }}
            hoveredMeasure={hoveredMeasure?.id === m.id ? hoveredMeasure.measure : null}
            rising={rising[m.id]}
            split={splits[m.id]}
            onRisen={() => store.getState().risen3d(m.id)}
            stereoShown={stereoShownOf(m)}
            atomNumbers={m.atomNumbers ?? null}
            stereoFont={stereoFont}
            overlay={!!overlay[m.id]}
            linkedAtom={hoveredDrawn != null && m.drawnFrom ? (m.drawnFrom.indexOf(hoveredDrawn) >= 0 ? m.drawnFrom.indexOf(hoveredDrawn) : null) : null}
            onHoverAtom={(atom) => store.getState().setHoveredAtom3d(m.id, atom)}
            onRemake={remake && changedSince.has(m.id) ? () => remake(m.id) : undefined}
            motion={motion?.value ?? null}
            surface={surface?.value ?? null}
            surfaceIso={open?.iso}
            surfaceColour={colourBy?.value && row?.colour ? { grid: colourBy.value, from: row.colour.from, to: row.colour.to } : null}
            marked={settingMoves?.id === m.id ? settingMoves.atoms : protonationMark?.id === m.id ? protonationMark.atoms : (pointed?.atoms ?? row?.atoms ?? NONE)}
            editingMeasure={measureEdit?.id === m.id ? measureEdit.measure : null}
            onSetMeasure={(measure, value) => {
              const st = store.getState();
              st.editMeasure3d(null);
              st.setMeasure3d(m.id, measure, value);
            }}
            onEditDone={() => store.getState().editMeasure3d(null)}
            stacked={!!inStack}
            swap={arrived != null && performance.now() - arrived < 1000 ? { dir: "in", start: arrived } : undefined}
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
                  iso={surface?.value ? (open.iso ?? isoOf(surface.value)) : undefined}
                  isoStart={surface?.value ? isoOf(surface.value) : undefined}
                  onIso={(iso) => store.getState().setIso3d(m.id, iso)}
                  scale={colourBy?.value && row?.colour ? { from: row.colour.from, to: row.colour.to, ...(row.colour.label ? { label: row.colour.label } : {}) } : undefined}
                  onClose={() => store.getState().closeList3d(m.id)}
                  onRoom={(bottom) => makeRoom(m, bottom)}
                  area={dom}
                />
              ) : undefined
            }
          />
        );
      })}
      {/* each stack's chip, below the one it shows: the stack's, kept as its molecules go over one to the next */}
      {molecules.map((m) => {
        const inStack = !hiddenStacked.has(m.id) ? placeInStack(molecules, m) : null;
        if (!inStack || !m.stack) return null;
        const stack = m.stack.id;
        return (
          <StackChip3D
            key={`stack-${stack}`}
            shown={m}
            turn={turns[m.id]}
            frame={frames[m.id] ?? 0}
            style={style}
            index={inStack.index}
            count={inStack.count}
            open={hovered?.id === m.id || sel3d.has(m.id)}
            onShow={(k) => store.getState().showInStack(stack, inStack.members[k])}
          />
        );
      })}
      {receding.map(({ m, turn, frame, start }) => (
        <Molecule3DView
          key={`receding-${m.id}-${start}`}
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
          stereoShown={null}
          stereoFont={stereoFont}
          swap={{ dir: "out", start }}
          onSwapped={() => setReceding((r) => r.filter((x) => x.start !== start || x.m !== m))}
        />
      ))}
      {leaving.map(({ m, turn, frame, split }) => (
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
          split={split}
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
  /** The grid its values are laid on, where it is a surface's (./grids `gridAbout`). */
  grid?: () => GridPlace,
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
  if (state === undefined) toAsk.push(() => void askFor(calc, list.from, v.ask, undefined, undefined, grid?.()).catch(() => {}));
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

/** How long a copy takes to split off `from` and go to its place (or back): longer the further, never faster than SPLIT_SPEED bond lengths a second, within SPLIT_LEAST and SPLIT_MOST seconds. */
function splitSeconds(from: Molecule3D, copy: Molecule3D): number {
  const far = Math.hypot(copy.at.x - from.at.x, copy.at.y - from.at.y) / NOMINAL_BOND_LENGTH;
  return Math.min(SPLIT_MOST, Math.max(SPLIT_LEAST, far / SPLIT_SPEED));
}
