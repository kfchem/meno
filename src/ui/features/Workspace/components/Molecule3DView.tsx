import clsx from "clsx";
import { longPressMs } from "../longPress";
import { PAGE_SIZED } from "../utils/pageScale";
import PageHtml from "./PageHtml";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import { COLORS } from "../../../theme/colors";
import { DURATION, TAU } from "../../../theme/motion";
import { usePresence } from "../../../theme/presence";
import { buttonHeld } from "./buttonHeld";
import { atomColour, ballCircles, bondRadiusOf, linedBall, lineWidth, LINE_LEAST_PX, type Style3D } from "../../../../lib/chem/style3d";
import type { Look3D, Measure3D, Molecule3D, Rising3D, Turn3D } from "../store/types";
import { menoShader } from "../utils/menoShader";
import { NOTES_SCALE, pageScale } from "../utils/pageScale";
import { bentStickGeometry, stickBends, withStickBend } from "../utils/stickBend";
import { imaginaryShown, withCentres, fadeStep, bentLinesOf, bondLines, bondReach, frameBondsOf, linesBetween, notesOf, plainNoteOf, frameOf, framesChipAt, labelSpot, linesOf, magnifiedOf, seenShare, sharesOf, sharesWithheld, solidOf, spotFollowed, valueSpots, widestWay, WORLD_PER_ANGSTROM, type BondLine, type DrawnBond, type LabelBox, type LabelFade, type SpotAbout, type Stick, type ValueAt } from "../utils/molecule3d";
import { MARK_MIN_PX, MARK_SCALE, marksReadAt, stereoTextEms } from "../chem/marks";
import { switchFade, switchStep } from "../utils/zoomSwitch";
import { LONG_PRESS_SHOW_MS } from "../constants";
import { kindOf, MEASURE_FAN_OPACITY, MEASURE_RADIUS, measureMarks, measureText, measureValue, piecesOf } from "../utils/measure3d";
import { eyeOf, FRAME_ORDER, seenAt } from "../utils/page";
import Frames3D from "./Frames3D";
import { STACK_SWAP_MS } from "../utils/stacks";
import Overlay3D from "./Overlay3D";
import StereoInk3D, { type StereoInk } from "./StereoInk3D";
import type { LayoutOptions } from "../../../../lib/chem/layout2d";
import { calcLine } from "../../../../lib/calc/output";
import { isMarked, pairValue, resultsOn, valueText } from "../../../../lib/calc/results";
import { cardGroupsOf } from "../../../../lib/calc/sources";
import { VIBRATION_PERIOD, vibrationOffsets } from "../utils/vibration3d";
import PointedCard3D, { type CardGroups } from "./PointedCard3D";
import Surface3D from "./Surface3D";
import { frameCentre } from "../utils/surfaceMesh";
import { ballLinesOf, ballNumbersOf, byAtomOf, fadeOf, teachBent, useShading3d } from "./shading3d";
import { JOINT_NUMBER_A, jointNumbersMesh, jointShare, jointUniforms, setJointAttributes } from "../utils/jointNumbers";
import { atomNumbersOf, digitsOf, NUMBER_HEIGHT_MOST_A, numberHeight, numberPlaces, numbersShownOn, setBallNumberPlaces, setBallNumbers, type AtomNumberKind, type AtomNumbersShown } from "../utils/atomNumbers";
import { outlineMaterial } from "../utils/outlineMaterial";
import type { Grid } from "../../../../lib/calc/results";
import { dollyAt, dollyMatrix, RISE_ACROSS_FROM, RISE_END, RISE_GROW, RISE_UP } from "../utils/rise";
import { chainRuns } from "../../../../lib/chem/biopolymer";
import { residueOnRay, ribbonMesh, ribbonSpheres, type RibbonSpheres } from "../utils/ribbon";
import { BALLS_NEAR, BALLS_SETTLE_MS, ballSegmentsFor, largeOn } from "../utils/largeDrawing";
import { typedValue } from "../utils/typedValue";
import { raycastCylinders, raycastSpheres } from "./raycast3d";
import { commitInstanceMatrices } from "./instances";
import { named3d } from "../workflow/selectionSet";
import { refinedFrame } from "../workflow/takeFrames";
import MagnifiedMark from "./MagnifiedMark";

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
const PLACE_TAU = TAU.place;
const FRAME_TAU = 0.06;
/** How quickly a vibration's swing eases in, and out as it comes to rest, in seconds. */
const VIBRATION_TAU = 0.25;
const LOOK_TAU = 0.08;
/**
 * The line round the balls (utils/outlineMaterial) is a ball drawn again,
 * as smooth as the balls up to LINES_FINE_MOST atoms, and of LINES_COARSE
 * segments past them: measured on 10 648 atoms and 30 492 bonds, a frame
 * took 14.0 ms with no line, 19.7 ms with lines as smooth as the balls (32
 * segments) and 16.4 ms with 16 - its rim strays from a circle by under a
 * pixel up to balls 40 pixels across.
 */
const LINES_FINE_MOST = 2000;
const LINES_COARSE = 16;
/** How gently the frames' chip follows the molecule's lowest point as it turns, in seconds. */
const PILL_TAU = 0.12;
/** How quickly a stereo label goes round its atom to the way it stands best, as the molecule turns, in seconds: as `TAU.move`. */
const STEREO_TAU = 0.07;
/** How long a stereo label takes to come into view, and to go out of it, in seconds: as the drawing's (CSS's `meno-fade-in` and `meno-fade-out`). */
const STEREO_FADE = DURATION.quick;
/** How many frames labels shown together wait at the most for all of them to be there, before those there fade in. */
const STEREO_WAIT_FRAMES = 30;
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
/** How quickly the numbers on the balls come and go, in seconds. */
const NUMBERS_TAU = 0.08;
/** The most atoms a molecule has for its numbers to be placed clear of the balls in front: past it, each in its ball's middle. */
const NUMBERS_PLACED_MOST = 600;
/** Every atom's number in its ball's middle, at its full size, not shown: x, y, share, shown, for each. */
const restingPlaces = (n: number) => Float32Array.from({ length: 4 * n }, (_, k) => (k % 4 === 2 ? 1 : 0));
/** How far apart two stereo labels keep at the least, in ems of their size. */
const STEREO_APART = 0.6;
const easeOutCubic = (u: number) => 1 - (1 - Math.min(Math.max(u, 0), 1)) ** 3;
const easeInOutCubic = (u: number) => {
  const t = Math.min(Math.max(u, 0), 1);
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
};
const SPRING = { stiffness: 150, damping: 15 };
/**
 * A stack going over from one molecule to the next (utils/stacks, as long as
 * STACK_SWAP_MS): how much larger the one let go of grows as it
 * comes towards the viewer and fades, and how much smaller the next starts
 * as it rises from behind; and how far each travels in depth, as a share of
 * its reach.
 */
const SWAP_NEAR = 0.35;
const SWAP_FAR = 0.3;
const SWAP_DEPTH = 1.5;
/** The most dashes and arc steps one molecule's measurements are drawn with. */
const MEASURE_PIECES = 2048;


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

/**
 * A copy splitting off the molecule it was made from (a value set on a
 * result, which is never edited itself): its atoms from that one's places
 * (`places`, laid as its own frames are) to its own, and its place from that
 * one's (`at`) to its own, over `seconds` from `start` (`performance.now()`);
 * `back`, undone, the other way - into that one, and gone.
 */
export type Split3D = { places: ArrayLike<number>; at: { x: number; y: number }; start: number; seconds: number; back?: boolean };

export type Molecule3DViewProps = {
  m: Molecule3D;
  style: Style3D;
  look: Look3D;
  frame: number;
  turn: Turn3D | undefined;
  /**
   * How it is turned, read as each frame is drawn, in place of `turn`: a turn that changes all the time, changed
   * without anything drawn again but the frame (StyleEditor/Preview3D's samples).
   */
  turning?: { readonly current: THREE.Quaternion };
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
  /** It is pointed at or selected: a single geometry's chip is seen then (Frames3D, which a click opens). */
  framesOpen: boolean;
  /** One of a set's: its notes kept short, within its room under the set's name (`NoteMark`). */
  inSet?: boolean;
  /** The foot of the set it is in, on the page: its frames chip, opened, goes down clear of it - never over the set's other molecules and their chips. */
  setFoot?: number;
  onFrame: (frame: number) => void;
  /** Its measurement under the pointer, by id; null, none. */
  hoveredMeasure: number | null;
  /** Taken away: it shrinks out of view, and says when it is gone. */
  leaving?: () => void;
  /** Rising out of its drawing: where it started, over the drawing, and when; and what is told once it has risen. */
  rising?: Rising3D;
  /** Splitting off the molecule it is a copy of, a value set on it (`Split3D`): over it at first, as it is, gliding out to its own place as its value goes over to the new one; or, `back`, undone, the other way, and gone. */
  split?: Split3D;
  /** Its atom whose drawing's atom is under the pointer: lit as if it were. */
  linkedAtom?: number | null;
  /** Its atom under the pointer, as it comes and goes. */
  onHoverAtom?: (atom: number | null) => void;
  /** Its drawing has changed since it was made from it: made again, asked for. */
  onRemake?: () => void;
  /** Its other frames - conformers - drawn over the one it shows. */
  overlay?: boolean;
  /** Its stereocentres' and double bonds' labels shown, by atom and bond index (document `stereoShownOf`); none, none. */
  stereoShown: { atoms: readonly number[]; bonds: readonly number[] } | null;
  /**
   * R and S as the drawing writes them: as large as its R and S, on the
   * page or on the screen; in its typeface; in parentheses or not; and how
   * far off its ball, as a share of the drawing's label size.
   */
  stereoFont: { size: number; units: "world" | "px"; family: string; parentheses: boolean; gap: number; opts?: LayoutOptions };
  /** The numbers shown on its atoms: of what kind, and on which (utils/atomNumbers); none, none. */
  atomNumbers?: AtomNumbersShown | null;
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
  /** What colours the surface, where another grid does, and the values its scale runs between. */
  surfaceColour?: { grid: Grid; from: number; to: number } | null;
  /** Its measurement whose value is being typed, by id: its chip a field; none, none. */
  editingMeasure?: number | null;
  /** One of a stack, the one it shows (utils/stacks): the stack's chip, not its own, says which (StackChip3D). */
  stacked?: boolean;
  /**
   * Its stack going over to it or from it (`dir`), since `start`
   * (`performance.now()`): the one let go of comes towards the viewer and
   * fades, and says so once gone (`onSwapped`); the next rises from behind.
   */
  swap?: { dir: "in" | "out"; start: number };
  onSwapped?: () => void;
  /** A value typed for a measurement, and Enter pressed: set it (utils/edit3d). */
  onSetMeasure?: (measure: number, value: number) => void;
  /** The typing let go of - Escape, or the field left. */
  onEditDone?: () => void;
  /** Shown `k` times as large as it is (docs/WORKSPACE.md, *Magnified display*) - a drag's run of them in one `gesture`: from its mark, while it is shown magnified. */
  onMagnify?: (k: number, gesture?: string) => void;
};

