import * as THREE from "three";
import { Fragment, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import PageHtml from "./PageHtml";
import { useEditor, useEditorStore } from "../store";
import type { EditorState, StepRunKept, WireEnd, WireTo, WorkflowSet, WorkflowStep } from "../store/types";
import { pageAt } from "../utils/page";
import { COLORS } from "../../../theme/colors";
import { MOV_PX } from "../constants";
import { useStyle3D } from "../style3d";
import SetFrame, { type Edge } from "../workflow/SetFrame";
import StepCard, { Port, shareOf, type PortLook, type RunRow, type RunView } from "../workflow/StepCard";
import { clickedOpen, type CardClick } from "../workflow/cardOpen";
import { positionMarks } from "../workflow/substituents";
import { countOf, countSaid, numberedOn, recordHow, recordNumber, recordWhy, type Frame } from "../workflow/entries";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { lookEvery } from "../workflow/lookEvery";
import { labelReach, selectionFrame, selectionInSet } from "../workflow/selectionSet";
import { useDrawnLayout } from "./drawnLayoutContext";
import { useShownFrames } from "./useShownFrames";
import { useMemberMarks } from "./useMemberMarks";
import { reachOverFrames } from "../utils/molecule3d";
import { wordsReadAt, zoomWritten } from "../utils/pageScale";
import { usePresence } from "../../../theme/presence";
import { DURATION, EASE, eased } from "../../../theme/motion";
import { canWire, entryOnPage, givesOf, stateOf, stepsRun, wireInto, wireRefusal } from "../workflow/flow";
import { addHow } from "../workflow/addStep";
import { droppedBy, namesOf } from "../workflow/earlierRuns";
import { howOf, inputsOf, kindInfo, optionsOf } from "../workflow/kinds";
import { useReaders } from "../../../../lib/calc/workers";
import { useAppSettings } from "../../../../lib/settings/appSettings";
import { finished } from "../../../../lib/jobs";
import { CARD_H, CARD_W, framesHash, HTML_DISTANCE, inputLead, nearWire, onLayer, PORTS_Z, portDown, PX, setGives, setTakes, shuttingCard, stepGives, stepTakes as portTakes, underCard, byTurn, FrameBudget, pointsFor, roundedWay, WIRE_LANE, WireEasing, wireLanes, wireRoute, wireKey, type WireRouted } from "../workflow/look";
import { byOf, doerOf, inputsFor, installedFor, kindsOf, notReadyFor, optionsFor, setName, stepOptions } from "../workflow/doers";
import { diagramKept, diagramNeeds, diagramOptions, diagramValues } from "../workflow/diagramOptions";
import { lookFor, useInstalled } from "../../../../lib/plugins/installed";
import { addsToSelection } from "../../../../lib/doc/shortcuts";
import { dragSelection } from "../utils/dragSelection";

type Pt = { x: number; y: number };

/** The least a set is sized to, each way. */
const LEAST = 48 * PX;

/**
 * A wire's colours, from Meno's palette (docs/WORKFLOWS.md, *How it looks*):
 * its grey; the accent while it is drawn; the attention colour into a step
 * that failed; and, under the pointer, the canvas's own hover blue.
 */
const WIRE = "rgb(89, 99, 110)";
const ACCENT = "rgb(49, 118, 137)";
const ATTENTION = "rgb(205, 69, 96)";
/** A wire's width on the screen, in px, at any zoom; and the band round it the pointer takes. */
const WIRE_PX = 1.25;
const WIRE_HIT_PX = 10;
/** The wire into a running step, dashed - its dashes and gaps, in px on the screen - and how fast they move along it, in px a second: slowly. */
const DASH_PX = 6;
const GAP_PX = 4;
const DASH_SPEED = 12;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Where a step's input `port` takes - its first, where it has no such input (look `stepTakes`). */
const stepTakes = (s: Pick<WorkflowStep, "x" | "y" | "kind">, port?: string): Pt => portTakes(s, Math.max(0, inputsOf(s.kind).findIndex((p) => p.id === port)));

/** What a wire leaves and comes into - a set's frame, a step's card - and the page's other sets and cards, for it to go round (look `wireCurve`). */
type Ends = { from?: Frame; to?: Frame; lead?: number; around?: readonly Frame[]; aroundKey?: number };
/** How far a wire's point may move at once, in screen pixels, and be drawn there straight away: further, it is eased there (`useEasedPoints`). */
const WIRE_JUMP_PX = 4;

/**
 * A wire's points as drawn: where `target` says - and where its shape
 * changed by more than a few pixels at once (it went round something else
 * now, or its ends came to be one above the other), eased there from where
 * it was over `DURATION.move` with `EASE`, so that a wire never jumps
 * (theme/motion). Its ends are where `target`'s are, always - only the rest
 * is eased (look `WireEasing`). Worked out as it is drawn, from the target
 * of this drawing, not set for the next: so that a wire dragged by its
 * card never comes away from its port, however slow the machine - an
 * update set aside for later can wait behind a drag's, all the drag long.
 */
function useEasedPoints(target: readonly Pt[], zoom: number): readonly Pt[] {
  const easing = useRef<WireEasing | null>(null);
  easing.current ??= new WireEasing(DURATION.move * 1000, (u) => eased(EASE, u));
  const [, tick] = useState(0);
  const { invalidate } = useThree();
  const pts = easing.current.at(target, WIRE_JUMP_PX / zoom, performance.now());
  useFrame(() => {
    if (!easing.current?.going) return;
    tick((n) => n + 1);
    invalidate();
  });
  return pts;
}

/**
 * The time a frame gives to working wires out: half of one at 60 frames a
 * second (16.7 ms), the other half left for drawing them.
 */
const WIRES_BUDGET = new FrameBudget(8);

/** A wire to draw: from `p` to `q`, with what it leaves and comes into, and what is near it (`Ends`), by its `key`. */
type WireItem = { key: string; p: Pt; q: Pt; ends?: Ends };
/** A wire's way as last worked out: from its key, its ends then, and its way (look `wireRoute`). */
type Routed = { key: string; p: Pt; q: Pt; route: WireRouted };

/**
 * The page's wires' points, by key, as drawn at `zoom`. Each wire's way
 * (look `wireRoute`) is worked out again where its key changed (look
 * `wireKey`): at once where its ends moved - a wire is never drawn off its
 * ports - but where only what is near it moved, while this frame has time
 * for it and none waits before it (`WIRES_BUDGET`), else when its turn
 * comes, the longest waiting first: so that a card dragged among many
 * wires keeps up with the pointer, those it is not wired to following some
 * frames behind. Then the wires going round are moved apart where they
 * would run on one another, each into a lane of its own (look `wireLanes`)
 * - half a bond clear of `frames`, the page's sets and cards - and each
 * drawn through as many points as make it smooth at `zoom` (look
 * `pointsFor`, `byTurn`). A wire whose way, or lane, moved is eased there
 * by its drawing (`useEasedPoints`). Those of `keep` no longer given are
 * kept as they were, for a wire going to fade where it was.
 */
function useWirePoints(items: readonly WireItem[], frames: readonly Frame[], zoom: number, keep: readonly string[], moving: boolean): Map<string, Pt[]> {
  const at = zoomStep(zoom);
  const routed = useRef(new Map<string, Routed>());
  const drawn = useRef(new Map<string, { of: string; pts: Pt[] }>());
  const latest = useRef(new Map<string, WireItem>());
  latest.current = new Map(items.map((it) => [it.key, it]));
  // (who each wire is, in the line of those waiting)
  const who = useRef(new Map<string, object>());
  const whoOf = (key: string) => who.current.get(key) ?? who.current.set(key, {}).get(key)!;
  const [, redraw] = useState(0);
  const { invalidate } = useThree();
  // (let go: every wire worked out anew, its way kept while dragged forgotten - those whose ends did not move as their turn comes; and
  //  dragged or not as it is now, for one served late)
  const dragged = useRef(false);
  if (dragged.current && !moving) for (const r of routed.current.values()) r.key = "";
  dragged.current = moving;
  const keyOf = (it: WireItem) => wireKey(it.p, it.q, it.ends, it.ends?.aroundKey ?? 0);
  const work = (it: WireItem) => {
    const t = performance.now();
    // (the way it went before, kept while it still can - so that a card dragged past something makes its wires flip neither way, look
    //  `wireRoute` - but only while it is dragged: let go, or undone, worked out anew)
    const was = dragged.current ? routed.current.get(it.key)?.route.way : undefined;
    const route = wireRoute(it.p, it.q, it.ends && { from: it.ends.from, to: it.ends.to, lead: it.ends.lead }, it.ends?.around ?? [], was);
    routed.current.set(it.key, { key: keyOf(it), p: it.p, q: it.q, route });
    WIRES_BUDGET.spend(performance.now() - t);
  };
  for (const it of items) {
    const d = routed.current.get(it.key);
    const key = keyOf(it);
    if (d && d.key === key) continue;
    if (!d || d.p.x !== it.p.x || d.p.y !== it.p.y || d.q.x !== it.q.x || d.q.y !== it.q.y || (WIRES_BUDGET.waiting === 0 && WIRES_BUDGET.left())) {
      work(it);
      WIRES_BUDGET.leave(whoOf(it.key));
    } else {
      WIRES_BUDGET.wait(whoOf(it.key), () => {
        const now = latest.current.get(it.key);
        if (!now || routed.current.get(it.key)?.key === keyOf(now)) return;
        work(now);
        redraw((n) => n + 1);
      });
      invalidate();
    }
  }
  // (those gone, and not fading: forgotten, and no longer waiting)
  const kept = new Set([...latest.current.keys(), ...keep]);
  for (const key of [...routed.current.keys()])
    if (!kept.has(key)) {
      routed.current.delete(key);
      drawn.current.delete(key);
      const me = who.current.get(key);
      if (me) WIRES_BUDGET.leave(me);
      who.current.delete(key);
    }
  useEffect(() => () => who.current.forEach((me) => WIRES_BUDGET.leave(me)), []);
  useFrame((state) => {
    WIRES_BUDGET.frame(state.clock.elapsedTime);
    if (!WIRES_BUDGET.waiting) return;
    WIRES_BUDGET.serve();
    invalidate();
  });
  // (those going round, into lanes: each wire's corners as moved - worked out again only where a way, or a frame, changed)
  type Laned = { corners: Pt[]; way: Pt[]; p: Pt; q: Pt; key: string };
  const lanes = useRef<{ of: string; laned: Map<string, Laned> } | null>(null);
  // (while a card or a set is dragged, the wires not on it keep the lanes they had - moved aside from their way as far as they were, where
  //  it goes the same way - and only those it moves, or makes go another way, put in lanes among them; all put in lanes anew once it is let go.
  //  As far aside as they were when it began, where they are as they were then: a lane taken in for a frame, to keep a frame's room, is
  //  not taken in for good - it is as wide again once the card has passed)
  const held = moving ? lanes.current?.laned : undefined;
  const began = useRef<Map<string, Laned> | null>(null);
  if (!moving) began.current = null;
  else if (!began.current) began.current = new Map(lanes.current?.laned ?? []);
  const round = [...routed.current.entries()].filter(([, r]) => r.route.corners);
  const holds = round.map(([key, r]) => {
    const h = held?.get(key);
    const c = r.route.corners!;
    const same = (l: Laned | undefined): l is Laned => !!l && l.p.x === r.p.x && l.p.y === r.p.y && l.q.x === r.q.x && l.q.y === r.q.y && l.way.length === c.length;
    if (!same(h)) return null;
    // (going the same way still - none of its corners further than a lane from where it was: else it goes another way, and is put in a lane anew)
    if (c.some((pt, i) => Math.hypot(pt.x - h.way[i].x, pt.y - h.way[i].y) >= WIRE_LANE)) return null;
    const b = began.current?.get(key);
    const from = same(b) ? b : h;
    return c.map((pt, i) => ({ x: pt.x + from.corners[i].x - from.way[i].x, y: pt.y + from.corners[i].y - from.way[i].y }));
  });
  const lanesOf = `${round.map(([key, r], i) => `${key}:${r.key}${holds[i] ? `*${holds[i]!.map((c) => `${c.x},${c.y}`).join(";")}` : ""}`).join("|")}#${framesHash(frames)}`;
  if (lanes.current?.of !== lanesOf) {
    const put = wireLanes(
      round.map(([, r]) => r.route.corners!),
      frames,
      holds,
    );
    lanes.current = { of: lanesOf, laned: new Map(round.map(([key, r], i) => [key, { corners: put[i], way: r.route.corners!, p: r.p, q: r.q, key: r.key }])) };
  }
  const laned = new Map([...lanes.current.laned].map(([key, l]) => [key, l.corners]));
  const out = new Map<string, Pt[]>();
  for (const [key, r] of routed.current) {
    const corners = laned.get(key);
    // (drawn again only where its way, or lane, or the zoom it is drawn at, changed)
    const of = `${r.key}|${at}|${corners ? corners.map((c) => `${c.x},${c.y}`).join(";") : ""}`;
    const had = drawn.current.get(key);
    if (had && had.of === of) {
      out.set(key, had.pts);
      continue;
    }
    const path = corners ? roundedWay(corners) : r.route.pts;
    const pts = byTurn(path, pointsFor(path, at));
    drawn.current.set(key, { of, pts });
    out.set(key, pts);
  }
  return out;
}

/** A zoom as the points a wire is drawn through are worked out at: by quarter steps of doubling, so that a wire is not worked out again for every frame of a zoom. */
const zoomStep = (zoom: number) => 2 ** (Math.round(Math.log2(zoom) * 4) / 4);

/** A wire through `pts` as a ribbon `width` wide. */
function ribbon(pts: readonly Pt[], width: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const index: number[] = [];
  // (how far along it each point is, for a dash)
  const along: number[] = [];
  let run = 0;
  pts.forEach((pt, i) => {
    if (i > 0) run += Math.hypot(pt.x - pts[i - 1].x, pt.y - pts[i - 1].y);
    along.push(run, run);
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const nx = (-(b.y - a.y) / len) * (width / 2);
    const ny = ((b.x - a.x) / len) * (width / 2);
    positions.push(pt.x + nx, pt.y + ny, 0, pt.x - nx, pt.y - ny, 0);
    if (i < pts.length - 1) index.push(2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("along", new THREE.Float32BufferAttribute(along, 1));
  g.setIndex(index);
  return g;
}

const DASH_VERTEX = `
attribute float along;
varying float vAlong;
void main() {
  vAlong = along;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const DASH_FRAGMENT = `
uniform vec3 color;
uniform float offset;
uniform float dash;
uniform float gap;
varying float vAlong;
void main() {
  if (mod(vAlong - offset, dash + gap) > dash) discard;
  gl_FragColor = vec4(color, 1.0);
}`;

/** The wire into a running step: dashed, its dashes moving slowly towards the step - a frame drawn for each step they move. */
function MovingWire({ target, color, zoom }: { target: Pt[]; color: string; zoom: number }) {
  const pts = useEasedPoints(target, zoom);
  const line = useMemo(() => ribbon(pts, WIRE_PX / zoom), [pts, zoom]);
  useEffect(() => () => line.dispose(), [line]);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { color: { value: new THREE.Color(color) }, offset: { value: 0 }, dash: { value: 1 }, gap: { value: 1 } },
        vertexShader: DASH_VERTEX,
        fragmentShader: DASH_FRAGMENT,
        depthTest: false,
        depthWrite: false,
      }),
    [color],
  );
  useEffect(() => () => material.dispose(), [material]);
  const { invalidate } = useThree();
  useFrame((_, dt) => {
    const u = material.uniforms;
    u.dash.value = DASH_PX / zoom;
    u.gap.value = GAP_PX / zoom;
    u.offset.value = (u.offset.value + (Math.min(dt, 0.1) * DASH_SPEED) / zoom) % ((DASH_PX + GAP_PX) / zoom);
    invalidate();
  });
  return (
    <group position={[0, 0, 0.012]}>
      <mesh geometry={line} material={material} renderOrder={4} />
    </group>
  );
}

/**
 * How much of a wire is seen: none as it is put down, all a moment later -
 * and back to none as it goes (`leaving`) - in a short ease, so that a wire
 * neither appears nor vanishes at once (theme/motion).
 */
function useFade(material: React.RefObject<THREE.Material | null>, leaving: boolean) {
  const from = useRef({ at: performance.now(), opacity: 0 });
  const was = useRef(leaving);
  const { invalidate } = useThree();
  if (was.current !== leaving) {
    was.current = leaving;
    from.current = { at: performance.now(), opacity: material.current?.opacity ?? 1 };
  }
  useFrame(() => {
    const m = material.current;
    if (!m) return;
    const goal = leaving ? 0 : 1;
    const t = Math.min(1, (performance.now() - from.current.at) / (DURATION.quick * 1000));
    const opacity = from.current.opacity + (goal - from.current.opacity) * t;
    if (opacity === m.opacity) return;
    m.opacity = opacity;
    invalidate();
  });
}

/** A wire drawn from `p` to `q`; where it can be pointed at, a wider band round it that the pointer takes. It fades in as it comes, and out as it goes (`leaving`). */
function WireLine({ target, color, zoom, onHover, leaving = false }: { target: Pt[]; color: string; zoom: number; onHover?: (on: boolean) => void; leaving?: boolean }) {
  // (as wide on the screen at any zoom: a hair, as the frames' lines are)
  const pts = useEasedPoints(target, zoom);
  const line = useMemo(() => ribbon(pts, WIRE_PX / zoom), [pts, zoom]);
  const hit = useMemo(() => (onHover && !leaving ? ribbon(pts, WIRE_HIT_PX / zoom) : null), [pts, zoom, !!onHover, leaving]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => line.dispose(), [line]);
  useEffect(() => () => hit?.dispose(), [hit]);
  const material = useRef<THREE.MeshBasicMaterial>(null);
  useFade(material, leaving);
  return (
    <group position={[0, 0, 0.012]}>
      <mesh geometry={line} renderOrder={4}>
        <meshBasicMaterial ref={material} color={color} transparent opacity={0} depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>
      {hit && (
        <mesh
          geometry={hit}
          onPointerOver={(e) => {
            e.stopPropagation();
            onHover!(true);
          }}
          onPointerOut={() => onHover!(false)}
        >
          <meshBasicMaterial transparent opacity={0} depthTest={false} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

/** How many of an earlier run's molecules did not read from its file, of both its exits. */
const notRead = (r: StepRunKept) => (r.results?.unread ?? 0) + (r.results?.restUnread ?? 0);

/** A step's runs as its card lists them: the one shown, then those it keeps, each with how it was set - its kind, where it was another. */
function runRows(s: WorkflowStep): RunRow[] {
  const by = byOf(s);
  const how = (kind: WorkflowStep["kind"], options: WorkflowStep["options"]) =>
    [kind !== s.kind ? kindInfo(kind).name : "", howOf(optionsFor(kind, by), options, by === "meno" ? kindInfo(kind).how : undefined)].filter(Boolean).join(" \u00b7 ");
  // (each named by when it was, to the second where two were in one minute)
  const names = namesOf([...(s.ran ? [s.ran.at] : []), ...(s.runs ?? []).map((r) => r.at)]);
  const first = s.ran ? 1 : 0;
  return [
    ...(s.ran ? [{ at: s.ran.at, name: names[0], said: s.ran.said, how: how(s.ran.kind ?? s.kind, s.ran.options ?? s.options), shown: true, keep: !!s.ran.keep }] : []),
    // (an earlier run's molecules that did not read from its file: said with what it said)
    ...(s.runs ?? []).map((r, i) => ({ at: r.at, name: names[first + i], said: notRead(r) ? `${r.said} · ${notRead(r).toLocaleString("en-US")} not read` : r.said, how: how(r.kind, r.options), shown: false, keep: !!r.keep })),
  ];
}

/**
 * A workflow on the page (docs/WORKFLOWS.md): its sets, its steps and the
 * wires between them, drawn at the page's scale - and the port on the
 * selection's right edge that makes it an input, while it holds whole
 * structures or molecules in 3D. Sets and steps are HTML laid on the
 * page, wires the canvas's own; what is dragged, drawn or pointed at is
 * worked here, and what changes the page is an edit to the document.
 */
export default function Workflow2D() {
  const store = useEditorStore();
  const sets = useEditor((s) => s.sets);
  const steps = useEditor((s) => s.steps);
  const wires = useEditor((s) => s.wires);
  const model = useEditor((s) => s.model);
  const molecules3d = useEditor((s) => s.molecules3d);
  const pictures = useEditor((s) => s.pictures);
  const hoveredSet = useEditor((s) => s.hoveredSet);
  const chosenSet = useEditor((s) => s.chosenSet);
  const hoveredWire = useEditor((s) => s.hoveredWire);
  const openStep = useEditor((s) => s.openStep);
  const choosingAtoms = useEditor((s) => s.choosingAtoms);
  // (the step last clicked, when, and whether it was open then: a double-click on it, open, shuts it - workflow/cardOpen)
  const clicked = useRef<CardClick | null>(null);

  // (the card just shut kept over the others while it shrinks back)
  const [shutting, setShutting] = useState<number | null>(null);
  const toldOpen = useRef<((open: number | null) => void) | null>(null);
  useEffect(() => {
    toldOpen.current ??= shuttingCard(setShutting, DURATION.base * 1000);
    toldOpen.current(openStep);
  }, [openStep]);
  const wireDrag = useEditor((s) => s.wireDrag);
  const docStyle = useEditor((s) => s.docStyle);
  const wireRefused = useEditor((s) => s.wireRefused);
  const sel = useEditor((s) => s.sel);
  const sel3d = useEditor((s) => s.sel3d);
  const turns3d = useEditor((s) => s.turns3d);
  const frames3d = useEditor((s) => s.frames3d);
  const jobsSeen = useEditor((s) => s.jobsSeen);
  const menoWorking = useEditor((s) => s.menoWorking);
  const selFlow = useEditor((s) => s.selFlow);
  const style3d = useStyle3D();
  const { camera, gl, invalidate } = useThree();
  // the workspace's styles in 3D - as it opens, and as they or Settings' change: the
  // result sets its molecules no longer fit laid out again (workflow/run
  // `fitResultSets`), frames and molecules going over to their new places
  useEffect(() => {
    store.getState().fitResultSets();
  }, [store, style3d]);
  // (each set's frame as it is drawn: on its way to where the document has it)
  const shownSets = useShownFrames(sets);
  // (what has just joined a set or left it, marked a moment)
  const memberMarks = useMemberMarks(sets, { model, molecules3d, pictures }, (m) => reachOverFrames(m, style3d, turns3d[m.id]));
  const shownOf = (b: WorkflowSet): Frame => shownSets.get(b.id) ?? b;
  // (each structure a step numbered - Enumerate's - its number under it, how it was made on pointing at it)
  const numbered = useMemo(() => numberedOn({ model }, sets), [model, sets]);
  // (the positions an Enumerate step by substituents has chosen, numbered, while it is selected, open, or being chosen for)
  const positions = useMemo(
    () => positionMarks(model, steps, new Set([...selFlow.steps, ...(openStep != null ? [openStep] : []), ...(choosingAtoms ? [choosingAtoms.step] : [])])),
    [model, steps, selFlow, openStep, choosingAtoms],
  );
  // (who does a kind of step changes as plugins are added and taken away)
  useReaders((r) => r.state);
  // (where the programs installed separately that steps run are: looked for as such steps are put down, opened, changed)
  useInstalled((s) => s.where);
  const programsRun = useEditor((s) =>
    [...new Set(s.steps.flatMap((x) => installedFor(x.kind, byOf(x)).map((d) => `${byOf(x)}:${d.name}`)))].sort().join(" "),
  );
  useEffect(() => {
    for (const key of programsRun.split(" ").filter(Boolean)) {
      const [plugin, name] = key.split(":");
      void lookFor(plugin, name);
    }
  }, [programsRun]);

  // the jobs of the steps that run any, looked at while there are any - and
  // at once, so that a workspace opened with jobs under way picks them up;
  // often while the newest run is young (workflow/lookEvery)
  const anyRunning = useEditor((s) => s.steps.some((x) => x.running));
  const newest = useEditor((s) => s.steps.reduce((t, x) => Math.max(t, x.running?.at ?? 0), 0));
  useEffect(() => {
    if (!anyRunning) return;
    let t: ReturnType<typeof setTimeout>;
    const look = () => {
      void store.getState().lookAtJobs();
      t = setTimeout(look, lookEvery(Date.now() - newest));
    };
    look();
    return () => clearTimeout(t);
  }, [anyRunning, newest, store]);

  // the zoom: where it crosses what a card's words need to be read; what
  // a hair on the screen is on the page's layer of HTML (`--hair`); and, by
  // steps of a few per cent, what the wires are made as wide on the screen for
  const [compact, setCompact] = useState(false);
  const read = useRef(true);
  const [zoom, setZoom] = useState((camera as THREE.OrthographicCamera).zoom || 1);
  // (what a hair was last written as, on which layers, and the zoom the frame before)
  const hair = useRef<{ layer: HTMLDivElement | null; ports: HTMLDivElement | null; zoom: number; before: number }>({ layer: null, ports: null, zoom: NaN, before: NaN });
  const layer = useRef<HTMLDivElement>(null);
  const portsLayer = useRef<HTMLDivElement>(null);
  // the card opened over the rest - or shutting - as tall as it is now, in the page's units: the ports under it are not drawn
  const [cover, setCover] = useState<{ step: number; w: number; h: number } | null>(null);
  const over = openStep ?? shutting;
  useEffect(() => {
    const el = over != null ? layer.current?.querySelector<HTMLElement>(`[data-step-card="${over}"] > *`) : null;
    if (over == null || !el) return setCover(null);
    // (followed as it opens, and as it shuts: it grows and shrinks)
    const measure = () => setCover({ step: over, w: el.offsetWidth * PX, h: el.offsetHeight * PX });
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(el);
    return () => watch.disconnect();
  }, [over]);
  useFrame(() => {
    const z = (camera as THREE.OrthographicCamera).zoom || 1;
    // (its words read, or too small: switched past their threshold - utils/pageScale `wordsReadAt` - and faded over a short time by CSS)
    read.current = wordsReadAt(z, read.current);
    const small = !read.current;
    if (small !== compact) setCompact(small);
    if (Math.abs(Math.log(z / zoom)) > 0.03) setZoom(z);
    // (written again only as utils/pageScale `zoomWritten` says - each write lays out every card again - and to a layer not yet written to)
    const still = z === hair.current.before;
    hair.current.before = z;
    const h = hair.current;
    if (h.layer !== layer.current || h.ports !== portsLayer.current || zoomWritten(h.zoom, z, still)) {
      hair.current = { layer: layer.current, ports: portsLayer.current, zoom: z, before: z };
      layer.current?.style.setProperty("--hair", `${1 / (z * PX)}px`);
      portsLayer.current?.style.setProperty("--hair", `${1 / (z * PX)}px`);
    } else if (h.zoom !== z) invalidate();
    layer.current?.style.setProperty("--words", read.current ? "1" : "0");
    layer.current?.style.setProperty("--stand-in", read.current ? "0" : "1");
  });

  const worldOf = (cx: number, cy: number): Pt => {
    const r = gl.domElement.getBoundingClientRect();
    const p = pageAt(((cx - r.left) / r.width) * 2 - 1, -(((cy - r.top) / r.height) * 2 - 1), camera);
    return { x: p.x, y: p.y };
  };

  // (a card or a set being dragged: the wires not on it kept in their lanes till it is let go - `useWirePoints`)
  const [moving, setMoving] = useState(false);

  /** A press followed: each move past MOV_PX, at its place on the page, and the button coming up - whether it moved; or lost, without a click (`onCancel`). */
  const follow = (e: ReactPointerEvent, move: (p: Pt, ev: PointerEvent) => void, up: (moved: boolean, ev: PointerEvent) => void) => {
    e.stopPropagation();
    const sx = e.clientX;
    const sy = e.clientY;
    let moved = false;
    const onMove = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < MOV_PX) return;
      moved = true;
      move(worldOf(ev.clientX, ev.clientY), ev);
      invalidate();
    };
    const stop = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("pointercancel", onCancel, true);
      window.removeEventListener("blur", onCancel);
      window.removeEventListener("keydown", onKey, true);
    };
    const onUp = (ev: PointerEvent) => {
      stop();
      up(moved, ev);
      invalidate();
    };
    // (the press lost without being let go - a gesture of the trackpad's or a pen's, or the window left: an end, but no click, and no drop -
    //  what was dragged stays where it was last moved; a wire being drawn let go, as Escape does)
    const onCancel = () => {
      stop();
      setMoving(false);
      if (store.getState().wireDrag) store.getState().setWorkflowView({ wireDrag: null });
      invalidate();
    };
    // (Escape lets a wire being drawn go)
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape" || !store.getState().wireDrag) return;
      ev.preventDefault();
      ev.stopPropagation();
      stop();
      store.getState().setWorkflowView({ wireDrag: null });
      invalidate();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, true);
    window.addEventListener("pointercancel", onCancel, true);
    window.addEventListener("blur", onCancel);
    window.addEventListener("keydown", onKey, true);
  };

  /** What lies under the pointer where a wire is let go: a port that takes or gives, empty space, or something else. */
  const dropTarget = (ev: PointerEvent): { take: WireTo } | { give: WireEnd } | "empty" | null => {
    const el = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null;
    // (a step's input: "step:port")
    const take = el?.closest("[data-take]")?.getAttribute("data-take");
    if (take) {
      const [step, port] = take.split(":");
      return { take: { step: Number(step), port } };
    }
    const giveSet = el?.closest("[data-give-set]")?.getAttribute("data-give-set");
    if (giveSet) return { give: { set: Number(giveSet) } };
    if (el !== gl.domElement) return null;
    const s = store.getState();
    const onSomething =
      s.hovered.atomId != null || s.hovered.bondId != null || s.hovered3d || s.hoveredArrow != null || s.hoveredPlus != null || s.hoveredCaption != null || s.hoveredWire != null;
    return onSomething ? null : "empty";
  };

  /** A wire let go on a step's input: made, where it takes what the wire gives - else not, and the card says why. */
  const wireTo = (from: WireEnd, step: number, port: string) => {
    const st = store.getState();
    const why = wireRefusal(st, from, step, port);
    if (why) st.setWorkflowView({ wireRefused: { step, said: why } });
    else st.connect(from, step, port);
  };

  /** A wire drawn out of a set: into a step's input, or - let go on empty space - Quick Add there, at the steps that take it. */
  const drawFrom = (e: ReactPointerEvent, from: WireEnd) => {
    if (e.button !== 0) return;
    // (pictures - a Render step's - no step takes: no wire is drawn out of them)
    if (givesOf(store.getState(), from) === "pictures") return;
    store.getState().setWorkflowView({ wireDrag: { from, at: worldOf(e.clientX, e.clientY) }, wireRefused: null });
    follow(
      e,
      (at) => store.getState().setWorkflowView({ wireDrag: { from, at } }),
      (moved, ev) => {
        const st = store.getState();
        st.setWorkflowView({ wireDrag: null });
        if (!moved) return;
        const there = dropTarget(ev);
        if (there && there !== "empty" && "take" in there) wireTo(from, there.take.step, there.take.port);
        else if (there === "empty") {
          const r = (gl.domElement.parentElement ?? gl.domElement).getBoundingClientRect();
          st.setQuickAdd({ at: worldOf(ev.clientX, ev.clientY), x: ev.clientX - r.left, y: ev.clientY - r.top, within: { width: r.width, height: r.height }, wire: from });
        }
      },
    );
  };

  /** A press on a step's input: the wire into it picked up - into another, or let go on nothing, deleted - or, with none, one drawn back from it to a set. */
  const drawInto = (e: ReactPointerEvent, step: number, port: string) => {
    if (e.button !== 0) return;
    const st = store.getState();
    const was = st.wires.find((w) => w.to.step === step && w.to.port === port);
    const at = worldOf(e.clientX, e.clientY);
    const drag = (p: Pt) => (was ? { from: was.from, at: p, was: was.id } : { to: { step, port }, at: p });
    st.setWorkflowView({ wireDrag: drag(at), wireRefused: null });
    follow(
      e,
      (p) => store.getState().setWorkflowView({ wireDrag: drag(p) }),
      (moved, ev) => {
        const s = store.getState();
        s.setWorkflowView({ wireDrag: null });
        if (!moved) return;
        const there = dropTarget(ev);
        if (was) {
          if (there && there !== "empty" && "take" in there) {
            const why = wireRefusal(s, was.from, there.take.step, there.take.port);
            if (why) s.setWorkflowView({ wireRefused: { step: there.take.step, said: why } });
            else s.rewire(was.id, there.take.step, there.take.port);
          } else s.removeWire(was.id);
        } else if (there && there !== "empty" && "give" in there) wireTo(there.give, step, port);
      },
    );
  };

  /**
   * A press on a selected set or step, or with Ctrl (⌘ on a Mac): as on an
   * atom - Ctrl or ⌘ and a click takes it into the selection or out of it;
   * a selected one dragged drags the whole selection. Whether it was the
   * selection's; `click` is told of a press on a selected one let go where
   * it was.
   */
  const asSelected = (e: ReactPointerEvent, part: { set: number } | { step: number }, click: () => void): boolean => {
    const st = store.getState();
    if (addsToSelection(e)) {
      e.stopPropagation();
      st.toggleFlowSel(part);
      return true;
    }
    const selected = "set" in part ? st.selFlow.sets.has(part.set) : st.selFlow.steps.has(part.step);
    if (!selected) return false;
    e.stopPropagation();
    dragSelection(store, worldOf, { x: e.clientX, y: e.clientY }, (_ev, moved) => {
      if (!moved) click();
    });
    return true;
  };

  /** A set dragged by its tab, with all it holds; clicked, chosen. */
  const dragSet = (e: ReactPointerEvent, set: WorkflowSet) => {
    if (e.button !== 0) return;
    if (asSelected(e, { set: set.id }, () => store.getState().setWorkflowView({ chosenSet: set.id }))) return;
    let last = worldOf(e.clientX, e.clientY);
    const gesture = `${performance.now()}`;
    follow(
      e,
      (p) => {
        setMoving(true);
        store.getState().moveSet(set.id, p.x - last.x, p.y - last.y, gesture);
        last = p;
      },
      (moved) => {
        setMoving(false);
        if (!moved) store.getState().setWorkflowView({ chosenSet: set.id });
      },
    );
  };

  /** A set sized by an edge or a corner: what it holds is what then lies inside it. */
  const sizeSet = (edge: Edge, e: ReactPointerEvent, set: WorkflowSet) => {
    if (e.button !== 0) return;
    const start = worldOf(e.clientX, e.clientY);
    const was = { x0: set.x0, y0: set.y0, x1: set.x1, y1: set.y1 };
    const gesture = `${performance.now()}`;
    follow(
      e,
      (p) => {
        const dx = p.x - start.x;
        const dy = p.y - start.y;
        const f = { ...was };
        if (edge.includes("e")) f.x1 = Math.max(was.x1 + dx, was.x0 + LEAST);
        if (edge.includes("w")) f.x0 = Math.min(was.x0 + dx, was.x1 - LEAST);
        if (edge.includes("n")) f.y1 = Math.max(was.y1 + dy, was.y0 + LEAST);
        if (edge.includes("s")) f.y0 = Math.min(was.y0 + dy, was.y1 - LEAST);
        store.getState().resizeSet(set.id, f, gesture);
      },
      () => {},
    );
  };

  /** A step dragged by its card; clicked, opened to its options, or shut. */
  const dragStep = (e: ReactPointerEvent, step: WorkflowStep) => {
    if (e.button !== 0) return;
    const open = () => {
      const s = store.getState();
      const now = performance.now();
      const next = clickedOpen(s.openStep, step.id, clicked.current, now);
      clicked.current = { step: step.id, at: now, wasOpen: s.openStep === step.id };
      if (next !== s.openStep) s.setWorkflowView(next == null ? { openStep: null, choosingAtoms: null } : { openStep: next });
    };
    if (asSelected(e, { step: step.id }, open)) return;
    const start = worldOf(e.clientX, e.clientY);
    const gesture = `${performance.now()}`;
    follow(
      e,
      (p) => {
        setMoving(true);
        store.getState().moveStep(step.id, step.x + p.x - start.x, step.y + p.y - start.y, gesture);
      },
      (moved) => {
        setMoving(false);
        if (!moved) open();
      },
    );
  };

  /** A right-click on a set's tab or a step's card: its menu. */
  const menuOf = (kind: "set" | "step", id: number) => (e: ReactMouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    store.getState().setWorkflowView({ workflowMenu: { kind, id, clientX: e.clientX, clientY: e.clientY } });
  };

  // a step open to its options: shut by a double-click on its card, its Close, or Escape - never by itself: not by a press
  // elsewhere, a zoom, the selection, a run starting or ending; the page is worked on while its options are (workflow/cardOpen)
  useEffect(() => {
    if (openStep == null) return;
    const shut = () => store.getState().setWorkflowView({ openStep: null });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      shut();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [openStep, store]);

  // a set chosen: let go by a press anywhere but its tab, or Escape
  useEffect(() => {
    if (chosenSet == null) return;
    const letGo = () => store.getState().setWorkflowView({ chosenSet: null });
    const onPress = (e: PointerEvent) => {
      if (!(e.target as HTMLElement | null)?.closest?.(`[data-set-tab="${chosenSet}"]`)) letGo();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") letGo();
    };
    window.addEventListener("pointerdown", onPress, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", onPress, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [chosenSet, store]);

  // --- what is drawn ---------------------------------------------------------
  const flow = useMemo(() => ({ model, molecules3d, sets, steps, wires, pictures }), [model, molecules3d, sets, steps, wires, pictures]);
  const stepById = useMemo(() => new Map(steps.map((s) => [s.id, s])), [steps]);
  const setById = useMemo(() => new Map(sets.map((b) => [b.id, b])), [sets]);
  const gives = (end: WireEnd): Pt | null => {
    const b = setById.get(end.set);
    return b ? setGives(shownOf(b)) : null;
  };
  // (a step whose options are its role's starts from Settings' choices for it: those changed, its card and state follow)
  const settingsOptions = useAppSettings((s) => s.options);
  // (Meno's Duplicates working in turns: running, as a step with jobs is)
  // (Settings' choices are read where the options are worked out, not passed in: a dependency all the same)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const states = useMemo(() => new Map(steps.map((s) => [s.id, menoWorking[s.id] ? ("running" as const) : stateOf(flow, s, byOf(s))])), [flow, steps, menoWorking, settingsOptions]);
  // how each running step's jobs are getting on, as last looked at
  const runs = useMemo(() => {
    const out = new Map<number, { waiting: boolean; view: RunView }>();
    for (const s of steps) {
      if (!s.running) continue;
      const seen = s.running.jobs.map((j) => jobsSeen[j.id]);
      const places = seen.flatMap((x) => (x?.place ? [x.place] : []));
      const starts = seen.flatMap((x) => (x?.started != null ? [x.started] : []));
      const line = seen.find((x) => x?.state === "running" && x.line)?.line;
      out.set(s.id, {
        waiting: seen.every((x) => !x || x.state === "waiting"),
        view: {
          ...(places.length ? { place: Math.min(...places) } : {}),
          ...(starts.length ? { since: Math.min(...starts) } : {}),
          ended: seen.filter((x) => x && finished(x.state)).length,
          total: s.running.jobs.length,
          ...(line ? { line } : {}),
          ...(shareOf(seen) != null ? { share: shareOf(seen) } : {}),
        },
      });
    }
    // (and Meno's working in turns: how many of its entries it has been through)
    for (const [id, m] of Object.entries(menoWorking)) out.set(Number(id), { waiting: false, view: { since: m.since, ended: m.done, total: m.total } });
    return out;
  }, [steps, jobsSeen, menoWorking]);
  // each set's name and count: what it holds, worked out as the page changes, not as the pointer moves
  const setInfo = useMemo(
    () =>
      new Map(
        sets.map((b) => {
          const count = countOf(flow, b);
          const counted = countSaid(b, count);
          // (a large result set: what it holds, said large in its frame)
          // (structures drawn held, none of them on the page: summed up in its frame too - those it shows are on the page, and it says how many)
          const summary =
            b.collection || (b.drawnCollection && count.entries <= b.drawnCollection.length)
              ? {
                  count: count.entries.toLocaleString("en-US"),
                  nouns:
                    count.holds === "conformers"
                      ? `${count.entries === 1 ? "conformer" : "conformers"} of ${plural(count.compounds, "compound")}`
                      : count.holds === "structures"
                        ? count.entries === 1
                          ? "structure"
                          : "structures"
                        : count.entries === 1
                          ? "molecule"
                          : "molecules",
                  holds: count.holds === "conformers" ? ("conformers" as const) : count.holds === "structures" ? ("structures" as const) : ("molecules" as const),
                  style: docStyle,
                }
              : undefined;
          return [b.id, { name: setName(b, steps), count: `${counted}${b.unread ? ` · ${b.unread.toLocaleString("en-US")} not read` : ""}${b.keep === false && count.entries ? " · not kept" : ""}`, summary }];
        }),
      ),
    [flow, sets, steps, docStyle],
  );

  // while a wire is drawn: the ports that would take it lit, the others faint
  const portLook = (side: "take" | "give", id: WireEnd | WireTo): PortLook => {
    if (!wireDrag) return "plain";
    if (side === "take" && wireDrag.from && "port" in id) return canWire(flow, wireDrag.from, id.step, id.port) ? "lit" : "plain";
    if (side === "give" && wireDrag.to != null && "set" in id) return canWire(flow, id, wireDrag.to.step, wireDrag.to.port) ? "lit" : "plain";
    if (side === "give" && wireDrag.from && "set" in id && id.set === wireDrag.from.set) return "lit";
    return "plain";
  };

  // the selection, where it holds whole structures or molecules in 3D: the frame an input set would take, round its labels as they are drawn -
  // none where any of it lies in a set already: a port there is the set's, shown as the set is
  const drawing = useDrawnLayout();
  const labels = useMemo(() => labelReach(drawing.layout, drawing.atoms, drawing.opts), [drawing.layout, drawing.atoms, drawing.opts]);
  const asSet = useMemo(
    () => (selectionInSet({ model, molecules3d, pictures }, sel.atoms, sel3d, sets) ? null : selectionFrame(model, sel.atoms, molecules3d, sel3d, style3d, turns3d, frames3d, labels)),
    [sel, sel3d, model, molecules3d, pictures, sets, style3d, turns3d, frames3d, labels],
  );

  /** The selection made a set, an input, and a wire drawn out of it. */
  const setFromSelection = (e: ReactPointerEvent) => {
    if (e.button !== 0 || !asSet) return;
    const st = store.getState();
    const id = st.addSet(asSet);
    st.clearSel();
    drawFrom(e, { set: id });
  };

  /** A chart's point pressed: the molecule it is of chosen, at its frame - where it is on the page. */
  const showEntry = (entry: string | undefined) => {
    const st = store.getState();
    const on = entryOnPage(st, entry);
    if (!on) return;
    st.selectMolecules3d([on.molecule]);
    st.setFrame3d(on.molecule, on.frame);
  };

  const hover = (patch: Partial<Pick<EditorState, "hoveredSet" | "hoveredStep" | "hoveredWire">>) => store.getState().setWorkflowView(patch);
  const unhover = (key: "hoveredSet" | "hoveredStep" | "hoveredWire", id: number) => {
    if (store.getState()[key] === id) hover({ [key]: null });
  };

  // a wire being drawn: from its port to the pointer, or from the pointer to the step it is drawn back from
  const drawn = (() => {
    if (!wireDrag) return null;
    if (wireDrag.from) {
      const p = gives(wireDrag.from);
      return p ? { p, q: wireDrag.at } : null;
    }
    const s = wireDrag.to != null ? stepById.get(wireDrag.to.step) : undefined;
    return s && wireDrag.to ? { p: wireDrag.at, q: stepTakes(s, wireDrag.to.port) } : null;
  })();

  // sets and steps, each drawn as it is - and those just gone, as they last were, fading out
  const parts = [
    ...sets.map((b) => {
      const info = setInfo.get(b.id)!;
      const f = shownOf(b);
      return (
        <div key={`b${b.id}`} style={onLayer(f.x0, f.y1)}>
          <SetFrame
            set={{ ...b, ...f }}
            name={info.name}
            count={info.count}
            {...(info.summary ? { summary: info.summary, onOpenTable: () => store.getState().readSetTable(b.id) } : {})}
            hovered={hoveredSet === b.id}
            chosen={chosenSet === b.id || selFlow.sets.has(b.id)}
            compact={compact}
            onTabDown={(e) => dragSet(e, b)}
            onEdgeDown={(edge, e) => sizeSet(edge, e, b)}
            onContextMenu={menuOf("set", b.id)}
            onHover={(on) => (on ? hover({ hoveredSet: b.id }) : unhover("hoveredSet", b.id))}
            {...(!b.made ? { onRename: (name: string) => store.getState().renameSet(b.id, name) } : {})}
            {...(b.chart ? { onEntry: showEntry } : {})}
          />
        </div>
      );
    }),
    ...steps.map((s) => {
      const info = kindInfo(s.kind);
      const doer = doerOf(s);
      // (an Energy diagram's: lists of what comes into its Levels)
      const diagram = s.kind === "energy-diagram";
      const takes = diagram ? diagramOptions(flow, s, stepOptions(s)) : stepOptions(s);
      const own = diagram ? diagramValues(takes, s.options) : s.options;
      // (Add's: its formula, the number wired into its Number with it, where one is)
      const how = s.kind === "add" ? addHow(optionsOf(takes, own), !!wireInto(flow, s.id, "number")) : howOf(takes, own, byOf(s) === "meno" ? info.how : undefined);
      const run = runs.get(s.id);
      return (
        // (its top at its place: the card grows downwards as it opens - over the cards below it)
        <div key={`s${s.id}`} data-step-card={s.id} style={onLayer(s.x, s.y, openStep === s.id || shutting === s.id)}>
          <StepCard
            step={s}
            info={info}
            who={doer?.name ?? "Nothing added"}
            how={how}
            state={run?.waiting ? "waiting" : (states.get(s.id) ?? "ready")}
            run={run?.view}
            missing={notReadyFor(s) ?? (diagram ? diagramNeeds(flow, s) : undefined)}
            {...(wireRefused?.step === s.id ? { refused: wireRefused.said } : {})}
            compact={compact}
            selected={selFlow.steps.has(s.id)}
            open={openStep === s.id}
            onClose={() => store.getState().setWorkflowView({ openStep: null, choosingAtoms: null })}
            inputs={inputsFor(s.kind, byOf(s)).map((p) => ({ id: p.id, name: p.name, look: portLook("take", { step: s.id, port: p.id }) }))}
            optionList={takes}
            options={optionsOf(takes, own)}
            kinds={kindsOf(byOf(s)).map((k) => ({ kind: k, name: kindInfo(k).name }))}
            runs={runRows(s)}
            drops={openStep === s.id ? droppedBy(flow, stepsRun(flow, [s.id])) : undefined}
            onOptions={(values) => store.getState().updateStep(s.id, { options: diagram ? diagramKept(values, optionsOf(takes, own), s.options) : values })}
            choosing={choosingAtoms?.step === s.id ? choosingAtoms.option : null}
            onChoose={(option) => store.getState().setWorkflowView({ choosingAtoms: option ? { step: s.id, option } : null })}
            onKind={(kind) => store.getState().updateStep(s.id, { kind })}
            onShowRun={(index) => store.getState().showRun(s.id, index)}
            onKeepRun={(index, keep) => store.getState().keepRunOf(s.id, index, keep)}
            onCardDown={(e) => dragStep(e, s)}
            onContextMenu={menuOf("step", s.id)}
            onHover={(on) => (on ? hover({ hoveredStep: s.id }) : unhover("hoveredStep", s.id))}
          />
        </div>
      );
    }),
  ];
  const shownParts = usePresence(parts, (el) => String(el.key));
  // the card opened over the rest, on the page: what the ports under it are not drawn for; a port's reach, half its 9 hairs (a hair, 1 / zoom on the page)
  const coverStep = cover ? stepById.get(cover.step) : undefined;
  const coverFrame = coverStep && cover ? { x0: coverStep.x, x1: coverStep.x + cover.w, y0: coverStep.y - cover.h, y1: coverStep.y } : null;
  const portR = 4.5 / zoom;
  // the wires: each drawn, and each step's to the set it made - each going round what it leaves and comes into, where it comes back (a step's card as it stands shut: where wires join it, look `wireCurve`)
  const cardFrame = (s: WorkflowStep): Frame => ({ x0: s.x, x1: s.x + CARD_W, y0: s.y - CARD_H, y1: s.y });
  const around = [...sets.map(shownOf), ...steps.map(cardFrame)];

  // (each wire with the sets and cards near it, which it may go round, and those as one number: worked out again only where it or they moved - look `nearWire`, `wireKey`)
  const endsNear = (p: Pt, q: Pt, e: Ends): Ends => {
    const near = nearWire(p, q, e, around);
    return { ...e, around: near, aroundKey: framesHash(near) };
  };
  // (into a card that names its inputs: in level under the name - look `inputLead`)
  const leadInto = (s: WorkflowStep, port: string) => {
    const inputs = inputsOf(s.kind);
    const name = inputs.length > 1 ? inputs.find((p) => p.id === port)?.name : undefined;
    return name ? { lead: inputLead(name) } : {};
  };
  const wireParts = [
    ...wires.flatMap((w) => {
      if (w.id === wireDrag?.was) return [];
      const p = gives(w.from);
      const s = stepById.get(w.to.step);
      if (!p || !s) return [];
      const failed = states.get(s.id) === "failed";
      const from = setById.get(w.from.set);
      return [
        {
          key: `w${w.id}`,
          p,
          q: stepTakes(s, w.to.port),
          ends: endsNear(p, stepTakes(s, w.to.port), { ...(from ? { from: shownOf(from) } : {}), to: cardFrame(s), ...leadInto(s, w.to.port) }),
          moving: !!s.running && hoveredWire !== w.id,
          color: hoveredWire === w.id ? COLORS.highlight : failed ? ATTENTION : WIRE,
          onHover: (on: boolean) => (on ? hover({ hoveredWire: w.id }) : unhover("hoveredWire", w.id)),
        },
      ];
    }),
    ...sets.flatMap((b) => {
      const s = b.made ? stepById.get(b.made.step) : undefined;
      return s ? [{ key: `m${b.id}`, p: stepGives(s), q: setTakes(shownOf(b)), ends: endsNear(stepGives(s), setTakes(shownOf(b)), { from: cardFrame(s), to: shownOf(b) }), moving: false, color: WIRE, onHover: undefined }] : [];
    }),
  ];
  const shownWires = usePresence(wireParts, (w) => w.key);
  const wirePoints = useWirePoints([...wireParts, ...(drawn ? [{ key: "drawn", p: drawn.p, q: drawn.q }] : [])], around, zoom, shownWires.map((w) => w.key), moving);

  return (
    <group>
      {/* wires: those drawn, and each step's to the set it made - and those just gone, fading */}
      {shownWires.map(({ key, item, leaving }) => {
        const target = wirePoints.get(item.key);
        if (!target) return null;
        return item.moving && !leaving ? (
          <MovingWire key={key} target={target} color={WIRE} zoom={zoom} />
        ) : (
          <WireLine key={key} target={target} color={item.color} zoom={zoom} onHover={leaving ? undefined : item.onHover} leaving={leaving} />
        );
      })}
      {drawn && wirePoints.get("drawn") && <WireLine target={wirePoints.get("drawn")!} color={ACCENT} zoom={zoom} />}

      {/* Sets and steps drawn in HTML on one layer laid on the page at its
          scale: one, so that what is under the pointer is found among them
          in the order they are drawn - sets, then steps, then the
          selection's port - and not behind a layer of another's. */}
      <PageHtml transform distanceFactor={HTML_DISTANCE} position={[0, 0, 0]} zIndexRange={[18, 18]} pointerEvents="none">
        <div ref={layer} style={{ position: "relative", width: 0, height: 0 }}>
          {memberMarks.map((k) => (
            <div key={k.key} style={onLayer(k.frame.x0, k.frame.y1)} className="meno-member-mark">
              <div
                className={k.joined ? "rounded-lg border border-accel-base bg-accel-base/5" : "rounded-lg border border-dashed border-gh-gray"}
                style={{ width: (k.frame.x1 - k.frame.x0) / PX, height: (k.frame.y1 - k.frame.y0) / PX, pointerEvents: "none" }}
              />
            </div>
          ))}
          {positions.map((m) => (
            <div key={`p${m.key}`} style={{ ...onLayer(m.x, m.y), transform: "translate(-50%, -50%)" }}>
              <span className="block min-w-4 rounded-full border border-accel-base bg-white px-1 text-center text-[10px] leading-4 tabular-nums text-accel-base">{m.n}</span>
            </div>
          ))}
          {numbered.map((n) => (
            <div key={`n${n.key}`} style={{ ...onLayer(n.x, n.y - NOMINAL_BOND_LENGTH / 2), transform: "translateX(-50%)" }}>
              <span
                className="block whitespace-nowrap rounded px-1 text-[10px] leading-4 tabular-nums text-gh-gray"
                style={{ pointerEvents: "auto" }}
                title={[recordHow(n.record), recordWhy(n.record)].filter(Boolean).join(" \u00b7 ")}
              >
                #{recordNumber(n.record)}
              </span>
            </div>
          ))}
          {shownParts.map(({ key, item, leaving }) =>
            leaving ? (
              // (gone: as it last was, fading, and no longer taking the pointer)
              <div key={key} inert className="meno-fade-out">
                {item}
              </div>
            ) : (
              <Fragment key={key}>{item}</Fragment>
            ),
          )}
        </div>
      </PageHtml>
      {/* The ports, on a layer of their own over the molecules' chips and
          cards: a port is pressed, lit and let go on whatever lies over it
          on the page - a chip below a molecule among many reaching over a
          set's edge, say. Small as they are, they hide nothing. */}
      {/* (but those under a step's card opened over the rest: it is over them, and takes the press) */}
      <PageHtml transform distanceFactor={HTML_DISTANCE} position={[0, 0, 0]} zIndexRange={[PORTS_Z, PORTS_Z]} pointerEvents="none">
        <div ref={portsLayer} style={{ position: "relative", width: 0, height: 0 }}>
          {sets.map((b) => {
            const f = shownOf(b);
            const info = setInfo.get(b.id)!;
            if (underCard({ x: f.x1, y: (f.y0 + f.y1) / 2 }, coverFrame, portR)) return null;
            return (
              <div key={`b${b.id}`} className="meno-fade-in" style={{ ...onLayer(f.x1, (f.y0 + f.y1) / 2), width: 0, height: 0 }}>
                <Port look={portLook("give", { set: b.id })} label={`Out of ${info.name}`} data={{ "data-give-set": String(b.id) }} onPointerDown={(e) => drawFrom(e, { set: b.id })} style={{ left: 0, top: 0 }} of={(f.y1 - f.y0) / PX} />
              </div>
            );
          })}
          {steps.map((s) => {
            const ports = inputsFor(s.kind, byOf(s));
            const name = kindInfo(s.kind).name;
            return (
              <div key={`s${s.id}`} className="meno-fade-in" style={{ ...onLayer(s.x, s.y), width: 0, height: 0 }}>
                {ports.map((p, k) =>
                  s.id !== cover?.step && underCard({ x: s.x, y: s.y - portDown(k) }, coverFrame, portR) ? null : (
                  <Port
                    key={p.id}
                    look={portLook("take", { step: s.id, port: p.id })}
                    label={ports.length > 1 ? `${p.name} into ${name}` : `Into ${name}`}
                    data={{ "data-take": `${s.id}:${p.id}` }}
                    onPointerDown={(e) => drawInto(e, s.id, p.id)}
                    style={{ left: 0, top: portDown(k) / PX }}
                    of={CARD_H / PX}
                  />
                  ),
                )}
              </div>
            );
          })}
          {/* the selection's port: pulled, the selection becomes an input set */}
          {asSet && !wireDrag && (
            <div className="meno-fade-in" style={{ ...onLayer(asSet.x1, (asSet.y0 + asSet.y1) / 2), width: 0, height: 0 }}>
              <Port look="plain" label="Set as input" data={{}} onPointerDown={setFromSelection} style={{ left: 0, top: 0 }} of={(asSet.y1 - asSet.y0) / PX} />
            </div>
          )}
        </div>
      </PageHtml>
    </group>
  );
}
