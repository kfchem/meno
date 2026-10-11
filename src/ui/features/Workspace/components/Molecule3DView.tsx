import PageHtml from "./PageHtml";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import { COLORS } from "../../../theme/colors";
import { atomColour, bondRadiusOf, HIDDEN_MARK, type Style3D } from "../../../../lib/chem/style3d";
import type { Look3D, Measure3D, Molecule3D, Rising3D, Turn3D } from "../store/types";
import { bondLines, bondReach, frameBondsOf, frameOf, labelSpot, linesOf, populations, solidOf, widestWay, WORLD_PER_ANGSTROM, type BondLine, type LabelBox, type Stick } from "../utils/molecule3d";
import { MARK_MIN_PX, MARK_SCALE, stereoTextEms } from "../chem/marks";
import { LONG_PRESS_MS, LONG_PRESS_SHOW_MS } from "../constants";
import { kindOf, MEASURE_FAN_OPACITY, MEASURE_RADIUS, measureMarks, measureText, measureValue, piecesOf } from "../utils/measure3d";
import { eyeOf, FRAME_ORDER, seenAt } from "../utils/page";
import Frames3D from "./Frames3D";
import Overlay3D from "./Overlay3D";
import StereoText from "./StereoText";
import { calcLine } from "../../../../lib/calc/output";
import { isMarked, pairValue, resultsOn, valueText } from "../../../../lib/calc/results";
import { cardGroupsOf } from "../../../../lib/calc/sources";
import { VIBRATION_PERIOD, vibrationOffsets } from "../utils/vibration3d";
import PointedCard3D, { type CardGroups } from "./PointedCard3D";
import Surface3D from "./Surface3D";
import type { Grid } from "../../../../lib/calc/results";
import { dollyAt, dollyMatrix, RISE_ACROSS_FROM, RISE_END, RISE_GROW, RISE_UP } from "../utils/rise";
import { chainRuns } from "../../../../lib/chem/biopolymer";
import { ribbonMesh } from "../utils/ribbon";

/**
 * Drawn after everything on the page, and depth-tested: what stands off the
 * page is never covered by what lies on it, whatever order that is drawn in.
 */
export const OVER_PAGE = 100;

/**
 * The outline's light, by how lit the molecule is - 0 not at all, 1 hovered
 * or turning, 2 moving: how wide, in pixels, and how much of the highlight
 * it takes. Between them it goes over smoothly. Selected, it has a broad,
 * pale outline as well, the selection's shade - which, as a press on it is
 * held, spreads out from the atom pressed on along its bonds.
 */
const OUTLINE_PX = [0, 1.6, 2.6];
const OUTLINE_BLUE = [0, 0.32, 0.6];
const SELECTED_PX = 5;
const SELECTED_BLUE = 0.27;
/** A chosen atom's ring, or a chosen bond's sleeve: how wide, in pixels, and how much of the highlight it takes. */
const CHOSEN_PX = 3.2;
const CHOSEN_BLUE = 0.75;
/** An atom whose drawing's atom is under the pointer: its outline, in pixels, and how blue. */
const LINKED_PX = 2.6;
const LINKED_BLUE = 0.5;
/** How long an atom or a bond is pointed at before what a calculation found of it is said, in milliseconds; and how far the card is off its ball, in pixels. */
const CARD_DELAY_MS = 250;
const CARD_OFF_PX = 10;
const outlineAt = (level: number, table: number[]) => {
  const i = Math.min(Math.floor(level), table.length - 2);
  return table[i] + (table[i + 1] - table[i]) * (level - i);
};
const HIGHLIGHT = new THREE.Color(COLORS.highlight);
const WHITE = new THREE.Color("#ffffff");
const blue = (k: number) => WHITE.clone().lerp(HIGHLIGHT, k);
/**
 * How quickly things follow, their time constants in seconds: the outline's
 * light, a molecule put back where it was, its atoms going to another frame,
 * and the molecule going over to its other look - its atoms growing or
 * shrinking, its bonds thickening or giving way, its finish changing.
 */
const OUTLINE_TAU = 0.07;
const PLACE_TAU = 0.08;
const FRAME_TAU = 0.06;
/** How quickly a vibration's swing eases in, and out as it comes to rest, in seconds. */
const VIBRATION_TAU = 0.25;
const LOOK_TAU = 0.08;
/** How gently the frames' chip follows the molecule's lowest point as it turns, in seconds. */
const PILL_TAU = 0.12;
/** How far above the molecule the mark of hydrogens left out stands, in pixels. */
const MARK_GAP_PX = 8;
/** A turn this small is followed at once - a drag's, or a turn on its own; a larger one is gone over to. */
const TURN_FOLLOWED = 0.3;
/** How much larger the atom under the pointer is drawn, and its spring: the 3D viewer's. */
const ATOM_SWELL = 1.1;
/**
 * A stereocentre's label: where it stands before it is first placed, the
 * white round its letters, and the room between it and its atom's ball.
 */
const STEREO_OFFSET = "translate(0.95em, -0.95em)";
const STEREO_HALO = "0 0 2px #fff, 0 0 2px #fff, 0 0 3px #fff";
/** How far apart two stereo labels keep at the least, in ems of their size. */
const STEREO_APART = 0.6;
const easeOutCubic = (u: number) => 1 - (1 - Math.min(Math.max(u, 0), 1)) ** 3;
const easeInOutCubic = (u: number) => {
  const t = Math.min(Math.max(u, 0), 1);
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
};
const SPRING = { stiffness: 150, damping: 15 };
/** The most dashes and arc steps one molecule's measurements are drawn with. */
const MEASURE_PIECES = 2048;

/**
 * Whether a pointer button is held down anywhere in the window: what moves
 * then is being dragged, and is followed at once rather than gone over to.
 */
let held = 0;
if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", () => (held += 1), true);
  const up = () => (held = Math.max(0, held - 1));
  window.addEventListener("pointerup", up, true);
  window.addEventListener("pointercancel", up, true);
  window.addEventListener("blur", () => (held = 0));
}
const buttonHeld = () => held > 0;

/** One step of a spring towards `to`, which says whether it is still moving. */
function spring(s: { v: number; vel: number; to: number }, dt: number): boolean {
  const force = -SPRING.stiffness * (s.v - s.to) - SPRING.damping * s.vel;
  s.vel += force * dt;
  s.v += s.vel * dt;
  if (Math.abs(s.v - s.to) < 1e-3 && Math.abs(s.vel) < 1e-3) {
    s.v = s.to;
    s.vel = 0;
    return false;
  }
  return true;
}

/** `v` a step `dt` nearer `to`, with time constant `tau`; there once near enough. */
function follow(v: number, to: number, dt: number, tau: number): number {
  const next = to + (v - to) * Math.exp(-dt / tau);
  return Math.abs(next - to) < 1e-3 ? to : next;
}

export type Molecule3DViewProps = {
  m: Molecule3D;
  style: Style3D;
  look: Look3D;
  frame: number;
  turn: Turn3D | undefined;
  /** How lit its outline is: 0 not at all, 1 hovered or turning, 2 moving. */
  lit: number;
  selected: boolean;
  /** Its atoms chosen, by index; and its bonds. */
  chosen: number[];
  chosenBonds: number[];
  /** A press held on it, to select it: the atom pressed on, and since when (`performance.now()`). */
  holding: { from: number; start: number } | null;
  /** Being moved by the pointer: where it stands is where it is put, at once. */
  following: boolean;
  /** Its frames shown in full beside it - hovered or selected - or as a count. */
  framesOpen: boolean;
  onFrame: (frame: number) => void;
  /** Its measurement under the pointer, by id; null, none. */
  hoveredMeasure: number | null;
  /** Taken away: it shrinks out of view, and says when it is gone. */
  leaving?: () => void;
  /** Rising out of its drawing: where it started, over the drawing, and when; and what is told once it has risen. */
  rising?: Rising3D;
  /** Its atom whose drawing's atom is under the pointer: lit as if it were. */
  linkedAtom?: number | null;
  /** Its atom under the pointer, as it comes and goes. */
  onHoverAtom?: (atom: number | null) => void;
  /** Its drawing has changed since it was made from it: made again, asked for. */
  onRemake?: () => void;
  /** Its other frames - conformers - drawn over the one it shows. */
  overlay?: boolean;
  /** Its stereocentres' and double bonds' labels shown: all, only those its drawing left open, or none. */
  stereoShown: "all" | "chosen" | null;
  /**
   * R and S as the drawing writes them: as large as its R and S, on the
   * page or on the screen; in its typeface; in parentheses or not; and how
   * far off its ball, as a share of the drawing's label size.
   */
  stereoFont: { size: number; units: "world" | "px"; family: string; parentheses: boolean; gap: number };
  onRisen?: () => void;
  /** The motion it moves in - a vibration, its list's row chosen: its atoms' displacements, x, y, z of each; none, it rests. */
  motion?: number[] | null;
  /** Its atoms marked, as its drawing's atom under the pointer is: a list's row pointed at, or chosen. */
  marked?: number[];
  /** One of its calculation's lists, open under it (CalcList3D). */
  list?: ReactNode;
  /** The surface it shows - a list's row chosen - and the value it is drawn at; none, none (or one fading out). */
  surface?: Grid | null;
  surfaceIso?: number;
  /** Its measurement whose value is being typed, by id: its chip a field; none, none. */
  editingMeasure?: number | null;
  /** A value typed for a measurement, and Enter pressed: set it (utils/edit3d). */
  onSetMeasure?: (measure: number, value: number) => void;
  /** The typing let go of - Escape, or the field left. */
  onEditDone?: () => void;
};