/**
 * One molecule in 3D: its atoms and bonds, in the 3D style's primary look or
 * its secondary, in the frame it shows; its outline lit as it is hovered,
 * moved or selected; its chosen atoms ringed; its measurements; and its frames beside it. What
 * changes goes over to what it is to be rather than jumping: another frame,
 * another look, its place on an undo, its coming and going.
 */
/** The imaginary frequencies each of a molecule's `n` frames was judged to have: a conformer set's, frame by frame; a single geometry's, its calculation's, of its last. */

export default function Molecule3DView(props: Molecule3DViewProps) {
  const { m, style, look, frame, turn, lit, selected, chosen, chosenBonds, holding, following, leaving } = props;
  const solid = solidOf(m, style);
  const n = m.atoms.length;
  // the bonds drawn: its bonds - or, where they go frame by frame, every
  // bond any frame has, each drawn as far as the frame shown has it, growing
  // and shrinking as frames go (utils/molecule3d `frameBondsOf`)
  const fb = useMemo(() => frameBondsOf(m), [m]);
  // (and a stick from a metal to each ring's or double bond's centre it is bound to, after them: withCentres)
  const drawn = useMemo(() => (fb || m.centres?.length ? { ...m, bonds: withCentres(m, fb ? fb.bonds : m.bonds) } : m), [m, fb]);
  const lineCount = useMemo(() => drawn.bonds.reduce((k, b) => k + linesOf(b.order), 0), [drawn.bonds]);
  const placed = useRef<THREE.Group>(null!);
  /** What it is drawn through while it rises: seen in perspective (utils/rise `dollyMatrix`). */
  const dolly = useRef<THREE.Group>(null!);
  const turned = useRef<THREE.Group>(null!);
  const atoms = useRef<THREE.InstancedMesh>(null!);
  const bonds = useRef<THREE.InstancedMesh>(null);
  const atomHull = useRef<THREE.InstancedMesh>(null!);
  // the style's line round every ball and stick (utils/outlineMaterial), and how wide it is drawn now and how far the
  // back fades - each gone over to as the style or the look changes
  const atomLines = useRef<THREE.InstancedMesh>(null);
  const bondLines3d = useRef<THREE.InstancedMesh>(null);
  const outlines = useMemo(() => ({ atoms: outlineMaterial(), bonds: outlineMaterial(), bent: outlineMaterial(true) }), []);
  useEffect(() => () => {
    outlines.atoms.material.dispose();
    outlines.bonds.material.dispose();
    outlines.bent.material.dispose();
  }, [outlines]);
  const lineLook = useRef<{ width: number; fade: number; byAtom: number; circles: [number, number, number]; circleWidth: number } | null>(null);
  // the atoms' colours as drawn now (linear RGB, three to an atom), and whether they are still going over to the style's
  const atomCols = useRef<Float32Array | null>(null);
  const recolour = useRef(true);
  // (the kind of number its balls show, or last showed: kept as they fade out)
  const numbersKind = useRef<AtomNumberKind>("order");
  // (how many digits each atom's number has; and, worked out each frame they are shown, where each goes)
  const numberDigits = useRef<Uint8Array>(new Uint8Array(0));
  const numbersWanted = useRef<Uint8Array>(new Uint8Array(0));
  // (and where an atom has no ball to carry its number - Sticks - drawn where the sticks meet: utils/jointNumbers)
  const numbersNow = useRef<Float32Array>(new Float32Array(0));
  const jointMesh = useMemo(() => jointNumbersMesh(n), [n]);
  useEffect(() => () => {
    jointMesh.geometry.dispose();
    (jointMesh.material as THREE.Material).dispose();
  }, [jointMesh]);
  const jointScratch = useRef<{ shown: Float32Array; at: THREE.Matrix4 } | null>(null);
  const numbersPlaced = useRef(false);
  const numbersAt = useRef("");
  const numberScratch = useRef<{ centres: Float32Array; radii: Float32Array; heights: Float32Array; digits: Uint8Array; places: Float32Array; was: Float32Array; now: Float32Array } | null>(null);
  const bondHull = useRef<THREE.InstancedMesh>(null);
  // the lines that curve in to a lone atom (utils/stickBend), drawn apart - their sticks, the line round them, their highlight: none, where none curves
  const bentSticks = useRef<THREE.InstancedMesh>(null);
  const bentLines3d = useRef<THREE.InstancedMesh>(null);
  const bentHull = useRef<THREE.InstancedMesh>(null);
  // how far each look's multiple bonds have gone over to one stick (0, as lines; 1, one stick)
  const oneLevel = useRef({ primary: style.primary.multipleBonds === "one" ? 1 : 0, secondary: style.secondary.multipleBonds === "one" ? 1 : 0 });
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
  // (its frames chip opened by a click: Frames3D says so - and kept over the rest until it is back where it hangs shut)
  const framesOpened = useRef(false);
  const [chipRaised, setChipRaised] = useState(false);
  const chipRaisedNow = useRef(false);
  const pillAt = useRef<number | null>(null);
  // where the mark of hydrogens left out stands: over its highest atom, followed gently
  const markAnchor = useRef<THREE.Group>(null);
  const markAt = useRef<number | null>(null);
  // where the mark of how large it is shown stands: at its top right, while it is shown magnified - and whether that mark is in use
  const magAnchor = useRef<THREE.Group>(null);
  const [magMarkActive, setMagMarkActive] = useState(false);
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
  // (its residues as spheres, which the pointer is found over: utils/ribbon)
  const ribbonHits = useRef<RibbonSpheres>({ residues: new Int32Array(0), centres: new Float32Array(0), radii: new Float32Array(0) });
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
  // how large it is shown (docs/WORKSPACE.md, *Magnified display*): going over to a magnification set, not jumping
  const magShown = useRef(magnifiedOf(m));

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
  // the segments round its balls: as the style has them - or, on a canvas
  // drawn lighter, as many as their size on the screen wants
  // (utils/largeDrawing `ballSegmentsFor`): more at once as they grow, fewer
  // once the zoom has settled
  const [segments, setSegments] = useState(style.ballSegments);
  // (by a loop: spread over a hundred thousand atoms, Math.max overruns the stack)
  const biggest = useMemo(() => {
    const most = (r: Float32Array) => r.reduce((a, b) => Math.max(a, b), 0);
    return { primary: most(solid.radii.primary), secondary: most(solid.radii.secondary) };
  }, [solid]);
  const ballSizing = useRef({ zoom: 0, since: 0, timer: 0 });
  useEffect(() => () => void (ballSizing.current.timer && window.clearTimeout(ballSizing.current.timer)), []);
  const atomsMat = useRef<THREE.MeshStandardMaterial>(null!);
  const bondsMat = useRef<THREE.MeshStandardMaterial>(null);
  // (the atoms either look leaves out, and whether it leaves out any)
  const hidden = solid.hidden;
  // (how much of atoms is drawn, as the molecule goes over from one look to
  // the other: of one a look leaves out, its ring and any measurement of it
  // go with it)
  const seenOf = (...atoms: number[]) => seenShare(hidden, atoms, fill.current);
  // what it says of itself, as it is drawn now, and in either look
  // (its notes - the one that says only how it is in grey, the rest as what is wrong. In a set, where molecules stand close
  //  under its name: that one left to its frames chip, which says its frames; the rest one short line, all of them as it
  //  is pointed at or selected - never over the set's name or a molecule beside it)
  const plain = useMemo(() => plainNoteOf(m), [m]);
  const notesNow = useMemo(() => notesOf(m, solid, look).filter((t) => !(props.inSet && t === plain)), [m, solid, look, props.inSet, plain]);
  const notesEver = useMemo(
    () => [...new Set([...notesOf(m, solid, "primary"), ...notesOf(m, solid, "secondary")])].filter((t) => !(props.inSet && t === plain)),
    [m, solid, props.inSet, plain],
  );
  const notesShort = !!props.inSet && !props.framesOpen;
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
  const bent = useMemo(() => bentLinesOf(drawn, solid), [drawn, solid]);
  const isBent = useMemo(() => (bent ? Uint8Array.from({ length: lineCount }, (_, k) => (bent.includes(k) ? 1 : 0)) : null), [bent, lineCount]);
  const bentGeometry = useMemo(() => (bent ? bentStickGeometry(style.bondSegments) : null), [bent, style.bondSegments]);
  const bentHullGeometry = useMemo(() => (bent ? bentStickGeometry(style.bondSegments) : null), [bent, style.bondSegments]);
  const bentHullMat = useMemo(() => {
    return menoShader(new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false }), "bent-hull", (shader) => withStickBend(shader));
  }, []);
  useEffect(() => () => bentGeometry?.dispose(), [bentGeometry]);
  useEffect(() => () => bentHullGeometry?.dispose(), [bentHullGeometry]);
  useEffect(() => () => bentHullMat.dispose(), [bentHullMat]);
  // (their own material, the straight ones' twin: so that straight sticks never pay for the bending)
  const bentMat = useMemo(() => new THREE.MeshStandardMaterial({ transparent: true, opacity: 1 }), []);
  useEffect(() => () => bentMat.dispose(), [bentMat]);
  useLayoutEffect(() => {
    if (bondsMat.current) teachBent(bentMat, bondsMat.current);
  });
  // how far each drawn bond is there, on its way to what the frame shown has
  const there = useRef<Float32Array>(Float32Array.from(fb ? fb.present[frameOf(solid, frame)] : []));
  if (fb && there.current.length !== fb.bonds.length) there.current = Float32Array.from(fb.present[frameOf(solid, frame)]);
  // (rising out of a drawing, it is its full size from the first: its atoms grow instead;
  // and coming or going in its stack, it is its full size too: STACK_SWAP_MS)
  const grown = useRef({ v: leaving || props.rising || props.swap || props.split ? 1 : 0, vel: 0, to: leaving && !props.split?.back ? 0 : 1 });
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
  // (where each measurement's value stands about its point as last drawn, which it glides on from: valueSpots)
  const valuesAbout = useRef(new Map<number, SpotAbout>());
  const [measureTexts, setMeasureTexts] = useState<Record<number, string>>({});
  const [shownMeasures, setShownMeasures] = useState<Measure3D[]>(m.measures ?? []);
  const dirty = useRef(true);
  // a conformer set's shares, as its chip shows them; and its atoms' elements
  const shares = useMemo(
    () => {
      const shares = sharesOf({ frames: m.frames, shares: m.shares, conformerSet: m.conformerSet, partOf: m.partOf, energies: m.energies, degeneracies: m.degeneracies, failed: m.failed, imaginary: m.imaginary, numbers: m.numbers, marksUnread: m.marksUnread });
      return shares?.length === solid.frames.length ? shares : undefined;
    },
    [m.frames, m.shares, m.conformerSet, m.partOf, m.energies, m.degeneracies, m.failed, m.imaginary, m.numbers, m.marksUnread, solid.frames.length],
  );
  const els = useMemo(() => m.atoms.map((a) => a.el), [m.atoms]);
  // where the frame shown is centred, in ångströms: what a surface on it is placed about
  const shownFrame = frameOf(solid, frame);
  const centre = useMemo(() => frameCentre({ atoms: m.atoms, frames: m.frames }, shownFrame), [m.atoms, m.frames, shownFrame]);
  // its stereocentres' and double bonds' labels: all, or those its drawing left open
  const stereoMarks = useMemo(() => {
    const st = m.stereo;
    const only = props.stereoShown;
    if (!st || !only) return [];
    // (with the atoms whose ways out it keeps clear of: a centre's
    // neighbours, a double bond's two and theirs)
    const near = (i: number) => m.bonds.flatMap((b) => (b.a1 === i ? [b.a2] : b.a2 === i ? [b.a1] : []));
    const out: { key: string; atoms: number[]; around: number[]; text: string }[] = [];
    for (const [i, text] of Object.entries(st.atoms)) {
      if (only.atoms.includes(Number(i))) out.push({ key: `a${i}`, atoms: [Number(i)], around: near(Number(i)), text });
    }
    for (const [i, text] of Object.entries(st.bonds)) {
      const b = m.bonds[Number(i)];
      if (b && only.bonds.includes(Number(i)))
        out.push({ key: `b${i}`, atoms: [b.a1, b.a2], around: [...new Set([...near(b.a1), ...near(b.a2)])], text });
    }
    return out;
  }, [m.stereo, m.bonds, props.stereoShown]);
  // (and each hidden kept a while as it fades out - longer than its fade,
  // which counts the frames drawn rather than the time)
  const stereoPresent = usePresence(stereoMarks, (mark) => mark.key, 2 * STEREO_FADE * 1000);
  const stereoNow = useRef(stereoPresent);
  stereoNow.current = stereoPresent;
  // (how far each is in view, and its fade: fadeStep)
  const stereoFades = useRef(new Map<string, LabelFade>());
  // (R and S all switched on or off as the view is far out or not, and faded over a short time: utils/zoomSwitch)
  const stereoRead = useRef(true);
  const stereoSeen = useRef(switchFade(true));
  // (frames waited for the labels shown together to be there)
  const stereoWaited = useRef(0);
  const stereoAnchors = useRef(new Map<string, { anchor: THREE.Group | null; ink: StereoInk | null }>());
  // (where each stereo label stands about its atom as last drawn, which it glides on from: spotFollowed)
  const stereoSpots = useRef(new Map<string, SpotAbout>());
  useEffect(() => {
    dirty.current = true;
    invalidate();
  }, [stereoMarks, invalidate]);

  // each atom's colour in either look, by its element as the look colours it (linear RGB)
  const atomGoals = useMemo(() => {
    const of = (look: Style3D["primary"]) => {
      const out = new Float32Array(3 * n);
      const col = new THREE.Color();
      for (let i = 0; i < n; i++) col.set(atomColour(m.atoms[i].el, look)).toArray(out, 3 * i);
      return out;
    };
    return { primary: of(style.primary), secondary: of(style.secondary) };
  }, [m.atoms, n, style.primary, style.secondary]);

  // the molecule itself changed - its atoms, its frames, the style: drawn afresh - its colours gone over to (below),
  // or, new, as they are at once
  useLayoutEffect(() => {
    if (!atomCols.current || atomCols.current.length !== 3 * n) {
      const now = new Float32Array(3 * n);
      const f = fill.current;
      for (let k = 0; k < now.length; k++) now[k] = atomGoals.primary[k] + (atomGoals.secondary[k] - atomGoals.primary[k]) * f;
      atomCols.current = now;
      const col = new THREE.Color();
      for (let i = 0; i < n; i++) atoms.current.setColorAt(i, col.fromArray(now, 3 * i));
      if (atoms.current.instanceColor) atoms.current.instanceColor.needsUpdate = true;
    }
    recolour.current = true;
    // (which balls carry lines, in either look: drawn as far as the look carries them)
    const lined = new Float32Array(n);
    for (let i = 0; i < n; i++) lined[i] = linedBall(m.atoms[i].el, style.primary) || linedBall(m.atoms[i].el, style.secondary) ? 1 : 0;
    atoms.current.geometry.setAttribute("ballLined", new THREE.InstancedBufferAttribute(lined, 1));
    // (each atom's number, of the kind shown - or that last shown, as it fades out - and which are to be shown)
    if (props.atomNumbers) numbersKind.current = props.atomNumbers.kind;
    const nums = atomNumbersOf(m, numbersKind.current);
    numbersNow.current = nums;
    setBallNumbers(atoms.current.geometry, nums);
    numberDigits.current = Uint8Array.from(nums, digitsOf);
    numbersWanted.current = numbersShownOn({ atoms: m.atoms, atomNumbers: props.atomNumbers ?? undefined });
    numbersPlaced.current = false;
    if ((atoms.current.geometry.getAttribute("ballNumberPlace")?.count ?? -1) !== n) setBallNumberPlaces(atoms.current.geometry, restingPlaces(n));
    if (places.current.length !== target.length) places.current = Float32Array.from(target);
    dirty.current = true;
    invalidate();
  }, [m, n, target, style, atomGoals, invalidate, props.atomNumbers]);

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

  useEffect(() => invalidate(), [lit, selected, look, frame, turn, props.atomNumbers, invalidate]);

  // (before the labels' Html places them, so that they are placed where the
  // atoms are drawn this frame, not the one before: FRAME_ORDER)
  useFrame((_, dt) => {
    const step = Math.min(dt, 1 / 30);
    let moving = false;
    // (its balls' segments, by their size on the screen where the canvas is drawn lighter; as the style has them otherwise, at once)
    {
      const lighter = largeOn(gl).lighter;
      const zoom = (camera as THREE.OrthographicCamera).zoom || 1;
      const bs = ballSizing.current;
      if (!bs.zoom || Math.abs(Math.log(zoom / bs.zoom)) >= BALLS_NEAR) {
        bs.zoom = zoom;
        bs.since = performance.now();
      }
      const want = lighter ? ballSegmentsFor(2 * biggest[look] * zoom * gl.getPixelRatio(), style.ballSegments) : style.ballSegments;
      // (more at once, as balls grow on the screen - fewer only once the zoom has settled)
      if (want !== segments) {
        const left = lighter && want < segments ? BALLS_SETTLE_MS - (performance.now() - bs.since) : 0;
        if (left <= 0) setSegments(want);
        else if (!bs.timer) {
          bs.timer = window.setTimeout(() => {
            bs.timer = 0;
            invalidate();
          }, left + 5);
        }
      }
    }
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
    // splitting off the molecule it is a copy of: from that one's places to its own - or, undone, back
    const split = props.split;
    const splitT = split ? Math.max(0, (performance.now() - split.start) / 1000 / split.seconds) : 1;
    const splitW = split ? easeInOutCubic(split.back ? 1 - splitT : splitT) : 1;
    if (split && split.places.length === p.length && splitT < 1) {
      for (let i = 0; i < p.length; i++) p[i] = split.places[i] + (target[i] - split.places[i]) * splitW;
      reshaped = moving = true;
    } else if (split?.back && split.places.length === p.length) {
      for (let i = 0; i < p.length; i++) p[i] = split.places[i];
      reshaped = true;
    } else if (rising?.flat && rising.flat.length === p.length && riseT < RISE_UP) {
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
    // (each look's multiple bonds going over to one stick, or back to lines, as its setting changes: not at a jump)
    for (const l of ["primary", "secondary"] as const) {
      const to = style[l].multipleBonds === "one" ? 1 : 0;
      const at = oneLevel.current[l];
      if (at === to) continue;
      const next = follow(at, to, step, LOOK_TAU);
      oneLevel.current[l] = Math.abs(next - to) < 0.002 ? to : next;
      reshaped = moving = true;
    }
    // (as large as it is shown, going over to it - every point of it so many times as far from its centre)
    {
      const to = magnifiedOf(m);
      const at = magShown.current;
      if (at !== to) {
        const next = Math.exp(follow(Math.log(at), Math.log(to), step, LOOK_TAU));
        magShown.current = Math.abs(Math.log(next / to)) < 1e-3 ? to : next;
        reshaped = moving = true;
      }
    }
    const mag = magShown.current;
    // (as high as it reaches - or where a turn of several put it)
    const height = m.at.z ?? (solid.reach.primary + (solid.reach.secondary - solid.reach.primary) * fill.current) * mag;
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
    // splitting off the one it is a copy of: from over it to its own place - or back over it, and gone
    else if (split && (splitT < 1 || split.back)) {
      const w = splitT < 1 ? splitW : 0;
      shown.current = new THREE.Vector3(split.at.x + (goal.x - split.at.x) * w, split.at.y + (goal.y - split.at.y) * w, goal.z);
      moving = true;
      if (split.back && splitT >= 1 && leaving) {
        // (back over the one it came from, the same as it: gone at once, unseen)
        placed.current.visible = false;
        leaving();
        invalidate();
        return;
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
    const turnTo = props.turning?.current ?? quaternion;
    if (!shownTurn.current || shownTurn.current.angleTo(turnTo) < TURN_FOLLOWED) {
      shownTurn.current = turnTo.clone();
    } else {
      shownTurn.current.slerp(turnTo, 1 - Math.exp(-step / PLACE_TAU));
      moving = true;
    }
    turned.current.quaternion.copy(shownTurn.current);
    turned.current.scale.setScalar(mag);
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
    // its stack going over to the next: towards the viewer and out of sight,
    // or up from behind into it
    const sw = props.swap;
    let seenBy = 1;
    if (sw) {
      const t = Math.min(1, (performance.now() - sw.start) / STACK_SWAP_MS);
      const u = easeInOutCubic(t);
      const near = sw.dir === "out" ? u : u - 1;
      placed.current.scale.multiplyScalar(sw.dir === "out" ? 1 + SWAP_NEAR * u : 1 - SWAP_FAR * (1 - u));
      placed.current.position.z += near * SWAP_DEPTH * solid.reach[look];
      seenBy = sw.dir === "out" ? 1 - u : u;
      if (t < 1) moving = true;
      else if (sw.dir === "out") {
        placed.current.visible = false;
        props.onSwapped?.();
        invalidate();
        return;
      }
    }
    if (atomsMat.current.opacity !== seenBy) {
      atomsMat.current.opacity = seenBy;
      if (bondsMat.current) bondsMat.current.opacity = seenBy;
      bentMat.opacity = seenBy;
      if (ribbonMat.current) ribbonMat.current.opacity = seenBy;
    }
    // the style's atoms' colours, its lines and its depth fade - gone over to as the style or the look changes, never
    // in a jump (the maintainer's rule: no abrupt changes)
    {
      const P = style.primary;
      const S = style.secondary;
      const ff = fill.current;
      const cols = atomCols.current;
      const recoloured = !!cols && (recolour.current || refinish);
      if (cols && recoloured) {
        let going = false;
        for (let k = 0; k < cols.length; k++) {
          const to = atomGoals.primary[k] + (atomGoals.secondary[k] - atomGoals.primary[k]) * ff;
          if (cols[k] === to) continue;
          cols[k] = follow(cols[k], to, step, LOOK_TAU);
          if (cols[k] !== to) going = true;
        }
        for (let i = 0; i < n; i++) atoms.current.setColorAt(i, colour.fromArray(cols, 3 * i));
        if (atoms.current.instanceColor) atoms.current.instanceColor.needsUpdate = true;
        recolour.current = going;
        if (going) moving = true;
      }
      const wantWidth = P.outline + (S.outline - P.outline) * ff;
      const wantFade = P.depthFade + (S.depthFade - P.depthFade) * ff;
      const byAtom = (l: Style3D["primary"]) => (l.bondColouring === "byAtom" ? 1 : 0);
      const wantByAtom = byAtom(P) + (byAtom(S) - byAtom(P)) * ff;
      const circlesOf = (l: Style3D["primary"]) => {
        const k = ballCircles(l);
        return [k >= 2 ? 1 : 0, k >= 2 ? 1 : 0, k >= 3 ? 1 : 0] as const;
      };
      const cp = circlesOf(P);
      const cs = circlesOf(S);
      const wantCircles = [0, 1, 2].map((a) => cp[a] + (cs[a] - cp[a]) * ff) as [number, number, number];
      const wantCircleWidth = P.ballLinesWidth + (S.ballLinesWidth - P.ballLinesWidth) * ff;
      const was = lineLook.current ?? { width: wantWidth, fade: wantFade, byAtom: wantByAtom, circles: wantCircles, circleWidth: wantCircleWidth };
      const ll = {
        width: follow(was.width, wantWidth, step, LOOK_TAU),
        fade: follow(was.fade, wantFade, step, LOOK_TAU),
        byAtom: follow(was.byAtom, wantByAtom, step, LOOK_TAU),
        circles: was.circles.map((c, a) => follow(c, wantCircles[a], step, LOOK_TAU)) as [number, number, number],
        circleWidth: follow(was.circleWidth, wantCircleWidth, step, LOOK_TAU),
      };
      if (ll.width !== wantWidth || ll.fade !== wantFade || ll.byAtom !== wantByAtom || ll.circleWidth !== wantCircleWidth || ll.circles.some((c, a) => c !== wantCircles[a])) moving = true;
      lineLook.current = ll;
      // (the lines on the balls: their circles, width and colour - the screen's sRGB)
      const bl = ballLinesOf(atomsMat.current);
      bl.amount.value.set(...ll.circles);
      // (in the balls' own units - their radii their instances' scale - so that they grow and shrink with the molecule)
      bl.width.value = ll.circleWidth * WORLD_PER_ANGSTROM;
      bl.least.value = LINE_LEAST_PX;
      bl.colour.value.set(P.ballLinesColor).lerp(colour.set(S.ballLinesColor), ff).convertLinearToSRGB();
      // (the sticks coloured by their atoms: each line's two ends' colours, as the atoms are coloured now)
      const bm = bonds.current;
      if (bm && bondsMat.current) {
        byAtomOf(bondsMat.current).value = ll.byAtom;
        const ends = bm.geometry.getAttribute("bondEndA") as THREE.InstancedBufferAttribute | undefined;
        if (ll.byAtom > 0 && cols && (recoloured || !ends || ends.count !== lineCount)) {
          const a = new Float32Array(3 * lineCount);
          const b = new Float32Array(3 * lineCount);
          for (let k = 0; k < lineCount; k++) {
            const bond = drawn.bonds[lineBond[k]];
            if (!bond) continue;
            for (let c = 0; c < 3; c++) {
              a[3 * k + c] = cols[3 * bond.a1 + c];
              b[3 * k + c] = cols[3 * bond.a2 + c];
            }
          }
          bm.geometry.setAttribute("bondEndA", new THREE.InstancedBufferAttribute(a, 3));
          bm.geometry.setAttribute("bondEndB", new THREE.InstancedBufferAttribute(b, 3));
          if (bent && bentGeometry) {
            const pick = (from: Float32Array) => Float32Array.from(bent.flatMap((k) => [from[3 * k], from[3 * k + 1], from[3 * k + 2]]));
            bentGeometry.setAttribute("bondEndA", new THREE.InstancedBufferAttribute(pick(a), 3));
            bentGeometry.setAttribute("bondEndB", new THREE.InstancedBufferAttribute(pick(b), 3));
          }
        }
      }
      const zoom = (camera as THREE.OrthographicCamera).zoom || 1;
      // (where the molecule's front and back stand in the camera's depth: what fades between)
      const centre = placed.current.getWorldPosition(fadeCentre).applyMatrix4(camera.matrixWorldInverse).z;
      // (a screen pixel in the camera's space at the molecule: an orthographic camera's - the canvas's - its zoom's;
      // a perspective one's - Settings' preview - as far off as the molecule stands)
      const pc = camera as THREE.PerspectiveCamera;
      const perPx = pc.isPerspectiveCamera ? (2 * Math.max(-centre, 1e-6) * Math.tan((pc.fov * Math.PI) / 360)) / Math.max(size.height, 1) : 1 / zoom;
      const reach = (solid.reach.primary + (solid.reach.secondary - solid.reach.primary) * ff) * placed.current.scale.x * magShown.current;
      const fades = [fadeOf(atomsMat.current, "atoms"), ...(bondsMat.current ? [fadeOf(bondsMat.current, "bonds")] : []), outlines.atoms.fade, outlines.bonds.fade, outlines.bent.fade];
      for (const u of fades) {
        u.fadeNear.value = centre + reach;
        u.fadeFar.value = centre - reach;
        u.fadeAmount.value = ll.fade;
      }
      const pairs: [THREE.InstancedMesh | null, THREE.InstancedMesh | null, ReturnType<typeof outlineMaterial>][] = [
        [atomLines.current, atoms.current, outlines.atoms],
        [bondLines3d.current, bonds.current, outlines.bonds],
        [bentLines3d.current, bentSticks.current, outlines.bent],
      ];
      for (const [lines, of, o] of pairs) {
        if (!lines) continue;
        lines.visible = ll.width > 1e-5 && !!of?.visible;
        if (!lines.visible || !of) continue;
        // (the balls' or sticks' own instances: where they are, it is)
        if (lines.instanceMatrix !== of.instanceMatrix) lines.instanceMatrix = of.instanceMatrix;
        lines.count = of.count;
        // (in the molecule's units, as large as it is drawn now - never under the least pixels)
        o.width.value = lineWidth(ll.width, WORLD_PER_ANGSTROM * placed.current.scale.x * magShown.current, perPx);
        o.material.color.set(P.outlineColor).lerp(colour.set(S.outlineColor), ff);
        o.material.opacity = seenBy;
      }
    }
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
      const u = Math.min(1, Math.max(0, (t - LONG_PRESS_SHOW_MS) / (longPressMs() - LONG_PRESS_SHOW_MS)));
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

    // (the atoms a very large drawing is counted by - utils/largeDrawing - both looks' while it goes over from one to the other)
    const { counted } = solid;
    atoms.current.userData.counted = fill.current === 0 ? counted.primary : fill.current === 1 ? counted.secondary : Math.max(counted.primary, counted.secondary);
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
      // (each look's ends - going over from one to the other, line by line)
      const f = fill.current;
      // (a look's lines - as one stick, as lines, or going over from one to the other: the side lines going into the middle one)
      const linesOf3d = (l: "primary" | "secondary") => {
        const k = oneLevel.current[l];
        const ends = solid.ends[l];
        return k <= 0 ? bondLines(drawn, p, bondR, ends) : k >= 1 ? bondLines(drawn, p, bondR, ends, true) : linesBetween(bondLines(drawn, p, bondR, ends), bondLines(drawn, p, bondR, ends, true), k);
      };
      const same = solid.ends.primary === solid.ends.secondary && oneLevel.current.primary === oneLevel.current.secondary;
      const all = same || f <= 0 ? linesOf3d("primary") : f >= 1 ? linesOf3d("secondary") : linesBetween(linesOf3d("primary"), linesOf3d("secondary"), f);
      if (fb) all.forEach((l, k) => (l.r *= there.current[lineBond[k]] ?? 1));
      if (leaves) all.forEach((l, k) => (l.r *= keptOf(drawn.bonds[lineBond[k]])));
      return all;
    };
    let lines: BondLine[] | null = null;
    if (reshaped) {
      placeAtoms(atoms.current, p, radius, 0);
      numbersPlaced.current = false;
      if (bonds.current) {
        lines = linesNow();
        // (those that curve drawn apart: none of them among the straight)
        placeBonds(bonds.current, isBent ? lines.map((l, k) => (isBent[k] ? { ...l, r: 0 } : l)) : lines, 0);
        bonds.current.visible = bondsShown;
        if (bent && bentSticks.current && bentGeometry) {
          const these = bent.map((k) => lines![k]);
          placeBonds(bentSticks.current, these, 0);
          bentGeometry.setAttribute("stickBend", new THREE.InstancedBufferAttribute(stickBends(these), 4));
          bentSticks.current.visible = bondsShown;
        }
      }
    }
    // its ribbons: as large as the look it is going over to has them - none,
    // where it draws the chains as atoms - made afresh as the atoms move
    const ribbonFrom = solid.ribbons.primary ? 1 : 0;
    const ribbonScale = (ribbonFrom + ((solid.ribbons.secondary ? 1 : 0) - ribbonFrom) * fill.current) * risen.current;
    if (runs.length && m.biopolymer && (reshaped || dirty.current || ribbonMade.current !== ribbonScale)) {
      const made = ribbonMesh(p, runs, m.biopolymer, style.ribbonColours, ribbonScale, WORLD_PER_ANGSTROM);
      fillGeometry(ribbonGeo, made);
      ribbonHits.current = ribbonSpheres(made);
      ribbonMade.current = ribbonScale;
    }
    const ribbonsShown = runs.length > 0 && ribbonScale > 1e-3;
    if (ribbon.current) ribbon.current.visible = ribbonsShown;
    // (as wide in pixels whatever the zoom - and, in perspective, however
    // high it stands)
    const eye = eyeOf(camera);
    // (and, for what is drawn inside it, in its own units - as large as it is shown)
    const px = 1 / (camera.zoom * seenAt(0, 0, height, eye).k);
    // the numbers on the balls: each in the part of its ball not behind
    // another, or a stick, as it is seen now - gliding there, and coming and
    // going, each on its own
    {
      const bn = ballNumbersOf(atomsMat.current);
      const want = numbersWanted.current;
      let sc = numberScratch.current;
      if (!sc || sc.radii.length !== n) {
        sc = numberScratch.current = {
          centres: new Float32Array(3 * n),
          radii: new Float32Array(n),
          heights: new Float32Array(n),
          digits: new Uint8Array(n),
          places: new Float32Array(3 * n),
          was: new Float32Array(3 * n),
          now: restingPlaces(n),
        };
        numbersPlaced.current = false;
      }
      let any = false;
      for (let i = 0; i < n && !any; i++) any = want[i] === 1 || sc.now[4 * i + 3] > 0;
      // (on the balls, or where the sticks meet - gone over from one to the other as the look is)
      const share = jointShare(style.primary.atoms === "sticks", style.secondary.atoms === "sticks", fill.current);
      bn.shown.value = any ? 1 - share : 0;
      const ju = jointUniforms(jointMesh);
      ju.shown.value = any ? share : 0;
      if (any && share > 0) {
        ju.pxPer.value = 1 / px;
        ju.height.value = JOINT_NUMBER_A * WORLD_PER_ANGSTROM * risen.current;
        // (in front of where the sticks meet: past the sticks' own round ends)
        ju.lift.value = bondR * 1.2;
        const js = (jointScratch.current ??= { shown: new Float32Array(n), at: new THREE.Matrix4() });
        if (js.shown.length !== n) js.shown = new Float32Array(n);
        for (let i = 0; i < n; i++) {
          js.shown[i] = sc.now[4 * i + 3];
          jointMesh.setMatrixAt(i, js.at.makeTranslation(p[3 * i], p[3 * i + 1], p[3 * i + 2]));
        }
        jointMesh.instanceMatrix.needsUpdate = true;
        setJointAttributes(jointMesh, numbersNow.current.length === n ? numbersNow.current : new Float32Array(n), js.shown, atomCols.current && atomCols.current.length === 3 * n ? atomCols.current : new Float32Array(3 * n));
      }
      bn.pxPer.value = 1 / px;
      bn.most.value = NUMBER_HEIGHT_MOST_A * WORLD_PER_ANGSTROM;
      if (any) {
        const mesh = atoms.current;
        mesh.updateWorldMatrix(true, false);
        const view = new THREE.Matrix4().multiplyMatrices(camera.matrixWorldInverse, mesh.matrixWorld);
        const scale = new THREE.Vector3().setFromMatrixScale(view).x;
        const key = view.elements.join() + fill.current + risen.current + bondR;
        if (!numbersPlaced.current || numbersAt.current !== key) {
          numbersPlaced.current = true;
          numbersAt.current = key;
          const v = new THREE.Vector3();
          for (let i = 0; i < n; i++) {
            v.set(p[3 * i], p[3 * i + 1], p[3 * i + 2]).applyMatrix4(view);
            sc.centres[3 * i] = v.x;
            sc.centres[3 * i + 1] = v.y;
            sc.centres[3 * i + 2] = v.z;
            const r = radius(i);
            sc.radii[i] = r * scale;
            // (placed only where it is shown, or going)
            sc.digits[i] = want[i] || sc.now[4 * i + 3] > 0 ? (numberDigits.current[i] ?? 0) : 0;
            sc.heights[i] = numberHeight(sc.digits[i], r / WORLD_PER_ANGSTROM);
            sc.was[3 * i] = sc.now[4 * i];
            sc.was[3 * i + 1] = sc.now[4 * i + 1];
            sc.was[3 * i + 2] = sc.now[4 * i + 3] > 0 ? sc.now[4 * i + 2] : 0;
          }
          if (n <= NUMBERS_PLACED_MOST) numberPlaces(sc.centres, sc.radii, sc.heights, sc.digits, sc.places, bondsShown ? { bonds: drawn.bonds, r: bondR * scale } : null, sc.was);
          else for (let i = 0; i < n; i++) sc.places.set([0, 0, 1], 3 * i);
        }
        let still = true;
        for (let i = 0; i < n; i++) {
          const w = follow(sc.now[4 * i + 3], want[i], step, NUMBERS_TAU);
          sc.now[4 * i + 3] = Math.abs(w - want[i]) < 1e-3 ? want[i] : w;
          // (one coming in starts where it is to be; one shown glides there)
          for (let k = 0; k < 3; k++) {
            const to = sc.places[3 * i + k];
            const at = sc.now[4 * i + k];
            const g = sc.now[4 * i + 3] > 0 && w > 1e-3 ? follow(at, to, step, NUMBERS_TAU) : to;
            sc.now[4 * i + k] = Math.abs(g - to) < 1e-3 ? to : g;
            if (sc.now[4 * i + k] !== to) still = false;
          }
          if (sc.now[4 * i + 3] !== want[i]) still = false;
        }
        setBallNumberPlaces(mesh.geometry, sc.now);
        if (!still) moving = true;
      }
    }
    const pxIn = px / mag;
    // the outline
    const outPx = Math.max(outlineAt(level.current, OUTLINE_PX), SELECTED_PX * selLevel.current);
    const lightOn = outPx > 0.02 || holdShown;
    atomHull.current.visible = lightOn;
    if (bondHull.current) bondHull.current.visible = lightOn && bondsShown;
    if (bentHull.current) bentHull.current.visible = lightOn && bondsShown;
    if (ribbonHull.current) ribbonHull.current.visible = lightOn && ribbonsShown;
    if (lightOn && (reshaped || relit || dirty.current || holdShown)) {
      const w = outPx * pxIn;
      const wide = SELECTED_PX * pxIn;
      placeAtoms(atomHull.current, p, radius, holdShown ? (i) => Math.max(w, wide * h[i]) : w);
      if (bondHull.current) {
        const all = lines ?? linesNow();
        const extra = holdShown
          ? (k: number) => {
              const b = drawn.bonds[lineBond[k]];
              return Math.max(w, wide * Math.min(h[b.a1], h[b.a2]));
            }
          : w;
        placeBonds(bondHull.current, isBent ? all.map((l, k) => (isBent[k] ? { ...l, r: 0 } : l)) : all, extra);
        // (round a curving line, curving as it does)
        if (bent && bentHull.current && bentHullGeometry) {
          const these = bent.map((k) => all[k]);
          const theirs = typeof extra === "number" ? extra : (j: number) => extra(bent[j]);
          placeBonds(bentHull.current, these, theirs);
          bentHullGeometry.setAttribute("stickBend", new THREE.InstancedBufferAttribute(stickBends(these, theirs), 4));
        }
      }
      const k = 1 - (1 - outlineAt(level.current, OUTLINE_BLUE)) * (1 - SELECTED_BLUE * Math.max(selLevel.current, holdMost));
      const colour = blue(k);
      (atomHull.current.material as THREE.MeshBasicMaterial).color.copy(colour);
      if (bondHull.current) (bondHull.current.material as THREE.MeshBasicMaterial).color.copy(colour);
      bentHullMat.color.copy(colour);
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
        mesh.scale.setScalar(radius(i) + LINKED_PX * pxIn * l.v);
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
          const r = v > 0.001 ? radius(i) + LINKED_PX * pxIn * v : 0;
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
      const off = (card.atoms.length === 1 ? (radius(card.atoms[0]) * g) / pxIn : 0) + CARD_OFF_PX;
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
        const v = (rings.current.get(i)?.v ?? 0) * seenOf(i);
        const r = v > 0.001 ? radius(i) + CHOSEN_PX * pxIn * v : 0;
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
        placePiece(sleeveMesh, i, a, b, v > 0.001 ? bondReach(bond.order, bondR) + CHOSEN_PX * pxIn * v : 0);
      });
      commitInstanceMatrices(sleeveMesh);
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
    // the measurements' values: on their points - or, where one is in the
    // way of another, off it and clear of it, kept there while that is
    // clear (valueSpots) - and glided where they go, as the stereo labels are
    const valuesPlaced: LabelBox[] = [];
    if (labels.current.size) {
      const w = new THREE.Vector3();
      // (a value's chip grows and shrinks with the page, from its middle: its size on the screen is its own times that)
      const chipScale = pageScale(camera.zoom || 1);
      const values: (ValueAt & { id: number; el: HTMLDivElement })[] = [];
      for (const [id, l] of labels.current) {
        const level = measureLevels.current.get(id);
        const parent = l.anchor?.parent;
        if (!l.anchor || !parent || !l.el || !level || level.v < 0.5) continue;
        // (each value's size read when its text is new)
        const text = l.el.textContent ?? "";
        let box = valueSizes.current.get(id);
        if (!box || box.text !== text) {
          box = { text, w: l.el.offsetWidth, h: l.el.offsetHeight };
          valueSizes.current.set(id, box);
        }
        parent.updateWorldMatrix(true, false);
        const onScreen = (x: number, y: number, z: number) => {
          parent.localToWorld(w.set(x, y, z)).project(camera);
          return { x: ((w.x + 1) / 2) * size.width, y: ((1 - w.y) / 2) * size.height };
        };
        const o = onScreen(l.anchor.position.x, l.anchor.position.y, l.anchor.position.z);
        const own = level.m.atoms.map((i) => onScreen(p[3 * i], p[3 * i + 1], p[3 * i + 2]));
        // (the way off: square to a distance's line, out from an angle's atoms)
        const way =
          own.length === 2
            ? { x: own[0].y - own[1].y, y: own[1].x - own[0].x }
            : { x: o.x - own.reduce((t, q) => t + q.x, 0) / own.length, y: o.y - own.reduce((t, q) => t + q.y, 0) / own.length };
        values.push({ o, half: { x: (box.w / 2) * chipScale, y: (box.h / 2) * chipScale }, way: Math.hypot(way.x, way.y) > 1e-9 ? way : { x: 0, y: -1 }, was: valuesAbout.current.get(id), id, el: l.el });
      }
      const goals = valueSpots(values);
      values.forEach((v, k) => {
        const about = v.was ? spotFollowed(v.was, goals[k], step, STEREO_TAU) : goals[k];
        valuesAbout.current.set(v.id, about);
        if (about.a !== goals[k].a || about.r !== goals[k].r) moving = true;
        const dx = about.r * Math.cos(about.a);
        const dy = about.r * Math.sin(about.a);
        v.el.style.transform = dx || dy ? `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)` : "";
        valuesPlaced.push({ x: v.o.x + dx, y: v.o.y + dy, hx: v.half.x, hy: v.half.y });
      });
    }
    // the stereo labels, on their atom - a double bond's, at its middle - and
    // set off from it on the screen, as the drawing's are: clear of its ball,
    // the widest way out between its bonds as it is seen now - or the
    // nearest way that keeps clear of the other atoms, the bonds, the
    // measurements' values and the labels already placed - and as large as
    // the drawing's letters
    if (stereoNow.current.length) {
      const g = Math.max(grown.current.v, 1e-3);
      const natural = props.stereoFont.units === "px" ? props.stereoFont.size : props.stereoFont.size / px;
      const font = Math.max(MARK_MIN_PX, natural);
      // (the view far out: switched as the drawing's are, past their least size - marksReadAt - and faded over a short time)
      stereoRead.current = marksReadAt(stereoRead.current, natural);
      if (switchStep(stereoSeen.current, stereoRead.current, step)) moving = true;
      const seenAtZoom = stereoSeen.current.v;
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
      // (those shown together fade in together, the molecule moving or not:
      // none starts before every one of them is there to be seen - each
      // label's element is made a frame or so after the label is asked for)
      const allThere = stereoNow.current.every(({ item }) => {
        const l = stereoAnchors.current.get(item.key);
        return !!l?.anchor?.parent && !!l.ink;
      });
      if (allThere) stereoWaited.current = 0;
      else if (stereoWaited.current++ < STEREO_WAIT_FRAMES) moving = true;
      const goIn = allThere || stereoWaited.current > STEREO_WAIT_FRAMES;
      for (const { item: mark, leaving } of stereoNow.current) {
        const l = stereoAnchors.current.get(mark.key);
        if (!l?.anchor) continue;
        const at = l.anchor.position.set(0, 0, 0);
        for (const i of mark.atoms) at.add(v.set(p[3 * i], p[3 * i + 1], p[3 * i + 2]));
        at.divideScalar(mark.atoms.length);
        const parent = l.anchor.parent;
        const ink = l.ink;
        if (!ink || !parent) continue;
        // (faded in, or out - in the same time either way, eased)
        let fade = stereoFades.current.get(mark.key);
        if (!fade) stereoFades.current.set(mark.key, (fade = { v: 0, from: 0, to: 0, t: 0 }));
        if (fadeStep(fade, leaving ? 0 : 1, goIn, step, STEREO_FADE)) moving = true;
        const opacity = risen.current * fade.v * seenAtZoom;
        parent.updateWorldMatrix(true, false);
        if (!balls) {
          balls = [];
          for (let i = 0; i < n; i++) balls.push({ ...onScreen(parent, p[3 * i], p[3 * i + 1], p[3 * i + 2]), r: (radius(i) * g) / pxIn });
          if (bondsShown) {
            const shownBonds = fb ? drawn.bonds.filter((_, i) => there.current[i] > 0.5) : m.bonds;
            for (const b of shownBonds) if (balls[b.a1]?.r && balls[b.a2]?.r) sticks.push({ a: balls[b.a1], b: balls[b.a2], r: (bondR * g) / pxIn });
          }
          // (the measurements' values, where they are written now: placed above)
          placedLabels.push(...valuesPlaced);
        }
        const o = onScreen(parent, at.x, at.y, at.z);
        const way = widestWay(mark.around.map((i) => Math.atan2(balls![i].y - o.y, balls![i].x - o.x)));
        // (out past the ball - or the bond - as far as the drawing's style
        // sets its R and S off its atoms, of its labels' size; the letters'
        // box a capital's height, and a little for the halo)
        const reach = ((mark.atoms.length === 1 ? radius(mark.atoms[0]) : bondR) * g) / pxIn + (props.stereoFont.gap * font) / MARK_SCALE;
        const half = { x: font * (stereoTextEms(mark.text, props.stereoFont.parentheses) / 2 + 0.1), y: font * 0.45 };
        // (every atom near it but its own - a double bond's two among them)
        const own = mark.atoms.length === 1 ? mark.atoms[0] : -1;
        const others = balls.filter((b, i) => i !== own && b.r > 0 && Math.hypot(b.x - o.x, b.y - o.y) < reach + 4 * half.x + b.r);
        const best = labelSpot(o, reach, half, way, others, placedLabels, sticks);
        // (not there at once where its best way changes as the molecule turns: glided round the atom to it, as everything moves)
        const goal = { a: Math.atan2(best.y - o.y, best.x - o.x), r: Math.hypot(best.x - o.x, best.y - o.y) };
        const was = stereoSpots.current.get(mark.key);
        const about = was ? spotFollowed(was, goal, step, STEREO_TAU) : goal;
        stereoSpots.current.set(mark.key, about);
        if (about.a !== goal.a || about.r !== goal.r) moving = true;
        const spot = { ...best, x: o.x + about.r * Math.cos(about.a), y: o.y + about.r * Math.sin(about.a) };
        // (the next keeps a little way off it, not just clear: two side by
        // side read as one, and as either atom's)
        placedLabels.push({ ...spot, hx: spot.hx + STEREO_APART * font, hy: spot.hy + STEREO_APART * font });
        ink.place(spot, font, opacity);
      }
    }
    // (the fades of those gone, forgotten)
    if (stereoFades.current.size > stereoNow.current.length) {
      const here = new Set(stereoNow.current.map((e) => e.key));
      for (const key of stereoFades.current.keys()) if (!here.has(key)) stereoFades.current.delete(key);
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
        v.set(p[3 * i], p[3 * i + 1], p[3 * i + 2]).applyQuaternion(shownTurn.current!).multiplyScalar(mag);
        const seen = seenAt(at.x + v.x, at.y + v.y, at.z + v.z, eye);
        high = Math.max(high, seen.y + r * mag * seen.k);
      }
      if (Number.isFinite(high)) {
        const above = high - at.y;
        markAt.current = markAt.current == null || reshaped ? above : follow(markAt.current, above, step, PILL_TAU);
        if (Math.abs(markAt.current - above) > 1e-3) moving = true;
        markAnchor.current.position.set(0, markAt.current / g, -at.z / g);
      }
    }
    // the mark of how large it is shown: at its top right on the page
    if (magAnchor.current) {
      const g = Math.max(grown.current.v, 1e-3);
      const at = shown.current;
      const v = new THREE.Vector3();
      let right = -Infinity;
      let top = -Infinity;
      for (let i = 0; i < n; i++) {
        const r = reachOf(i);
        if (r <= 0) continue;
        v.set(p[3 * i], p[3 * i + 1], p[3 * i + 2]).applyQuaternion(shownTurn.current!).multiplyScalar(mag);
        const seen = seenAt(at.x + v.x, at.y + v.y, at.z + v.z, eye);
        right = Math.max(right, seen.x + r * mag * seen.k);
        top = Math.max(top, seen.y + r * mag * seen.k);
      }
      if (Number.isFinite(right)) magAnchor.current.position.set((right - at.x) / g, (top - at.y) / g, -at.z / g);
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
        v.set(p[3 * i], p[3 * i + 1], p[3 * i + 2]).applyQuaternion(shownTurn.current!).multiplyScalar(mag);
        const seen = seenAt(at.x + v.x, at.y + v.y, at.z + v.z, eye);
        low = Math.min(low, seen.y - r * mag * seen.k);
      }
      // (opened, clear of its set: from the set's foot down - followed there, and back up as it shuts)
      const below = framesChipAt(low, framesOpened.current ? props.setFoot : undefined) - at.y;
      pillAt.current = pillAt.current == null || reshaped ? below : follow(pillAt.current, below, step, PILL_TAU);
      if (Math.abs(pillAt.current - below) > 1e-3) moving = true;
      // (shut and back where it hangs: no longer over the rest)
      else if (chipRaisedNow.current && !framesOpened.current) {
        chipRaisedNow.current = false;
        setChipRaised(false);
      }
      pill.current.position.set(0, pillAt.current / g, -at.z / g);
    }
    if (moving) invalidate();
  }, FRAME_ORDER.molecules);

  // its hollows shaded and its shadow cast, as it stands now (after the frame
  // above has placed its atoms)
  useShading3d({ turned, atoms, bonds, ribbon, atomsMat, bondsMat, m: drawn, solid, frame: frameOf(solid, frame), style, fill, bent: { geometry: bentGeometry, lines: bent } });

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
      bentMat.roughness = b.roughness;
      bentMat.metalness = b.metalness;
      bentMat.color.copy(b.color);
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
      // (of an atom the look leaves out: going with it)
      const seen = l.v * seenOf(...l.m.atoms);
      const r = MEASURE_RADIUS * WORLD_PER_ANGSTROM * seen;
      if (seen > 0.001) {
        for (const [s, e] of piecesOf(marks)) if (used < MEASURE_PIECES) placePiece(mesh, used++, s, e, r);
        for (const v of marks.fan) fanPoints.push(v.x, v.y, v.z);
      }
      texts[id] = measureText(kindOf(l.m.atoms), measureValue(p, l.m.atoms));
      const label = labels.current.get(id);
      if (label?.anchor) label.anchor.position.copy(marks.label);
      if (label?.el) label.el.style.opacity = String(seen);
      // (its value being written, gone out of sight: written no more)
      if (props.editingMeasure === id && seen < 0.5 && l.v > 0.5) props.onEditDone?.();
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
          receiveShadow
          // (each atom met where its sphere is, worked out exactly, not by its triangles: components/raycast3d)
          raycast={function (this: THREE.InstancedMesh, rc, hits) {
            raycastSpheres(this, rc, hits);
          }}
          onPointerMove={(e) => {
            e.stopPropagation();
            if (e.instanceId != null && e.instanceId !== hoverAtom) setHoverAtom(e.instanceId);
          }}
          onPointerOut={() => setHoverAtom(null)}
        >
          <sphereGeometry args={[1, segments, segments]} />
          <meshStandardMaterial ref={atomsMat} transparent opacity={1} />
        </instancedMesh>
        {/* atom numbers where the sticks meet, where there are no balls to carry them (utils/jointNumbers) */}
        <primitive object={jointMesh} renderOrder={OVER_PAGE + 1} />
        {/* the style's line round every ball (utils/outlineMaterial) */}
        <instancedMesh ref={atomLines} args={[undefined, outlines.atoms.material, n]} renderOrder={OVER_PAGE} frustumCulled={false} visible={false} raycast={() => {}}>
          <sphereGeometry args={[1, n > LINES_FINE_MOST ? LINES_COARSE : style.ballSegments, n > LINES_FINE_MOST ? LINES_COARSE / 2 : style.ballSegments]} />
        </instancedMesh>
        {lineCount > 0 && (
          <instancedMesh
            ref={bonds}
            args={[undefined, undefined, lineCount]}
            renderOrder={OVER_PAGE}
            frustumCulled={false}
            receiveShadow
            // (each bond met where its cylinder is, worked out exactly: components/raycast3d)
            raycast={function (this: THREE.InstancedMesh, rc, hits) {
              raycastCylinders(this, rc, hits);
            }}
            // (pointed at, a bond says what a calculation found of it - where one did)
            onPointerMove={
              pairResults.length
                ? (e) => {
                    const b = e.instanceId != null ? lineBond[e.instanceId] : undefined;
                    // (a stick to a centre is no bond of two atoms a calculation says anything of)
                    if (b != null && b !== hoverBond && !(drawn.bonds[b] as DrawnBond | undefined)?.endpoints) setHoverBond(b);
                  }
                : undefined
            }
            onPointerOut={pairResults.length ? () => setHoverBond(null) : undefined}
          >
            <cylinderGeometry args={[1, 1, 1, style.bondSegments]} />
            <meshStandardMaterial ref={bondsMat} transparent opacity={1} />
          </instancedMesh>
        )}
        {lineCount > 0 && (
          // (and round every stick)
          <instancedMesh ref={bondLines3d} args={[undefined, outlines.bonds.material, lineCount]} renderOrder={OVER_PAGE} frustumCulled={false} visible={false} raycast={() => {}}>
            <cylinderGeometry args={[1, 1, 1, style.bondSegments]} />
          </instancedMesh>
        )}
        {bent && bentGeometry && (
          // (the lines that curve in to a lone atom, apart - with the rings a curve needs - and the line round them)
          <>
            <instancedMesh
              key={bent.length}
              ref={bentSticks}
              args={[bentGeometry, bentMat, bent.length]}
              renderOrder={OVER_PAGE}
              frustumCulled={false}
              receiveShadow
              onPointerMove={
                pairResults.length
                  ? (e) => {
                      const b = e.instanceId != null ? lineBond[bent[e.instanceId]] : undefined;
                      if (b != null && b !== hoverBond && !(drawn.bonds[b] as DrawnBond | undefined)?.endpoints) setHoverBond(b);
                    }
                  : undefined
              }
              onPointerOut={pairResults.length ? () => setHoverBond(null) : undefined}
            />
            <instancedMesh
              key={`l${bent.length}`}
              ref={bentLines3d}
              args={[bentGeometry, outlines.bent.material, bent.length]}
              renderOrder={OVER_PAGE}
              frustumCulled={false}
              visible={false}
              raycast={() => {}}
            />
          </>
        )}
        {runs.length > 0 && (
          <>
            <mesh
              ref={ribbon}
              geometry={ribbonGeo}
              renderOrder={OVER_PAGE}
              frustumCulled={false}
              // (found under the pointer only while it is there to be seen - a
              // residue at a time, by the spheres round them, not by every
              // one of its triangles: utils/ribbon `residueOnRay`)
              raycast={function (this: THREE.Mesh, rc, hits) {
                if (!this.visible) return;
                const local = rc.ray.clone().applyMatrix4(toLocal.copy(this.matrixWorld).invert());
                const hit = residueOnRay(ribbonHits.current, local);
                if (!hit) return;
                const point = hit.point.applyMatrix4(this.matrixWorld);
                const distance = rc.ray.origin.distanceTo(point);
                if (distance < rc.near || distance > rc.far) return;
                hits.push({ distance, point, object: this, residue: hit.residue } as THREE.Intersection & { residue: number });
              }}
              onPointerMove={(e) => {
                e.stopPropagation();
                const r = (e as unknown as { residue?: number }).residue;
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
          <sphereGeometry args={[1, segments, segments]} />
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
        {bent && bentHullGeometry && (
          <instancedMesh
            key={`h${bent.length}`}
            ref={bentHull}
            args={[bentHullGeometry, bentHullMat, bent.length]}
            renderOrder={OVER_PAGE - 1}
            frustumCulled={false}
            visible={false}
            raycast={() => {}}
          />
        )}
        <mesh ref={linkedHull} renderOrder={OVER_PAGE - 1} frustumCulled={false} visible={false} raycast={() => {}}>
          <sphereGeometry args={[1, segments, segments]} />
          <meshBasicMaterial color={blue(LINKED_BLUE)} transparent opacity={1} depthWrite={false} toneMapped={false} />
        </mesh>
        <instancedMesh ref={markedHull} args={[undefined, undefined, n]} renderOrder={OVER_PAGE - 1} frustumCulled={false} visible={false} raycast={() => {}}>
          <sphereGeometry args={[1, segments, segments]} />
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
          <sphereGeometry args={[1, segments, segments]} />
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
              <div className="meno-page-chip" style={PAGE_SIZED}>
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
            radius={(style[look].atoms !== "space" ? style[look] : style.primary).bondRadius * WORLD_PER_ANGSTROM}
            weights={shares}
          />
        )}
        <Surface3D
          grid={props.surface ?? null}
          centre={centre}
          iso={props.surfaceIso ?? props.surface?.iso ?? 0.05}
          plus={style.surfacePlus}
          minus={style.surfaceMinus}
          colour={props.surfaceColour ?? null}
          renderOrder={OVER_PAGE + 2}
        />
        {stereoPresent.map(({ item: mark }) => (
          <group
            key={mark.key}
            ref={(g) => {
              const l = stereoAnchors.current.get(mark.key) ?? { anchor: null, ink: null };
              l.anchor = g;
              stereoAnchors.current.set(mark.key, l);
            }}
          >
            {props.stereoFont.opts && (
              <StereoInk3D
                text={mark.text}
                opts={props.stereoFont.opts}
                ink={(ink) => {
                  const l = stereoAnchors.current.get(mark.key) ?? { anchor: null, ink: null };
                  l.ink = ink;
                  stereoAnchors.current.set(mark.key, l);
                }}
              />
            )}
          </group>
        ))}
      </group>
      {/* (rising out of its drawing, it shows its frames once it has risen) */}
      {/* (read from a calculation, it says what the calculation was - a
          single geometry's only when it is pointed at) */}
      {(solid.frames.length > 1 || m.conformerSet || props.onRemake || m.calc || m.edited || named3d(m)) && !props.rising && (
        <group ref={pill}>
          {/* (one of a stack: its stack's chip says which, not its own - StackChip3D; one called by a name of its own says it) */}
          {(solid.frames.length > 1 || m.conformerSet || m.calc || named3d(m) || m.failed?.some(Boolean)) && !props.stacked ? (
            <Frames3D
              onOpened={(o) => {
                framesOpened.current = o;
                if (o && !chipRaisedNow.current) {
                  chipRaisedNow.current = true;
                  setChipRaised(true);
                }
                invalidate();
              }}
              raised={chipRaised}
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
              {...(m.conformerSet && sharesWithheld(m) ? { noShares: sharesWithheld(m)! } : {})}
              numbers={m.numbers?.length === solid.frames.length ? m.numbers : undefined}
              about={m.calc ? calcLine(m.calc) : undefined}
              results={m.calc?.results}
              unread={m.calc?.unread}
              made={m.made}
              conformers={m.conformerSet}
              said={m.said}
              {...(named3d(m) ? { title: m.title } : {})}
              {...(m.failed?.length === solid.frames.length ? { failed: m.failed } : {})}
              {...(m.marksUnread ? { marksUnread: true } : {})}
              {...(m.calc?.warnings?.length ? { warnings: m.calc.warnings } : {})}
              {...(imaginaryShown(m, solid.frames.length) ? { imaginary: imaginaryShown(m, solid.frames.length) } : {})}
              {...(refinedFrame(m) != null ? { fromStart: true } : {})}
            />
          ) : (
            <PageHtml zIndexRange={[30, 20]}>
              <div
                className="meno-page-chip meno-control-chip flex flex-col items-center"
                style={{ transform: "translate(-50%, calc(10px * var(--page, 1)))" }}
              >
                <div className="flex flex-col items-center" style={PAGE_SIZED}>
                  {m.edited && <Edited from={m.edited.from} />}
                  {props.onRemake && <Changed onRemake={props.onRemake} />}
                </div>
              </div>
            </PageHtml>
          )}
        </group>
      )}
      {/* (what it says of itself - its hydrogens hidden or not in its file,
          its bond orders not known - above it while it is so, in either
          look - its frames' chip is below - at any zoom: not a chip that goes
          when the page's words are too small, and never too small or too
          large to read) */}
      {/* (how large it is shown, while it is not at its true size - while it is hovered or selected, or its mark is in use) */}
      {magnifiedOf(m) !== 1 && props.onMagnify && !props.rising && (
        <group ref={magAnchor}>
          <PageHtml zIndexRange={[35, 25]}>
            <div
              className="transition-opacity duration-150"
              style={{ transform: "translate(4px, -100%)", opacity: lit || selected || magMarkActive ? 1 : 0, pointerEvents: lit || selected || magMarkActive ? "auto" : "none" }}
            >
              <MagnifiedMark k={magnifiedOf(m)} onSet={props.onMagnify} onActive={setMagMarkActive} />
            </div>
          </PageHtml>
        </group>
      )}
      {notesEver.length > 0 && !props.rising && (
        <group ref={markAnchor}>
          <PageHtml zIndexRange={[30, 20]} style={{ pointerEvents: "none" }}>
            <div
              className="flex flex-col items-center"
              data-fit-notes={MARK_GAP_PX}
              style={{ transform: `translate(-50%, calc(-100% - ${MARK_GAP_PX}px))` }}
            >
              <div className="flex flex-col items-center" style={{ zoom: `clamp(${NOTES_SCALE.least}, var(--page, 1), ${NOTES_SCALE.most})` }}>
              {notesEver.map((text) => (
                <NoteMark
                  key={text}
                  text={notesShort && text === notesNow[0] && notesNow.length > 1 ? `${text} +${notesNow.length - 1}` : text}
                  title={notesNow.join("\n")}
                  on={notesNow.includes(text) && (!notesShort || text === notesNow[0])}
                  plain={text === plain}
                  short={notesShort}
                />
              ))}
              </div>
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
  menoShader(mat, "grown", (shader) => {
    shader.uniforms.grow = grow;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float grow;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\ntransformed += normalize(normal) * grow;");
  });
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
const toLocal = new THREE.Matrix4();
const colour = new THREE.Color();
const fadeCentre = new THREE.Vector3();
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
  // (its sphere read off the matrices, not each ball's taken into it: a protein's tens of thousands at every frame it moves)
  commitInstanceMatrices(mesh);
}

/** Each bond's lines, cylinders from end to end, `extra` thicker all round (by line, if it is a function). */
function placeBonds(mesh: THREE.InstancedMesh, lines: BondLine[], extra: number | ((k: number) => number)) {
  lines.forEach((line, k) => placePiece(mesh, k, line.a, line.b, line.r + (line.r > 0 ? (typeof extra === "number" ? extra : extra(k)) : 0)));
  commitInstanceMatrices(mesh);
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
 * What a molecule says of itself (utils/molecule3d `notesOf`): its
 * hydrogens on carbon hidden, its file's hydrogens missing, its bond
 * orders not known - said for as long as it is so, over it, where it
 * cannot be missed, as a picture without them misleads (the maintainer,
 * 2026-10-10 and 2026-10-11). It comes and goes as the molecule goes over
 * to a look it says it in or not, folding away.
 */
function NoteMark({ text, title, on, plain, short }: { text: string; title?: string; on: boolean; plain?: boolean; short?: boolean }) {
  return (
    <div
      // (as wide as it says: in a chip of no width of its own, the fold would cut it off)
      className="grid w-max transition-[grid-template-rows,opacity] duration-[120ms] ease-[var(--ease-meno)]"
      style={{ gridTemplateRows: on ? "1fr" : "0fr", opacity: on ? 1 : 0 }}
      aria-hidden={!on}
    >
      <div className="overflow-hidden">
        <div
          data-note={plain ? "plain" : ""}
          title={short ? title : undefined}
          className={clsx(
            "mt-1 whitespace-nowrap rounded-full border px-2 text-[11px] leading-[20px] shadow-sm",
            // (one that only says how it is in the page's grey, as an edit's origin is; one that says what is wrong in the accent)
            plain ? "border-gh-line bg-white/90 text-gh-gray" : "border-accel-accent/50 bg-accel-lightaccent/90 font-medium text-accel-accent",
            // (in a set, short: within its own room, the rest of it pointed at)
            short && "max-w-[9rem] truncate",
          )}
        >
          {text}
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
  const read = () => typedValue(value);
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