/**
 * One molecule in 3D: its atoms and bonds, in the 3D style's primary look or
 * its secondary, in the frame it shows; its outline lit as it is hovered,
 * moved or selected; its chosen atoms ringed; its measurements; and its frames beside it. What
 * changes goes over to what it is to be rather than jumping: another frame,
 * another look, its place on an undo, its coming and going.
 */
export default function Molecule3DView(props: Molecule3DViewProps) {
  const { m, style, look, frame, turn, lit, selected, chosen, chosenBonds, holding, following, leaving } = props;
  const solid = solidOf(m, style);
  const n = m.atoms.length;
  // the bonds drawn: its bonds - or, where they go frame by frame, every
  // bond any frame has, each drawn as far as the frame shown has it, growing
  // and shrinking as frames go (utils/molecule3d `frameBondsOf`)
  const fb = useMemo(() => frameBondsOf(m), [m]);
  const drawn = useMemo(() => (fb ? { ...m, bonds: fb.bonds } : m), [m, fb]);
  const lineCount = useMemo(() => drawn.bonds.reduce((k, b) => k + linesOf(b.order), 0), [drawn.bonds]);
  const placed = useRef<THREE.Group>(null!);
  /** What it is drawn through while it rises: seen in perspective (utils/rise `dollyMatrix`). */
  const dolly = useRef<THREE.Group>(null!);
  const turned = useRef<THREE.Group>(null!);
  const atoms = useRef<THREE.InstancedMesh>(null!);
  const bonds = useRef<THREE.InstancedMesh>(null);
  const atomHull = useRef<THREE.InstancedMesh>(null!);
  const bondHull = useRef<THREE.InstancedMesh>(null);
  const chosenHull = useRef<THREE.InstancedMesh>(null!);
  const linkedHull = useRef<THREE.Mesh>(null!);
  const markedHull = useRef<THREE.InstancedMesh>(null!);
  // the atoms marked, each how far its outline has come
  const marks = useRef(new Map<number, { v: number; to: number }>());
  // the atom lit for its drawing's, and how far its outline has come
  const linked = useRef<{ atom: number | null; v: number }>({ atom: null, v: 0 });
  const chosenSleeves = useRef<THREE.InstancedMesh>(null);
  const pieces = useRef<THREE.InstancedMesh>(null!);
  const fans = useRef<THREE.Mesh>(null!);
  const pill = useRef<THREE.Group>(null!);
  const pillAt = useRef<number | null>(null);
  // where the mark of hydrogens left out stands: over its highest atom, followed gently
  const markAnchor = useRef<THREE.Group>(null);
  const markAt = useRef<number | null>(null);
  const [hoverAtom, setHoverAtom] = useState<number | null>(null);
  const [hoverBond, setHoverBond] = useState<number | null>(null);
  // its chains as ribbons, where a look draws them so (utils/ribbon): the
  // runs, the residue under the pointer, the band's triangles - shared with
  // its outline, which pushes them out along their normals - and the size
  // they were last made at
  const runs = useMemo(
    () => (m.biopolymer && (solid.ribbons.primary || solid.ribbons.secondary) ? chainRuns(m.biopolymer, m.atoms) : []),
    [m.biopolymer, m.atoms, solid.ribbons],
  );
  const traceOf = useMemo(() => new Map(runs.flatMap((r) => r.residues.map((res, i) => [res, r.trace[i]] as const))), [runs]);
  const [hoverResidue, setHoverResidue] = useState<number | null>(null);
  const ribbon = useRef<THREE.Mesh>(null);
  const ribbonHull = useRef<THREE.Mesh>(null);
  const ribbonMat = useRef<THREE.MeshStandardMaterial>(null);
  const ribbonGeo = useMemo(() => new THREE.BufferGeometry(), []);
  useEffect(() => () => ribbonGeo.dispose(), [ribbonGeo]);
  const hullMat = useMemo(() => grownMaterial(), []);
  useEffect(() => () => hullMat.dispose(), [hullMat]);
  const ribbonResidues = useRef<Int32Array>(new Int32Array(0));
  // (going over to a look without ribbons, the residue pointed at is let go)
  const ribbonsNow = solid.ribbons[look];
  useEffect(() => {
    if (!ribbonsNow) setHoverResidue(null);
  }, [ribbonsNow]);
  const ribbonMade = useRef(-1);
  const { invalidate, camera, size, gl } = useThree();
  const quaternion = useMemo(() => (turn ? new THREE.Quaternion(...turn) : new THREE.Quaternion()), [turn]);
  // how it is turned as drawn: following a drag at once, going over to a turn set afresh
  const shownTurn = useRef<THREE.Quaternion | null>(null);

  // what is drawn now, on its way to what it is to be
  const target = solid.frames[frameOf(solid, frame)];
  const places = useRef<Float32Array>(Float32Array.from(target));
  // the vibration it moves in: the displacements moving it, how far into
  // its swing (eased in and out), where in its period, and what it added to
  // the atoms' places this frame - taken off again before the next
  const vib = useRef<{ shown: number[] | null; level: number; phase: number; offset: Float32Array | null }>({
    shown: null,
    level: 0,
    phase: 0,
    offset: null,
  });
  // how far over to the secondary look it is drawn: 0 the primary, 1 the secondary
  const fill = useRef(look === "secondary" ? 1 : 0);
  const atomsMat = useRef<THREE.MeshStandardMaterial>(null!);
  const bondsMat = useRef<THREE.MeshStandardMaterial>(null);
  // (the atoms either look leaves out, and whether it leaves out any)
  const hidden = solid.hidden;
  const hides = solid.hidesH;
  // (a bond to an atom a look leaves out is let go with it: whether either look leaves any out)
  const leaves = useMemo(() => hidden.primary.includes(1) || hidden.secondary.includes(1), [hidden]);
  const swell = useRef(new Map<number, { v: number; vel: number; to: number }>());
  const rings = useRef(new Map<number, { v: number; vel: number; to: number }>());
  const sleeves = useRef(new Map<number, { v: number; vel: number; to: number }>());
  // how far the selection's outline has spread, atom by atom, as a press is held
  const held = useRef(new Float32Array(n));
  if (held.current.length !== n) held.current = new Float32Array(n);
  const wasHolding = useRef(false);
  // each atom's distance from the atom pressed on, in bonds, and the furthest
  const spread = useMemo(() => {
    if (!holding) return null;
    const near: number[][] = m.atoms.map(() => []);
    for (const b of m.bonds) {
      near[b.a1].push(b.a2);
      near[b.a2].push(b.a1);
    }
    const level = new Int32Array(n).fill(-1);
    level[holding.from] = 0;
    let edge = [holding.from];
    let deepest = 0;
    while (edge.length) {
      const next: number[] = [];
      for (const a of edge) {
        for (const o of near[a]) {
          if (level[o] >= 0) continue;
          level[o] = level[a] + 1;
          deepest = level[o];
          next.push(o);
        }
      }
      edge = next;
    }
    // (atoms not bonded to it - a salt's other ion - last)
    for (let i = 0; i < n; i++) if (level[i] < 0) level[i] = deepest + 1;
    // (by a loop: spread over a protein's atoms, Math.max overruns the stack)
    return { level, deepest: level.reduce((most, l) => Math.max(most, l), 0) };
  }, [holding, m.atoms, m.bonds, n]);
  // each bond's lines, by bond
  const lineBond = useMemo(() => drawn.bonds.flatMap((b, i) => Array.from({ length: linesOf(b.order) }, () => i)), [drawn.bonds]);
  // how far each drawn bond is there, on its way to what the frame shown has
  const there = useRef<Float32Array>(Float32Array.from(fb ? fb.present[frameOf(solid, frame)] : []));
  if (fb && there.current.length !== fb.bonds.length) there.current = Float32Array.from(fb.present[frameOf(solid, frame)]);
  // (rising out of a drawing, it is its full size from the first: its atoms grow instead)
  const grown = useRef({ v: leaving || props.rising ? 1 : 0, vel: 0, to: leaving ? 0 : 1 });
  // how far its atoms have grown, rising out of a drawing
  const risen = useRef(props.rising ? 0 : 1);
  const level = useRef(0);
  const selLevel = useRef(0);
  const shown = useRef<THREE.Vector3 | null>(null);
  // measurements on their way in or out: how far in, and the last drawn of one gone
  const measureLevels = useRef(new Map<number, { v: number; m: Measure3D }>());
  const labels = useRef(new Map<number, { anchor: THREE.Group | null; el: HTMLDivElement | null }>());
  // each value's size on the screen, with the text it was read for: read
  // again only when its text changes, not every frame - what the stereo
  // labels keep clear of
  const valueSizes = useRef(new Map<number, { text: string; w: number; h: number }>());
  const [measureTexts, setMeasureTexts] = useState<Record<number, string>>({});
  const [shownMeasures, setShownMeasures] = useState<Measure3D[]>(m.measures ?? []);
  const dirty = useRef(true);
  // a conformer set's shares: as a Populations step found them, or by Boltzmann; and its atoms' elements
  const shares = useMemo(
    () =>
      m.shares?.length === solid.frames.length
        ? m.shares
        : m.conformerSet && m.energies?.length === solid.frames.length
          ? populations(m.energies)
          : undefined,
    [m.shares, m.conformerSet, m.energies, solid.frames.length],
  );
  const els = useMemo(() => m.atoms.map((a) => a.el), [m.atoms]);
  // where the frame shown is centred, in ångströms: what a surface on it is placed about
  const shownFrame = frameOf(solid, frame);
  const centre = useMemo((): [number, number, number] => {
    const xyz = shownFrame === 0 ? m.atoms.flatMap((a) => [a.x, a.y, a.z]) : (m.frames?.[shownFrame - 1] ?? []);
    const c: [number, number, number] = [0, 0, 0];
    const count = Math.floor(xyz.length / 3) || 1;
    for (let i = 0; i + 2 < xyz.length; i += 3) for (let x = 0; x < 3; x++) c[x] += xyz[i + x] / count;
    return c;
  }, [m.atoms, m.frames, shownFrame]);
  // its stereocentres' and double bonds' labels: all, or those its drawing left open
  const stereoMarks = useMemo(() => {
    const st = m.stereo;
    if (!st || !props.stereoShown) return [];
    const only = props.stereoShown === "chosen" ? st.chosen : null;
    if (props.stereoShown === "chosen" && !only) return [];
    // (with the atoms whose ways out it keeps clear of: a centre's
    // neighbours, a double bond's two and theirs)
    const near = (i: number) => m.bonds.flatMap((b) => (b.a1 === i ? [b.a2] : b.a2 === i ? [b.a1] : []));
    const out: { key: string; atoms: number[]; around: number[]; text: string }[] = [];
    for (const [i, text] of Object.entries(st.atoms)) {
      if (!only || only.atoms.includes(Number(i))) out.push({ key: `a${i}`, atoms: [Number(i)], around: near(Number(i)), text });
    }
    for (const [i, text] of Object.entries(st.bonds)) {
      const b = m.bonds[Number(i)];
      if (b && (!only || only.bonds.includes(Number(i))))
        out.push({ key: `b${i}`, atoms: [b.a1, b.a2], around: [...new Set([...near(b.a1), ...near(b.a2)])], text });
    }
    return out;
  }, [m.stereo, m.bonds, props.stereoShown]);
  const stereoAnchors = useRef(new Map<string, { anchor: THREE.Group | null; el: HTMLDivElement | null }>());
  useEffect(() => {
    dirty.current = true;
    invalidate();
  }, [stereoMarks, invalidate]);

  // the molecule itself changed - its atoms, its frames, the style: drawn afresh
  useLayoutEffect(() => {
    const col = new THREE.Color();
    for (let i = 0; i < n; i++) atoms.current.setColorAt(i, col.set(atomColour(m.atoms[i].el)));
    if (atoms.current.instanceColor) atoms.current.instanceColor.needsUpdate = true;
    if (places.current.length !== target.length) places.current = Float32Array.from(target);
    dirty.current = true;
    invalidate();
  }, [m, n, target, style, invalidate]);

  // measurements come and go, fading
  useEffect(() => {
    const now = m.measures ?? [];
    const ids = new Set(now.map((x) => x.id));
    for (const x of now) {
      const known = measureLevels.current.get(x.id);
      measureLevels.current.set(x.id, { v: known?.v ?? 0, m: x });
    }
    setShownMeasures([...now, ...[...measureLevels.current.values()].filter((l) => !ids.has(l.m.id)).map((l) => l.m)]);
    dirty.current = true;
    invalidate();
  }, [m.measures, invalidate]);

  // the atom under the pointer swells - or the one whose drawing's atom is -
  // and the one it leaves goes back
  const linkedAtom = props.linkedAtom ?? null;
  useEffect(() => {
    const lit = [hoverAtom, linkedAtom].filter((i): i is number => i != null);
    for (const [i, s] of swell.current) s.to = lit.includes(i) ? ATOM_SWELL : 1;
    for (const i of lit) if (!swell.current.has(i)) swell.current.set(i, { v: 1, vel: 0, to: ATOM_SWELL });
    invalidate();
  }, [hoverAtom, linkedAtom, invalidate]);
  const onHoverAtom = props.onHoverAtom;
  useEffect(() => onHoverAtom?.(hoverAtom), [hoverAtom, onHoverAtom]);

  // chosen atoms are ringed, the ring opening out, and chosen bonds
  // sleeved likewise; let go, it closes
  useEffect(() => {
    const on = new Set(chosen);
    for (const [i, r] of rings.current) r.to = on.has(i) ? 1 : 0;
    for (const i of on) if (!rings.current.has(i)) rings.current.set(i, { v: 0, vel: 0, to: 1 });
    invalidate();
  }, [chosen, invalidate]);
  useEffect(() => {
    const on = new Set(chosenBonds);
    for (const [i, r] of sleeves.current) r.to = on.has(i) ? 1 : 0;
    for (const i of on) if (!sleeves.current.has(i)) sleeves.current.set(i, { v: 0, vel: 0, to: 1 });
    invalidate();
  }, [chosenBonds, invalidate]);
  useEffect(() => invalidate(), [holding, invalidate]);
  // the atoms a list's row is of, outlined as it is pointed at
  const marked = props.marked;
  useEffect(() => {
    const on = new Set(marked ?? []);
    for (const [i, r] of marks.current) r.to = on.has(i) ? 1 : 0;
    for (const i of on) if (!marks.current.has(i)) marks.current.set(i, { v: 0, to: 1 });
    invalidate();
  }, [marked, invalidate]);

  // what a calculation found of an atom, or a bond, said beside it once it
  // has been pointed at a moment - at once, where something is said already
  const atomResults = useMemo(() => resultsOn(m.calc?.results, "atoms"), [m.calc]);
  const pairResults = useMemo(() => resultsOn(m.calc?.results, "pairs"), [m.calc]);
  const cardOf = (on: { atom: number } | { bond: number } | { residue: number }): { title: string; groups: CardGroups; atoms: number[] } | null => {
    const name = (i: number) => `${m.atoms[i]?.el ?? "?"} ${i + 1}`;
    // (a ribbon's residue: its name, number and chain, by its backbone atom)
    if ("residue" in on) {
      const r = m.biopolymer?.residues[on.residue];
      const at = traceOf.get(on.residue);
      if (!r || at == null) return null;
      return { title: `${r.name} ${r.seq}${r.iCode}${r.chain ? ` (${r.chain})` : ""}`, groups: [], atoms: [at] };
    }
    if ("atom" in on) {
      const i = on.atom;
      if (!atomResults.length || i >= n) return null;
      const groups = cardGroupsOf(atomResults, (r) => ({ text: valueText(r.values[i], r), marked: isMarked(r.values[i], r) }));
      return { title: name(i), groups, atoms: [i] };
    }
    const b = m.bonds[on.bond];
    if (!b || !pairResults.length) return null;
    const known = pairResults.filter((r) => pairValue(r, b.a1, b.a2) !== undefined);
    if (!known.length) return null;
    const groups = cardGroupsOf(known, (r) => {
      const v = pairValue(r, b.a1, b.a2)!;
      return { text: valueText(v, r), marked: isMarked(v, r) };
    });
    return { title: `${name(b.a1)}\u2013${name(b.a2)}`, groups, atoms: [b.a1, b.a2] };
  };
  const pointedAt = hoverAtom != null ? { atom: hoverAtom } : hoverBond != null ? { bond: hoverBond } : hoverResidue != null ? { residue: hoverResidue } : null;
  const pointedKey = pointedAt ? ("atom" in pointedAt ? `a${pointedAt.atom}` : "bond" in pointedAt ? `b${pointedAt.bond}` : `r${pointedAt.residue}`) : null;
  const [card, setCard] = useState<{ key: string; title: string; groups: CardGroups; atoms: number[] } | null>(null);
  const [cardShown, setCardShown] = useState(false);
  const cardEl = useRef<HTMLDivElement>(null);
  const cardAnchor = useRef<THREE.Group>(null);
  useEffect(() => {
    const said = pointedAt ? cardOf(pointedAt) : null;
    if (!said) {
      setCardShown(false);
      return;
    }
    const show = () => {
      setCard({ key: pointedKey!, ...said });
      setCardShown(true);
      invalidate();
    };
    if (cardShown) {
      show();
      return;
    }
    const t = window.setTimeout(show, CARD_DELAY_MS);
    return () => window.clearTimeout(t);
    // (said afresh as what is pointed at changes, or what is known of it)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pointedKey, atomResults, pairResults]);
  // (faded out, it is let go)
  useEffect(() => {
    invalidate();
    if (cardShown || !card) return;
    const t = window.setTimeout(() => setCard(null), 200);
    return () => window.clearTimeout(t);
  }, [cardShown, card, invalidate]);

  useEffect(() => invalidate(), [lit, selected, look, frame, turn, invalidate]);

  // (before the labels' Html places them, so that they are placed where the
  // atoms are drawn this frame, not the one before: FRAME_ORDER)
  useFrame((_, dt) => {
    const step = Math.min(dt, 1 / 30);
    let moving = false;
    // another frame: its atoms go there
    let reshaped = dirty.current;
    const p = places.current;
    // (what a vibration added last frame taken off first: what follows is
    // of the atoms at rest)
    const v = vib.current;
    if (v.offset && v.offset.length === p.length) for (let i = 0; i < p.length; i++) p[i] -= v.offset[i];
    const offset = v.offset;
    v.offset = null;
    let far = 0;
    const rising = props.rising;
    const riseT = rising ? (performance.now() - rising.start) / 1000 : 0;
    if (rising?.flat && rising.flat.length === p.length && riseT < RISE_UP) {
      // rising out of the drawing: from its atoms on the page to their places in 3D
      const u = easeInOutCubic(riseT / RISE_UP);
      for (let i = 0; i < p.length; i++) p[i] = rising.flat[i] + (target[i] - rising.flat[i]) * u;
      reshaped = moving = true;
    } else {
      for (let i = 0; i < p.length; i++) far = Math.max(far, Math.abs(p[i] - target[i]));
    }
    if (far > 1e-4) {
      const k = 1 - Math.exp(-step / FRAME_TAU);
      for (let i = 0; i < p.length; i++) p[i] += (target[i] - p[i]) * k;
      reshaped = moving = true;
    } else if (far > 0) {
      p.set(target);
      reshaped = true;
    }
    // a vibration chosen: the atoms move in it, its swing eased in and out;
    // another chosen, the one moving comes to rest before the next begins
    const wanted = props.motion?.length === p.length ? props.motion : null;
    if (v.shown !== wanted && (!v.shown || v.level < 0.02)) {
      v.shown = wanted;
      v.phase = 0;
    }
    if (v.shown) {
      v.level = follow(v.level, v.shown === wanted ? 1 : 0, step, VIBRATION_TAU);
      if (v.shown !== wanted && v.level < 0.02) {
        v.shown = wanted;
        v.level = 0;
        v.phase = 0;
      }
      v.phase += (step / VIBRATION_PERIOD) * 2 * Math.PI;
      if (v.shown && v.level > 0) {
        v.offset = vibrationOffsets(v.shown, v.level * Math.sin(v.phase), offset ?? undefined);
        for (let i = 0; i < p.length; i++) p[i] += v.offset[i];
      }
      reshaped = moving = true;
    } else if (offset) reshaped = true;
    // the other look: its atoms grow or shrink, its bonds thicken or give
    // way, and its finish goes over to the other's
    const f = follow(fill.current, look === "secondary" ? 1 : 0, step, LOOK_TAU);
    const refinish = f !== fill.current || dirty.current;
    if (f !== fill.current) {
      fill.current = f;
      reshaped = moving = true;
    }
    if (refinish) finish(fill.current);
    // (as high as it reaches - or where a turn of several put it)
    const height = m.at.z ?? solid.reach.primary + (solid.reach.secondary - solid.reach.primary) * fill.current;
    // where it stands: put back by an undo, it goes there rather than jumps
    const goal = new THREE.Vector3(m.at.x, m.at.y, height);
    const rise = props.rising;
    if (rise) {
      // rising out of its drawing: off the page, its depth growing, and over to beside it
      const t = riseT;
      const up = easeInOutCubic(t / RISE_UP);
      const across = easeInOutCubic((t - RISE_ACROSS_FROM) / (RISE_END - RISE_ACROSS_FROM));
      shown.current = new THREE.Vector3(
        rise.from.x + (goal.x - rise.from.x) * across,
        rise.from.y + (goal.y - rise.from.y) * across,
        goal.z * up,
      );
      const grow = easeOutCubic(t / RISE_GROW);
      if (grow !== risen.current) reshaped = true;
      risen.current = grow;
      moving = true;
      if (t >= RISE_END) {
        risen.current = 1;
        p.set(target);
        reshaped = true;
        props.onRisen?.();
      }
    }
    // (a drag - its own, or the drawing's it is selected with - it follows at once)
    else if (!shown.current || following || buttonHeld()) shown.current = goal.clone();
    else if (shown.current.distanceToSquared(goal) > 1e-8) {
      shown.current.lerp(goal, 1 - Math.exp(-step / PLACE_TAU));
      moving = true;
    }
    placed.current.position.copy(shown.current);
    // rising, it alone is seen in perspective for the moment of its rise (a
    // dolly zoom: the page as it was), and back
    const seen = rise && camera instanceof THREE.OrthographicCamera ? dollyMatrix(camera, dollyAt(performance.now(), [rise.start])) : null;
    if (seen) dolly.current.matrix.copy(seen);
    else dolly.current.matrix.identity();
    dolly.current.matrixWorldNeedsUpdate = true;
    if (!shownTurn.current || shownTurn.current.angleTo(quaternion) < TURN_FOLLOWED) {
      shownTurn.current = quaternion.clone();
    } else {
      shownTurn.current.slerp(quaternion, 1 - Math.exp(-step / PLACE_TAU));
      moving = true;
    }
    turned.current.quaternion.copy(shownTurn.current);
    // coming into view from its centre, or going into it
    if (grown.current.v !== grown.current.to || grown.current.vel !== 0) {
      spring(grown.current, step);
      moving = true;
      // (gone: shrunk to nothing, it is let go - hidden at once, and drawn
      // once more without it, or its last little picture would stay)
      if (leaving && grown.current.v <= 0.02) {
        placed.current.visible = false;
        leaving();
        invalidate();
        return;
      }
    }
    placed.current.scale.setScalar(Math.max(grown.current.v, 1e-3));
    // the atom under the pointer, and the chosen atoms' rings
    for (const [i, s] of swell.current) {
      if (spring(s, step)) reshaped = moving = true;
      else if (s.to === 1) swell.current.delete(i);
    }
    let ringing = false;
    for (const [i, r] of rings.current) {
      if (spring(r, step)) ringing = moving = true;
      else if (r.to === 0) {
        rings.current.delete(i);
        ringing = true;
      }
    }
    let sleeving = false;
    for (const [i, r] of sleeves.current) {
      if (spring(r, step)) sleeving = moving = true;
      else if (r.to === 0) {
        sleeves.current.delete(i);
        sleeving = true;
      }
    }
    // a press held: the selection's outline spreads from the atom pressed
    // on, nothing showing for the first part of it; done, the molecule is
    // selected and its outline stays as it is; let go early, it goes
    const h = held.current;
    let holdTo = 0;
    if (holding && spread) {
      const t = performance.now() - holding.start;
      const u = Math.min(1, Math.max(0, (t - LONG_PRESS_SHOW_MS) / (LONG_PRESS_MS - LONG_PRESS_SHOW_MS)));
      for (let i = 0; i < n; i++) h[i] = Math.min(1, Math.max(0, u * (spread.deepest + 1) - spread.level[i]));
      holdTo = 1;
      moving = true;
    } else if (wasHolding.current && selected) {
      let least = 1;
      for (let i = 0; i < n; i++) least = Math.min(least, h[i]);
      selLevel.current = Math.max(selLevel.current, least);
    }
    wasHolding.current = !!holding;
    let holdMost = 0;
    if (!holding) {
      for (let i = 0; i < n; i++) {
        if (h[i] === 0) continue;
        h[i] = follow(h[i], 0, step, OUTLINE_TAU);
        moving = true;
      }
    }
    for (let i = 0; i < n; i++) holdMost = Math.max(holdMost, h[i]);
    const holdShown = holdMost > 0 || holdTo > 0;
    // the outline's light, and the selection's
    const towards = Math.max(0, Math.min(2, lit));
    const nextLevel = follow(level.current, towards, step, OUTLINE_TAU);
    const nextSel = follow(selLevel.current, selected ? 1 : 0, step, OUTLINE_TAU);
    const relit = nextLevel !== level.current || nextSel !== selLevel.current;
    if (relit) moving = true;
    level.current = nextLevel;
    selLevel.current = nextSel;

    const radius = (i: number) => {
      const r = solid.radii.primary[i] + (solid.radii.secondary[i] - solid.radii.primary[i]) * fill.current;
      return r * (swell.current.get(i)?.v ?? 1) * risen.current;
    };
    const fromR = bondRadiusOf(style.primary);
    const bondR = (fromR + (bondRadiusOf(style.secondary) - fromR) * fill.current) * WORLD_PER_ANGSTROM * risen.current;
    const bondsShown = bondR > 1e-6;
    // (a bond to an atom a look leaves out goes with it)
    const keptOf = (b: { a1: number; a2: number }) => {
      const p = hidden.primary[b.a1] || hidden.primary[b.a2] ? 0 : 1;
      const s = hidden.secondary[b.a1] || hidden.secondary[b.a2] ? 0 : 1;
      return p + (s - p) * fill.current;
    };
    // (bonds forming and breaking as the frame goes: each grows or shrinks to what it has)
    if (fb) {
      const want = fb.present[frameOf(solid, frame)];
      const t = there.current;
      const k = 1 - Math.exp(-step / FRAME_TAU);
      for (let i = 0; i < t.length; i++) {
        if (t[i] === want[i]) continue;
        t[i] = Math.abs(want[i] - t[i]) < 0.01 ? want[i] : t[i] + (want[i] - t[i]) * k;
        reshaped = moving = true;
      }
    }
    const linesNow = () => {
      const all = bondLines(drawn, p, bondR);
      if (fb) all.forEach((l, k) => (l.r *= there.current[lineBond[k]]));
      if (leaves) all.forEach((l, k) => (l.r *= keptOf(drawn.bonds[lineBond[k]])));
      return all;
    };
    let lines: BondLine[] | null = null;
    if (reshaped) {
      placeAtoms(atoms.current, p, radius, 0);
      if (bonds.current) {
        lines = linesNow();
        placeBonds(bonds.current, lines, 0);
        bonds.current.visible = bondsShown;
      }
    }
    // its ribbons: as large as the look it is going over to has them - none,
    // where it draws the chains as atoms - made afresh as the atoms move
    const ribbonFrom = solid.ribbons.primary ? 1 : 0;
    const ribbonScale = (ribbonFrom + ((solid.ribbons.secondary ? 1 : 0) - ribbonFrom) * fill.current) * risen.current;
    if (runs.length && m.biopolymer && (reshaped || dirty.current || ribbonMade.current !== ribbonScale)) {
      const made = ribbonMesh(p, runs, m.biopolymer, style.ribbonColours, ribbonScale, WORLD_PER_ANGSTROM);
      fillGeometry(ribbonGeo, made);
      ribbonResidues.current = made.residues;
      ribbonMade.current = ribbonScale;
    }
    const ribbonsShown = runs.length > 0 && ribbonScale > 1e-3;
    if (ribbon.current) ribbon.current.visible = ribbonsShown;
    // (as wide in pixels whatever the zoom - and, in perspective, however
    // high it stands)
    const eye = eyeOf(camera);
    const px = 1 / (camera.zoom * seenAt(0, 0, height, eye).k);
    // the outline
    const outPx = Math.max(outlineAt(level.current, OUTLINE_PX), SELECTED_PX * selLevel.current);
    const lightOn = outPx > 0.02 || holdShown;
    atomHull.current.visible = lightOn;
    if (bondHull.current) bondHull.current.visible = lightOn && bondsShown;
    if (ribbonHull.current) ribbonHull.current.visible = lightOn && ribbonsShown;
    if (lightOn && (reshaped || relit || dirty.current || holdShown)) {
      const w = outPx * px;
      const wide = SELECTED_PX * px;
      placeAtoms(atomHull.current, p, radius, holdShown ? (i) => Math.max(w, wide * h[i]) : w);
      if (bondHull.current) {
        const all = lines ?? linesNow();
        placeBonds(
          bondHull.current,
          all,
          holdShown
            ? (k) => {
                const b = drawn.bonds[lineBond[k]];
                return Math.max(w, wide * Math.min(h[b.a1], h[b.a2]));
              }
            : w,
        );
      }
      const k = 1 - (1 - outlineAt(level.current, OUTLINE_BLUE)) * (1 - SELECTED_BLUE * Math.max(selLevel.current, holdMost));
      const colour = blue(k);
      (atomHull.current.material as THREE.MeshBasicMaterial).color.copy(colour);
      if (bondHull.current) (bondHull.current.material as THREE.MeshBasicMaterial).color.copy(colour);
      // (a ribbon's outline: its band pushed out all round - as wide as the selection's while a press is held)
      hullMat.color.copy(colour);
      (hullMat.userData.grow as { value: number }).value = holdShown ? Math.max(w, wide * holdMost) : w;
    }
    // the atom whose drawing's atom is under the pointer, outlined
    {
      const l = linked.current;
      const want = props.linkedAtom ?? null;
      if (want != null) l.atom = want;
      const v = follow(l.v, want != null ? 1 : 0, step, OUTLINE_TAU);
      if (Math.abs(v - (want != null ? 1 : 0)) > 0.005) moving = true;
      l.v = Math.abs(v - (want != null ? 1 : 0)) <= 0.005 ? (want != null ? 1 : 0) : v;
      const mesh = linkedHull.current;
      mesh.visible = l.v > 0 && l.atom != null && l.atom < n && radius(l.atom) > 0;
      if (mesh.visible) {
        const i = l.atom!;
        mesh.position.set(p[3 * i], p[3 * i + 1], p[3 * i + 2]);
        mesh.scale.setScalar(radius(i) + LINKED_PX * px * l.v);
      }
    }
    // the atoms a list's row is of, outlined as the drawing's atom is
    {
      let marking = false;
      for (const [i, r] of marks.current) {
        const v = follow(r.v, r.to, step, OUTLINE_TAU);
        if (v !== r.v) {
          r.v = v;
          marking = moving = true;
        }
        if (v === 0 && r.to === 0) {
          marks.current.delete(i);
          marking = true;
        }
      }
      if (reshaped || marking || dirty.current) {
        const mesh = markedHull.current;
        for (let i = 0; i < n; i++) {
          const v = marks.current.get(i)?.v ?? 0;
          const r = v > 0.001 ? radius(i) + LINKED_PX * px * v : 0;
          mtx.makeScale(r, r, r).setPosition(p[3 * i], p[3 * i + 1], p[3 * i + 2]);
          mesh.setMatrixAt(i, mtx);
        }
        mesh.instanceMatrix.needsUpdate = true;
        mesh.visible = marks.current.size > 0;
      }
    }
    // what is said of the atom or bond pointed at: beside its ball - or
    // the bond's middle - on the side the canvas has room on; not while a
    // button is held
    if (card && cardAnchor.current && cardEl.current) {
      const a = cardAnchor.current;
      const at = a.position.set(0, 0, 0);
      for (const i of card.atoms) if (i < n) at.add(new THREE.Vector3(p[3 * i], p[3 * i + 1], p[3 * i + 2]));
      at.divideScalar(Math.max(1, card.atoms.length));
      const g = Math.max(grown.current.v, 1e-3);
      const off = (card.atoms.length === 1 ? (radius(card.atoms[0]) * g) / px : 0) + CARD_OFF_PX;
      const parent = a.parent;
      let x = off;
      if (parent) {
        parent.updateWorldMatrix(true, false);
        const s = parent.localToWorld(at.clone()).project(camera);
        const sx = ((s.x + 1) / 2) * size.width;
        if (sx + off + cardEl.current.offsetWidth > size.width - CARD_OFF_PX) x = -off - cardEl.current.offsetWidth;
      }
      cardEl.current.style.transform = `translate(${x.toFixed(1)}px, -50%)`;
      cardEl.current.style.opacity = cardShown && !buttonHeld() ? "1" : "0";
    }
    // the chosen atoms' rings
    if (reshaped || ringing || dirty.current) {
      const mesh = chosenHull.current;
      for (let i = 0; i < n; i++) {
        const v = rings.current.get(i)?.v ?? 0;
        const r = v > 0.001 ? radius(i) + CHOSEN_PX * px * v : 0;
        mtx.makeScale(r, r, r).setPosition(p[3 * i], p[3 * i + 1], p[3 * i + 2]);
        mesh.setMatrixAt(i, mtx);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.visible = rings.current.size > 0;
    }
    // the chosen bonds' sleeves
    const sleeveMesh = chosenSleeves.current;
    if (sleeveMesh && (reshaped || sleeving || dirty.current)) {
      const a = new THREE.Vector3();
      const b = new THREE.Vector3();
      m.bonds.forEach((bond, i) => {
        const v = sleeves.current.get(i)?.v ?? 0;
        a.set(p[3 * bond.a1], p[3 * bond.a1 + 1], p[3 * bond.a1 + 2]);
        b.set(p[3 * bond.a2], p[3 * bond.a2 + 1], p[3 * bond.a2 + 2]);
        placePiece(sleeveMesh, i, a, b, v > 0.001 ? bondReach(bond.order, bondR) + CHOSEN_PX * px * v : 0);
      });
      sleeveMesh.instanceMatrix.needsUpdate = true;
      sleeveMesh.computeBoundingSphere();
      sleeveMesh.visible = sleeves.current.size > 0 && bondsShown;
    }
    // the measurements: drawn afresh as the atoms move, fading in and out
    let fading = false;
    for (const [id, l] of measureLevels.current) {
      const to = (m.measures ?? []).some((x) => x.id === id) ? 1 : 0;
      const v = follow(l.v, to, step, OUTLINE_TAU);
      if (v !== l.v) {
        l.v = v;
        fading = moving = true;
      }
      if (v === 0 && to === 0) {
        measureLevels.current.delete(id);
        fading = true;
      }
    }
    if (reshaped || fading || dirty.current) drawMeasures(p);
    // the stereo labels, on their atom - a double bond's, at its middle - and
    // set off from it on the screen, as the drawing's are: clear of its ball,
    // the widest way out between its bonds as it is seen now - or the
    // nearest way that keeps clear of the other atoms, the bonds, the
    // measurements' values and the labels already placed - and as large as
    // the drawing's letters
    if (stereoMarks.length) {
      const g = Math.max(grown.current.v, 1e-3);
      const font = Math.max(MARK_MIN_PX, props.stereoFont.units === "px" ? props.stereoFont.size : props.stereoFont.size / px);
      const v = new THREE.Vector3();
      const onScreen = (parent: THREE.Object3D, x: number, y: number, z: number) => {
        parent.localToWorld(v.set(x, y, z)).project(camera);
        return { x: ((v.x + 1) / 2) * size.width, y: ((1 - v.y) / 2) * size.height };
      };
      const placedLabels: LabelBox[] = [];
      // (every atom's ball on the screen, once for all the labels; and every
      // bond as drawn - none when space-filling)
      let balls: { x: number; y: number; r: number }[] | null = null;
      const sticks: Stick[] = [];
      for (const mark of stereoMarks) {
        const l = stereoAnchors.current.get(mark.key);
        if (!l?.anchor) continue;
        const at = l.anchor.position.set(0, 0, 0);
        for (const i of mark.atoms) at.add(v.set(p[3 * i], p[3 * i + 1], p[3 * i + 2]));
        at.divideScalar(mark.atoms.length);
        const parent = l.anchor.parent;
        if (!l.el || !parent) continue;
        if (reshaped || dirty.current) l.el.style.opacity = String(risen.current);
        parent.updateWorldMatrix(true, false);
        if (!balls) {
          balls = [];
          for (let i = 0; i < n; i++) balls.push({ ...onScreen(parent, p[3 * i], p[3 * i + 1], p[3 * i + 2]), r: (radius(i) * g) / px });
          if (bondsShown) {
            const shownBonds = fb ? drawn.bonds.filter((_, i) => there.current[i] > 0.5) : m.bonds;
            for (const b of shownBonds) if (balls[b.a1]?.r && balls[b.a2]?.r) sticks.push({ a: balls[b.a1], b: balls[b.a2], r: (bondR * g) / px });
          }
          // (the measurements' values, where they are written now - each
          // value's size read when its text is new: it is written in a
          // root of its own, after this one's, so not before it shows)
          for (const [id, v] of labels.current) {
            if (!v.anchor?.parent || !v.el || (measureLevels.current.get(id)?.v ?? 0) < 0.5) continue;
            const text = v.el.textContent ?? "";
            let size = valueSizes.current.get(id);
            if (!size || size.text !== text) {
              size = { text, w: v.el.offsetWidth, h: v.el.offsetHeight };
              valueSizes.current.set(id, size);
            }
            const c = onScreen(v.anchor.parent, v.anchor.position.x, v.anchor.position.y, v.anchor.position.z);
            placedLabels.push({ x: c.x, y: c.y, hx: size.w / 2, hy: size.h / 2 });
          }
        }
        const o = onScreen(parent, at.x, at.y, at.z);
        const way = widestWay(mark.around.map((i) => Math.atan2(balls![i].y - o.y, balls![i].x - o.x)));
        // (out past the ball - or the bond - as far as the drawing's style
        // sets its R and S off its atoms, of its labels' size; the letters'
        // box a capital's height, and a little for the halo)
        const reach = ((mark.atoms.length === 1 ? radius(mark.atoms[0]) : bondR) * g) / px + (props.stereoFont.gap * font) / MARK_SCALE;
        const half = { x: font * (stereoTextEms(mark.text, props.stereoFont.parentheses) / 2 + 0.1), y: font * 0.45 };
        // (every atom near it but its own - a double bond's two among them)
        const own = mark.atoms.length === 1 ? mark.atoms[0] : -1;
        const others = balls.filter((b, i) => i !== own && b.r > 0 && Math.hypot(b.x - o.x, b.y - o.y) < reach + 4 * half.x + b.r);
        const spot = labelSpot(o, reach, half, way, others, placedLabels, sticks);
        // (the next keeps a little way off it, not just clear: two side by
        // side read as one, and as either atom's)
        placedLabels.push({ ...spot, hx: spot.hx + STEREO_APART * font, hy: spot.hy + STEREO_APART * font });
        l.el.style.transform = `translate(${(spot.x - o.x).toFixed(1)}px, ${(spot.y - o.y).toFixed(1)}px)`;
        l.el.style.fontSize = `${font.toFixed(1)}px`;
      }
    }
    dirty.current = false;
    // how far an atom reaches as drawn - its ball, or, where its chain is a
    // ribbon, the ribbon about its backbone atom: what the chips beside the
    // molecule keep clear of
    const ribbonReach = ribbonsShown ? ribbonScale : 0;
    const reachOf = (i: number) => {
      const r = radius(i);
      return r > 0 ? r : solid.extent[look][i] > 0 ? solid.extent[look][i] * ribbonReach : 0;
    };
    // the mark of hydrogens left out: just above it on the page
    if (markAnchor.current) {
      const g = Math.max(grown.current.v, 1e-3);
      const at = shown.current;
      const v = new THREE.Vector3();
      let high = -Infinity;
      for (let i = 0; i < n; i++) {
        const r = reachOf(i);
        if (r <= 0) continue;
        v.set(p[3 * i], p[3 * i + 1], p[3 * i + 2]).applyQuaternion(shownTurn.current!);
        const seen = seenAt(at.x + v.x, at.y + v.y, at.z + v.z, eye);
        high = Math.max(high, seen.y + r * seen.k);
      }
      if (Number.isFinite(high)) {
        const above = high - at.y;
        markAt.current = markAt.current == null || reshaped ? above : follow(markAt.current, above, step, PILL_TAU);
        if (Math.abs(markAt.current - above) > 1e-3) moving = true;
        markAnchor.current.position.set(0, markAt.current / g, -at.z / g);
      }
    }
    // its frames, beside it: just below it on the page
    if (pill.current) {
      // (where its lowest atom is seen, on the page, now: followed gently as it turns)
      const g = Math.max(grown.current.v, 1e-3);
      const at = shown.current;
      const v = new THREE.Vector3();
      let low = Infinity;
      for (let i = 0; i < n; i++) {
        // (an atom its look leaves out is not its lowest)
        const r = reachOf(i);
        if (r <= 0) continue;
        v.set(p[3 * i], p[3 * i + 1], p[3 * i + 2]).applyQuaternion(shownTurn.current!);
        const seen = seenAt(at.x + v.x, at.y + v.y, at.z + v.z, eye);
        low = Math.min(low, seen.y - r * seen.k);
      }
      const below = low - at.y;
      pillAt.current = pillAt.current == null || reshaped ? below : follow(pillAt.current, below, step, PILL_TAU);
      if (Math.abs(pillAt.current - below) > 1e-3) moving = true;
      pill.current.position.set(0, pillAt.current / g, -at.z / g);
    }
    if (moving) invalidate();
  }, FRAME_ORDER.molecules);

  /** The atoms' and bonds' finish, `f` of the way from the primary look's to the secondary's. */
  const finish = (f: number) => {
    const P = style.primary;
    const S = style.secondary;
    const mix = (a: number, b: number) => a + (b - a) * f;
    atomsMat.current.roughness = mix(P.roughness, S.roughness);
    atomsMat.current.metalness = mix(P.metalness, S.metalness);
    if (ribbonMat.current) {
      ribbonMat.current.roughness = atomsMat.current.roughness;
      ribbonMat.current.metalness = atomsMat.current.metalness;
    }
    const b = bondsMat.current;
    if (b) {
      b.roughness = atomsMat.current.roughness;
      b.metalness = atomsMat.current.metalness;
      b.color.set(P.bondColor).lerp(colour.set(S.bondColor), f);
    }
  };

  /** The measurements' marks and values, as the atoms are now. */
  const drawMeasures = (p: Float32Array) => {
    const mesh = pieces.current;
    const fanPoints: number[] = [];
    let used = 0;
    const texts: Record<number, string> = {};
    for (const [id, l] of measureLevels.current) {
      const marks = measureMarks(p, l.m.atoms);
      const r = MEASURE_RADIUS * WORLD_PER_ANGSTROM * l.v;
      for (const [s, e] of piecesOf(marks)) if (used < MEASURE_PIECES) placePiece(mesh, used++, s, e, r);
      for (const v of marks.fan) fanPoints.push(v.x, v.y, v.z);
      texts[id] = measureText(kindOf(l.m.atoms), measureValue(p, l.m.atoms));
      const label = labels.current.get(id);
      if (label?.anchor) label.anchor.position.copy(marks.label);
      if (label?.el) label.el.style.opacity = String(l.v);
    }
    mesh.count = used;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.visible = used > 0;
    const geometry = fans.current.geometry;
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(fanPoints, 3));
    geometry.computeBoundingSphere();
    fans.current.visible = fanPoints.length > 0;
    setMeasureTexts((was) => (same(was, texts) ? was : texts));
    // a measurement fully gone is let go
    setShownMeasures((was) => {
      const kept = was.filter((x) => measureLevels.current.has(x.id));
      return kept.length === was.length ? was : kept;
    });
  };

  return (
    <group ref={dolly} matrixAutoUpdate={false}>
    <group ref={placed}>
      <group ref={turned}>
        <instancedMesh
          ref={atoms}
          args={[undefined, undefined, n]}
          renderOrder={OVER_PAGE}
          frustumCulled={false}
          onPointerMove={(e) => {
            e.stopPropagation();
            if (e.instanceId != null && e.instanceId !== hoverAtom) setHoverAtom(e.instanceId);
          }}
          onPointerOut={() => setHoverAtom(null)}
        >
          <sphereGeometry args={[1, style.ballSegments, style.ballSegments]} />
          <meshStandardMaterial ref={atomsMat} transparent opacity={1} />
        </instancedMesh>
        {lineCount > 0 && (
          <instancedMesh
            ref={bonds}
            args={[undefined, undefined, lineCount]}
            renderOrder={OVER_PAGE}
            frustumCulled={false}
            // (pointed at, a bond says what a calculation found of it - where one did)
            onPointerMove={
              pairResults.length
                ? (e) => {
                    const b = e.instanceId != null ? lineBond[e.instanceId] : undefined;
                    if (b != null && b !== hoverBond) setHoverBond(b);
                  }
                : undefined
            }
            onPointerOut={pairResults.length ? () => setHoverBond(null) : undefined}
          >
            <cylinderGeometry args={[1, 1, 1, style.bondSegments]} />
            <meshStandardMaterial ref={bondsMat} transparent opacity={1} />
          </instancedMesh>
        )}
        {runs.length > 0 && (
          <>
            <mesh
              ref={ribbon}
              geometry={ribbonGeo}
              renderOrder={OVER_PAGE}
              frustumCulled={false}
              // (found under the pointer only while it is there to be seen)
              raycast={function (this: THREE.Mesh, rc, hits) {
                if (this.visible) THREE.Mesh.prototype.raycast.call(this, rc, hits);
              }}
              onPointerMove={(e) => {
                e.stopPropagation();
                const index = ribbonGeo.getIndex();
                const v = e.faceIndex != null && index ? index.getX(3 * e.faceIndex) : -1;
                const r = v >= 0 ? ribbonResidues.current[v] : undefined;
                if (r != null && r !== hoverResidue) setHoverResidue(r);
              }}
              onPointerOut={() => setHoverResidue(null)}
            >
              <meshStandardMaterial ref={ribbonMat} vertexColors transparent opacity={1} />
            </mesh>
            <mesh
              ref={ribbonHull}
              geometry={ribbonGeo}
              material={hullMat}
              renderOrder={OVER_PAGE - 1}
              frustumCulled={false}
              visible={false}
              raycast={() => {}}
            />
          </>
        )}
        {/* The outline, and a chosen atom's ring: the molecule, or the atom,
            drawn a little larger, before it and under it - what shows is a
            thin rim of light round its outline only, none where one part of
            it passes in front of another. */}
        <instancedMesh
          ref={atomHull}
          args={[undefined, undefined, n]}
          renderOrder={OVER_PAGE - 1}
          frustumCulled={false}
          visible={false}
          raycast={() => {}}
        >
          <sphereGeometry args={[1, style.ballSegments, style.ballSegments]} />
          <meshBasicMaterial transparent opacity={1} depthWrite={false} toneMapped={false} />
        </instancedMesh>
        {lineCount > 0 && (
          <instancedMesh
            ref={bondHull}
            args={[undefined, undefined, lineCount]}
            renderOrder={OVER_PAGE - 1}
            frustumCulled={false}
            visible={false}
            raycast={() => {}}
          >
            <cylinderGeometry args={[1, 1, 1, style.bondSegments]} />
            <meshBasicMaterial transparent opacity={1} depthWrite={false} toneMapped={false} />
          </instancedMesh>
        )}
        <mesh ref={linkedHull} renderOrder={OVER_PAGE - 1} frustumCulled={false} visible={false} raycast={() => {}}>
          <sphereGeometry args={[1, style.ballSegments, style.ballSegments]} />
          <meshBasicMaterial color={blue(LINKED_BLUE)} transparent opacity={1} depthWrite={false} toneMapped={false} />
        </mesh>
        <instancedMesh ref={markedHull} args={[undefined, undefined, n]} renderOrder={OVER_PAGE - 1} frustumCulled={false} visible={false} raycast={() => {}}>
          <sphereGeometry args={[1, style.ballSegments, style.ballSegments]} />
          <meshBasicMaterial color={blue(LINKED_BLUE)} transparent opacity={1} depthWrite={false} toneMapped={false} />
        </instancedMesh>
        {card && (
          <group ref={cardAnchor}>
            <PageHtml zIndexRange={[40, 30]} style={{ pointerEvents: "none" }}>
              <PointedCard3D ref={cardEl} title={card.title} groups={card.groups} />
            </PageHtml>
          </group>
        )}
        <instancedMesh
          ref={chosenHull}
          args={[undefined, undefined, n]}
          renderOrder={OVER_PAGE - 1}
          frustumCulled={false}
          visible={false}
          raycast={() => {}}
        >
          <sphereGeometry args={[1, style.ballSegments, style.ballSegments]} />
          <meshBasicMaterial color={blue(CHOSEN_BLUE)} transparent opacity={1} depthWrite={false} toneMapped={false} />
        </instancedMesh>
        {m.bonds.length > 0 && (
          <instancedMesh
            ref={chosenSleeves}
            args={[undefined, undefined, m.bonds.length]}
            renderOrder={OVER_PAGE - 1}
            frustumCulled={false}
            visible={false}
            raycast={() => {}}
          >
            <cylinderGeometry args={[1, 1, 1, style.bondSegments]} />
            <meshBasicMaterial color={blue(CHOSEN_BLUE)} transparent opacity={1} depthWrite={false} toneMapped={false} />
          </instancedMesh>
        )}
        {/* The measurements: lines and arcs, a faint fan within an angle,
            and each value written beside its marks */}
        <instancedMesh
          ref={pieces}
          args={[undefined, undefined, MEASURE_PIECES]}
          renderOrder={OVER_PAGE + 1}
          frustumCulled={false}
          visible={false}
          raycast={() => {}}
        >
          <cylinderGeometry args={[1, 1, 1, 6]} />
          <meshBasicMaterial color={COLORS.highlight} transparent opacity={1} toneMapped={false} />
        </instancedMesh>
        <mesh ref={fans} renderOrder={OVER_PAGE + 1} frustumCulled={false} visible={false} raycast={() => {}}>
          <bufferGeometry />
          <meshBasicMaterial
            color={COLORS.highlight}
            transparent
            opacity={MEASURE_FAN_OPACITY}
            side={THREE.DoubleSide}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
        {shownMeasures.map((x) => (
          <group
            key={x.id}
            ref={(g) => {
              const l = labels.current.get(x.id) ?? { anchor: null, el: null };
              l.anchor = g;
              labels.current.set(x.id, l);
            }}
          >
            {/* (the pointer goes through it to the molecule: what it is over
                is found by its box - Molecules3D - for its menu and the
                Delete key) */}
            <PageHtml center zIndexRange={[30, 20]} style={{ pointerEvents: "none" }}>
              {/* (as large as the page draws it: a chip on the page) */}
              <div className="meno-page-chip" style={{ transform: "scale(var(--page, 1))" }}>
                <div
                  ref={(el) => {
                    const l = labels.current.get(x.id) ?? { anchor: null, el: null };
                    l.el = el;
                    labels.current.set(x.id, l);
                  }}
                  data-measure3d={`${m.id}:${x.id}`}
                  className={`pointer-events-none px-1.5 rounded-full bg-white/90 border text-[11px] leading-[18px] text-gh-black tabular-nums whitespace-nowrap select-none shadow-sm transition-colors duration-150 ${
                    props.hoveredMeasure === x.id || props.editingMeasure === x.id ? "border-[#1e90ff]" : "border-gh-line"
                  }`}
                  style={{ opacity: 0 }}
                >
                  {props.editingMeasure === x.id && props.onSetMeasure ? (
                    <MeasureField
                      text={measureTexts[x.id] ?? ""}
                      onSet={(v) => props.onSetMeasure!(x.id, v)}
                      onDone={() => props.onEditDone?.()}
                    />
                  ) : (
                    (measureTexts[x.id] ?? "")
                  )}
                </div>
              </div>
            </PageHtml>
          </group>
        ))}
        {solid.frames.length > 1 && (
          <Overlay3D
            solid={solid}
            bonds={m.bonds}
            els={els}
            frame={frameOf(solid, frame)}
            on={!!props.overlay}
            radius={(style[look].atoms === "balls" ? style[look] : style.primary).bondRadius * WORLD_PER_ANGSTROM}
            weights={shares}
          />
        )}
        <Surface3D
          grid={props.surface ?? null}
          centre={centre}
          iso={props.surfaceIso ?? props.surface?.iso ?? 0.05}
          plus={style.surfacePlus}
          minus={style.surfaceMinus}
          renderOrder={OVER_PAGE + 2}
        />
        {stereoMarks.map((mark) => (
          <group
            key={mark.key}
            ref={(g) => {
              const l = stereoAnchors.current.get(mark.key) ?? { anchor: null, el: null };
              l.anchor = g;
              stereoAnchors.current.set(mark.key, l);
            }}
          >
            <PageHtml center zIndexRange={[30, 20]} style={{ pointerEvents: "none" }}>
              <div
                ref={(el) => {
                  const l = stereoAnchors.current.get(mark.key) ?? { anchor: null, el: null };
                  l.el = el;
                  stereoAnchors.current.set(mark.key, l);
                }}
                className="pointer-events-none select-none whitespace-nowrap text-accel-blue text-[12px] leading-none"
                style={{ opacity: 0, transform: STEREO_OFFSET, textShadow: STEREO_HALO, fontFamily: props.stereoFont.family }}
              >
                <StereoText cip={mark.text} parentheses={props.stereoFont.parentheses} />
              </div>
            </PageHtml>
          </group>
        ))}
      </group>
      {/* (rising out of its drawing, it shows its frames once it has risen) */}
      {/* (read from a calculation, it says what the calculation was - a
          single geometry's only when it is pointed at) */}
      {(solid.frames.length > 1 || props.onRemake || m.calc || m.edited) && !props.rising && (
        <group ref={pill}>
          {solid.frames.length > 1 || m.calc ? (
            <Frames3D
              count={solid.frames.length}
              frame={frameOf(solid, frame)}
              energies={m.energies?.length === solid.frames.length ? m.energies : undefined}
              open={props.framesOpen}
              onFrame={props.onFrame}
              below={
                (props.onRemake || props.list) && (
                  <>
                    {props.onRemake && <Changed onRemake={props.onRemake} />}
                    {props.list}
                  </>
                )
              }
              populations={shares}
              numbers={m.numbers?.length === solid.frames.length ? m.numbers : undefined}
              about={m.calc ? calcLine(m.calc) : undefined}
              results={m.calc?.results}
              unread={m.calc?.unread}
              made={m.made?.how}
              area={gl.domElement}
            />
          ) : (
            <PageHtml zIndexRange={[30, 20]}>
              <div
                className="meno-page-chip flex flex-col items-center"
                style={{ transform: "translate(-50%, calc(10px * var(--page, 1))) scale(var(--page, 1))", transformOrigin: "50% 0" }}
              >
                {m.edited && <Edited from={m.edited.from} />}
                {props.onRemake && <Changed onRemake={props.onRemake} />}
              </div>
            </PageHtml>
          )}
        </group>
      )}
      {/* (drawn without the hydrogens on its carbons, in either look, it says so
          above it while it is - its frames' chip is below - at any zoom: not a
          chip that goes when the page's words are too small, and never too
          small or too large to read) */}
      {(hides.primary || hides.secondary) && !props.rising && (
        <group ref={markAnchor}>
          <PageHtml zIndexRange={[30, 20]} style={{ pointerEvents: "none" }}>
            <div style={{ transform: `translate(-50%, calc(-100% - ${MARK_GAP_PX}px)) scale(clamp(0.75, var(--page, 1), 1.5))`, transformOrigin: "50% 100%" }}>
              <HiddenMark on={hides[look]} />
            </div>
          </PageHtml>
        </group>
      )}
    </group>
    </group>
  );
}

function same(a: Record<number, string>, b: Record<number, string>): boolean {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => a[Number(k)] === b[Number(k)]);
}

/**
 * An outline's material for a band of triangles: unlit, its surface pushed
 * out along its normals by `userData.grow` (page units) - drawn before the
 * band and under it, only a rim of it shows.
 */
function grownMaterial(): THREE.MeshBasicMaterial {
  const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 1, depthWrite: false, toneMapped: false });
  const grow = { value: 0 };
  mat.userData.grow = grow;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.grow = grow;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float grow;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\ntransformed += normalize(normal) * grow;");
  };
  return mat;
}

/** A geometry given a ribbon's triangles: in place where it holds as many already, so nothing is made anew as the ribbon moves. */
function fillGeometry(g: THREE.BufferGeometry, m: { positions: Float32Array; normals: Float32Array; colours: Float32Array; indices: Uint32Array }) {
  const set = (name: string, data: Float32Array) => {
    const a = g.getAttribute(name) as THREE.BufferAttribute | undefined;
    if (a && a.array.length === data.length) {
      (a.array as Float32Array).set(data);
      a.needsUpdate = true;
    } else g.setAttribute(name, new THREE.BufferAttribute(data, 3));
  };
  set("position", m.positions);
  set("normal", m.normals);
  set("color", m.colours);
  const index = g.getIndex();
  if (index && index.array.length === m.indices.length) {
    (index.array as Uint32Array).set(m.indices);
    index.needsUpdate = true;
  } else g.setIndex(new THREE.BufferAttribute(m.indices, 1));
  g.computeBoundingSphere();
}

const mtx = new THREE.Matrix4();
const colour = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
const q = new THREE.Quaternion();
const scale = new THREE.Vector3();
const mid = new THREE.Vector3();
const dir = new THREE.Vector3();

/** Each atom's ball where it is, as large as `radius` says, and `extra` larger all round - none for an atom its look leaves out. */
function placeAtoms(mesh: THREE.InstancedMesh, places: Float32Array, radius: (i: number) => number, extra: number | ((i: number) => number)) {
  const n = places.length / 3;
  for (let i = 0; i < n; i++) {
    const own = radius(i);
    const r = own > 0 ? own + (typeof extra === "number" ? extra : extra(i)) : 0;
    mtx.makeScale(r, r, r).setPosition(places[3 * i], places[3 * i + 1], places[3 * i + 2]);
    mesh.setMatrixAt(i, mtx);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
}

/** Each bond's lines, cylinders from end to end, `extra` thicker all round (by line, if it is a function). */
function placeBonds(mesh: THREE.InstancedMesh, lines: BondLine[], extra: number | ((k: number) => number)) {
  lines.forEach((line, k) => placePiece(mesh, k, line.a, line.b, line.r + (line.r > 0 ? (typeof extra === "number" ? extra : extra(k)) : 0)));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
}

/** A cylinder of radius `r` from `a` to `b`, as instance `k`. */
function placePiece(mesh: THREE.InstancedMesh, k: number, a: THREE.Vector3, b: THREE.Vector3, r: number) {
  dir.subVectors(b, a);
  const length = dir.length();
  q.setFromUnitVectors(UP, length > 1e-9 ? dir.divideScalar(length) : UP);
  mtx.compose(mid.addVectors(a, b).multiplyScalar(0.5), q, scale.set(r, length, r));
  mesh.setMatrixAt(k, mtx);
}

/**
 * Drawn without the hydrogens on its carbons: said for as long as it is,
 * under it, where it cannot be missed - the picture misrepresents the
 * molecule (the maintainer, 2026-10-10). It comes and goes as the molecule
 * goes over to a look that hides them or back, folding away.
 */
function HiddenMark({ on }: { on: boolean }) {
  return (
    <div
      // (as wide as it says: in a chip of no width of its own, the fold would cut it off)
      className="grid w-max transition-[grid-template-rows,opacity] duration-[120ms] ease-[var(--ease-meno)]"
      style={{ gridTemplateRows: on ? "1fr" : "0fr", opacity: on ? 1 : 0 }}
      aria-hidden={!on}
    >
      <div className="overflow-hidden">
        <div
          data-hidden-mark
          className="whitespace-nowrap rounded-full border border-accel-accent/50 bg-accel-lightaccent/90 px-2 text-[11px] leading-[20px] font-medium text-accel-accent shadow-sm"
        >
          {HIDDEN_MARK}
        </div>
      </div>
    </div>
  );
}

/** Made by editing a result: what from, said quietly under it - an edited result is no longer that result. */
function Edited({ from }: { from: string }) {
  return (
    <div className="mt-1.5 w-max whitespace-nowrap rounded-full border border-gh-line bg-white/90 px-2 text-[11px] leading-[20px] text-gh-gray shadow-sm">
      Edited from {from}
    </div>
  );
}

/**
 * A measurement's value being typed, in its chip: the number as it is now,
 * selected, and its unit; Enter sets what is typed (a comma or a true minus
 * read as well), Escape or leaving the field lets it go.
 */
function MeasureField({ text, onSet, onDone }: { text: string; onSet: (value: number) => void; onDone: () => void }) {
  const unit = text.endsWith("Å") ? " Å" : "°";
  const [value, setValue] = useState(() => text.replace(/\s*(Å|°)$/, "").replace("\u2212", "-"));
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    field.current?.focus();
    field.current?.select();
  }, []);
  const read = () => Number(value.trim().replace("\u2212", "-").replace(",", "."));
  return (
    <span className="inline-flex items-baseline">
      <input
        ref={field}
        value={value}
        inputMode="decimal"
        aria-label="Value"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") {
            const v = read();
            if (Number.isFinite(v)) onSet(v);
            else onDone();
          } else if (e.key === "Escape") onDone();
        }}
        onBlur={onDone}
        onPointerDown={(e) => e.stopPropagation()}
        className="pointer-events-auto w-[5ch] bg-transparent text-right tabular-nums outline-none select-text"
        style={{ width: `${Math.max(3, value.length + 0.5)}ch` }}
      />
      <span>{unit}</span>
    </span>
  );
}

/** Its drawing changed since it was made from it: said quietly, under its frames, with the way to make it again. */
function Changed({ onRemake }: { onRemake: () => void }) {
  return (
    <div
      className="mt-1.5 whitespace-nowrap rounded-full border border-gh-line bg-white/90 px-2 text-[11px] leading-[20px] text-gh-gray shadow-sm"
      onPointerDown={(e) => e.stopPropagation()}
    >
      Its drawing has changed ·{" "}
      <button className="text-accel-base hover:underline" onClick={onRemake}>
        Make again
      </button>
    </div>
  );
}
