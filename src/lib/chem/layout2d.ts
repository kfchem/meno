import "./fonts";
import { ARIAL } from "./arial";
import { labelFont, type LabelFont } from "./labelFonts";
import { ringSidesOf } from "./aromaticSides";
import {
  chargeText,
  implicitHydrogens,
  valenceOrder,
  type AtomChem,
  type BondChem,
  type SgroupMark,
  type StereoGroup,
} from "./molecule";
import { italicUnits, labelRuns, labelUnits, namesRingFirst, reversedLabel, unitRuns } from "./abbreviations";
import { ELEMENTS } from "./elements";
import { namesLaid } from "../layout/names";

export { implicitHydrogens };

/** An atom as the drawing takes it: its chemistry (./molecule), and where it is. */
export type Atom = AtomChem & {
  id: number;
  x: number;
  y: number;
  /**
   * How near the atom is to the viewer, where the structure is drawn in
   * perspective (a cage): a bond passing behind another is broken where it
   * crosses it.
   */
  z?: number;
  /**
   * Its symbol drawn, whatever it is: a carbon between two double bonds (an
   * allene's, a ketene's, a carbodiimide's middle), which a straight line
   * through it would hide (`cumulatedShown`).
   */
  shown?: boolean;
  /**
   * Where its charge - and a radical's dots - was put by hand: their middle,
   * from the atom, in ems of the labels' size. Unset, where the drawing
   * puts them: after the label, or beside it, or beside a bare vertex.
   */
  chargeAt?: Vec2;
  /** The colour its label is drawn in - its charge with it - where it is given one (as CSS: "#d55e00"). */
  color?: string;
  /** The colour it is highlighted in, behind the drawing, where it is: drawn in it exactly. */
  highlight?: string;
};
export type Bond = BondChem & {
  a1: number;
  a2: number;
  order: 1 | 2 | 3;
  /** A single bond's wedge, hash or wave; a double bond's "either": cis or trans not known. */
  stereo?: "up" | "down" | "wavy" | "either" | "none";
  // Double-bond offset layout modes
  doubleMode?: "auto" | "center" | "left" | "right";
  // Wedge orientation principle vs. reverse principle
  stereoOrient?: "principle" | "reverse";
  /**
   * How a single bond with no stereo is drawn: as a plain line (the
   * default), as a bold bar, as hashes across it, or dashed along it.
   */
  display?: BondDisplay;
  /** A dative bond, drawn as an arrow from `a1`, the donor, to `a2`. */
  dative?: boolean;
  /** The colour it is drawn in, where it is given one (as CSS). */
  color?: string;
  /** The colour it is highlighted in, behind the drawing (`Atom.highlight`). */
  highlight?: string;
};
export type Vec2 = { x: number; y: number };

/**
 * How a bond is drawn where it says nothing of stereochemistry. "wedge" is
 * a ring's bond in perspective running toward the viewer, narrow at its far
 * end (as a stereo wedge is narrow at its centre: `stereoOrient`); on a
 * double bond it, or "bold", takes the place of the line the second one is
 * drawn beside.
 */
export type BondDisplay = "plain" | "bold" | "hashed" | "dashed" | "wedge";

/**
 * How a bond is actually drawn: stereo first, then a single bond's display,
 * then as a dative arrow; a double or triple bond is always its lines.
 */
export function bondKind(
  b: Bond,
): "wedge" | "hashedWedge" | "wavy" | "bold" | "hashed" | "dashed" | "dotted" | "dative" | "lines" {
  // A hydrogen bond is a partial bond, dotted (IUPAC GR-1.8)
  if (b.hydrogen) return "dotted";
  // A bond to a pi system's centre, plain (GR-1.7), whatever its type
  if (b.endpoints?.length) return "lines";
  if (b.stereo === "up") return "wedge";
  if (b.stereo === "down") return "hashedWedge";
  if (b.stereo === "wavy") return "wavy";
  if (b.order !== 1) return "lines";
  if (b.display === "bold" || b.display === "hashed" || b.display === "dashed") {
    return b.display;
  }
  if (b.display === "wedge") return "wedge";
  return b.dative ? "dative" : "lines";
}

export type LayoutOptions = {
  lineWidthPx: number;
  doubleOffsetPx: number;
  tripleOffsetPx: number;
  wedgeWidthPx: number;
  /** Least distance between the hashes of a hashed wedge, centre to centre. */
  hashSpacingPx: number;
  /**
   * A bold bond's width, and the length of a hashed bond's hashes. Left
   * unset, two thirds of a wedge's broad end.
   */
  boldWidthPx?: number;
  /**
   * How far the first hash sits from an unlabelled atom the hashes start at.
   * Left unset, one hash spacing.
   */
  hashFirstGapPx?: number;
  /** A dashed bond's dashes, and the least gap between them. */
  dashLengthPx?: number;
  dashGapPx?: number;
  /** The head of a dative bond's arrow: how long, and how wide at its base. */
  dativeHeadLengthPx?: number;
  dativeHeadWidthPx?: number;
  /** How far a wavy bond swings either side of its line. */
  wavyAmpPx: number;
  /** One whole wave of a wavy bond: a turn to either side. */
  wavyPeriodPx: number;
  /** How long a point is, in the same units: what words on the page given a size of their own in points are set at (lib/chem/captions `wordsFontPx`). */
  pointPx?: number;
  fontPx: number;
  /**
   * How far a bond stops short of a label's letters. Left unset, it is 16%
   * of the font size - ACS 1996's 1.6 pt at 10 pt.
   */
  labelMarginPx?: number;
  /** The typeface labels are set in; Arial when unset. */
  fontFamily?: string;
  /** How a label is set, as fractions of its font size; ACS 1996's when unset. */
  labelSet?: LabelSet;
  /** The colours bonds and labels are drawn in, as CSS; black when unset. */
  bondColor?: string;
  labelColor?: string;
  /**
   * The rules the drawing decides by, each left unset for ACS 1996's own:
   * see the matching settings in style.ts for what each means.
   */
  hydrogenBandDeg?: number;
  symbolCentringDeg?: number;
  labelShareMax?: number;
  doubleSideThreshold?: number;
  doubleCrowdingDeg?: number;
  innerLineMaxShortening?: number;
  centredJoinMinDeg?: number;
  wedgeCutMaxDeg?: number;
  wedgeCornerReach?: number;
  aromaticCircleSize?: number;
  paddingPx: number;
  showCarbonLabels: boolean;
  /** A charge of one drawn circled (⊕, ⊖) rather than as a plain sign; unset, circled. */
  circleCharges?: boolean;
  /** A charged carbon, or one with an unpaired electron, drawn with its C; unset, as a bare vertex, the charge beside it. */
  showChargedCarbons?: boolean;
  /** R, S, E and Z written in parentheses, (R), rather than plainly; unset, plainly. */
  stereoParentheses?: boolean;
  /** How far R or S stands off its atom, to its nearest letter, as a fraction of the font size; unset, half a capital's height (0.35). */
  stereoGap?: number;
  /** Draw the hydrogens a labelled atom carries, e.g. OH, NH2. Default: on. */
  showImplicitHydrogens?: boolean;
  /**
   * How bonds meet. "round" (the default) rounds the corners of a wedge and
   * fills the join where bonds meet with a round cap; "sharp" leaves the
   * wedge's corners as they are cut and mitres the join instead.
   */
  joinStyle?: "round" | "sharp";
  units?: "px" | "world";
  minLinePx?: number;
  // boolean: all rings ON, undefined/false: OFF
  // { enabled: Set<string> }: enable only rings with ringKey (ascending concat of 6 atom ids)
  aromaticCircle?: boolean | { enabled: Set<string> };
  /**
   * The rings filled with a colour, behind the drawing: the colour (as CSS)
   * by the ring's key - its atoms' ids, ascending, joined by "-" - drawn in
   * it exactly.
   */
  ringFills?: Readonly<Record<string, string>>;
};

export type LineSeg = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  widthPx: number;
  /** Its colour, where it is not the bonds' (as CSS). */
  color?: string;
};
export type Poly = { points: Vec2[]; color?: string };
/**
 * A stroked curve: cubic Bezier segments end to end, its points the start
 * then three for each segment (two controls and an end) - as EMF's
 * PolyBezier takes them - its width in the drawing's units, its ends round
 * or flat. A picture draws it as the curve it is, smooth however far it is
 * enlarged (an electron-pushing arrow's line).
 */
export type Curve = { points: Vec2[]; width: number; round?: boolean; color?: string };
/** What is drawn behind the drawing, filled flat, its edge sharp: a ring's fill, a part's highlight. */
export type Under = { points: Vec2[]; color: string };
/**
 * A shape on the page as a picture draws it, under everything of the
 * drawing (lib/chem/shapes): its fill, its line - whole or in dashes, each
 * `width` wide in the layout's units, its corners mitred - and an arrow's
 * heads.
 */
export type ShapeMark = {
  fill?: { points: Vec2[]; color: string };
  lines: { points: Vec2[]; closed: boolean; width: number; color: string }[];
  heads: { points: Vec2[]; color: string }[];
};
/** Where a line of the drawing runs into another's end, and which way it leaves that point. */
export type Meet = { at: Vec2; dir: Vec2 };
/** A corner within one stroke - a wavy bond's - and the ways its two pieces leave it. */
export type Bend = { at: Vec2; dirs: Vec2[] };
/**
 * What one bond draws, and where its lines need finishing off: `ends` are
 * line ends nothing else meets, `meets` the points where its lines run into
 * a neighbour's, `bends` the corners along a wavy bond. The drawing rounds
 * them all or squares them all, never some of each.
 */
export type BondPrimitives = {
  lines: LineSeg[];
  polys: Poly[];
  meets?: Meet[];
  ends?: Vec2[];
  bends?: Bend[];
};
/**
 * A piece of a label: `sub` marks a subscript such as the 2 in NH2, `sup` a
 * superscript - a charge of two or more, an isotope's mass number. A `mark`
 * is drawn rather than set in type, where a superscript would go: a charge
 * of one in its circle (its `text` the sign), a radical's dot or dots.
 */
export type TextRun = {
  text: string;
  sub?: boolean;
  sup?: boolean;
  mark?: "charge" | "radical";
  /**
   * A superscript that is part of the label itself - an Rgroup's number -
   * which bonds stop short of as of the rest, where a charge is moved clear
   * of them instead.
   */
  part?: boolean;
  /** Set in italics: the t of t-Bu, the p of p-Ts (IUPAC's Table II). */
  italic?: boolean;
  /** Set bold, as words on the page are marked (lib/chem/captions `WordsMark`). */
  bold?: boolean;
  /** Its colour, where it is not the text's (as #rrggbb): words on the page marked so. */
  color?: string;
};

/**
 * How a label is set, as fractions of its font size (ACS 1996): its baseline
 * sits `BASELINE_DROP` below the atom, and a subscript is `SUB_SCALE` the
 * size, its baseline `SUB_DROP` below the label's.
 */
export const BASELINE_DROP = 0.4;
export const SUB_SCALE = 0.75;
export const SUB_DROP = 0.225;

/**
 * How far below its atom a capital's middle sits, in ems: where ACS 1996's
 * baseline puts an Arial capital's. Set by it, a capital of any typeface
 * sits on its atom as an Arial one does.
 */
export const CAP_MIDDLE_DROP =
  BASELINE_DROP - ARIAL.capHeight / ARIAL.unitsPerEm / 2;

/** The baseline that sets a capital `capHeight` ems tall on its atom as ACS 1996 sets Arial's. */
export function automaticBaseline(capHeight: number): number {
  return capHeight / 2 + CAP_MIDDLE_DROP;
}
/** How far apart the lines of a stacked label are, baseline to baseline. */
export const STACK_SPACING = 0.857;

/**
 * How far above the label's baseline a superscript's sits, in ems: a
 * charge's sign level with the top of a capital, as a formula has it.
 */
export const SUP_RISE = 0.42;
/** How wide a mark - a charge in its circle, a radical's dot - is set, in the superscript's ems. */
const MARK_WIDTH = 0.82;
/** The circle round a charge of one, as a share of the superscript's em. */
const MARK_RADIUS = 0.34;
/** How far above its baseline a mark's middle is, in the superscript's ems: where a plus sign's is. */
const MARK_MIDDLE = 0.36;

/** How a label is set, as fractions of its font size, and in what. */
export type LabelSet = {
  /** Below the atom, in ems; unset, as `automaticBaseline` has it for the typeface. */
  baseline?: number;
  subscriptSize: number;
  subscriptDrop: number;
  /** Above the baseline, in ems; unset, `SUP_RISE`. */
  superscriptRise?: number;
  stackSpacing: number;
  fontFamily?: string;
};

/** ACS 1996's way of setting a label. */
export const ACS_LABEL_SET: LabelSet = {
  baseline: BASELINE_DROP,
  subscriptSize: SUB_SCALE,
  subscriptDrop: SUB_DROP,
  stackSpacing: STACK_SPACING,
  fontFamily: "Arial",
};

/** How labels are set under these options. */
export function labelSetOf(opts: Pick<LayoutOptions, "labelSet" | "fontFamily">): LabelSet {
  return {
    ...(opts.labelSet ?? ACS_LABEL_SET),
    fontFamily: opts.labelSet?.fontFamily ?? opts.fontFamily ?? "Arial",
  };
}

export type TextItem = {
  x: number;
  y: number;
  /** The whole label as plain text (subscripts inline), for simple consumers. */
  text: string;
  fontPx: number;
  /** The label split into runs, so subscripts can be drawn smaller. */
  runs?: TextRun[];
  /**
   * Which run sits on the atom: the element symbol, so that OH hangs to the
   * right of the atom and HO to its left.
   */
  anchorRun?: number;
  /**
   * The runs after the symbol set on a line of their own, below it or above
   * it: CH2 between two bonds rising either side has its H2 underneath.
   */
  stack?: "below" | "above";
  /**
   * The whole symbol centred on the atom rather than its first letter: an Si
   * between bonds leaving straight out to either side sits square between
   * them.
   */
  centreSymbol?: boolean;
  /** The atom this label belongs to, by index. */
  atom?: number;
  /**
   * Not a label but a charge or a radical's dots set beside a carbon drawn
   * without one: centred on (x, y) as a whole, and at the middle of a
   * superscript rather than on a baseline.
   */
  beside?: boolean;
  /** Set beside: the atom, by index, whose charge it is. */
  markOf?: number;
  /** Its colour, where it is not the labels' (as CSS). */
  color?: string;
  /**
   * Set at its own size - `fontPx` - in pictures too, not at the labels':
   * words on the page given a size of their own (docs/EDITOR-2D.md, *Text*).
   */
  ownSize?: boolean;
};

/** Whether two sets of texts are drawn alike: the same letters, set the same way, in the same places. */
export function sameTexts(a: readonly TextItem[], b: readonly TextItem[]): boolean {
  return a === b || (a.length === b.length && JSON.stringify(a) === JSON.stringify(b));
}

/** How far a label's ink reaches from its atom: left, right, up and down. */
export type LabelBox = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};
/**
 * A run of a label as it is set: where its pen starts, the baseline it sits
 * on (y up, as the drawing is) and its font size.
 */
export type PlacedRun = {
  text: string;
  sub: boolean;
  /** In italics: see `TextRun`. */
  italic?: boolean;
  /** Bold, and in a colour of its own: see `TextRun`. */
  bold?: boolean;
  color?: string;
  /** Drawn, not set in type: see `TextRun`. */
  mark?: "charge" | "radical";
  x: number;
  y: number;
  size: number;
};
/**
 * A ring's circle: round, or - a ring seen in perspective - an ellipse,
 * `r` its long half-axis along `angle` and `squash` its short one's share
 * of that.
 */
export type Circle = { c: Vec2; r: number; key?: string; squash?: number; angle?: number; color?: string };

/** The points round a circle or an ellipse, `n` of them, closed. */
export function circlePoints(c: Circle, n = 64): Vec2[] {
  const out: Vec2[] = [];
  const cos = Math.cos(c.angle ?? 0);
  const sin = Math.sin(c.angle ?? 0);
  for (let k = 0; k <= n; k++) {
    const t = (k / n) * Math.PI * 2;
    const u = Math.cos(t) * c.r;
    const v = Math.sin(t) * c.r * (c.squash ?? 1);
    out.push({ x: c.c.x + u * cos - v * sin, y: c.c.y + u * sin + v * cos });
  }
  return out;
}

/**
 * The rings bound face-on to a metal through all their atoms - Cp, an
 * arene, at a haptic bond's end - each as its atoms' indices, where they
 * make a ring by bonds of their own.
 */
export function hapticRings(atoms: readonly Atom[], bonds: readonly Bond[]): number[][] {
  const out: number[][] = [];
  // (most drawings have none)
  if (!bonds.some((b) => (b.endpoints?.length ?? 0) >= 3 && b.attach !== "any")) return out;
  const indexOf = new Map(atoms.map((a, i) => [a.id, i]));
  for (const b of bonds) {
    if ((b.endpoints?.length ?? 0) < 3 || b.attach === "any") continue;
    const ring = b.endpoints!.map((id) => indexOf.get(id)).filter((i): i is number => i != null);
    const inside = new Set(ring);
    const own = bonds.filter((e) => !e.endpoints?.length && inside.has(e.a1) && inside.has(e.a2));
    const degree = new Map<number, number>();
    for (const e of own) for (const i of [e.a1, e.a2]) degree.set(i, (degree.get(i) ?? 0) + 1);
    if (ring.length === inside.size && own.length === ring.length && ring.every((i) => degree.get(i) === 2)) {
      if (!out.some((r) => r.length === ring.length && r.every((i) => inside.has(i)))) out.push(ring);
    }
  }
  return out;
}

/**
 * The atoms as the drawing shows their charges: a ring bound face-on to a
 * metal is drawn with its circle (`buildAllPrimitives`), and a charge its
 * carbons carry - a cyclopentadienide's - is the circle's, not drawn; the
 * metal it is bound to is shown with that much less, so that ferrocene,
 * Fe²⁺ and two Cp⁻ as written, is drawn as it is written by chemists, with
 * none. So is an unpaired electron of the ring's (Cp* as a neutral ligand),
 * or of any pi system bound so (an η³-allyl's).
 */
/**
 * The atoms, a carbon between two double bonds with its symbol drawn: the
 * middle of an allene, a ketene, CO2 or a carbodiimide, which its bonds run
 * straight through, hidden in a line as it would be (O=C=O read as O=O).
 */
export function cumulatedShown(atoms: Atom[], bonds: readonly Bond[]): Atom[] {
  const doubles = atoms.map(() => 0);
  const all = atoms.map(() => 0);
  for (const b of bonds) {
    for (const e of [b.a1, b.a2]) {
      all[e]++;
      if (b.order === 2) doubles[e]++;
    }
  }
  return atoms.map((a, i) => (a.el === "C" && doubles[i] === 2 && all[i] === 2 ? { ...a, shown: true } : a));
}

function chargesAsDrawn(atoms: Atom[], bonds: readonly Bond[]): Atom[] {
  // (most drawings have no bond with more ends than two, and nothing to change)
  if (!bonds.some((b) => b.endpoints?.length)) return atoms;
  const rings = hapticRings(atoms, bonds);
  const indexOf = new Map(atoms.map((a, i) => [a.id, i]));
  // (an unpaired electron of any pi system bound so - an allyl's - is its
  // bond's, not drawn)
  const pi = new Set(bonds.flatMap((b) => (b.attach === "any" ? [] : (b.endpoints ?? []).map((id) => indexOf.get(id)!))));
  if (!rings.length && ![...pi].some((i) => atoms[i]?.radical && atoms[i].el === "C")) return atoms;
  const out = atoms.map((a, i) => (pi.has(i) && a.el === "C" && a.radical ? { ...a, radical: undefined } : { ...a }));
  for (const b of bonds) {
    const ring = rings.find((r) => r.length === b.endpoints?.length && b.endpoints.every((id) => r.includes(indexOf.get(id)!)));
    if (!ring) continue;
    const metal = atoms[b.a1]?.el === "*" ? b.a2 : b.a1;
    let moved = 0;
    for (const i of ring) {
      if (out[i].el !== "C") continue;
      if (out[i].radical) out[i].radical = undefined;
      if (!out[i].charge) continue;
      moved += out[i].charge!;
      out[i].charge = 0;
    }
    if (moved && out[metal]) out[metal].charge = (out[metal].charge ?? 0) + moved;
  }
  return out;
}

/**
 * Something of a molecule in 3D as a picture shows it, as seen: a ball,
 * shaded as if lit from above right, or a stick from end to end. A picture
 * draws them in the order given, from the back forward, over the drawing.
 */
export type SolidMark =
  | { kind: "ball"; c: Vec2; r: number; color: string }
  | { kind: "stick"; a: Vec2; b: Vec2; width: number; color: string };

/**
 * A measurement on a molecule in 3D as a picture shows it, over the
 * molecules, in `color`: its lines, each `width` wide (a distance's already
 * cut into dashes); a fan, as triangles, `fanOpacity` strong; and its
 * value, `text`, `size` high, centred on `label` on a white ground
 * (`measureLabelBox`).
 */
export type MeasureMark = {
  lines: [Vec2, Vec2][];
  width: number;
  fan: [Vec2, Vec2, Vec2][];
  fanOpacity: number;
  label: Vec2;
  text: string;
  size: number;
  color: string;
};

/**
 * Where a measurement's value is written, in a typeface: the white ground
 * round it, and the start of its baseline - centred on its point.
 */
export function measureLabelBox(
  m: Pick<MeasureMark, "label" | "text" | "size">,
  family: string | undefined,
): { min: Vec2; max: Vec2; baseline: Vec2 } {
  const font = labelFont(family);
  const width = [...m.text].reduce((w, ch) => w + font.advance(ch) * m.size, 0);
  const padX = 0.3 * m.size;
  const halfHeight = 0.65 * m.size;
  return {
    min: { x: m.label.x - width / 2 - padX, y: m.label.y - halfHeight },
    max: { x: m.label.x + width / 2 + padX, y: m.label.y + halfHeight },
    // (the letters' middle on the point: the baseline a third of the size below it)
    baseline: { x: m.label.x - width / 2, y: m.label.y - 0.35 * m.size },
  };
}

/** A ball's shading: its colour lightened where the light falls, darkened at its edge away from it. */
export const BALL_SHADE = { light: 0.4, dark: 0.42, focus: { x: 0.18, y: 0.18 } } as const;

/** A colour (#rrggbb) mixed towards white (`t` > 0) or black (`t` < 0), as #rrggbb. */
export function shadeOf(hex: string, t: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const n = m ? parseInt(m[1], 16) : 0x808080;
  const mix = (c: number) => Math.round(t >= 0 ? c + (255 - c) * t : c * (1 + t));
  const r = mix((n >> 16) & 0xff), g = mix((n >> 8) & 0xff), b = mix(n & 0xff);
  return "#" + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

export type Layout = {
  /** Shapes on the page, under all of it, from the back. */
  shapes?: ShapeMark[];
  /** What is drawn behind all of it, from the back: the rings' fills, then the parts' highlights. */
  under?: Under[];
  lines: LineSeg[];
  polys: Poly[];
  /** Curves stroked, over the filled shapes. */
  curves?: Curve[];
  texts: TextItem[];
  circles: Circle[];
  fills: Circle[];
  /** Molecules in 3D, as seen, from the back forward. */
  solids?: SolidMark[];
  /**
   * The same molecules drawn as the canvas draws them, lit and in depth, as
   * an image (a data URL) and where on the page it goes: a picture shows
   * that rather than the marks, which as flat discs one over another cannot
   * show balls running into one another.
   */
  solidsImage?: { href: string; bounds: { min: Vec2; max: Vec2 } };
  /** Measurements on the molecules in 3D, drawn over them. */
  measures?: MeasureMark[];
  bounds: { min: Vec2; max: Vec2 };
  /**
   * Pixels per coordinate unit this layout was built for. Sizes the layout
   * reports in pixels (a line's width, a label's font in px units) divide by
   * it to land back in the coordinates everything else is in.
   */
  zoom: number;
  /** How far each bond's drawing reaches off its own line, by the bonds' order. */
  reach: BondReach[];
};

/**
 * How far a bond's drawing reaches either side of its own line, at each end,
 * in the drawing's coordinates: `left` on the side `vperp(a2 - a1)` points
 * to, `right` on the other; `1` at its a1 and `2` at its a2. A line reaches
 * half its width; a wedge widens to its broad end; a double bond reaches its
 * second line, or half the gap either side when it is centred; a triple bond
 * its outer lines; a wavy bond its swing; a bold or hashed bond its width.
 * What a highlight round the bond follows, so that nothing of the bond stands
 * out past it.
 */
export type BondReach = { left1: number; right1: number; left2: number; right2: number };

/** Half the width of a line as the drawing draws it, in its coordinates. */
export function lineHalfOf(opts: LayoutOptions, zoom: number): number {
  const units = opts.units ?? "px";
  let lwPx = units === "world" ? opts.lineWidthPx * zoom : opts.lineWidthPx;
  const minPx = Math.max(0.5, opts.minLinePx ?? 1);
  if (!(lwPx >= minPx)) lwPx = minPx;
  return pxToWorld(lwPx * 0.5, zoom);
}

/** See BondReach. `doubleSides` and `deg` as the drawing works them out. */
export function bondReach(
  bond: Bond,
  opts: LayoutOptions,
  zoom: number,
  deg?: Map<number, number>,
  doubleSides?: Map<Bond, number | undefined>,
): BondReach {
  const units = opts.units ?? "px";
  const line = lineHalfOf(opts, zoom);
  const even = (half: number): BondReach => ({ left1: half, right1: half, left2: half, right2: half });
  const kind = bondKind(bond);
  if (kind === "wedge" || kind === "hashedWedge") {
    // narrow at one end, a line's width there, to its broad end at the other
    const broad = Math.max(line, toWorld(opts.wedgeWidthPx * 0.5, zoom, units));
    const [h1, h2] = wedgeBaseAtom(bond, deg) === bond.a1 ? [broad, line] : [line, broad];
    return { left1: h1, right1: h1, left2: h2, right2: h2 };
  }
  if (kind === "wavy") return even(toWorld(opts.wavyAmpPx, zoom, units) + line);
  if (kind === "bold" || kind === "hashed") {
    const bold =
      (opts.boldWidthPx != null
        ? toWorld(opts.boldWidthPx, zoom, units)
        : (toWorld(opts.wedgeWidthPx, zoom, units) * 2) / 3) / 2;
    return even(Math.max(line, bold));
  }
  if (bond.order === 3) return even(toWorld(opts.tripleOffsetPx, zoom, units) + line);
  if (bond.order === 2) {
    const offsets = doubleOffsets(bond, toWorld(opts.doubleOffsetPx, zoom, units), doubleSides);
    // (a double bond with one line off its axis has its other line on it)
    const lines = offsets.length === 1 ? [0, ...offsets] : offsets;
    const left = line + Math.max(0, ...lines);
    const right = line + Math.max(0, ...lines.map((v) => -v));
    return { left1: left, right1: right, left2: left, right2: right };
  }
  return even(line);
}

/**
 * Whether a layout made at zoom `a` is the drawing at zoom `b` as well. In
 * world units the zoom comes into it only where a line is kept from getting
 * thinner on screen than the least it is drawn at, and in the steps a wavy
 * bond's turns are drawn in: with the lines wider than that at both zooms,
 * and a turn drawn in as many steps at both (or nothing wavy), the two
 * layouts are the same, number for number but for the last bit or two of
 * rounding - a line's width, kept in pixels at the zoom it was laid out
 * for, scaled with it. So a view can be zoomed without its drawing being
 * laid out again at every step.
 */
export function sameAtZooms(opts: LayoutOptions, bonds: readonly Bond[], a: number, b: number): boolean {
  if ((opts.units ?? "px") !== "world") return false;
  const least = Math.max(0.5, opts.minLinePx ?? 1);
  if (!(opts.lineWidthPx * a >= least && opts.lineWidthPx * b >= least)) return false;
  // (a bond next to a double bond whose stereo is not known is drawn wavy)
  if (!bonds.some((x) => x.stereo === "wavy" || x.stereo === "either")) return true;
  const half = opts.wavyPeriodPx / 2;
  return waveSteps(opts.wavyAmpPx, half, a) === waveSteps(opts.wavyAmpPx, half, b);
}

export function pxToWorld(px: number, zoom: number): number {
  return px / Math.max(zoom, 1e-6);
}

function runWidth(font: LabelFont, text: string, size: number): number {
  let w = 0;
  for (const ch of text) w += font.advance(ch) * size;
  return w;
}

/** How wide `runs` come to set side by side at `fontSize`, as `placeLabel` sets them: each at its own size, a mark at its own width. */
export function runsWidth(runs: readonly TextRun[], fontSize: number, set: LabelSet = ACS_LABEL_SET): number {
  const font = labelFont(set.fontFamily);
  let w = 0;
  for (const r of runs) {
    const size = fontSize * (r.sub || r.sup || r.mark ? set.subscriptSize : 1);
    w += r.mark ? size * MARK_WIDTH : runWidth(font, r.text, size);
  }
  return w;
}

export function computeBounds(atoms: Atom[]): { min: Vec2; max: Vec2 } {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const a of atoms) {
    if (a.x < minX) minX = a.x;
    if (a.y < minY) minY = a.y;
    if (a.x > maxX) maxX = a.x;
    if (a.y > maxY) maxY = a.y;
  }
  if (!isFinite(minX)) return { min: { x: -1, y: -1 }, max: { x: 1, y: 1 } };
  return { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } };
}

/**
 * A label set as ACS 1996 has it: the first letter of the element symbol
 * centred on the atom - the C of Cl, as of CH3 - and the rest following on
 * either side at the typeface's own advances, all on one baseline but for
 * subscripts. A stacked label sets what follows the symbol on a line of
 * its own, below or above, its first letter centred under the symbol's.
 */
export function placeLabel(
  t: TextItem,
  fontSize: number,
  set: LabelSet = ACS_LABEL_SET,
): PlacedRun[] {
  const font = labelFont(set.fontFamily);
  const runs = t.runs ?? [{ text: t.text }];
  const anchor = Math.min(t.anchorRun ?? 0, runs.length - 1);
  const small = (r: TextRun) => r.sub || r.sup || r.mark;
  const sizes = runs.map((r) => fontSize * (small(r) ? set.subscriptSize : 1));
  const widths = runs.map((r, i) => (r.mark ? sizes[i] * MARK_WIDTH : runWidth(font, r.text, sizes[i])));
  /** Where a run starts so that its first letter (or its mark) is centred on the atom. */
  const centredOn = (i: number) =>
    t.x - (runs[i].mark ? widths[i] : font.advance([...runs[i].text][0] ?? " ") * sizes[i]) / 2;
  /** Where the symbol starts: its first letter on the atom, or all of it. */
  const symbolAt = () =>
    t.centreSymbol ? t.x - widths[anchor] / 2 : centredOn(anchor);
  const baseline =
    t.y - fontSize * (set.baseline ?? automaticBaseline(font.capHeight));
  const rise = fontSize * (set.superscriptRise ?? SUP_RISE);
  const setRun = (i: number, x: number, line: number): PlacedRun => ({
    text: runs[i].text,
    sub: !!runs[i].sub,
    ...(runs[i].italic ? { italic: true } : {}),
    ...(runs[i].bold ? { bold: true } : {}),
    ...(runs[i].color ? { color: runs[i].color } : {}),
    ...(runs[i].mark ? { mark: runs[i].mark } : {}),
    x,
    y: runs[i].sub ? line - fontSize * set.subscriptDrop : runs[i].sup || runs[i].mark ? line + rise : line,
    size: sizes[i],
  });
  const out: PlacedRun[] = [];
  if (t.beside) {
    // a charge beside a bare vertex: centred on its spot, its sign's middle there
    const total = widths.reduce((sum, w) => sum + w, 0);
    let x = t.x - total / 2;
    const line = t.y - rise - (sizes[0] ?? fontSize) * MARK_MIDDLE;
    for (let i = 0; i < runs.length; i++) {
      out.push(setRun(i, x, line));
      x += widths[i];
    }
    return out;
  }
  // (a charge or a radical after the symbol stays beside it)
  let firstLineEnd = anchor;
  while (firstLineEnd + 1 < runs.length && (runs[firstLineEnd + 1].sup || runs[firstLineEnd + 1].mark)) firstLineEnd++;
  if (t.stack && firstLineEnd + 1 < runs.length) {
    // the symbol, and whatever precedes it, on the first line
    let x = symbolAt();
    for (let i = 0; i < anchor; i++) x -= widths[i];
    for (let i = 0; i <= firstLineEnd; i++) {
      out.push(setRun(i, x, baseline));
      x += widths[i];
    }
    const line =
      baseline +
      fontSize * set.stackSpacing * (t.stack === "below" ? -1 : 1);
    x = centredOn(firstLineEnd + 1);
    for (let i = firstLineEnd + 1; i < runs.length; i++) {
      out.push(setRun(i, x, line));
      x += widths[i];
    }
    return out;
  }
  let x = symbolAt();
  for (let i = 0; i < anchor; i++) x -= widths[i];
  for (let i = 0; i < runs.length; i++) {
    out.push(setRun(i, x, baseline));
    x += widths[i];
  }
  return out;
}

/**
 * Where a charge's runs, placed, are together - their middle: across, and
 * up where a superscript's middle is - and how far their ink reaches from it
 * either way. A charge put beside an atom is centred so (`beside`).
 */
export function markExtent(runs: readonly PlacedRun[], set: LabelSet = ACS_LABEL_SET): { x: number; y: number; halfW: number; halfH: number } {
  const font = labelFont(set.fontFamily);
  const x0 = Math.min(...runs.map((r) => r.x));
  const x1 = Math.max(...runs.map((r) => r.x + (r.mark ? r.size * MARK_WIDTH : runWidth(font, r.text, r.size))));
  const first = runs[0];
  return {
    x: (x0 + x1) / 2,
    y: first.y + first.size * MARK_MIDDLE,
    halfW: (x1 - x0) / 2,
    halfH: Math.max(...runs.map((r) => r.size * (r.mark ? MARK_RADIUS : 0.4))),
  };
}

/** Where a placed mark's circle is: a charge's, or the one a radical's dots sit in. */
export function markCircle(run: PlacedRun): { c: Vec2; r: number } {
  return {
    c: { x: run.x + (run.size * MARK_WIDTH) / 2, y: run.y + run.size * MARK_MIDDLE },
    r: run.size * MARK_RADIUS,
  };
}

/**
 * The marks of the labels, drawn: a charge of one as its sign in a circle,
 * a radical as a dot, or two for a carbene's pair - in lines, shapes and
 * filled circles, as the rest of the drawing is, a little lighter than a
 * bond's line.
 */
function labelMarks(
  texts: readonly TextItem[],
  fontSize: number,
  set: LabelSet,
  lineWorld: number,
  lwPx: number,
): { lines: LineSeg[]; polys: Poly[]; fills: Circle[] } {
  const lines: LineSeg[] = [];
  const polys: Poly[] = [];
  const fills: Circle[] = [];
  const w = lineWorld * 0.8;
  for (const t of texts) {
    for (const run of placeLabel(t, fontSize, set)) {
      if (!run.mark) continue;
      const { c, r } = markCircle(run);
      // (in its label's colour, where it has one)
      const color = t.color ? { color: t.color } : {};
      if (run.mark === "radical") {
        const dot = Math.max(lineWorld * 1.25, run.size * 0.075);
        const two = [...run.text].length > 1;
        for (const dx of two ? [-r * 0.55, r * 0.55] : [0]) fills.push({ c: { x: c.x + dx, y: c.y }, r: dot, ...color });
        continue;
      }
      // the circle, as a ring of thin pieces
      const n = 40;
      for (let k = 0; k < n; k++) {
        const a0 = (k * 2 * Math.PI) / n;
        const a1 = ((k + 1) * 2 * Math.PI) / n;
        const at = (a: number, rr: number) => ({ x: c.x + rr * Math.cos(a), y: c.y + rr * Math.sin(a) });
        polys.push({ points: [at(a0, r - w / 2), at(a0, r + w / 2), at(a1, r + w / 2), at(a1, r - w / 2)], ...color });
      }
      const arm = r * 0.58;
      lines.push({ x1: c.x - arm, y1: c.y, x2: c.x + arm, y2: c.y, widthPx: lwPx * 0.8, ...color });
      if (run.text === "+") lines.push({ x1: c.x, y1: c.y - arm, x2: c.x, y2: c.y + arm, widthPx: lwPx * 0.8, ...color });
    }
  }
  return { lines, polys, fills };
}

/** Whether a label's run `k` is its atom's charge or its radical's dots: set after its symbol, above the line. */
export function isTail(runs: readonly TextRun[], k: number, anchor: number): boolean {
  return k > anchor && !!(runs[k]?.sup || runs[k]?.mark) && !runs[k]?.part;
}

/**
 * The ink of a label, as the convex outline of each of its letters, around
 * its atom: the atom is at the origin.
 */
export function labelHulls(
  t: TextItem,
  fontSize: number,
  set: LabelSet = ACS_LABEL_SET,
  tail = true,
): Vec2[][] {
  const font = labelFont(set.fontFamily);
  const out: Vec2[][] = [];
  const anchor = t.anchorRun ?? 0;
  const runs = t.runs ?? [{ text: t.text }];
  for (const [k, run] of placeLabel(t, fontSize, set).entries()) {
    // (its charge and a radical's dots, which a bond is kept clear of by
    // where they are put, not by stopping short of them)
    if (!tail && isTail(runs, k, anchor)) continue;
    let pen = run.x - t.x;
    if (run.mark) {
      const { c, r } = markCircle(run);
      out.push(
        Array.from({ length: 12 }, (_, k) => ({
          x: c.x - t.x + r * Math.cos((k * Math.PI) / 6),
          y: c.y - t.y + r * Math.sin((k * Math.PI) / 6),
        })),
      );
      continue;
    }
    for (const ch of run.text) {
      const hull = font.hull(ch).map((p) => ({
        x: pen + p.x * run.size,
        y: run.y - t.y + p.y * run.size,
      }));
      if (hull.length > 0) out.push(hull);
      pen += font.advance(ch) * run.size;
    }
  }
  return out;
}

/** How far a label's ink reaches either side of its atom, and above and below. */
export function labelBox(
  t: TextItem,
  fontSize: number,
  set: LabelSet = ACS_LABEL_SET,
): LabelBox {
  const box = { left: 0, right: 0, top: 0, bottom: 0 };
  for (const hull of labelHulls(t, fontSize, set)) {
    for (const p of hull) {
      box.left = Math.max(box.left, -p.x);
      box.right = Math.max(box.right, p.x);
      box.top = Math.max(box.top, p.y);
      box.bottom = Math.max(box.bottom, -p.y);
    }
  }
  return box;
}

/** The box a label takes up, so the drawing's bounds can make room for it. */
function expandBoundsForLabels(
  bounds: { min: Vec2; max: Vec2 },
  texts: TextItem[],
  fontSize: number,
  set: LabelSet,
): { min: Vec2; max: Vec2 } {
  const out = {
    min: { x: bounds.min.x, y: bounds.min.y },
    max: { x: bounds.max.x, y: bounds.max.y },
  };
  for (const t of texts) {
    const { left, right, top, bottom } = labelBox(t, fontSize, set);
    out.min.x = Math.min(out.min.x, t.x - left);
    out.max.x = Math.max(out.max.x, t.x + right);
    out.min.y = Math.min(out.min.y, t.y - bottom);
    out.max.y = Math.max(out.max.y, t.y + top);
  }
  return out;
}

function toWorld(
  n: number,
  zoom: number,
  units: "px" | "world" | undefined
): number {
  return units === "world" ? n : pxToWorld(n, zoom);
}

/**
 * The bounds, grown to take in everything the bonds draw: the outer lines of
 * a triple bond, a wedge's broad end and a wavy bond's swing all reach past
 * the atoms, and an export cut at the atoms clips them.
 */
function expandBoundsForBonds(
  bounds: { min: Vec2; max: Vec2 },
  prim: { lines: LineSeg[]; polys: Poly[]; circles: Circle[]; fills: Circle[] },
  zoom: number,
): { min: Vec2; max: Vec2 } {
  const out = {
    min: { x: bounds.min.x, y: bounds.min.y },
    max: { x: bounds.max.x, y: bounds.max.y },
  };
  const take = (x: number, y: number, r: number) => {
    out.min.x = Math.min(out.min.x, x - r);
    out.max.x = Math.max(out.max.x, x + r);
    out.min.y = Math.min(out.min.y, y - r);
    out.max.y = Math.max(out.max.y, y + r);
  };
  for (const l of prim.lines) {
    // a line's width is in pixels whatever the drawing's units
    const half = pxToWorld(l.widthPx, zoom) / 2;
    take(l.x1, l.y1, half);
    take(l.x2, l.y2, half);
  }
  for (const p of prim.polys) for (const q of p.points) take(q.x, q.y, 0);
  for (const c of [...prim.circles, ...prim.fills]) take(c.c.x, c.c.y, c.r);
  return out;
}

function vsub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}
function vadd(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}
function vscale(a: Vec2, s: number): Vec2 {
  return { x: a.x * s, y: a.y * s };
}
function vlen(a: Vec2): number {
  return Math.hypot(a.x, a.y);
}
function vnorm(a: Vec2): Vec2 {
  const L = vlen(a);
  return L > 1e-9 ? { x: a.x / L, y: a.y / L } : { x: 1, y: 0 };
}
function vcross(a: Vec2, b: Vec2): number {
  return a.x * b.y - a.y * b.x;
}

function vdot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}
function vperp(a: Vec2): Vec2 {
  return { x: -a.y, y: a.x };
}

/**
 * How far out from an atom, along `d`, a bond stops for the atom's label: the
 * label margin beyond the furthest the label's letters reach in that
 * direction. That is how ACS 1996 keeps a bond clear of a label - measured
 * along the bond, not to the nearest letter - so a bond meeting the flat side
 * of an N at a slant stops as far out as the N's corner reaches, while one
 * meeting an O's round side comes in closer.
 *
 * The letter on the atom is measured whole: the bond leaves from within it.
 * Of the letters beside it only what lies in the bond's path counts - within
 * `band`, how far the bond's ink reaches either side of its line along `n`,
 * and the margin: one the bond passes clear of (the H set below an N whose
 * two bonds leave it downward at a slant) does not stop it.
 */
function labelClearance(
  hulls: Vec2[][],
  d: Vec2,
  margin: number,
  band: { n: Vec2; lo: number; hi: number },
): number {
  const lo = band.lo - margin;
  const hi = band.hi + margin;
  let reach = -Infinity;
  // (each hull is convex and in order round: its part in the band is cut by
  // the band's edges, and reaches furthest at a corner of it or where an edge
  // crosses the band's)
  for (const hull of hulls) {
    if (aroundOrigin(hull)) {
      for (const p of hull) reach = Math.max(reach, vdot(p, d));
      continue;
    }
    hull.forEach((p, i) => {
      const q = hull[(i + 1) % hull.length];
      const sp = vdot(p, band.n);
      const sq = vdot(q, band.n);
      if (sp >= lo && sp <= hi) reach = Math.max(reach, vdot(p, d));
      for (const edge of [lo, hi]) {
        if ((sp - edge) * (sq - edge) >= 0) continue;
        const t = (edge - sp) / (sq - sp);
        reach = Math.max(reach, vdot(p, d) + t * (vdot(q, d) - vdot(p, d)));
      }
    });
  }
  return reach === -Infinity ? 0 : Math.max(0, reach + margin);
}
/** Whether a convex outline, in order round, has the origin within it. */
function aroundOrigin(hull: readonly Vec2[]): boolean {
  if (hull.length < 3) return false;
  let sign = 0;
  for (let i = 0; i < hull.length; i++) {
    const p = hull[i];
    const q = hull[(i + 1) % hull.length];
    const turn = Math.sign(vcross(p, q));
    if (!turn) continue;
    if (sign && turn !== sign) return false;
    sign = turn;
  }
  return sign !== 0;
}
function buildTripleLines(
  p1: Vec2,
  p2: Vec2,
  offsetWorld: number
): [LineSeg, LineSeg, LineSeg] {
  const dir = vsub(p2, p1);
  const n = vnorm(vperp(dir));
  const o = vscale(n, offsetWorld);
  return [
    {
      x1: p1.x + o.x,
      y1: p1.y + o.y,
      x2: p2.x + o.x,
      y2: p2.y + o.y,
      widthPx: 0,
    },
    { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, widthPx: 0 },
    {
      x1: p1.x - o.x,
      y1: p1.y - o.y,
      x2: p2.x - o.x,
      y2: p2.y - o.y,
      widthPx: 0,
    },
  ];
}

/**
 * A line as a point and a direction; the cut the wide end of a wedge follows.
 * `reach` is how far a corner may travel to land on it - see WEDGE_MITRE_REACH.
 */
type Cut = { on: Vec2; dir: Vec2; key: number; reach: number };

/**
 * A bond carrying on from the wide end of a wedge: which way it goes, how far
 * it reaches either side of its own line - `plus` on the side `vperp(dir)`
 * points to, `minus` on the other - and how long it is. A double bond reaches
 * past its centre where its lines are: half the gap either side when it is
 * drawn centred, and the whole gap on the one side its second line takes
 * otherwise, with nothing past its own line on the other. A cut that only
 * knew about a single line would leave the outer one stranded off the wedge;
 * one that took a second line to be on both sides would stand the wedge's
 * corner out past a bond that has nothing there.
 *
 * `wide` says it is drawn as more than one line, and `centred` that none of
 * them runs along the bond itself: the two lines of a centred double bond.
 */
type Neighbour = {
  dir: Vec2;
  plus: number;
  minus: number;
  wide: boolean;
  centred: boolean;
  len: number;
  /** Where its lines lie off its own line, the `plus` side positive. */
  lines: number[];
};

/**
 * A bond that runs nearly straight on through the wide end of a wedge cannot
 * be followed: its edge is almost the wedge's own, so the corner that chases
 * it runs off towards infinity. Past this angle between the two the wide end
 * is cut square across instead.
 */
const WEDGE_CUT_MAX_DEG = 175;

/**
 * How far along the bond it follows a corner of the wide end may travel. This
 * is a mitre limit: the shallower the angle, the further the corner has to go
 * to meet the bond's edge, and letting it run would swallow the bond whole.
 * Half the bond keeps the join inside the bond that makes it; beyond that the
 * wide end is cut square and the bond leaves it with a step.
 */
const WEDGE_MITRE_REACH = 0.5;

/** The limits a broad end's cut keeps to: see WEDGE_CUT_MAX_DEG and WEDGE_MITRE_REACH. */
type CutRule = { minSin: number; reach: number };

function cutRuleOf(opts: LayoutOptions): CutRule {
  const maxDeg = opts.wedgeCutMaxDeg ?? WEDGE_CUT_MAX_DEG;
  return {
    minSin: Math.sin(((180 - maxDeg) * Math.PI) / 180),
    reach: opts.wedgeCornerReach ?? WEDGE_MITRE_REACH,
  };
}

const ACS_CUT_RULE: CutRule = cutRuleOf({} as LayoutOptions);

/**
 * Where the wide end of a wedge meets another bond, a square cut leaves a
 * notch on the side the bond descends to. Pick, for this side of the wedge,
 * the bond to follow and the line to cut along: one of that bond's edges,
 * half a line width off its centre, so the cut face and that edge are one run.
 *
 * Which edge depends on what else is at the atom. A single bond carries on
 * away from the wedge, and the edge that carries the outline round is its far
 * one, so the cut takes the bond in whole. Where two bonds carry on, each is
 * followed by its near edge, which is the outline between them, and the two
 * cuts meet in the dent.
 */
function baseCut(
  atom: Vec2,
  side: number,
  axis: Vec2,
  neighbours: Neighbour[],
  rule: CutRule = ACS_CUT_RULE,
): Cut | null {
  if (neighbours.length === 0) return null;
  const n = vperp(axis);
  // the neighbour furthest round to this side; with only one bond both sides
  // follow it, which is the cut parallel to that bond
  let key = -1;
  let best = -Infinity;
  for (let i = 0; i < neighbours.length; i++) {
    const m = neighbours[i].dir;
    const d = (m.x * n.x + m.y * n.y) * side;
    if (d > best) {
      best = d;
      key = i;
    }
  }
  if (key < 0) return null;
  const { dir, plus, minus, wide, centred, len } = neighbours[key];
  const half = Math.max(plus, minus);
  // A bond running nearly straight on through the wide end cannot usefully be
  // cut along: its line is almost the wedge's own, and following it would
  // draw the end out into a spike. Square across the wedge is what carries
  // such a bond out of it, and the other side still follows its own bond.
  if (Math.abs(vcross(dir, axis)) < rule.minSin) {
    return {
      on: vadd(atom, vscale(axis, -half)),
      dir: vperp(axis),
      key,
      // square across the axis: the corner only has to come back as far as
      // the cut itself, whatever the bond does
      reach: half * 4,
    };
  }
  const off = vperp(dir);
  const towardsTip = off.x * axis.x + off.y * axis.y >= 0 ? 1 : -1;
  // Take the bond in whole when it is the only one carrying on: its second
  // line, wherever it is, then runs into the end rather than stopping short
  // of it. Where another bond carries on too, each is followed by the edge of
  // its own line nearest the narrow end, as a single bond is, and a second
  // line beside it is left short, as it is drawn - it lies in the dent
  // between the two, where the end has no business; drawn out to it, the
  // corner would run into a spike. A centred double bond has no line of its
  // own there: its near line is followed, which runs into the end, while its
  // far one goes on to meet the other bond (see centredClose). A triple bond,
  // a line either side of its own, is taken whole as before.
  const lines = neighbours[key].lines;
  const triple = lines.length > 2;
  const takeWhole = neighbours.length === 1 || triple;
  const edge = takeWhole ? -towardsTip : towardsTip;
  // (its own line's edge: a second line beside it does not count here)
  const ownHalf = Math.min(plus, minus);
  const reach = !takeWhole && wide && !centred ? ownHalf : edge > 0 ? plus : minus;
  return {
    on: vadd(atom, vscale(off, edge * reach)),
    dir,
    key,
    reach: len * rule.reach,
  };
}

/**
 * Where a double bond meets another at an atom, the line beside each of them
 * should meet its neighbour's rather than stop short of it: run on to where
 * the two would cross. Returns the point to end at, or the one given, and
 * says whether it found a line to meet: two thick lines that end on the same
 * point still want a cap over the corner they leave open.
 */
function mitreOffsetEnd(
  atoms: Atom[],
  atIdx: number,
  from: Vec2,
  along: Vec2,
  outward: Vec2,
  offset: number,
  fallback: Vec2,
  sideOf: (b: Bond) => number[],
  others: Bond[],
  limit: number,
): { at: Vec2; met: boolean } {
  const at = { x: atoms[atIdx].x, y: atoms[atIdx].y };
  const mine = { on: vadd(from, vscale(vperp(along), offset)), dir: along };
  let best: Vec2 | null = null;
  let bestD = Infinity;
  for (const b of others) {
    const far = b.a1 === atIdx ? b.a2 : b.a1;
    const o = atoms[far];
    if (!o) continue;
    const d = vsub({ x: o.x, y: o.y }, at);
    if (vlen(d) < 1e-9) continue;
    const dir = vnorm(d);
    // Offsets are reported against the bond's own direction, a1 to a2. Here
    // the direction runs from this atom outwards, which is the other way
    // round when the bond ends at this atom rather than starting from it, and
    // a line taken to the wrong side of it is one no end will ever meet.
    const flip = b.a1 === atIdx ? 1 : -1;
    // the two bonds' own directions from the atom; a line belongs to the
    // side of the corner its offset leans towards
    const bisect = vnorm(vadd(outward, dir));
    const sideMine = Math.sign(
      vperp(along).x * offset * bisect.x + vperp(along).y * offset * bisect.y,
    );
    for (const raw of sideOf(b)) {
      const off = raw * flip;
      const sideOther = Math.sign(
        vperp(dir).x * off * bisect.x + vperp(dir).y * off * bisect.y,
      );
      // only ever meet the line on the same side of the corner
      if (sideMine * sideOther < 0) continue;
      const line = { on: vadd(at, vscale(vperp(dir), off)), dir };
      const den = vcross(mine.dir, line.dir);
      if (Math.abs(den) < 1e-6) continue;
      const s = vcross(vsub(line.on, mine.on), line.dir) / den;
      const p = vadd(mine.on, vscale(mine.dir, s));
      const dist = vlen(vsub(p, at));
      if (dist > limit || dist >= bestD) continue;
      best = p;
      bestD = dist;
    }
  }
  return { at: best ?? fallback, met: best != null };
}

/**
 * How far the line beside a double bond stops short of an atom. Where it runs
 * inside the angle the bond makes with another bond there, it ends on the
 * bisector of that angle - its offset over the tangent of half the angle, so
 * 1.5 pt at a 120 degree corner in ACS proportions. With nothing on its side
 * it runs right up to the atom.
 */
function sideLineBack(
  atoms: Atom[],
  atIdx: number,
  outward: Vec2,
  side: Vec2,
  offset: number,
  others: Bond[],
): number {
  const at = atoms[atIdx];
  let back = 0;
  for (const b of others) {
    const o = atoms[b.a1 === atIdx ? b.a2 : b.a1];
    if (!o) continue;
    const d = vsub({ x: o.x, y: o.y }, { x: at.x, y: at.y });
    if (vlen(d) < 1e-9) continue;
    const u = vnorm(d);
    if (vdot(u, side) <= 1e-9) continue;
    const theta = Math.acos(Math.max(-1, Math.min(1, vdot(u, outward))));
    if (theta < 1e-6) continue;
    back = Math.max(back, offset / Math.tan(theta / 2));
  }
  return back;
}

/** A plain bond: one line, no stereo, nothing else to it. */
function isPlainSingle(b: Bond): boolean {
  return b.order === 1 && (b.stereo == null || b.stereo === "none");
}

/**
 * Where the line of a centred double bond that lies `offset` off it (on the
 * side of its own a1-to-a2 normal) meets a plain bond leaving `atIdx` along
 * `u`: on that bond's own line. The double bond and the plain one each ask
 * this with the same arguments, so they agree on the point exactly.
 */
function centredMeetPoint(
  atoms: Atom[],
  dbl: Bond,
  atIdx: number,
  offset: number,
  u: Vec2,
): Vec2 | null {
  const a = atoms[dbl.a1];
  const c = atoms[dbl.a2];
  const at = atoms[atIdx];
  const d = vnorm(vsub({ x: c.x, y: c.y }, { x: a.x, y: a.y }));
  const n = vperp(d);
  const den = vcross(d, u);
  if (Math.abs(den) < 1e-6) return null;
  // at + n*offset + t*d lies on at + k*u
  const t = (-offset * vcross(n, u)) / den;
  return vadd({ x: at.x, y: at.y }, vadd(vscale(n, offset), vscale(d, t)));
}

/** Where the lines of a double bond sit, either side of its own line. */
function doubleOffsets(
  b: Bond,
  off: number,
  doubleSides?: Map<Bond, number | undefined>,
): number[] {
  if (b.order !== 2) return [];
  const mode = b.doubleMode || "auto";
  if (mode === "center") return [off * 0.5, -off * 0.5];
  if (mode === "left") return [off];
  if (mode === "right") return [-off];
  const sgn = doubleSides?.get(b);
  return sgn == null ? [off * 0.5, -off * 0.5] : [off * sgn];
}

/**
 * The two lines of a double bond drawn centred, each carried on to meet the
 * line of a neighbouring double bond where they share an atom. Left to stop
 * short, consecutive double bonds read as four loose lines rather than a
 * chain. Not at a labelled atom, though: the label has already taken the
 * bond's end, and a line run on from there would cross the letters.
 */
function centredPair(
  p1: Vec2,
  p2: Vec2,
  dir: Vec2,
  n: Vec2,
  off: number,
  widthPx: number,
  bond: Bond,
  atoms: Atom[],
  labelled: (idx: number) => boolean,
  adjBonds?: Map<number, Bond[]>,
  doubleSides?: Map<Bond, number | undefined>,
  joinMinDeg = 20,
): { lines: LineSeg[]; meets: Meet[]; ends: Vec2[] } {
  const half = off * 0.5;
  const limit = off * 2;
  const sideOf = (b: Bond) => doubleOffsets(b, off, doubleSides);
  const others = (idx: number) =>
    labelled(idx)
      ? []
      : (adjBonds?.get(idx) ?? []).filter(
          (b) => b !== bond && b.order === 2 && b.stereo !== "up" && b.stereo !== "down",
        );
  const out: LineSeg[] = [];
  const meets: Meet[] = [];
  const ends: Vec2[] = [];
  for (const sgn of [1, -1]) {
    const o = vscale(n, half * sgn);
    const a = vadd(p1, o);
    const b = vadd(p2, o);
    const endA = mitreOffsetEnd(
      atoms,
      bond.a1,
      p1,
      dir,
      dir,
      half * sgn,
      a,
      sideOf,
      others(bond.a1),
      limit,
    );
    const endB = mitreOffsetEnd(
      atoms,
      bond.a2,
      p2,
      dir,
      vscale(dir, -1),
      half * sgn,
      b,
      sideOf,
      others(bond.a2),
      limit,
    );
    // Not met by a double bond's line: run on to the plain bond on this
    // line's side, the way ACS 1996 draws a centred double bond. That bond
    // still reaches the atom, so the line ends on it partway, and the corner
    // is finished between the line and that bond both ways.
    const plainEnd = (
      atIdx: number,
      outward: Vec2,
      end: { at: Vec2; met: boolean },
    ): { at: Vec2; met: boolean; through?: Vec2 } => {
      if (end.met || labelled(atIdx)) return end;
      const atom = atoms[atIdx];
      let best: Vec2 | null = null;
      let bestU: Vec2 | null = null;
      let bestT = -Infinity;
      for (const nb of adjBonds?.get(atIdx) ?? []) {
        if (nb === bond || !isPlainSingle(nb)) continue;
        const far = atoms[nb.a1 === atIdx ? nb.a2 : nb.a1];
        if (!far) continue;
        const u0 = vsub({ x: far.x, y: far.y }, { x: atom.x, y: atom.y });
        if (vlen(u0) < 1e-9) continue;
        const u = vnorm(u0);
        if (Math.sign(vdot(u, n)) !== Math.sign(sgn)) continue;
        const pt = centredMeetPoint(atoms, bond, atIdx, half * sgn, u);
        if (!pt) continue;
        // A bond leaving nearly straight on is met far behind the atom, or
        // nowhere: past 20 degrees off straight on the line meets it, closer
        // than that it stops at the atom like any line with nothing to meet.
        const behind = -vdot(vsub(pt, { x: atom.x, y: atom.y }), outward);
        if (behind > half / Math.tan((joinMinDeg * Math.PI) / 180)) continue;
        // the first plain bond the line reaches, coming in from the bond
        const t = vdot(vsub(pt, { x: atom.x, y: atom.y }), outward);
        if (t > bestT) {
          best = pt;
          bestU = u;
          bestT = t;
        }
      }
      return best && bestU ? { at: best, met: true, through: bestU } : end;
    };
    const endA2 = plainEnd(bond.a1, dir, endA);
    const endB2 = plainEnd(bond.a2, vscale(dir, -1), endB);
    endA.at = endA2.at;
    endA.met = endA2.met;
    endB.at = endB2.at;
    endB.met = endB2.met;
    const along = vnorm(vsub(endB.at, endA.at));
    if (endA.met) meets.push({ at: endA.at, dir: along });
    else ends.push(endA.at);
    if (endB.met) meets.push({ at: endB.at, dir: vscale(along, -1) });
    else ends.push(endB.at);
    for (const e of [endA2, endB2]) {
      if (!e.through) continue;
      meets.push({ at: e.at, dir: e.through }, { at: e.at, dir: vscale(e.through, -1) });
    }
    out.push({
      x1: endA.at.x,
      y1: endA.at.y,
      x2: endB.at.x,
      y2: endB.at.y,
      widthPx,
    });
  }
  return { lines: out, meets, ends };
}

/** Where two cuts cross: the point both bonds' outlines meet at. */
function cutsCross(a: Cut, b: Cut): Vec2 | null {
  const den = vcross(a.dir, b.dir);
  if (Math.abs(den) < 1e-6) return null;
  const s = vcross(vsub(b.on, a.on), b.dir) / den;
  return vadd(a.on, vscale(a.dir, s));
}

/**
 * Slides a base corner along the wedge's edge until it sits on the cut, or
 * gives up. A bond leaving the atom at a shallow angle to the wedge meets that
 * edge far away; cutting to it would draw the wedge out into a spike instead
 * of tidying its end, and a square end there is no worse than any other bond
 * end, so the corner is left alone.
 */
function cornerOnCut(
  cut: Cut | null,
  corner: Vec2,
  tipCorner: Vec2,
  intoWedge: number,
): Vec2 | null {
  if (!cut) return null;
  const e = vnorm(vsub(tipCorner, corner));
  const den = vcross(e, cut.dir);
  // nearly parallel to the edge: the cut would run off to infinity
  if (Math.abs(den) < 1e-6) return null;
  const t = vcross(vsub(cut.on, corner), cut.dir) / den;
  if (t > intoWedge || t < -cut.reach) return null;
  return vadd(corner, vscale(e, t));
}

/**
 * Replaces each corner of a polygon with an arc of `radius`, the way a round
 * join does. The radius is reduced where an edge is too short to give it room,
 * so a wedge's narrow end becomes a semicircle rather than losing its shape.
 *
 * Only corners that stick out are rounded, and only those `soften` allows. A
 * corner that folds inwards, or one that a bond runs into, keeps its point:
 * rounding it would scoop out the join instead of softening a free edge.
 */
export function roundPolyCorners(
  points: Vec2[],
  radius: number,
  soften?: boolean[],
  segments = 4,
): Vec2[] {
  const n = points.length;
  if (n < 3 || radius <= 0) return points;
  // which way the outline is wound, so a corner can be told from a dent
  let twice = 0;
  for (let i = 0; i < n; i++) {
    const p = points[i];
    const q = points[(i + 1) % n];
    twice += p.x * q.y - q.x * p.y;
  }
  const winding = twice >= 0 ? 1 : -1;
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const b = points[i];
    const a = points[(i - 1 + n) % n];
    const c = points[(i + 1) % n];
    if (soften && !soften[i]) {
      out.push(b);
      continue;
    }
    if (vcross(vsub(b, a), vsub(c, b)) * winding < 0) {
      out.push(b);
      continue;
    }
    const v1 = vsub(a, b);
    const v2 = vsub(c, b);
    const l1 = vlen(v1);
    const l2 = vlen(v2);
    if (l1 < 1e-9 || l2 < 1e-9) {
      out.push(b);
      continue;
    }
    const u1 = vscale(v1, 1 / l1);
    const u2 = vscale(v2, 1 / l2);
    const cosA = Math.max(-1, Math.min(1, u1.x * u2.x + u1.y * u2.y));
    const angle = Math.acos(cosA);
    // straight or folded back on itself: nothing to round
    if (angle < 1e-3 || Math.PI - angle < 1e-3) {
      out.push(b);
      continue;
    }
    const half = angle / 2;
    // keep the arc inside both edges, sharing each with the next corner
    const dist = Math.min(radius / Math.tan(half), l1 / 2, l2 / 2);
    const r = dist * Math.tan(half);
    const t1 = vadd(b, vscale(u1, dist));
    const t2 = vadd(b, vscale(u2, dist));
    const bis = vnorm(vadd(u1, u2));
    const centre = vadd(b, vscale(bis, r / Math.sin(half)));
    const a1 = Math.atan2(t1.y - centre.y, t1.x - centre.x);
    const a2 = Math.atan2(t2.y - centre.y, t2.x - centre.x);
    let sweep = a2 - a1;
    while (sweep > Math.PI) sweep -= 2 * Math.PI;
    while (sweep < -Math.PI) sweep += 2 * Math.PI;
    const steps = Math.max(1, Math.ceil(Math.abs(sweep) / (Math.PI / 8)));
    const count = Math.max(steps, segments);
    for (let k = 0; k <= count; k++) {
      const ang = a1 + (sweep * k) / count;
      out.push({
        x: centre.x + r * Math.cos(ang),
        y: centre.y + r * Math.sin(ang),
      });
    }
  }
  return out;
}

/**
 * Fills the notches where bonds meet at an atom the way a mitre join does:
 * for each gap between two bonds, out to the point where the outlines of the
 * two would cross. A gap too shallow for that is cut off square instead.
 */
export function mitreJoinPolys(
  centre: Vec2,
  dirs: Vec2[],
  halfWidth: number,
  miterLimit = 4,
): Poly[] {
  if (dirs.length < 2 || halfWidth <= 0) return [];
  const round = [...dirs].sort(
    (a, b) => Math.atan2(a.y, a.x) - Math.atan2(b.y, b.x),
  );
  const out: Poly[] = [];
  for (let i = 0; i < round.length; i++) {
    const d1 = round[i];
    const d2 = round[(i + 1) % round.length];
    // the two outlines facing the gap that runs anticlockwise from d1 to d2
    const e1 = vadd(centre, vscale(vperp(d1), halfWidth));
    const e2 = vsub(centre, vscale(vperp(d2), halfWidth));
    const den = vcross(d1, d2);
    let apex: Vec2 | null = null;
    if (Math.abs(den) > 1e-6) {
      const s = vcross(vsub(e2, e1), d2) / den;
      const p = vadd(e1, vscale(d1, s));
      if (vlen(vsub(p, centre)) <= halfWidth * miterLimit) apex = p;
    }
    out.push({
      points: apex ? [centre, e1, apex, e2] : [centre, e1, e2],
    });
  }
  return out;
}

/**
 * A broad end at `p`: the wide end of a wedge, or either end of a bold bond,
 * `half` either side of the bond, which leaves `p` along `dir`. It is cut
 * along the bonds that continue from the atom - following each of them where
 * there are two, which dents the middle of the cut inwards - and square
 * across where nothing does. `farL` and `farR` are the corners at the other
 * end, on the left and right of `dir`, which no corner may slide past;
 * `capHalf` is how far a square end reaches back past an atom other bonds
 * meet at, to cover the join there.
 *
 * Returns the end's outline from its left corner to its right, and which of
 * those points are free corners that rounding may soften.
 */
function broadEnd(
  p: Vec2,
  dir: Vec2,
  half: number,
  neighbours: Neighbour[],
  farL: Vec2,
  farR: Vec2,
  capHalf: number,
  rule: CutRule = ACS_CUT_RULE,
): { points: Vec2[]; soften: boolean[] } {
  const nb = vscale(vperp(dir), half);
  const cutL = baseCut(p, 1, dir, neighbours, rule);
  const cutR = baseCut(p, -1, dir, neighbours, rule);
  // A corner may slide towards the far end as far as the far corner and no
  // further, and back past the atom as far as the cut it follows allows.
  const squareL = vadd(p, nb);
  const squareR = vsub(p, nb);
  const cornerL = cornerOnCut(cutL, squareL, farL, vlen(vsub(farL, squareL)));
  const cornerR = cornerOnCut(cutR, squareR, farR, vlen(vsub(farR, squareR)));
  // Either both corners follow their cut or neither does. One alone leaves the
  // end slewed across the bond, which at some angles no longer covers the
  // atom at all and cuts the bonds there adrift.
  const mitredL = cornerR ? cornerL : null;
  const mitredR = cornerL ? cornerR : null;
  // A square end left at an atom other bonds meet would stop right at the
  // atom, and the cap that fills the join there would bulge out of it. Reach
  // the cap's width past the atom instead, so the end covers it.
  const back =
    neighbours.length > 0
      ? vscale(dir, -Math.min(capHalf, half))
      : { x: 0, y: 0 };
  const baseL = mitredL ?? vadd(squareL, back);
  const baseR = mitredR ?? vadd(squareR, back);
  const points = [baseL];
  // A corner cut along a bond carries on into that bond, so it is not a free
  // corner and must stay as it is; the rest may be softened.
  const soften = [!mitredL];
  const close =
    mitredL && mitredR && cutL && cutR && cutL.key !== cutR.key
      ? centredClose(p, neighbours, cutL.key, cutR.key)
      : null;
  if (close) {
    // one of the two is a centred double bond: the end closes the gap between
    // its lines (see centredClose)
    points.push(close);
    soften.push(false);
  } else if (mitredL && mitredR && cutL && cutR && cutL.key !== cutR.key) {
    // Two bonds carry on from the end, so the cut follows one on each side
    // and turns between them.
    const edge = vsub(baseR, baseL);
    const n = vperp(edge);
    const outwards = n.x * dir.x + n.y * dir.y >= 0 ? 1 : -1;
    const inwards =
      ((p.x - baseL.x) * n.x + (p.y - baseL.y) * n.y) * outwards > 0;
    if (inwards) {
      // the turn is inwards: stop at the atom rather than at where the two
      // outlines cross, which is further out than anything else there reaches
      // and would show a sliver of background through the join
      points.push(p);
      soften.push(false);
    } else {
      // the turn is outwards - a bond carrying straight on through the end
      // puts it there - so follow both cuts to where they meet
      const cross = cutsCross(cutL, cutR);
      if (cross && vlen(vsub(cross, p)) <= half) {
        points.push(cross);
        soften.push(false);
      }
    }
  }
  points.push(baseR);
  soften.push(!mitredR);
  return { points, soften };
}

/**
 * Where a broad end between two bonds turns when one of them is a centred
 * double bond, or null when neither or both are. A centred double bond has
 * no line along its own: its near line runs into the end, which follows that
 * line's edge, and its far line runs on to meet the other bond. Between them
 * is a gap, open towards the atom. A turn at the atom would cut back across
 * it and leave the other bond's square end standing in it; a straight cut
 * from corner to corner would leave the atom out. Turning at the corner of
 * the other bond's end on the gap's side closes the gap with one straight
 * edge and takes that end in whole.
 */
function centredClose(
  p: Vec2,
  neighbours: Neighbour[],
  keyL: number,
  keyR: number,
): Vec2 | null {
  const a = neighbours[keyL];
  const b = neighbours[keyR];
  if (!a || !b || a.centred === b.centred) return null;
  const [double, other] = a.centred ? [a, b] : [b, a];
  // (the gap's side is told by where the double bond lies from the other)
  const n = vperp(other.dir);
  const towardsDouble = vdot(n, double.dir) >= 0 ? 1 : -1;
  // the other bond's own line's half width, on that side
  const half = towardsDouble > 0 ? other.plus - Math.max(0, ...other.lines) : other.minus - Math.max(0, ...other.lines.map((v) => -v));
  return vadd(p, vscale(n, towardsDouble * half));
}

/**
 * Solid wedge. Neither end is a point: the narrow end is as wide as a plain
 * bond so the join at an atom is as clean as a line-to-line one, and the wide
 * end is a broad end, cut along the bonds that continue from its atom.
 * `tipAtLabel` says a label has taken the narrow end, which then stops where
 * a line would.
 */
function buildWedgeTriangle(
  p1: Vec2,
  p2: Vec2,
  baseHalfWorld: number,
  tipHalfWorld: number,
  baseNeighbours: Neighbour[] = [],
  round = false,
  tipAtLabel = false,
  rule: CutRule = ACS_CUT_RULE,
  squareBase = false,
): Poly {
  const dir = vnorm(vsub(p2, p1));
  // Keep a taper even when the minimum line width would otherwise make the
  // narrow end as wide as the base (very low zoom).
  const tipHalf = Math.min(tipHalfWorld, baseHalfWorld * 0.5);
  const nt = vscale(vperp(dir), tipHalf);
  // Reach just past the atom so the flat tip overlaps the bonds meeting there,
  // the way a mitred line join does. At a label there is nothing to overlap:
  // a square end stops flat where the line would, and a round one is rounded
  // about that point, as a line's cap is.
  const tip = vadd(p2, vscale(dir, tipAtLabel && !round ? 0 : tipHalf));
  const tipL = vadd(tip, nt);
  const tipR = vsub(tip, nt);
  const base = broadEnd(
    p1,
    dir,
    baseHalfWorld,
    baseNeighbours,
    tipL,
    tipR,
    tipHalfWorld,
    rule,
  );
  const points = [...base.points, tipR, tipL];
  // (a base another shape in perspective meets is kept square: see buildBoldBar)
  const soften = [...base.soften.map((v) => v && !squareBase), true, true];
  return {
    points: round ? roundPolyCorners(points, tipHalf, soften) : points,
  };
}

/**
 * A bold bond, as ACS 1996 draws it: a bar `half` either side of the line,
 * each end a broad end cut along the bonds continuing from its atom, as a
 * wedge's wide end is. Round ends round its free corners by half its width,
 * so an end that meets nothing is a half circle - but for one another of a
 * ring in perspective's shapes is broad at (`square1`, `square2`): that end
 * stays square, the outer corner between the two filled after
 * (perspectiveCorners).
 */
function buildBoldBar(
  p1: Vec2,
  p2: Vec2,
  half: number,
  lineHalf: number,
  neighbours1: Neighbour[],
  neighbours2: Neighbour[],
  round: boolean,
  rule: CutRule = ACS_CUT_RULE,
  square1 = false,
  square2 = false,
): Poly {
  const dir = vnorm(vsub(p2, p1));
  const n = vscale(vperp(dir), half);
  // each end may reach no further than the middle of the bar
  const mid = vscale(vadd(p1, p2), 0.5);
  const end1 = broadEnd(p1, dir, half, neighbours1, vadd(mid, n), vsub(mid, n), lineHalf, rule);
  const back = vscale(dir, -1);
  const end2 = broadEnd(p2, back, half, neighbours2, vsub(mid, n), vadd(mid, n), lineHalf, rule);
  const points = [...end1.points, ...end2.points];
  const soften = [...end1.soften.map((v) => v && !square1), ...end2.soften.map((v) => v && !square2)];
  return {
    points: round ? roundPolyCorners(points, half, soften) : points,
  };
}

/**
 * The hashes of a hashed wedge, from `narrow` (the stereocentre) along `dir`,
 * over `start`..`end` of the bond, measured from the narrow atom.
 *
 * ACS 1996 draws it as a solid wedge cut into hashes: an outline running from
 * `startHalf` either side at `start` - half a line width, for a wedge - to
 * `wideHalf` at `end`, and each hash the part of it one line width deep - a trapezoid, its ends following the
 * outline. The first hash sits flush with `start` and the last with `end`,
 * and as many lie between as fit at least the hash spacing apart, spread
 * evenly. Round ends make each hash a line with a cap at either end instead,
 * reaching across the outline as far as the trapezoid does at its middle.
 */
function buildHashes(
  narrow: Vec2,
  dir: Vec2,
  start: number,
  end: number,
  startHalf: number,
  wideHalf: number,
  spacing: number,
  lineWidth: number,
  round: boolean,
): { lines: LineSeg[]; polys: Poly[]; ends: Vec2[] } {
  const out = { lines: [] as LineSeg[], polys: [] as Poly[], ends: [] as Vec2[] };
  if (!(end > 0) || !(lineWidth > 0)) return out;
  // Too short for more than one: a single hash, flush with the wide end.
  const from = Math.max(0, Math.min(start, end - lineWidth));
  const n = vperp(dir);
  const depth = Math.min(lineWidth, end - from);
  const first = from + depth / 2;
  const last = end - depth / 2;
  const count =
    spacing > 0 ? 1 + Math.floor((last - first) / spacing + 1e-9) : 1;
  // half the outline's width, a distance `at` from the narrow atom
  const halfAt = (at: number) =>
    Math.max(0, startHalf + (wideHalf - startHalf) * ((at - from) / (end - from)));
  const point = (at: number, side: number) =>
    vadd(narrow, vadd(vscale(dir, at), vscale(n, side)));
  for (let k = 0; k < count; k++) {
    const at = count > 1 ? first + ((last - first) * k) / (count - 1) : last;
    if (round) {
      const half = Math.max(0, halfAt(at) - lineWidth / 2);
      const a = point(at, half);
      const b = point(at, -half);
      out.lines.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, widthPx: 0 });
      out.ends.push(a, b);
    } else {
      const near = at - depth / 2;
      const far = at + depth / 2;
      out.polys.push({
        points: [
          point(near, halfAt(near)),
          point(far, halfAt(far)),
          point(far, -halfAt(far)),
          point(near, -halfAt(near)),
        ],
      });
    }
  }
  return out;
}

/**
 * A dashed bond: dashes of `dash` along the line from `p1` to `p2`, one flush
 * with each end and as many between as leave gaps of at least `gap`, spread
 * evenly.
 */
function buildDashes(p1: Vec2, p2: Vec2, dash: number, gap: number): LineSeg[] {
  const d = vsub(p2, p1);
  const L = vlen(d);
  if (!(L > 0)) return [];
  const seg = (a: number, b: number): LineSeg => {
    const u = vscale(d, 1 / L);
    const s = vadd(p1, vscale(u, a));
    const e = vadd(p1, vscale(u, b));
    return { x1: s.x, y1: s.y, x2: e.x, y2: e.y, widthPx: 0 };
  };
  if (!(dash > 0) || L <= dash + Math.max(gap, 0) + dash) return [seg(0, L)];
  const count = Math.max(2, Math.floor((L + gap) / (dash + gap) + 1e-9));
  const g = (L - count * dash) / (count - 1);
  const out: LineSeg[] = [];
  for (let k = 0; k < count; k++) {
    const at = k * (dash + g);
    out.push(seg(at, at + dash));
  }
  return out;
}

/**
 * A dative bond: a line from the donor `from` to the acceptor `to`, and a
 * filled head at the acceptor's end, its point where the line would end.
 */
function buildDativeArrow(
  from: Vec2,
  to: Vec2,
  headLength: number,
  headHalf: number,
): { line: LineSeg | null; head: Poly } {
  const d = vsub(to, from);
  const L = vlen(d);
  const u = L > 0 ? vscale(d, 1 / L) : { x: 1, y: 0 };
  const length = Math.min(headLength, L);
  const base = vsub(to, vscale(u, length));
  const n = vscale(vperp(u), headHalf);
  // the line runs into the head, so no sliver shows between them
  const into = vsub(to, vscale(u, length / 2));
  return {
    line:
      L > length
        ? { x1: from.x, y1: from.y, x2: into.x, y2: into.y, widthPx: 0 }
        : null,
    head: { points: [vadd(base, n), to, vsub(base, n)] },
  };
}

/**
 * Whether a wavy bond's wave starts at its a1: the stereocentre, the atom
 * with more bonds, or a1 when they have as many. The drawing and the caps at
 * its atoms both ask this, so that they cannot come to disagree about which
 * end the wave reaches.
 */
function wavyFromA1(bond: Bond, deg?: Map<number, number>): boolean {
  return (deg?.get(bond.a1) || 0) >= (deg?.get(bond.a2) || 0);
}

/**
 * How many steps a wavy bond's turn is drawn in: even in angle, so a turn
 * stays round - about 2 px each on screen.
 */
function waveSteps(amp: number, half: number, zoom: number): number {
  return Math.max(12, Math.min(64, Math.ceil((Math.PI * Math.max(amp, half / 2) * zoom) / 2)));
}

/**
 * A wavy bond, as ACS 1996 draws it: half circles alternately either side of
 * the line - half ellipses, if the amplitude is not a quarter of the period -
 * starting on the line at `from`, the stereocentre, and swinging first to the
 * right going out. The wave is made of quarter turns, as many as fit between
 * the two atoms, so it ends either back on the line or at the top of a turn.
 * Only `start`..`end` of it is drawn, measured from `from`: a label cuts the
 * wave where it is rather than squeezing it into less room.
 */
function buildWavySegments(
  from: Vec2,
  to: Vec2,
  start: number,
  end: number,
  amp: number,
  period: number,
  zoom: number,
): LineSeg[] {
  const dir = vnorm(vsub(to, from));
  // to the right, going out
  const right = vscale(vperp(dir), -1);
  const half = period / 2;
  if (!(half > 0)) return [];
  const quarters = Math.floor(vlen(vsub(to, from)) / (half / 2) + 1e-9);
  const last = Math.min(end, (quarters * half) / 2);
  if (!(last > start)) return [];
  // A point on the wave, a distance `u` along the line: turn k runs from
  // k half-waves out to k + 1, as an angle from 0 to pi about its middle.
  const at = (u: number): Vec2 => {
    const k = Math.min(Math.floor(u / half), Math.max(0, Math.ceil(last / half) - 1));
    const phi = Math.acos(Math.max(-1, Math.min(1, 1 - (2 * (u - k * half)) / half)));
    return waveAt(k, phi);
  };
  const waveAt = (k: number, phi: number): Vec2 => {
    const along = k * half + (half / 2) * (1 - Math.cos(phi));
    const side = (k % 2 === 0 ? 1 : -1) * amp * Math.sin(phi);
    return vadd(from, vadd(vscale(dir, along), vscale(right, side)));
  };
  const perTurn = waveSteps(amp, half, zoom);
  const points: Vec2[] = [at(start)];
  const firstTurn = Math.floor(start / half);
  for (let k = firstTurn; k * half < last; k++) {
    for (let i = 1; i <= perTurn; i++) {
      const phi = (Math.PI * i) / perTurn;
      const along = k * half + (half / 2) * (1 - Math.cos(phi));
      if (along <= start + 1e-12) continue;
      if (along >= last - 1e-12) break;
      points.push(waveAt(k, phi));
    }
  }
  points.push(at(last));
  const out: LineSeg[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (vlen(vsub(b, a)) < 1e-12) continue;
    out.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, widthPx: 0 });
  }
  return out;
}

/**
 * Whether an atom with bonds is drawn with its label: anything but a
 * carbon, and a carbon when every carbon is, when it is one isotope in
 * particular (¹³C), or - where the style has it so - when it is charged or
 * has an electron unpaired. Otherwise a carbon is its bonds' meeting, and
 * its charge sits beside it.
 */
export function showsLabel(
  a: Pick<Atom, "el" | "charge" | "radical" | "isotope" | "valence" | "shown">,
  opts: Pick<LayoutOptions, "showCarbonLabels" | "showChargedCarbons">,
): boolean {
  return (
    opts.showCarbonLabels ||
    a.el !== "C" ||
    !!a.shown ||
    !!a.isotope ||
    // (a carbon of other than four bonds' valence says so: its hydrogens with it)
    (a.valence != null && a.valence !== 4) ||
    (!!opts.showChargedCarbons && (!!a.charge || !!a.radical))
  );
}

const ELEMENT_SYMBOLS = new Set(ELEMENTS.map((e) => e.symbol));

/**
 * How an atom that is not an element is labelled, or nothing for one that
 * is: an Rgroup R with its numbers set superscript (IUPAC GR-9.1: R¹, not
 * R₁); an atom list in brackets (GR-9.1); any other label - an
 * abbreviation, a class such as Ar, a reserved atom type such as A or Q -
 * with its counts subscript, read outward from its bond where that comes in
 * from the right (GR-2.3: TBSO). `anchor` is the run that sits on the atom.
 */
function specialLabel(a: Atom, fromRight: boolean): { runs: TextRun[]; anchor: number } | null {
  if (a.el === "R#" || (a.rgroups?.length && !ELEMENT_SYMBOLS.has(a.el))) {
    const n = a.rgroups?.join(",") ?? "";
    return { runs: n ? [{ text: "R" }, { text: n, sup: true, part: true }] : [{ text: "R" }], anchor: 0 };
  }
  if (a.list) {
    const text = `${a.list.not ? "NOT " : ""}[${a.list.symbols.join(",")}]`;
    return { runs: [{ text }], anchor: 0 };
  }
  // (a group named as an element is - Ac, Pr, Ts - set as the group it holds)
  if (ELEMENT_SYMBOLS.has(a.el) && !a.abbrev) return null;
  // (a ring's substituents named before it - 2,6-diMeBz - are not read
  // outward: on the right of its bond, the label starts at the bond)
  const ringFirst = namesRingFirst(a.el);
  const units = labelUnits(fromRight && !ringFirst ? reversedLabel(a.el) : a.el);
  if (units.length < 2) {
    const runs = labelRuns(a.el);
    // one unit read outward from a bond coming in from the right - TMS on
    // a carbon to its right - is set before the bond, its last letter on
    // the atom
    const last = runs.map((r) => !r.sub && !r.sup && !r.mark).lastIndexOf(true);
    if (!fromRight || last < 0 || [...runs[last].text].length + last < 2) return { runs, anchor: 0 };
    const letters = [...runs[last].text];
    const end = letters.pop()!;
    const split = [...(letters.length ? [{ ...runs[last], text: letters.join("") }] : []), { ...runs[last], text: end }];
    const out = [...runs.slice(0, last), ...split, ...runs.slice(last + 1)];
    return { runs: out, anchor: last + split.length - 1 };
  }
  // the unit at the bond as runs of its own, so that it sits on the atom:
  // a formula's ring by its C6
  const ring = ringFirst ? units.lastIndexOf("C6") : -1;
  const at = fromRight ? (ring >= 0 ? ring : units.length - 1) : 0;
  const italic = italicUnits(units);
  const before = unitRuns(units.slice(0, at), italic.slice(0, at));
  const own = unitRuns([units[at]], [italic[at]]);
  const after = unitRuns(units.slice(at + 1), italic.slice(at + 1));
  const runs = [...(at > 0 ? before : []), ...own, ...(at < units.length - 1 ? after : [])];
  return { runs, anchor: at > 0 ? before.length : 0 };
}

/**
 * Whether a label's charge, set after it above the line, would sit on one of
 * its atom's bonds (widened by a double bond's lines, and the labels'
 * clearance). Only where the drawing is in world units: elsewhere the size
 * of a label is not known here.
 */
function tailClashes(
  item: TextItem,
  tail: readonly TextRun[],
  ways: readonly { dir: Vec2; len: number; order: number }[],
  a: Atom,
  opts: LayoutOptions,
): boolean {
  if (opts.units !== "world" || !ways.length) return false;
  const set = labelSetOf(opts);
  const runs = item.runs ?? [];
  // (a line's half width and a little; a double or triple bond's other lines besides)
  const gap = opts.lineWidthPx * 0.5 + (opts.labelMarginPx ?? opts.fontPx * 0.16) * 0.35;
  const room = (w: { order: number }) =>
    gap + (w.order >= 3 ? (opts.tripleOffsetPx ?? 0) : w.order === 2 ? (opts.doubleOffsetPx ?? 0) : 0);
  return placeLabel(item, opts.fontPx, set).some((run, k) => {
    if (!tail.includes(runs[k])) return false;
    const { c, r } = run.mark
      ? markCircle(run)
      : { c: { x: run.x + run.size * 0.5, y: run.y + run.size * MARK_MIDDLE }, r: run.size * 0.5 };
    return ways.some((w) => {
      const v = { x: c.x - a.x, y: c.y - a.y };
      const along = Math.max(0, Math.min(w.len, v.x * w.dir.x + v.y * w.dir.y));
      const off = Math.hypot(v.x - along * w.dir.x, v.y - along * w.dir.y);
      return off < r + room(w);
    });
  });
}

/**
 * A charge, or a radical's dots, set beside a carbon drawn as its bonds'
 * meeting: out along whichever way its bonds leave most room, above and to
 * the right where that is as good, a little under half a bond out.
 */
function besideVertex(
  a: Atom,
  ways: readonly { dir: Vec2; len: number; order?: number }[],
  runs: TextRun[],
  opts: Pick<LayoutOptions, "fontPx">,
  reach?: (dir: Vec2) => number,
  /** The way it would rather go, in degrees: a charge's 45, above and to the right. */
  prefer = 45,
): TextItem {
  const deg = Math.PI / 180;
  let best = prefer * deg;
  let bestScore = -Infinity;
  for (let k = 0; k < 24; k++) {
    const t = k * 15 * deg;
    let room = 90 * deg;
    for (const w of ways) {
      const d = Math.abs(Math.atan2(Math.sin(t - Math.atan2(w.dir.y, w.dir.x)), Math.cos(t - Math.atan2(w.dir.y, w.dir.x))));
      room = Math.min(room, d);
    }
    const off = Math.abs(Math.atan2(Math.sin(t - prefer * deg), Math.cos(t - prefer * deg)));
    const score = Math.min(room, 70 * deg) - 0.15 * off;
    if (score > bestScore + 1e-9) {
      bestScore = score;
      best = t;
    }
  }
  const lens = ways.map((w) => w.len).sort((p, q) => p - q);
  const dir = { x: Math.cos(best), y: Math.sin(best) };
  // (beside a label, clear of its letters: `reach` says how far they go that way)
  const out = reach ? reach(dir) : 0.42 * (lens[lens.length >> 1] ?? 1);
  return {
    x: a.x + out * Math.cos(best),
    y: a.y + out * Math.sin(best),
    text: runs.map((r) => r.text).join(""),
    fontPx: opts.fontPx,
    runs,
    anchorRun: 0,
    // (the whole of it centred there, set as a superscript would be)
    beside: true,
  };
}

/** An atom's charge where a hand put it: `at` ems of the labels from the atom (`Atom.chargeAt`). */
function besideAt(a: Atom, at: Vec2, runs: TextRun[], opts: Pick<LayoutOptions, "fontPx">): TextItem {
  return {
    x: a.x + at.x * opts.fontPx,
    y: a.y + at.y * opts.fontPx,
    text: runs.map((r) => r.text).join(""),
    fontPx: opts.fontPx,
    runs,
    anchorRun: 0,
    beside: true,
  };
}

/** What a label writes after its symbol, on the symbol's line: its charge, then its radical's dots. */
function tailRuns(a: Atom, opts: Pick<LayoutOptions, "circleCharges">): TextRun[] {
  const out: TextRun[] = [];
  const q = a.charge ?? 0;
  if (q) {
    out.push(
      Math.abs(q) === 1 && opts.circleCharges !== false
        ? { text: q > 0 ? "+" : "\u2212", mark: "charge" }
        : { text: chargeText(q), sup: true },
    );
  }
  if (a.radical) out.push({ text: a.radical === "doublet" ? "\u2022" : "\u2022\u2022", mark: "radical" });
  return out;
}

/** The elements whose hydrides are written hydrogens first: groups 16 and 17. */
const HYDROGENS_FIRST = new Set(["O", "S", "Se", "Te", "Po", "F", "Cl", "Br", "I", "At"]);

/**
 * The labels of the atoms that have one, and where their hydrogens go.
 *
 * Two angles decide it (options hydrogenBandDeg, symbolCentringDeg). How far
 * from vertical, either way, the bonds of a labelled atom may lean and still
 * count as vertical for placing its hydrogens: 10 degrees by default. Not
 * 15: bonds snap to 15-degree steps, and the edge of the band should not sit
 * on one of them. And how close to horizontal bonds on both sides have to
 * leave for the whole symbol to be centred between them: within 25 degrees.
 * Bonds of a zigzag, 30 degrees off, leave the first letter on the atom.
 */
export function buildTextLabels(
  atoms: Atom[],
  opts: LayoutOptions,
  bonds: Bond[] = []
): TextItem[] {
  // Bond orders and directions per atom: the first decides how many hydrogens
  // an atom carries, the second which side to write them on.
  // the bands that decide where the hydrogens and the symbol go
  const band = Math.sin(((opts.hydrogenBandDeg ?? 10) * Math.PI) / 180);
  const sideways = Math.cos(((opts.symbolCentringDeg ?? 25) * Math.PI) / 180);
  const orderSum = new Map<number, number>();
  const away = new Map<number, Vec2>();
  const bonded = new Set<number>();
  // which sides of each atom its bonds leave from, outside the vertical band
  const leftward = new Set<number>();
  const rightward = new Set<number>();
  // and which have a bond leaving close to straight out to the side
  const straightLeft = new Set<number>();
  const straightRight = new Set<number>();
  // each bond out of each atom, as a direction and a length
  const ways = new Map<number, { dir: Vec2; len: number; order: number }[]>();
  const note = (i: number, j: number, order: number, valence = order) => {
    bonded.add(i);
    orderSum.set(i, (orderSum.get(i) ?? 0) + valence);
    const from = atoms[i];
    const to = atoms[j];
    if (!from || !to) return;
    const d = vnorm(vsub({ x: to.x, y: to.y }, { x: from.x, y: from.y }));
    const way = { dir: d, len: vlen(vsub({ x: to.x, y: to.y }, { x: from.x, y: from.y })), order };
    const here = ways.get(i);
    if (here) here.push(way);
    else ways.set(i, [way]);
    const acc = away.get(i) ?? { x: 0, y: 0 };
    away.set(i, { x: acc.x + d.x, y: acc.y + d.y });
    if (d.x < -band) leftward.add(i);
    if (d.x > band) rightward.add(i);
    if (d.x < -sideways) straightLeft.add(i);
    if (d.x > sideways) straightRight.add(i);
  };
  for (const b of bonds) {
    // a dative bond lends a pair rather than sharing one: it takes no
    // hydrogen from either end, so H3N->BH3 keeps all six
    const kind = { ...b, dative: bondKind(b) === "dative" };
    const order = valenceOrder(kind);
    note(b.a1, b.a2, order, valenceOrder(kind, atoms[b.a1]?.el));
    note(b.a2, b.a1, order, valenceOrder(kind, atoms[b.a2]?.el));
  }

  const hapticCentres = new Set<number>();
  for (const b of bonds) {
    if (!b.endpoints?.length) continue;
    for (const e of [b.a1, b.a2]) if (atoms[e]?.el === "*") hapticCentres.add(e);
  }
  // which way each name runs, as the layout reckons it (lib/layout/names):
  // read outward from its bond, or, on a bond near upright, the way with
  // more room
  const lengths = bonds
    .filter((b) => atoms[b.a1] && atoms[b.a2])
    .map((b) => Math.hypot(atoms[b.a1].x - atoms[b.a2].x, atoms[b.a1].y - atoms[b.a2].y))
    .filter((d) => d > 1e-9)
    .sort((p, q) => p - q);
  const names = namesLaid(
    {
      x: atoms.map((a) => a.x),
      y: atoms.map((a) => a.y),
      edges: bonds.filter((b) => atoms[b.a1] && atoms[b.a2]).map((b) => [b.a1, b.a2] as const),
      elements: atoms.map((a) => a.el),
      // (each label's H, counted as the label writes it below)
      hydrogens: atoms.map((a, i) =>
        opts.showImplicitHydrogens === false
          ? 0
          : a.valence != null
            ? Math.max(0, a.valence - (orderSum.get(i) ?? 0))
            : implicitHydrogens(a.el, orderSum.get(i) ?? 0, a.charge ?? 0, a.radical),
      ),
    },
    lengths.length ? lengths[lengths.length >> 1] : 1,
  );
  const out: TextItem[] = [];
  for (let i = 0; i < atoms.length; i++) {
    const a = atoms[i];
    // A carbon with no bonds has nothing to stand for it but its label: ACS
    // 1996 writes methane CH4.
    // (a pi system's centre, where a haptic bond ends, is drawn as nothing)
    if (hapticCentres.has(i)) continue;
    const show = showsLabel(a, opts) || !bonded.has(i);
    // its charge and its radical's dots, after the symbol on its line; its
    // mass number before it
    const tail = tailRuns(a, opts);
    const head: TextRun[] = a.isotope ? [{ text: String(a.isotope), sup: true }] : [];
    // A label's charge goes after it, above the line - unless a bond runs
    // there (a nitro group's N=O); then beside the label, where its bonds
    // leave most room.
    // (put by hand: where it was put, whatever the drawing would do)
    const nudged = tail.length > 0 && a.chargeAt ? a.chargeAt : null;
    const push = (item: TextItem) => {
      const clash = tail.length > 0 && (!!nudged || tailClashes(item, tail, ways.get(i) ?? [], a, opts));
      if (!clash) {
        out.push(item);
        return;
      }
      const runs = (item.runs ?? []).filter((r) => !tail.includes(r));
      const bare = { ...item, runs, text: runs.map((r) => r.text).join("") };
      out.push(bare);
      if (nudged) {
        out.push({ ...besideAt(a, nudged, tail, opts), markOf: i });
        return;
      }
      const set = labelSetOf(opts);
      const size = opts.fontPx * set.subscriptSize;
      out.push({
        ...besideVertex(a, ways.get(i) ?? [], tail, opts, (dir) => {
          let far = 0;
          for (const hull of labelHulls(bare, opts.fontPx, set, false)) {
            for (const p of hull) far = Math.max(far, p.x * dir.x + p.y * dir.y);
          }
          return far + size * (MARK_RADIUS + 0.2);
        }),
        markOf: i,
      });
    };
    if (!show) {
      // A carbon drawn as its bonds' meeting carries its charge beside it,
      // where its bonds leave most room - above and to the right, if that
      // is free.
      if (tail.length) out.push({ ...(nudged ? besideAt(a, nudged, tail, opts) : besideVertex(a, ways.get(i) ?? [], tail, opts)), markOf: i });
      continue;
    }
    // A label that is not an element: an Rgroup, an atom list, an
    // abbreviation or any text, written as such, with no hydrogens of its own
    const towardAll = away.get(i) ?? { x: 0, y: 0 };
    const fromRight =
      names.get(i)?.left ?? ((ways.get(i)?.length ?? 0) === 1 && towardAll.x > Math.hypot(towardAll.x, towardAll.y) * band);
    const special = specialLabel(a, fromRight);
    if (special) {
      const runs = [...head, ...special.runs, ...tail];
      push({
        x: a.x,
        y: a.y,
        text: runs.map((r) => r.text).join(""),
        fontPx: opts.fontPx,
        runs,
        anchorRun: head.length + special.anchor,
        atom: i,
      });
      continue;
    }
    const h =
      opts.showImplicitHydrogens === false
        ? 0
        : a.valence != null
          ? // (a valence the file sets: what the bonds leave of it)
            Math.max(0, a.valence - (orderSum.get(i) ?? 0))
          : implicitHydrogens(a.el, orderSum.get(i) ?? 0, a.charge ?? 0, a.radical);
    const centreSymbol =
      straightLeft.has(i) && straightRight.has(i) ? { centreSymbol: true } : {};
    if (h <= 0) {
      const runs = [...head, { text: a.el }, ...tail];
      push({
        x: a.x,
        y: a.y,
        text: runs.map((r) => r.text).join(""),
        fontPx: opts.fontPx,
        runs,
        anchorRun: head.length,
        ...centreSymbol,
        atom: i,
      });
      continue;
    }
    const hydrogens: TextRun[] =
      h > 1 ? [{ text: "H" }, { text: String(h), sub: true }] : [{ text: "H" }];
    // Keep the hydrogens clear of the bonds: if the neighbours sit to the
    // right, write HO rather than OH. Within a band either side of vertical
    // they sit neither side, and OH it is - otherwise a bond that leans a
    // hair to the right flips the label, and a dragged atom swinging through
    // vertical flickers between the two.
    const toward = away.get(i) ?? { x: 0, y: 0 };
    // Bonds leaving on both sides leave no side for the hydrogens: ACS 1996
    // sets them on a line of their own, below the symbol when the bonds rise
    // and above it when they fall - on the side further from every bond, so
    // that three bonds evenly spread, one of them straight down (a borate's
    // BH), keep the line clear of it; where neither is, as the bonds lean.
    if (leftward.has(i) && rightward.has(i)) {
      const rise = Math.max(...(ways.get(i) ?? []).map((w) => w.dir.y));
      const fall = Math.max(...(ways.get(i) ?? []).map((w) => -w.dir.y));
      const stack = rise < fall - 1e-6 ? "above" : fall < rise - 1e-6 ? "below" : toward.y >= 0 ? "below" : "above";
      const runs = [...head, { text: a.el }, ...tail, ...hydrogens];
      push({
        x: a.x,
        y: a.y,
        text: runs.map((r) => r.text).join(""),
        fontPx: opts.fontPx,
        runs,
        anchorRun: head.length,
        stack,
        ...centreSymbol,
        atom: i,
      });
      continue;
    }
    // An atom on its own has no bonds to keep the hydrogens clear of: they
    // go where its formula is written with them - first for oxygen and the
    // halogens and their groups, H2O, H2S, HCl, H3O+; after the symbol for
    // the rest, NH3, CH4, PH3.
    const neighboursRight = bonded.has(i)
      ? toward.x > Math.hypot(toward.x, toward.y) * band
      : HYDROGENS_FIRST.has(a.el);
    // (the charge after all of it where the H follow the symbol: NH3+; after
    // the symbol where they come first: H3N+)
    const runs = neighboursRight
      ? [...hydrogens, ...head, { text: a.el }, ...tail]
      : [...head, { text: a.el }, ...hydrogens, ...tail];
    push({
      x: a.x,
      y: a.y,
      text: runs.map((r) => r.text).join(""),
      fontPx: opts.fontPx,
      runs,
      anchorRun: neighboursRight ? hydrogens.length + head.length : head.length,
      atom: i,
    });
  }
  return out;
}

/**
 * Which end of a wedge carries the wide base. By the usual principle the thin
 * end points at the stereocentre, i.e. the atom of higher degree; the reverse
 * orientation swaps the ends.
 */
function wedgeBaseAtom(bond: Bond, deg?: Map<number, number>): number {
  const degA = deg?.get(bond.a1) || 0;
  const degB = deg?.get(bond.a2) || 0;
  const thinAtA = degA >= degB; // tie: thin end at a1
  const baseAtA = bond.stereoOrient === "reverse" ? thinAtA : !thinAtA;
  return baseAtA ? bond.a1 : bond.a2;
}

/**
 * Which atom a wedge's narrow end is at: the stereocentre, which a MOL file
 * lists first.
 */
export function wedgeNarrowAtom(
  bond: Bond,
  deg?: Map<number, number>,
): number {
  return wedgeBaseAtom(bond, deg) === bond.a1 ? bond.a2 : bond.a1;
}

function degreeMap(bonds: Bond[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const b of bonds) {
    m.set(b.a1, (m.get(b.a1) || 0) + 1);
    m.set(b.a2, (m.get(b.a2) || 0) + 1);
  }
  return m;
}

export function buildBondPrimitives(
  atoms: Atom[],
  bond: Bond,
  opts: LayoutOptions,
  zoom: number,
  deg?: Map<number, number>,
  // Where a second line stops no longer depends on whether the bond is in a
  // ring - the angles at its atoms decide - but callers still pass it.
  _inRing?: boolean,
  autoSgn?: number,
  adjBonds?: Map<number, Bond[]>,
  labelShapes?: Map<number, Vec2[][]>,
  doubleSides?: Map<Bond, number | undefined>
): BondPrimitives {
  const a = atoms[bond.a1];
  const c = atoms[bond.a2];
  const p1o = { x: a.x, y: a.y };
  const p2o = { x: c.x, y: c.y };
  const lines: LineSeg[] = [];
  const polys: Poly[] = [];
  const units = opts.units ?? "px";
  let lwPx = units === "world" ? opts.lineWidthPx * zoom : opts.lineWidthPx;
  const minPx = Math.max(0.5, opts.minLinePx ?? 1);
  if (!(lwPx >= minPx)) lwPx = minPx;
  // Stop a bond short of a label so the two do not overlap: the label margin
  // beyond the furthest the label's letters reach along the bond. How far
  // that is depends on which way the bond leaves and on the letters
  // themselves - a bond comes closer to the round side of an O than to the
  // corner of an N - but not on how wide the bond is there, so a wedge's
  // broad end stops where a line would.
  const hasLabel = (at: Atom) => showsLabel(at, opts);
  const fontWorld = toWorld(opts.fontPx, zoom, units);
  const margin =
    opts.labelMarginPx != null
      ? toWorld(opts.labelMarginPx, zoom, units)
      : fontWorld * 0.16;
  const lineHalf = pxToWorld(lwPx * 0.5, zoom);
  // how wide a bold bond is, and a wedge at its broad end, either side of its line
  const boldHalf =
    (opts.boldWidthPx != null
      ? toWorld(opts.boldWidthPx, zoom, units)
      : (toWorld(opts.wedgeWidthPx, zoom, units) * 2) / 3) / 2;
  const broadHalf = toWorld(opts.wedgeWidthPx * 0.5, zoom, units);
  const dir0 = vsub(p2o, p1o);
  const L0 = vlen(dir0);
  const dir = L0 > 1e-9 ? vscale(dir0, 1 / L0) : { x: 1, y: 0 };
  // how far the bond's ink reaches either side of its line at each end
  const across = bondReach(bond, opts, zoom, deg, doubleSides);
  const n = vperp(dir);
  /** Where a bond stops, leaving the atom along `towards`, its ink from `lo` to `hi` along `n`. */
  const labelReach = (idx: number, at: Atom, towards: Vec2, lo: number, hi: number) => {
    if (!hasLabel(at)) return 0;
    const el = at.el;
    const hulls =
      (idx >= 0 ? labelShapes?.get(idx) : undefined) ??
      labelHulls(
        { x: 0, y: 0, text: el, fontPx: opts.fontPx, runs: [{ text: el }] },
        fontWorld,
        labelSetOf(opts),
      );
    return labelClearance(hulls, towards, margin, { n, lo, hi });
  };
  // Labels at both ends may not take more than nine tenths of the bond
  // between them; if they would, each gives up its share.
  let trimA = labelReach(bond.a1, a, dir, -across.right1, across.left1);
  let trimB = labelReach(bond.a2, c, vscale(dir, -1), -across.right2, across.left2);
  const room = L0 * (opts.labelShareMax ?? 0.9);
  if (trimA + trimB > room) {
    const k = room / (trimA + trimB);
    trimA *= k;
    trimB *= k;
  }
  const p1 = vadd(p1o, vscale(dir, trimA));
  const p2 = vadd(p2o, vscale(dir, -trimB));
  // Where a label has taken the bond's end, the line simply stops there, and
  // that end is finished off like any other free end.
  const labelEnds: Vec2[] = [];
  if (hasLabel(a) && trimA > 0) labelEnds.push(p1);
  if (hasLabel(c) && trimB > 0) labelEnds.push(p2);
  const round = (opts.joinStyle ?? "round") === "round";
  /**
   * The bonds carrying on from `at`, other than to `other`, to cut a broad
   * end along. A labelled atom has none: the bond stops short of the label,
   * so there is no join to make.
   */
  const neighboursAt = (at: number, other: number): Neighbour[] => {
    const atom = atoms[at];
    const out: Neighbour[] = [];
    if (!atom || hasLabel(atom)) return out;
    const doubleOff = toWorld(opts.doubleOffsetPx, zoom, units);
    const tripleOff = toWorld(opts.tripleOffsetPx, zoom, units);
    for (const b of adjBonds?.get(at) ?? []) {
      const far = b.a1 === at ? b.a2 : b.a1;
      if (far === other || far === at) continue;
      // (a ring in perspective's bold edge and wedge meet square, their
      // outer corner filled to a point after (perspectiveCorners))
      if (inPerspective(bond) && inPerspective(b)) continue;
      const o = atoms[far];
      if (!o) continue;
      const d = vsub({ x: o.x, y: o.y }, { x: atom.x, y: atom.y });
      if (vlen(d) < 1e-9) continue;
      // Where that bond's lines lie either side of its own line, seen going
      // out from this atom: its offsets are taken from a1 to a2, so they turn
      // over when it leaves this atom from its a2 end.
      const turn = b.a1 === at ? 1 : -1;
      const offsets =
        b.order === 3
          ? [0, tripleOff, -tripleOff]
          : b.order === 2
            ? doubleOffsets(b, doubleOff, doubleSides)
            : [0];
      // (a double bond with one line off its axis has its other line on it)
      const lines = (b.order === 2 && offsets.length === 1 ? [0, ...offsets] : offsets).map(
        (v) => v * turn,
      );
      // its own line as wide as it is drawn here: a bold bond's, a wedge's
      // broad end (a ring in perspective's front edge and the bonds toward
      // it meet flush, not with a step)
      const kind = bondKind(b);
      const shape = kind === "bold" || (b.order === 2 && b.display === "bold") ? "bold" : kind === "wedge" || (b.order === 2 && b.display === "wedge") ? "wedge" : null;
      const broad = b.display === "wedge" && b.stereo !== "up" ? boldHalf : broadHalf;
      const own = shape === "bold" ? boldHalf : shape === "wedge" && wedgeBaseAtom(b, deg) === at ? broad : lineHalf;
      const halfOf = (v: number) => (Math.abs(v) < 1e-12 ? own : lineHalf);
      out.push({
        dir: vnorm(d),
        plus: Math.max(own, ...lines.map((v) => v + halfOf(v))),
        minus: Math.max(own, ...lines.map((v) => -v + halfOf(v))),
        wide: lines.length > 1,
        centred: !lines.includes(0),
        len: vlen(d),
        lines,
      });
    }
    return out;
  };
  const kind = bondKind(bond);
  // an end of a ring in perspective's shape where another is broad too: kept
  // square, the outer corner between them filled after (perspectiveCorners)
  const metInPerspective = (at: number) =>
    inPerspective(bond) &&
    (adjBonds?.get(at) ?? []).some((b) => b !== bond && inPerspective(b) && (b.display === "bold" || wedgeBaseAtom(b, deg) === at));
  // how far the first hash sits from a bare atom the hashes start at
  const firstGap = toWorld(opts.hashFirstGapPx ?? opts.hashSpacingPx, zoom, units);
  if (kind === "bold") {
    polys.push(
      buildBoldBar(
        p1,
        p2,
        boldHalf,
        lineHalf,
        neighboursAt(bond.a1, bond.a2),
        neighboursAt(bond.a2, bond.a1),
        round,
        cutRuleOf(opts),
        metInPerspective(bond.a1),
        metInPerspective(bond.a2),
      ),
    );
    return { lines, polys };
  }
  if (kind === "hashed") {
    // Hashes as long as a bold bond is wide, set out as a hashed wedge's are:
    // from the atom with more bonds, one hash spacing out, or from a label
    // there, to flush with the far end.
    const fromA = (deg?.get(bond.a1) || 0) >= (deg?.get(bond.a2) || 0);
    const towards = fromA ? dir : vscale(dir, -1);
    const tStart = fromA ? trimA : trimB;
    const tEnd = fromA ? trimB : trimA;
    const spacing = toWorld(opts.hashSpacingPx, zoom, units);
    const hashes = buildHashes(
      fromA ? p1o : p2o,
      towards,
      tStart > 0 ? tStart : firstGap,
      L0 - tEnd,
      boldHalf,
      boldHalf,
      spacing,
      pxToWorld(lwPx, zoom),
      round,
    );
    for (const l of hashes.lines) l.widthPx = lwPx;
    lines.push(...hashes.lines);
    polys.push(...hashes.polys);
    return { lines, polys, ends: hashes.ends };
  }
  if (kind === "dotted") {
    // round dots, whatever the ends: a line's width and a half across, three
    // line widths clear of each other (IUPAC GR-1.3: 2 to 4), at least three
    const lw = pxToWorld(lwPx, zoom);
    polys.push(...buildDots(p1, p2, lw * 0.75, lw * 3));
    return { lines, polys, ends: [] };
  }
  if (kind === "dashed") {
    const spacing = toWorld(opts.hashSpacingPx, zoom, units);
    const dash =
      opts.dashLengthPx != null
        ? toWorld(opts.dashLengthPx, zoom, units)
        : spacing * 0.6;
    const gap =
      opts.dashGapPx != null ? toWorld(opts.dashGapPx, zoom, units) : spacing * 0.4;
    const dashes = buildDashes(p1, p2, dash, gap);
    for (const l of dashes) l.widthPx = lwPx;
    lines.push(...dashes);
    // every dash's ends are free, bar the ones on an atom, whose join sees to
    // them
    const ends: Vec2[] = [...labelEnds];
    dashes.forEach((l, i) => {
      if (i > 0) ends.push({ x: l.x1, y: l.y1 });
      if (i < dashes.length - 1) ends.push({ x: l.x2, y: l.y2 });
    });
    return { lines, polys, ends };
  }
  if (kind === "dative") {
    const headLength =
      opts.dativeHeadLengthPx != null
        ? toWorld(opts.dativeHeadLengthPx, zoom, units)
        : boldHalf * 3;
    const headHalf =
      opts.dativeHeadWidthPx != null
        ? toWorld(opts.dativeHeadWidthPx, zoom, units) / 2
        : boldHalf;
    const arrow = buildDativeArrow(p1, p2, headLength, headHalf);
    if (arrow.line) {
      arrow.line.widthPx = lwPx;
      lines.push(arrow.line);
    }
    polys.push(arrow.head);
    // the head's point is its own end; a label at the donor takes the line's
    return {
      lines,
      polys,
      ends: hasLabel(a) && trimA > 0 ? [p1] : [],
    };
  }
  if (kind === "wedge" || kind === "hashedWedge") {
    const baseAtP1 = wedgeBaseAtom(bond, deg) === bond.a1;
    // (a ring in perspective's bond toward the viewer as broad as its bold
    // front edge, which it runs into)
    const baseHalf = bond.display === "wedge" && bond.stereo !== "up" && bond.stereo !== "down" ? boldHalf : broadHalf;
    // The narrow end is a bond's width, matching the join caps at atoms.
    const tipHalf = pxToWorld(lwPx * 0.5, zoom);
    const wideO = baseAtP1 ? p1o : p2o;
    const narrowO = baseAtP1 ? p2o : p1o;
    const trimWide = baseAtP1 ? trimA : trimB;
    const trimNarrow = baseAtP1 ? trimB : trimA;
    const bp1 = baseAtP1 ? p1 : p2;
    const bp2 = baseAtP1 ? p2 : p1;
    if (kind === "wedge") {
      // Directions of the bonds continuing from the wide end, to cut it along
      // them. A labelled atom is left out: the bond stops short of the label,
      // so there is no join to make.
      const baseIdx = baseAtP1 ? bond.a1 : bond.a2;
      const tipIdx = baseAtP1 ? bond.a2 : bond.a1;
      const neighbours = neighboursAt(baseIdx, tipIdx);
      const tri = buildWedgeTriangle(
        bp1,
        bp2,
        baseHalf,
        tipHalf,
        neighbours,
        round,
        hasLabel(atoms[tipIdx]) && trimNarrow > 0,
        cutRuleOf(opts),
        metInPerspective(baseIdx),
      );
      polys.push(tri);
      return { lines, polys };
    } else {
      // The hashes start where a label at the narrow atom leaves off, or one
      // hash spacing out from a bare atom, and run to the wide end or the
      // label there.
      const spacing = toWorld(opts.hashSpacingPx, zoom, units);
      const hashes = buildHashes(
        narrowO,
        vnorm(vsub(wideO, narrowO)),
        trimNarrow > 0 ? trimNarrow : firstGap,
        L0 - trimWide,
        pxToWorld(lwPx, zoom) / 2,
        baseHalf,
        spacing,
        pxToWorld(lwPx, zoom),
        (opts.joinStyle ?? "round") === "round",
      );
      for (const l of hashes.lines) l.widthPx = lwPx;
      lines.push(...hashes.lines);
      polys.push(...hashes.polys);
      return { lines, polys, ends: hashes.ends };
    }
  }
  if (bond.stereo === "wavy") {
    // The wave starts at the stereocentre: the atom with more bonds, or the
    // first when they have as many.
    const fromA = wavyFromA1(bond, deg);
    lines.push(
      ...buildWavySegments(
        fromA ? p1o : p2o,
        fromA ? p2o : p1o,
        fromA ? trimA : trimB,
        L0 - (fromA ? trimB : trimA),
        toWorld(opts.wavyAmpPx, zoom, units),
        toWorld(opts.wavyPeriodPx, zoom, units),
        zoom,
      )
    );
    for (const l of lines) l.widthPx = lwPx;
    // A wave is short straight pieces end to end; the corner between two of
    // them wants the same finish as a join, or it shows as a nick.
    const bends: Bend[] = [];
    for (let i = 1; i < lines.length; i++) {
      const prev = lines[i - 1];
      const next = lines[i];
      bends.push({
        at: { x: next.x1, y: next.y1 },
        dirs: [
          vnorm({ x: prev.x1 - prev.x2, y: prev.y1 - prev.y2 }),
          vnorm({ x: next.x2 - next.x1, y: next.y2 - next.y1 }),
        ],
      });
    }
    // Both ends of the wave are free: the far one can stop at the top of a
    // turn, off the line and away from the atom's own join.
    const waveEnds =
      lines.length > 0
        ? [
            { x: lines[0].x1, y: lines[0].y1 },
            { x: lines[lines.length - 1].x2, y: lines[lines.length - 1].y2 },
          ]
        : [];
    return { lines, polys, bends, ends: waveEnds };
  }
  if (bond.order === 1) {
    // No trimming: ensure bonds meet cleanly at atoms
    lines.push({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, widthPx: lwPx });
    return { lines, polys, ends: labelEnds };
  }
  if (bond.order === 2) {
    const off = toWorld(opts.doubleOffsetPx, zoom, units);
    const dir = vnorm(vsub(p2, p1));
    const n = vperp(dir);

    const mode = bond.doubleMode || "auto";
    // Which side the second line goes: null puts one either side, at half
    // the offset, and a number puts a single one that far off the axis.
    const sgn =
      mode === "center"
        ? null
        : mode === "left"
          ? 1
          : mode === "right"
            ? -1
            : autoSgn == null || !isFinite(autoSgn)
              ? null
              : autoSgn >= 0
                ? 1
                : -1;
    if (sgn == null) {
      // Symmetric placement: two lines at +/-off/2 from the axis, each run on
      // to meet its neighbour's where two double bonds share an atom
      const pair = centredPair(
        p1,
        p2,
        dir,
        n,
        off,
        lwPx,
        bond,
        atoms,
        (idx) => hasLabel(atoms[idx]),
        adjBonds,
        doubleSides,
        opts.centredJoinMinDeg ?? 20,
      );
      lines.push(...pair.lines);
      return { lines, polys, meets: pair.meets, ends: pair.ends };
    }
    // Skew placement: the bond's own line, and a second one to one side of
    // it. That one meets the line of a double bond next door where they share
    // an atom, rather than stopping short of it: two double bonds in a row
    // read as a chain that way, and as four loose lines otherwise. Elsewhere
    // it stops on the bisector of the angle it runs inside, and runs up to an
    // atom with nothing on its side - in a ring, both ends; in a chain, the
    // end inside the zigzag. A label takes both lines' ends alike, and meets
    // nothing: the lines stop where it has cut them.
    const o = vscale(n, off * sgn);
    const around = (idx: number) =>
      (adjBonds?.get(idx) ?? []).filter((nb) => nb !== bond);
    const back1 = hasLabel(a)
      ? 0
      : sideLineBack(atoms, bond.a1, dir, vscale(n, sgn), off, around(bond.a1));
    const back2 = hasLabel(c)
      ? 0
      : sideLineBack(
          atoms,
          bond.a2,
          vscale(dir, -1),
          vscale(n, sgn),
          off,
          around(bond.a2),
        );
    const room = Math.max(
      0,
      vlen(vsub(p2, p1)) * (opts.innerLineMaxShortening ?? 0.45),
    );
    const ps1 = vadd(p1, vscale(dir, Math.min(back1, room)));
    const ps2 = vadd(p2, vscale(dir, -Math.min(back2, room)));
    const others = (idx: number) =>
      hasLabel(atoms[idx])
        ? []
        : (adjBonds?.get(idx) ?? []).filter(
            (nb) =>
              nb !== bond &&
              nb.order === 2 &&
              nb.stereo !== "up" &&
              nb.stereo !== "down",
          );
    const sideOf = (nb: Bond) => doubleOffsets(nb, off, doubleSides);
    const ps1b = mitreOffsetEnd(
      atoms,
      bond.a1,
      p1,
      dir,
      dir,
      off * sgn,
      vadd(ps1, o),
      sideOf,
      others(bond.a1),
      off * 2,
    );
    const ps2b = mitreOffsetEnd(
      atoms,
      bond.a2,
      p2,
      dir,
      vscale(dir, -1),
      off * sgn,
      vadd(ps2, o),
      sideOf,
      others(bond.a2),
      off * 2,
    );
    // a ring's bond in perspective: its own line bold, or a wedge toward
    // the viewer, the second line beside it as ever
    if (bond.display === "bold") {
      polys.push(
        buildBoldBar(
          p1,
          p2,
          boldHalf,
          lineHalf,
          neighboursAt(bond.a1, bond.a2),
          neighboursAt(bond.a2, bond.a1),
          round,
          cutRuleOf(opts),
          metInPerspective(bond.a1),
          metInPerspective(bond.a2),
        ),
      );
    } else if (bond.display === "wedge") {
      const baseAtP1 = wedgeBaseAtom(bond, deg) === bond.a1;
      const [baseIdx, tipIdx] = baseAtP1 ? [bond.a1, bond.a2] : [bond.a2, bond.a1];
      polys.push(
        buildWedgeTriangle(
          baseAtP1 ? p1 : p2,
          baseAtP1 ? p2 : p1,
          boldHalf,
          pxToWorld(lwPx * 0.5, zoom),
          neighboursAt(baseIdx, tipIdx),
          round,
          hasLabel(atoms[tipIdx]) && (baseAtP1 ? trimB : trimA) > 0,
          cutRuleOf(opts),
          metInPerspective(baseIdx),
        ),
      );
    } else lines.push({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, widthPx: lwPx });
    lines.push({
      x1: ps1b.at.x,
      y1: ps1b.at.y,
      x2: ps2b.at.x,
      y2: ps2b.at.y,
      widthPx: lwPx,
    });
    const meets: Meet[] = [];
    const ends: Vec2[] = [...labelEnds];
    const along = vnorm(vsub(ps2b.at, ps1b.at));
    if (ps1b.met) meets.push({ at: ps1b.at, dir: along });
    else ends.push(ps1b.at);
    if (ps2b.met) meets.push({ at: ps2b.at, dir: vscale(along, -1) });
    else ends.push(ps2b.at);
    return { lines, polys, meets, ends };
  }
  if (bond.order === 3) {
    // Triple bond outer offset matches the double-bond offset
    const off = toWorld(opts.doubleOffsetPx, zoom, units);
    // The outer lines run the bond's whole length, square to the atoms at
    // either end, as ACS 1996 draws them.
    const [o1, , o3] = buildTripleLines(p1, p2, off);
    lines.push(
      { x1: o1.x1, y1: o1.y1, x2: o1.x2, y2: o1.y2, widthPx: lwPx },
      { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, widthPx: lwPx },
      { x1: o3.x1, y1: o3.y1, x2: o3.x2, y2: o3.y2, widthPx: lwPx }
    );
    const ends = [
      ...labelEnds,
      { x: o1.x1, y: o1.y1 },
      { x: o1.x2, y: o1.y2 },
      { x: o3.x1, y: o3.y1 },
      { x: o3.x2, y: o3.y2 },
    ];
    return { lines, polys, ends };
  }
  lines.push({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, widthPx: lwPx });
  return { lines, polys, ends: labelEnds };
}

/**
 * Where bonds meet, and where one simply ends, the drawing is finished off:
 * with a cap of half a line width when joins are round, and with a mitre
 * between the bonds when they are sharp. Not every atom wants one.
 *
 * `caps` are the atoms a round cap belongs on and `mitres` the atoms a sharp
 * join is built at, with the directions of the plain bonds arriving there.
 * The drag preview draws the atom it is carrying itself, so it asks the same
 * question of the same function rather than guessing: a dot the drawing does
 * not have must not appear for as long as the atom is moving.
 */
export function joinsAtAtoms(
  atoms: Atom[],
  bonds: Bond[],
  opts: LayoutOptions,
  deg: Map<number, number>,
  doubleSides?: Map<Bond, number | undefined>,
): { caps: Set<number>; mitres: Map<number, Vec2[]> } {
  // A double bond drawn centred has no line along the bond itself, so nothing
  // of it reaches the atom for a cap to round off: a cap there is a dot in
  // mid air between the two lines. Which way an automatic one went is known
  // once the sides are worked out; without them, it is taken as centred.
  const onAxis = (b: Bond) =>
    b.order !== 2 ||
    (doubleSides
      ? doubleOffsets(b, 1, doubleSides).length === 1
      : b.doubleMode !== undefined &&
        b.doubleMode !== "auto" &&
        b.doubleMode !== "center");
  // A wavy bond starts on the line at its stereocentre but stops short of
  // the other atom - at the top of a turn, if that is where it falls - and
  // its own end is finished where it stops. Nothing of it reaches that atom,
  // and a cap there is a dot out beyond the wave.
  const wavyFar = (b: Bond): number | null =>
    bondKind(b) !== "wavy" ? null : wavyFromA1(b, deg) ? b.a2 : b.a1;
  const reaching = new Map<number, number>();
  for (const b of bonds) {
    if (!onAxis(b)) continue;
    for (const e of [b.a1, b.a2]) {
      if (e !== wavyFar(b)) reaching.set(e, (reaching.get(e) ?? 0) + 1);
    }
  }
  const plainDirs = new Map<number, Vec2[]>();
  const plainEnds = new Set<number>();
  for (const b of bonds) {
    // A wedge or a bold bond is a shape of its own, and a hashed one is a row
    // of hashes: a cap at any of them would sit past its end as a loose dot.
    const kind = bondKind(b);
    if (
      kind === "wedge" ||
      kind === "hashedWedge" ||
      kind === "bold" ||
      kind === "hashed" ||
      kind === "dotted"
    ) {
      continue;
    }
    if (!onAxis(b)) continue;
    // a dative bond's line ends at the donor; at the acceptor its arrow's
    // point is the end, and a cap there would blunt it. A wave ends at its
    // stereocentre only.
    const ends =
      kind === "dative" ? [b.a1] : [b.a1, b.a2].filter((e) => e !== wavyFar(b));
    const p = { x: atoms[b.a1].x, y: atoms[b.a1].y };
    const q = { x: atoms[b.a2].x, y: atoms[b.a2].y };
    for (const e of ends) plainEnds.add(e);
    if (vlen(vsub(q, p)) < 1e-9) continue;
    const dirTo = (e: number, d: Vec2) => {
      const here = plainDirs.get(e);
      if (here) here.push(d);
      else plainDirs.set(e, [d]);
    };
    if (ends.includes(b.a1)) dirTo(b.a1, vnorm(vsub(q, p)));
    if (ends.includes(b.a2)) dirTo(b.a2, vnorm(vsub(p, q)));
  }
  // The wide end of a solid wedge covers the join at its atom itself, either
  // by reaching past it or by being cut along the bonds there; a cap on top of
  // that only bulges out of the wedge.
  const wedgeEnds = new Set<number>();
  for (const b of bonds) {
    if (bondKind(b) === "wedge" || (b.order === 2 && b.display === "wedge")) wedgeEnds.add(wedgeBaseAtom(b, deg));
  }
  const caps = new Set<number>();
  const mitres = new Map<number, Vec2[]>();
  for (let i = 0; i < atoms.length; i++) {
    const d = deg.get(i) || 0;
    const showLabel = showsLabel(atoms[i], opts);
    // A label takes the bond's end with it, and a wedge's wide end covers its
    // own join, so neither wants anything here.
    if (showLabel || wedgeEnds.has(i)) continue;
    // A free end of a plain bond, or any atom bonds meet at - including one
    // where only wedges meet, whose thin ends are each a bond wide and do
    // not fill the join between them on their own. Something has to reach
    // the atom for the cap to round off, though.
    if (plainEnds.has(i) || (d >= 2 && (reaching.get(i) ?? 0) > 0)) caps.add(i);
    if (d >= 2) mitres.set(i, plainDirs.get(i) ?? []);
  }
  return { caps, mitres };
}

/** Each atom's bonds (by index), in their order - a bond to itself twice. */
function bondsByAtom(bonds: Bond[]): Map<number, Bond[]> {
  const adjBonds = new Map<number, Bond[]>();
  const add = (k: number, b: Bond) => {
    const here = adjBonds.get(k);
    if (here) here.push(b);
    else adjBonds.set(k, [b]);
  };
  for (const b of bonds) {
    add(b.a1, b);
    add(b.a2, b);
  }
  return adjBonds;
}

/**
 * The circles a drawing's rings are drawn with, as the layout draws them -
 * a ring bound face-on to a metal through all its atoms always, and a
 * six-membered ring with three double bonds where `opts.aromaticCircle`
 * asks for its circle - with the bonds they stand in for, by the ids of
 * their atoms ("3-7"). They depend only on where the atoms are and how they
 * are bonded, not on the zoom: what the canvas offers a circle at is found
 * without laying the drawing out.
 */
export function ringCircles(
  atoms: Atom[],
  bonds: Bond[],
  opts: LayoutOptions,
  adjBonds: Map<number, Bond[]> = bondsByAtom(bonds),
): { circles: Circle[]; edges: Set<string> } {
  const circles: Circle[] = [];
  // Every six-membered cycle, as found walking out from each atom in turn
  // (each once from each of its atoms, either way round), its atoms in
  // order: a path of six led back to where it started.
  const sixCycles = (found: (cycle: number[]) => void) => {
    const adj = new Map<number, number[]>();
    for (const b of bonds) {
      for (const [k, v] of [[b.a1, b.a2], [b.a2, b.a1]]) {
        const here = adj.get(k);
        if (here) here.push(v);
        else adj.set(k, [v]);
      }
    }
    const n = atoms.length;
    const path: number[] = [];
    const visited = new Set<number>();
    // How many bonds each atom is from the one walked out from, up to three
    // (no atom of a six-membered ring is further from another): a step to
    // an atom too far out to get back from in the steps left is not taken,
    // which finds the same cycles in the same order without walking every
    // chain and ring system out to six atoms. (Not where a bond names an
    // atom that is not there: then every step is taken.)
    const near = bonds.every((b) => Number.isInteger(b.a1) && Number.isInteger(b.a2) && b.a1 >= 0 && b.a2 >= 0 && b.a1 < n && b.a2 < n);
    const from = new Int32Array(near ? n : 0).fill(-1);
    const dist = new Int8Array(near ? n : 0);
    const reach = (start: number) => {
      from[start] = start;
      dist[start] = 0;
      const q = [start];
      for (let h = 0; h < q.length; h++) {
        const u = q[h];
        if (dist[u] === 3) continue;
        for (const v of adj.get(u) || []) {
          if (from[v] === start) continue;
          from[v] = start;
          dist[v] = dist[u] + 1;
          q.push(v);
        }
      }
    };
    // (a cycle's k-th atom is at most 7 - k bonds from its first)
    const canReturn = (a: number, start: number, length: number) =>
      !near || (from[a] === start && dist[a] <= 7 - length);
    const walk = (startIdx: number, currIdx: number) => {
      if (path.length === 6) {
        if ((adj.get(currIdx) || []).includes(startIdx)) found([...path]);
        return;
      }
      for (const nxt of adj.get(currIdx) || []) {
        if (nxt === startIdx && path.length >= 3) continue;
        if (visited.has(nxt)) continue;
        if (!canReturn(nxt, startIdx, path.length + 1)) continue;
        visited.add(nxt);
        path.push(nxt);
        walk(startIdx, nxt);
        path.pop();
        visited.delete(nxt);
      }
    };
    for (let i = 0; i < n; i++) {
      if (near) reach(i);
      path.push(i);
      visited.add(i);
      walk(i, i);
      path.pop();
      visited.delete(i);
    }
  };
  // optional aromatic circle detection (6-cycle with >=3 double bonds)
  const aromaticEdges = new Set<string>();
  // and a ring bound face-on to a metal through all its atoms, always: its
  // pi system the circle's - an ellipse where it is seen in perspective -
  // not double bonds (Cp, an arene), the circle fitted to its atoms
  for (const ring of hapticRings(atoms, bonds)) {
    const pts = ring.map((i) => atoms[i]);
    const c = { x: pts.reduce((t, p) => t + p.x, 0) / pts.length, y: pts.reduce((t, p) => t + p.y, 0) / pts.length };
    let xx = 0;
    let yy = 0;
    let xy = 0;
    for (const p of pts) {
      xx += (p.x - c.x) ** 2;
      yy += (p.y - c.y) ** 2;
      xy += (p.x - c.x) * (p.y - c.y);
    }
    xx /= pts.length;
    yy /= pts.length;
    xy /= pts.length;
    // (a regular ring's corners spread as an ellipse's points do: its
    // half-axes the root of twice the spread along each)
    const mid = (xx + yy) / 2;
    const span = Math.sqrt(((xx - yy) / 2) ** 2 + xy * xy);
    const long = Math.sqrt(2 * (mid + span));
    const short = Math.sqrt(2 * Math.max(0, mid - span));
    const angle = 0.5 * Math.atan2(2 * xy, xx - yy);
    circles.push({ c, r: long * (opts.aromaticCircleSize ?? 0.5), squash: long ? short / long : 1, angle });
    for (const e of bonds) {
      if (e.endpoints?.length || !ring.includes(e.a1) || !ring.includes(e.a2)) continue;
      const u = atoms[e.a1].id;
      const v = atoms[e.a2].id;
      aromaticEdges.add(u < v ? `${u}-${v}` : `${v}-${u}`);
    }
  }
  const enableAll = opts.aromaticCircle === true;
  const enabledSet: Set<string> | null =
    typeof opts.aromaticCircle === "object" &&
    opts.aromaticCircle &&
    (opts.aromaticCircle as any).enabled
      ? (opts.aromaticCircle as any).enabled
      : null;
  if (enableAll || enabledSet) {
    const seen = new Set<string>();
    sixCycles((cycle) => {
      // ringKey: concatenation of atom.id in ascending order
      const ids = cycle.map((i) => atoms[i].id).sort((a, b) => a - b);
      const ringKey = ids.join("-");
      if (seen.has(ringKey)) return;
      seen.add(ringKey);
      let doubles = 0;
      const pts: Vec2[] = [];
      for (let i = 0; i < 6; i++) {
        const u = cycle[i];
        const v = cycle[(i + 1) % 6];
        // (the first bond between them, as in the whole list: the first at u)
        const be = (adjBonds.get(u) ?? []).find(
          (bb) =>
            (bb.a1 === u && bb.a2 === v) || (bb.a1 === v && bb.a2 === u)
        );
        if (be && be.order === 2) doubles++;
        pts.push({ x: atoms[u].x, y: atoms[u].y });
        // Edge-key calculation is deferred to demotion time; skip here
      }
      const isAromatic = doubles >= 3;
      const isEnabled =
        enableAll || (!!enabledSet && enabledSet.has(ringKey));
      if (isAromatic && isEnabled) {
        const c = pts.reduce(
          (acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }),
          { x: 0, y: 0 }
        );
        c.x /= 6;
        c.y /= 6;
        let r = 0;
        for (const p of pts) r += Math.hypot(p.x - c.x, p.y - c.y);
        r /= 6;
        circles.push({ c, r: r * (opts.aromaticCircleSize ?? 0.5), key: ringKey });
        // Demote these 6 edges (belonging to this ring)
        for (let i = 0; i < 6; i++) {
          const u = cycle[i];
          const v = cycle[(i + 1) % 6];
          const idu = atoms[u].id,
            idv = atoms[v].id;
          const ekey = idu < idv ? `${idu}-${idv}` : `${idv}-${idu}`;
          aromaticEdges.add(ekey);
        }
      }
    });
  }
  return { circles, edges: aromaticEdges };
}

export function buildAllPrimitives(
  atoms: Atom[],
  bonds: Bond[],
  opts: LayoutOptions,
  zoom: number,
  // (the labels, where the caller has them already)
  labels: TextItem[] = buildTextLabels(atoms, opts, bonds),
): {
  lines: LineSeg[];
  polys: Poly[];
  circles: Circle[];
  fills: Circle[];
  reach: BondReach[];
} {
  const lines: LineSeg[] = [];
  const polys: Poly[] = [];
  const circles: Circle[] = [];
  const fills: Circle[] = [];
  const deg = degreeMap(bonds);
  // adjacency by index
  // Which side the second line of each double bond takes. Worked out for all
  // of them before any is drawn, so that a bond can meet its neighbour's line
  // where they share an atom instead of stopping short of it.
  const doubleSides = new Map<Bond, number | undefined>();
  // A ring's double bond goes inside the ring - an aromatic ring's into the
  // ring that shows as aromatic by it, since fused rings share a bond and it
  // can go into only one of them (see aromaticSides).
  const ringSide = ringSidesOf(
    atoms.length,
    bonds,
    atoms.map((a) => a.el),
  );
  // each atom's bonds, in their order, each once: what a bond's neighbours
  // are read from, rather than from every bond in the drawing
  const bondsAtAtom = new Map<number, Bond[]>();
  for (const b of bonds) {
    for (const e of b.a1 === b.a2 ? [b.a1] : [b.a1, b.a2]) {
      const here = bondsAtAtom.get(e);
      if (here) here.push(b);
      else bondsAtAtom.set(e, [b]);
    }
  }
  bonds.forEach((b, i) => {
    if (b.order !== 2) return;
    if (b.doubleMode !== undefined && b.doubleMode !== "auto") return;
    const p1 = { x: atoms[b.a1].x, y: atoms[b.a1].y };
    const p2 = { x: atoms[b.a2].x, y: atoms[b.a2].y };
    const axis = vsub(p2, p1);
    const L0 = vlen(axis);
    const dir = L0 > 1e-9 ? vscale(axis, 1 / L0) : { x: 1, y: 0 };
    const n = vperp(dir); // Treat +n as "left"
    const ring = ringSide.get(i);
    if (ring) {
      const c = ring.reduce(
        (acc, k) => ({ x: acc.x + atoms[k].x / ring.length, y: acc.y + atoms[k].y / ring.length }),
        { x: 0, y: 0 },
      );
      const toward = vdot(vsub(c, vscale(vadd(p1, p2), 0.5)), n);
      if (Math.abs(toward) > 1e-9) {
        doubleSides.set(b, toward > 0 ? 1 : -1);
        return;
      }
    }
    const neigh1 = (bondsAtAtom.get(b.a1) ?? [])
      .filter((o) => o !== b)
      .map((o) => (o.a1 === b.a1 ? o.a2 : o.a1));
    const neigh2 = (bondsAtAtom.get(b.a2) ?? [])
      .filter((o) => o !== b)
      .map((o) => (o.a1 === b.a2 ? o.a2 : o.a1));
    // Ignore neighbours near the axis, so a small nudge does not flip the side
    const EPS = Math.max(1e-4, L0 * (opts.doubleSideThreshold ?? 0.06));
    let plus = 0;
    let minus = 0;
    for (const [from, list] of [
      [p1, neigh1],
      [p2, neigh2],
    ] as [Vec2, number[]][]) {
      for (const o of list) {
        const v = { x: atoms[o].x - from.x, y: atoms[o].y - from.y };
        const s = v.x * n.x + v.y * n.y;
        if (s > EPS) plus++;
        else if (s < -EPS) minus++;
      }
    }
    let sgn: number | undefined = plus === minus ? undefined : plus > minus ? 1 : -1;
    // A double bond into an atom it runs straight through - an allene's,
    // a ketene's or a carbodiimide's middle - has its lines either side of
    // the line they make, as the next one does: not one to a side, which
    // reads as a bend.
    const straightOn = (end: number, others: number[], along: Vec2) =>
      others.length === 1 &&
      vdot(vnorm({ x: atoms[others[0]].x - atoms[end].x, y: atoms[others[0]].y - atoms[end].y }), along) > Math.cos((2 * Math.PI) / 180);
    if (straightOn(b.a1, neigh1, vscale(dir, -1)) || straightOn(b.a2, neigh2, dir)) sgn = undefined;
    if (sgn != null) {
      // A bond leaning in along the double bond, close beside where the
      // second line would run, leaves no room for it. Only one leaning along
      // it: a bond leaving backwards, however close to straight on, is
      // nowhere near the second line.
      const clearance = (side: number) => {
        let worst = Math.PI;
        for (const [from, list, along] of [
          [p1, neigh1, dir],
          [p2, neigh2, vscale(dir, -1)],
        ] as [Vec2, number[], Vec2][]) {
          for (const o of list) {
            const v = vnorm({ x: atoms[o].x - from.x, y: atoms[o].y - from.y });
            if ((v.x * n.x + v.y * n.y) * side <= 0) continue;
            const cos = Math.max(-1, Math.min(1, vdot(v, along)));
            worst = Math.min(worst, Math.acos(cos));
          }
        }
        return worst;
      };
      const CROWDED = ((opts.doubleCrowdingDeg ?? 45) * Math.PI) / 180;
      const here = clearance(sgn);
      const there = clearance(-sgn);
      if (here < CROWDED && there > here) sgn = -sgn;
    }
    doubleSides.set(b, sgn);
  });

  // measure the labels once: the bonds are trimmed to them
  const fontWorld = toWorld(opts.fontPx, zoom, opts.units);
  const labelShapes = new Map<number, Vec2[][]>();
  for (const tx of labels) {
    if (tx.atom != null) {
      labelShapes.set(tx.atom, labelHulls(tx, fontWorld, labelSetOf(opts), false));
    }
  }
  // bonds at each atom
  const adjBonds = bondsByAtom(bonds);
  // the rings' circles, and the bonds they stand in for - in the colour of
  // the ring's bonds where they are all given one
  const ringed = ringCircles(atoms, bonds, opts, adjBonds);
  for (const c of ringed.circles) {
    const color = c.key ? sameColor(bonds.filter((b) => c.key!.split("-").includes(String(atoms[b.a1].id)) && c.key!.split("-").includes(String(atoms[b.a2].id)))) : undefined;
    circles.push(color ? { ...c, color } : c);
  }
  const aromaticEdges = ringed.edges;
  // join fill caps for degree==2 to avoid wedge gaps at ~120°
  const widthPx =
    opts.units === "world" ? opts.lineWidthPx * zoom : opts.lineWidthPx;
  const rWorld =
    opts.units === "world"
      ? opts.lineWidthPx * 0.5
      : pxToWorld(widthPx * 0.5, zoom); // restore previous size
  // How a plain bond ends, and how plain bonds meet. Round: a cap of half a
  // line width at every end, so a join and the end of a chain are rounded to
  // the same degree. Sharp: a flat end, and a mitre where two bonds meet.
  const roundJoins = (opts.joinStyle ?? "round") === "round";
  const joins = joinsAtAtoms(atoms, bonds, opts, deg, doubleSides);
  // (a join in the colour its bonds share, where they share one)
  const joinColor = (i: number) => sameColor(adjBonds.get(i) ?? []);
  for (const i of roundJoins ? joins.caps : []) {
    const color = joinColor(i);
    fills.push({ c: { x: atoms[i].x, y: atoms[i].y }, r: rWorld, ...(color ? { color } : {}) });
  }
  if (!roundJoins) {
    for (const [i, dirs] of joins.mitres) {
      const color = joinColor(i);
      polys.push(
        ...mitreJoinPolys({ x: atoms[i].x, y: atoms[i].y }, dirs, rWorld).map((p) => (color ? { ...p, color } : p)),
      );
    }
  }
  // build lines/polys - each in its bond's colour, where it has one, the
  // ends and corners it leaves to be finished too
  const meets: (Meet & { color?: string })[] = [];
  const freeEnds: (Vec2 & { color?: string })[] = [];
  const bends: (Bend & { color?: string })[] = [];
  const reach: BondReach[] = [];
  for (const b of bonds) {
    const u = atoms[b.a1].id,
      v = atoms[b.a2].id;
    const key = u < v ? `${u}-${v}` : `${v}-${u}`;
    const beff: Bond = aromaticEdges.has(key) ? { ...b, order: 1 } : b;
    // which side the second line of a double bond takes, worked out for every
    // one of them first so that each knows what its neighbours are doing
    const autoSgn = doubleSides.get(b);
    const r = buildBondPrimitives(
      atoms,
      beff,
      opts,
      zoom,
      deg,
      undefined,
      autoSgn,
      adjBonds,
      labelShapes,
      doubleSides
    );
    reach.push(bondReach(beff, opts, zoom, deg, doubleSides));
    const behind = brokenBehind(atoms, bonds, b, r.lines, rWorld);
    const tint = <T extends object>(x: T): T & { color?: string } => (b.color ? { ...x, color: b.color } : x);
    lines.push(...behind.lines.map(tint));
    polys.push(...r.polys.map(tint));
    meets.push(...(r.meets ?? []).map(tint));
    freeEnds.push(...[...(r.ends ?? []), ...behind.ends].map(tint));
    bends.push(...(r.bends ?? []).map(tint));
  }
  // a ring in perspective: where its bold edges and wedges meet, the outer
  // corner filled to a point
  polys.push(...perspectiveCorners(atoms, bonds, opts, zoom, deg, rWorld));
  // Every end and corner the joins at atoms have not already seen to:
  // rounded all, or squared all. Two lines of neighbouring double bonds run
  // on to the same point, but a point is all they share, so the corner they
  // turn needs finishing as much as a wave's does. A free end needs nothing
  // when ends are square: a line already stops flat.
  const colored = (color?: string) => (color ? { color } : {});
  if (roundJoins) {
    for (const m of meets) fills.push({ c: m.at, r: rWorld, ...colored(m.color) });
    for (const e of freeEnds) fills.push({ c: { x: e.x, y: e.y }, r: rWorld, ...colored(e.color) });
    for (const b of bends) fills.push({ c: b.at, r: rWorld, ...colored(b.color) });
  } else {
    const byPoint = new Map<string, { at: Vec2; dirs: Vec2[]; color?: string }>();
    for (const m of meets) {
      const key = `${m.at.x.toFixed(6)},${m.at.y.toFixed(6)}`;
      const g = byPoint.get(key) ?? { at: m.at, dirs: [], ...colored(m.color) };
      g.dirs.push(m.dir);
      byPoint.set(key, g);
    }
    for (const g of [...byPoint.values(), ...bends]) {
      polys.push(...mitreJoinPolys(g.at, g.dirs, rWorld).map((p) => ({ ...p, ...colored(g.color) })));
    }
  }
  return { lines, polys, circles, fills, reach };
}

/** The colour every one of `bonds` is drawn in, where they all have the same; none, else. */
function sameColor(bonds: readonly Bond[]): string | undefined {
  const c = bonds[0]?.color;
  return c && bonds.every((b) => b.color === c) ? c : undefined;
}

/** A ring's bond in perspective: bold, or a wedge toward the viewer (display, not stereo). */
function inPerspective(b: Bond): boolean {
  return b.display === "bold" || (b.display === "wedge" && b.stereo !== "up" && b.stereo !== "down");
}

/**
 * Where a ring in perspective's bold edge meets a wedge broad at the same
 * atom - or another bold edge - each cut square: the notch between their
 * outer edges filled to the point where those edges meet (a mitre, as a
 * pen drawing them as one stroke would), or across, where they meet too far
 * out.
 */
function perspectiveCorners(atoms: Atom[], bonds: Bond[], opts: LayoutOptions, zoom: number, deg: Map<number, number>, lineHalf: number): Poly[] {
  const units = opts.units ?? "px";
  const half =
    (opts.boldWidthPx != null ? toWorld(opts.boldWidthPx, zoom, units) : (toWorld(opts.wedgeWidthPx, zoom, units) * 2) / 3) / 2;
  const out: Poly[] = [];
  const broadAt = new Map<number, Bond[]>();
  for (const b of bonds) {
    if (!inPerspective(b)) continue;
    const ends = b.display === "bold" ? [b.a1, b.a2] : [wedgeBaseAtom(b, deg)];
    for (const e of ends) {
      const here = broadAt.get(e);
      if (here) here.push(b);
      else broadAt.set(e, [b]);
    }
  }
  for (const [at, here] of broadAt) {
    if (here.length < 2) continue;
    const v = { x: atoms[at].x, y: atoms[at].y };
    // each shape's way out of the atom, and the line of its edge on a side
    const shapes = here.map((b) => {
      const far = b.a1 === at ? b.a2 : b.a1;
      const u = vnorm(vsub({ x: atoms[far].x, y: atoms[far].y }, v));
      const edge = (n: Vec2) => {
        const corner = vadd(v, vscale(n, half));
        if (b.display === "bold") return { corner, along: vscale(u, -1) };
        const tip = vadd({ x: atoms[far].x, y: atoms[far].y }, vscale(n, lineHalf));
        return { corner, along: vnorm(vsub(corner, tip)) };
      };
      return { u, edge };
    });
    for (let i = 0; i < shapes.length; i++) {
      for (let k = i + 1; k < shapes.length; k++) {
        const [p, q] = [shapes[i], shapes[k]];
        // the outer side of each: away from the other
        const np = vperp(p.u);
        const nq = vperp(q.u);
        const sp = vdot(np, q.u) < 0 ? np : vscale(np, -1);
        const sq = vdot(nq, p.u) < 0 ? nq : vscale(nq, -1);
        const a = p.edge(sp);
        const c = q.edge(sq);
        const den = vcross(a.along, c.along);
        let mitre: Vec2 | null = null;
        if (Math.abs(den) > 1e-9) {
          const t = vcross(vsub(c.corner, a.corner), c.along) / den;
          const m = vadd(a.corner, vscale(a.along, t));
          // (no further out than twice its half width: a corner sharper than
          // 60 degrees, the tub of a cod's, is cut across instead)
          if (t >= 0 && vlen(vsub(m, v)) <= half * 2) mitre = m;
        }
        out.push({ points: mitre ? [v, a.corner, mitre, c.corner] : [v, a.corner, c.corner] });
      }
    }
  }
  return out;
}

/**
 * A bond's lines, broken where the bond passes behind another - both drawn
 * in perspective, their atoms' `z` saying which is nearer where they cross.
 * The gap is wide enough to read as the one bond going under the other.
 * Returns the lines, and the ends the breaks make.
 */
function brokenBehind(
  atoms: Atom[],
  bonds: Bond[],
  bond: Bond,
  lines: LineSeg[],
  halfWidth: number,
): { lines: LineSeg[]; ends: Vec2[] } {
  const a = atoms[bond.a1];
  const c = atoms[bond.a2];
  // (a bond to a pi system's centre goes into its ring, not over or under
  // its edges: neither is broken for the other)
  if (a?.z == null || c?.z == null || bond.endpoints?.length) return { lines, ends: [] };
  const gap = halfWidth * 5;
  // where the bond crosses the ones in front of it, as fractions along it
  const cuts: number[] = [];
  const p = { x: a.x, y: a.y };
  const d = { x: c.x - a.x, y: c.y - a.y };
  for (const o of bonds) {
    if (o === bond || o.endpoints?.length) continue;
    if (o.a1 === bond.a1 || o.a1 === bond.a2 || o.a2 === bond.a1 || o.a2 === bond.a2) continue;
    const e = atoms[o.a1];
    const f = atoms[o.a2];
    if (e?.z == null || f?.z == null) continue;
    const q = { x: e.x, y: e.y };
    const g = { x: f.x - e.x, y: f.y - e.y };
    const den = vcross(d, g);
    if (Math.abs(den) < 1e-9) continue;
    const t = vcross(vsub(q, p), g) / den;
    const u = vcross(vsub(q, p), d) / den;
    if (t <= 0 || t >= 1 || u <= 0 || u >= 1) continue;
    const mine = a.z + (c.z - a.z) * t;
    const theirs = e.z + (f.z - e.z) * u;
    if (mine < theirs - 1e-6) cuts.push(t);
  }
  if (!cuts.length) return { lines, ends: [] };
  const out: LineSeg[] = [];
  const ends: Vec2[] = [];
  for (const l of lines) {
    // each line of the bond, cut where the crossing falls along it
    const ld = { x: l.x2 - l.x1, y: l.y2 - l.y1 };
    const ll = vlen(ld);
    if (ll < 1e-9) {
      out.push(l);
      continue;
    }
    let pieces: [number, number][] = [[0, 1]];
    for (const t0 of cuts) {
      const cross = { x: p.x + d.x * t0, y: p.y + d.y * t0 };
      const t = vdot(vsub(cross, { x: l.x1, y: l.y1 }), ld) / (ll * ll);
      const half = gap / ll;
      pieces = pieces.flatMap(([s0, s1]): [number, number][] => {
        if (t + half <= s0 || t - half >= s1) return [[s0, s1]];
        const kept: [number, number][] = [];
        if (t - half > s0) kept.push([s0, t - half]);
        if (t + half < s1) kept.push([t + half, s1]);
        return kept;
      });
    }
    const at = (s: number) => ({ x: l.x1 + (l.x2 - l.x1) * s, y: l.y1 + (l.y2 - l.y1) * s });
    for (const [s0, s1] of pieces) {
      const from = at(s0);
      const to = at(s1);
      out.push({ ...l, x1: from.x, y1: from.y, x2: to.x, y2: to.y });
      if (s0 > 0) ends.push(from);
      if (s1 < 1) ends.push(to);
    }
  }
  return { lines: out, ends };
}

/**
 * A hydrogen bond's dots between `p` and `q`: `r` across, `gap` clear of
 * each other, spread evenly, never fewer than three.
 */
export function buildDots(p: Vec2, q: Vec2, r: number, gap: number): Poly[] {
  const d = vsub(q, p);
  const len = vlen(d);
  if (len < 1e-9 || r <= 0) return [];
  const n = Math.max(3, Math.round(len / (2 * r + gap)));
  const out: Poly[] = [];
  for (let k = 0; k < n; k++) {
    const c = vadd(p, vscale(d, (k + 0.5) / n));
    const points: Vec2[] = [];
    for (let j = 0; j < 12; j++) {
      const t = (j / 12) * Math.PI * 2;
      points.push({ x: c.x + r * Math.cos(t), y: c.y + r * Math.sin(t) });
    }
    out.push({ points });
  }
  return out;
}

/**
 * The bonds as they are drawn where a double bond's configuration is not
 * known: the double bond as it is, and a wavy bond beside it on a single
 * substituent - as IUPAC's ST-4.4 prefers, rather than a crossed double bond,
 * which it does not accept. Never on a bond to another stereocentre; on both
 * substituents of an end that has two, where no end has one; and none where
 * the drawing shows no configuration anyway - a substituent straight on, or
 * an end with none. The same bonds, in the same order: only how they look.
 */
export function unspecifiedDoubles(atoms: Atom[], bonds: Bond[]): Bond[] {
  if (!bonds.some((b) => b.order === 2 && b.stereo === "either")) return bonds;
  const deg = degreeMap(bonds);
  // a stereocentre: where a wedge or a hashed wedge starts
  const centres = new Set<number>();
  for (const b of bonds) {
    if (b.stereo === "up" || b.stereo === "down") centres.add(wedgeNarrowAtom(b, deg));
  }
  const out = bonds.map((b) => (b.order === 2 && b.stereo === "either" ? { ...b, stereo: "none" as const } : b));
  // each atom's bonds, by index, in their order
  const at = new Map<number, number[]>();
  bonds.forEach((b, k) => {
    for (const e of b.a1 === b.a2 ? [b.a1] : [b.a1, b.a2]) {
      const here = at.get(e);
      if (here) here.push(k);
      else at.set(e, [k]);
    }
  });
  const plain = (b: Bond) =>
    b.order === 1 &&
    (b.stereo ?? "none") === "none" &&
    !b.dative &&
    !b.hydrogen &&
    !b.coordination &&
    !b.query &&
    (b.display ?? "plain") === "plain";
  bonds.forEach((d, i) => {
    if (d.order !== 2 || d.stereo !== "either") return;
    const ends = [
      [d.a1, d.a2],
      [d.a2, d.a1],
    ].map(([end, other]) => {
      const subs = (at.get(end) ?? []).filter((k) => k !== i);
      const far = (k: number) => (bonds[k].a1 === end ? bonds[k].a2 : bonds[k].a1);
      // straight on from the double bond: within ten degrees of it
      const straight =
        subs.length === 1 &&
        (() => {
          const u = vsub({ x: atoms[end].x, y: atoms[end].y }, { x: atoms[other].x, y: atoms[other].y });
          const w = vsub({ x: atoms[far(subs[0])].x, y: atoms[far(subs[0])].y }, { x: atoms[end].x, y: atoms[end].y });
          const lu = vlen(u);
          const lw = vlen(w);
          return lu > 1e-9 && lw > 1e-9 && vdot(u, w) / (lu * lw) > Math.cos((10 * Math.PI) / 180);
        })();
      const free = (k: number) => plain(bonds[k]) && !centres.has(far(k));
      return { subs, straight, free };
    });
    if (ends.some((e) => e.subs.length === 0 || e.straight)) return;
    const single = ends.find((e) => e.subs.length === 1 && e.free(e.subs[0]));
    const both = ends.find((e) => e.subs.length === 2 && e.subs.every(e.free));
    for (const k of single ? single.subs : (both?.subs ?? [])) out[k] = { ...out[k], stereo: "wavy" };
  });
  return out;
}

/** How a query bond is labelled: the two kinds it stands for, or any. */
const QUERY_LABEL = {
  "single-or-double": "S/D",
  "single-or-aromatic": "S/A",
  "double-or-aromatic": "D/A",
  any: "Any",
} as const;

/** An annotation's size against an atom label's: set smaller, so it reads as one (IUPAC GR-11). */
const ANNOTATION_SIZE = 0.8;

/** How a reacting centre that is not drawn with strokes is tagged ("CTfile Formats": 1, a centre; 2, no change). */
const CENTRE_TAG: Record<number, string> = { 1: "rc", 2: "nc" };

/** An enhanced stereo group as a label: abs, and1, or2. */
const groupText = (g: StereoGroup) => (g.kind === "abs" ? "abs" : `${g.kind}${g.n ?? 1}`);

/**
 * Which enhanced stereo groups are labelled at their centres: in a
 * structure (a connected part of the drawing) whose centres are not all of
 * one group. One that is says so once, beneath it (`structureNotes`), as
 * IUPAC's ST-6.3 would have it - and an absolute one needs nothing said.
 */
function centresLabelled(atoms: Atom[], bonds: Bond[]): { atoms: Set<number>; bonds: Set<number>; notes: { atoms: number[]; text: string }[] } {
  const parts = components(atoms.length, bonds);
  const out = { atoms: new Set<number>(), bonds: new Set<number>(), notes: [] as { atoms: number[]; text: string }[] };
  // (each part's bonds in a group, by the part their first atom is in)
  const partOf = new Map<number, number>();
  parts.forEach((part, p) => part.forEach((i) => partOf.set(i, p)));
  const grouped: number[][] = parts.map(() => []);
  bonds.forEach((b, k) => {
    const p = b.stereoGroup ? partOf.get(b.a1) : undefined;
    if (p != null) grouped[p].push(k);
  });
  for (const [p, part] of parts.entries()) {
    const groups = new Set<string>();
    const ats = part.filter((i) => atoms[i].stereoGroup);
    const bds = grouped[p];
    for (const i of ats) groups.add(groupText(atoms[i].stereoGroup!));
    for (const k of bds) groups.add(groupText(bonds[k].stereoGroup!));
    if (!groups.size) continue;
    const [only] = groups;
    if (groups.size === 1 && only === "abs") continue;
    if (groups.size === 1 && !bds.length) {
      out.notes.push({ atoms: part, text: only.startsWith("and") ? "and enantiomer" : "or enantiomer" });
      continue;
    }
    for (const i of ats) out.atoms.add(i);
    for (const k of bds) out.bonds.add(k);
  }
  return out;
}

/** The drawing's connected parts, as atom indices. */
function components(n: number, bonds: Bond[]): number[][] {
  const parent = Array.from({ length: n }, (_, i) => i);
  // (without recursion: a long chain would overflow the stack)
  const find = (i: number): number => {
    let root = i;
    while (parent[root] !== root) root = parent[root];
    while (parent[i] !== root) [parent[i], i] = [root, parent[i]];
    return root;
  };
  for (const b of bonds) parent[find(b.a1)] = find(b.a2);
  const parts = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    const part = parts.get(r);
    if (part) part.push(i);
    else parts.set(r, [i]);
  }
  return [...parts.values()];
}

/**
 * What is said about a bond beside its middle - a query bond's kind, a
 * reacting centre's tag, an enhanced stereo group's label - on whichever
 * side has the more room, the farther from the atoms around it and from
 * what is already set, small, as an annotation of the bond rather than a
 * label of an atom (IUPAC GR-11.1, GR-11.2).
 */
function bondNotes(atoms: Atom[], bonds: Bond[], groupsAt: Set<number>, opts: LayoutOptions, zoom: number): TextItem[] {
  const out: TextItem[] = [];
  const fontPx = opts.fontPx * ANNOTATION_SIZE;
  const size = toWorld(fontPx, zoom, opts.units) * labelSetOf(opts).subscriptSize;
  const taken: Vec2[] = [];
  bonds.forEach((b, k) => {
    const parts = [
      b.query ? QUERY_LABEL[b.query] : "",
      b.reactingCentre != null ? (CENTRE_TAG[b.reactingCentre] ?? "") : "",
      groupsAt.has(k) && b.stereoGroup ? groupText(b.stereoGroup) : "",
    ].filter(Boolean);
    if (!parts.length) return;
    const text = parts.join(" ");
    const p = { x: atoms[b.a1].x, y: atoms[b.a1].y };
    const q = { x: atoms[b.a2].x, y: atoms[b.a2].y };
    const len = vlen(vsub(q, p));
    if (len < 1e-9) return;
    const n = vperp(vscale(vsub(q, p), 1 / len));
    const mid = vscale(vadd(p, q), 0.5);
    const spread = b.order === 2 ? toWorld(opts.doubleOffsetPx, zoom, opts.units) : 0;
    // (half the text's width, roughly, and its height, clear of the line)
    const off = spread + size * (0.6 + 0.3 * text.length * 0.6);
    const room = (c: Vec2) => {
      let near = Infinity;
      for (const a of atoms) near = Math.min(near, vlen(vsub({ x: a.x, y: a.y }, c)));
      for (const t of taken) near = Math.min(near, vlen(vsub(t, c)) * 0.75);
      return near;
    };
    const sides = [1, -1].map((s) => vadd(mid, vscale(n, off * s)));
    const at = room(sides[0]) >= room(sides[1]) - 1e-9 ? sides[0] : sides[1];
    taken.push(at);
    out.push({ x: at.x, y: at.y, text, fontPx, runs: [{ text, sup: true }], anchorRun: 0, beside: true });
  });
  return out;
}

/**
 * A reacting centre's strokes across the middle of its bond ("CTfile
 * Formats" numbers; the marks are Meno's own): one where its order changes,
 * two where it is made or broken, three where both; a cross where it is not
 * a centre.
 */
function centreStrokes(atoms: Atom[], bonds: Bond[], opts: LayoutOptions, zoom: number): LineSeg[] {
  const out: LineSeg[] = [];
  const units = opts.units ?? "px";
  const lwPx = Math.max(units === "world" ? opts.lineWidthPx * zoom : opts.lineWidthPx, Math.max(0.5, opts.minLinePx ?? 1));
  for (const b of bonds) {
    const c = b.reactingCentre;
    if (!c) continue;
    const p = { x: atoms[b.a1].x, y: atoms[b.a1].y };
    const q = { x: atoms[b.a2].x, y: atoms[b.a2].y };
    const len = vlen(vsub(q, p));
    if (len < 1e-9) continue;
    const u = vscale(vsub(q, p), 1 / len);
    const n = vperp(u);
    const mid = vscale(vadd(p, q), 0.5);
    const half = len * 0.09;
    const line = (a: Vec2, d: Vec2) => {
      const from = vsub(a, vscale(d, half));
      const to = vadd(a, vscale(d, half));
      out.push({ x1: from.x, y1: from.y, x2: to.x, y2: to.y, widthPx: lwPx });
    };
    if (c === -1) {
      const s = Math.SQRT1_2;
      line(mid, vadd(vscale(u, s), vscale(n, s)));
      line(mid, vsub(vscale(u, s), vscale(n, s)));
      continue;
    }
    const strokes = (c & 4 ? 2 : 0) + (c & 8 ? 1 : 0);
    const gap = len * 0.05;
    for (let k = 0; k < strokes; k++) line(vadd(mid, vscale(u, (k - (strokes - 1) / 2) * gap)), n);
  }
  return out;
}

/**
 * What is said about an atom, set small in the most open space beside it:
 * its atom-atom mapping number, its configuration inverted or retained, the
 * change on it exact, its enhanced stereo group where that is labelled at
 * its centre (IUPAC GR-11.1: close to the atom, about half a capital's
 * height clear of it, smaller than its label).
 */
function atomNotes(
  atoms: Atom[],
  bonds: Bond[],
  labels: TextItem[],
  groupsAt: Set<number>,
  opts: LayoutOptions,
  zoom: number,
): TextItem[] {
  const out: TextItem[] = [];
  const fontPx = opts.fontPx * ANNOTATION_SIZE;
  const font = toWorld(opts.fontPx, zoom, opts.units);
  const set = labelSetOf(opts);
  const ways = new Map<number, { dir: Vec2; len: number }[]>();
  for (const b of bonds) {
    for (const [i, j] of [
      [b.a1, b.a2],
      [b.a2, b.a1],
    ]) {
      const d = vsub({ x: atoms[j].x, y: atoms[j].y }, { x: atoms[i].x, y: atoms[i].y });
      const len = vlen(d);
      if (len > 1e-9) {
        const way = { dir: vscale(d, 1 / len), len };
        const here = ways.get(i);
        if (here) here.push(way);
        else ways.set(i, [way]);
      }
    }
  }
  atoms.forEach((a, i) => {
    const parts = [
      a.map ? String(a.map) : "",
      a.invRet === "invert" ? "inv" : a.invRet === "retain" ? "ret" : "",
      a.exactChange ? "exact" : "",
      groupsAt.has(i) && a.stereoGroup ? groupText(a.stereoGroup) : "",
    ].filter(Boolean);
    if (!parts.length) return;
    const text = parts.join(" ");
    const label = labels.find((t) => t.atom === i && !t.beside);
    const item = besideVertex(a, ways.get(i) ?? [], [{ text, sup: true }], { fontPx }, (dir) => {
      // clear of its label's letters, or of the bare vertex, by half a capital
      let far = 0;
      if (label) {
        for (const hull of labelHulls(label, font, set, true)) for (const p of hull) far = Math.max(far, p.x * dir.x + p.y * dir.y);
      }
      // and of its own letters: half their extent that way
      const size = font * ANNOTATION_SIZE * set.subscriptSize;
      const half = Math.abs(dir.x) * size * 0.3 * text.length + Math.abs(dir.y) * size * 0.4;
      return far + font * 0.25 + half;
      // (above, where it can: beside a label's right, a small number reads
      // as a charge's or a count's - GR-11.1)
    }, 90);
    out.push(item);
  });
  return out;
}

/**
 * What is said about a whole structure, beneath it, half a bond and more
 * clear of it, as large as its labels (IUPAC GR-11.3): an enhanced stereo
 * group that takes in all its centres, as ST-6.3 would put it - "and
 * enantiomer", "or enantiomer".
 */
function structureNotes(atoms: Atom[], notes: { atoms: number[]; text: string }[], opts: LayoutOptions, zoom: number): TextItem[] {
  const font = toWorld(opts.fontPx, zoom, opts.units);
  return notes.map((n) => {
    const xs = n.atoms.map((i) => atoms[i].x);
    const ys = n.atoms.map((i) => atoms[i].y);
    const bond = typicalBond(atoms, n.atoms);
    return {
      x: (Math.min(...xs) + Math.max(...xs)) / 2,
      y: Math.min(...ys) - bond * 0.6 - font,
      text: n.text,
      fontPx: opts.fontPx,
      runs: [{ text: n.text }],
      anchorRun: 0,
      beside: true,
    };
  });
}

/** About how long a structure's bonds are: from how far its atoms lie from their nearest. */
function typicalBond(atoms: Atom[], part: number[]): number {
  let sum = 0;
  let n = 0;
  for (const i of part) {
    let near = Infinity;
    for (const j of part) if (j !== i) near = Math.min(near, Math.hypot(atoms[i].x - atoms[j].x, atoms[i].y - atoms[j].y));
    if (Number.isFinite(near)) {
      sum += near;
      n++;
    }
  }
  return n ? sum / n : 1;
}

/** What a polymer's or other group's bracket says, by its type: Meno's, after IUPAC's polymer terms where they have one. */
function bracketLabel(g: SgroupMark): string {
  switch (g.type) {
    case "SRU":
      return g.label || "n";
    case "COP":
      return g.subtype === "ALT" ? "alt" : g.subtype === "RAN" ? "ran" : g.subtype === "BLO" ? "block" : "co";
    case "GRA":
      return "graft";
    case "MON":
      return "mon";
    case "MER":
      return "mer";
    case "CRO":
      return "xl";
    case "MOD":
      return "mod";
    case "COM":
      return `c${g.componentNumber ?? ""}`;
    case "MIX":
      return "mix";
    case "FOR":
      return "f";
    case "ANY":
      return "any";
    default:
      return g.label ?? "";
  }
}

/**
 * The brackets of a file's polymer and other bracketed Sgroups (CTfile
 * Formats' SRU, COP, MON, MER, CRO, MOD, GRA, COM, MIX, FOR, ANY, GEN),
 * worked out from where their atoms are: one across each bond out of the
 * group, at its middle, its ends turned in towards the group - or, for a
 * group with no bond out, one either side of it - in square brackets or
 * parentheses as the file has them, with what the group is set small at the
 * lower outside end of its last bracket (an SRU's n), and its connectivity
 * (hh, ht) at the upper. A data Sgroup's data is set small beneath its atoms.
 * A multiple group and an abbreviation shown expanded are their atoms alone.
 */
function sgroupDrawing(atoms: Atom[], bonds: Bond[], opts: LayoutOptions, zoom: number): { lines: LineSeg[]; texts: TextItem[] } {
  const lines: LineSeg[] = [];
  const texts: TextItem[] = [];
  const groups = new Map<number, { mark: SgroupMark; members: Set<number> }>();
  atoms.forEach((a, i) => {
    for (const g of a.sgroups ?? []) {
      if (!groups.has(g.id)) groups.set(g.id, { mark: g, members: new Set() });
      groups.get(g.id)!.members.add(i);
    }
  });
  if (!groups.size) return { lines, texts };
  const units = opts.units ?? "px";
  const lwPx = Math.max(units === "world" ? opts.lineWidthPx * zoom : opts.lineWidthPx, Math.max(0.5, opts.minLinePx ?? 1));
  const fontPx = opts.fontPx * ANNOTATION_SIZE;
  const font = toWorld(opts.fontPx, zoom, opts.units);
  const lens = bonds.map((b) => Math.hypot(atoms[b.a1].x - atoms[b.a2].x, atoms[b.a1].y - atoms[b.a2].y)).filter((l) => l > 1e-9).sort((p, q) => p - q);
  const L = lens[lens.length >> 1] ?? font * 3;
  const seg = (p: Vec2, q: Vec2) => lines.push({ x1: p.x, y1: p.y, x2: q.x, y2: q.y, widthPx: lwPx });
  const note = (at: Vec2, text: string) =>
    texts.push({ x: at.x, y: at.y, text, fontPx, runs: [{ text, sup: true }], anchorRun: 0, beside: true });
  let dataRow = 0;
  for (const { mark, members } of groups.values()) {
    const xs = [...members].map((i) => atoms[i].x);
    const ys = [...members].map((i) => atoms[i].y);
    if (mark.type === "DAT") {
      const text = [...(mark.field?.data ?? []), mark.field?.units ?? ""].filter(Boolean).join(" ");
      if (text) note({ x: (Math.min(...xs) + Math.max(...xs)) / 2, y: Math.min(...ys) - L * (0.6 + 0.35 * dataRow++) - font * 0.5 }, text);
      continue;
    }
    if (mark.type === "MUL" || mark.type === "SUP") continue;
    // a bracket: from its centre `c`, `half` either way along `n`, its ends turned in along `inward`
    const brackets: { c: Vec2; n: Vec2; inward: Vec2; half: number }[] = [];
    for (const b of bonds) {
      if (b.endpoints?.length) continue;
      const in1 = members.has(b.a1);
      if (in1 === members.has(b.a2)) continue;
      const inside = in1 ? atoms[b.a1] : atoms[b.a2];
      const outside = in1 ? atoms[b.a2] : atoms[b.a1];
      const d = vsub({ x: inside.x, y: inside.y }, { x: outside.x, y: outside.y });
      const len = vlen(d);
      if (len < 1e-9) continue;
      const inward = vscale(d, 1 / len);
      brackets.push({ c: vscale(vadd(inside, outside), 0.5), n: vperp(inward), inward, half: L * 0.35 });
    }
    if (!brackets.length) {
      const pad = L * 0.4 + font * 0.5;
      const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
      const half = (Math.max(...ys) - Math.min(...ys)) / 2 + pad;
      brackets.push({ c: { x: Math.min(...xs) - pad, y: cy }, n: { x: 0, y: 1 }, inward: { x: 1, y: 0 }, half });
      brackets.push({ c: { x: Math.max(...xs) + pad, y: cy }, n: { x: 0, y: 1 }, inward: { x: -1, y: 0 }, half });
    }
    const tick = L * 0.1;
    for (const k of brackets) {
      const a = vsub(k.c, vscale(k.n, k.half));
      const b = vadd(k.c, vscale(k.n, k.half));
      if (mark.bracketStyle === "paren") {
        // a parenthesis: bowed out from the group, its ends at the bracket's
        const pts: Vec2[] = [];
        for (let j = 0; j <= 8; j++) {
          const t = -1 + j / 4;
          pts.push(vadd(vadd(k.c, vscale(k.n, t * k.half)), vscale(k.inward, -tick * (1 - t * t) + tick)));
        }
        for (let j = 0; j < pts.length - 1; j++) seg(pts[j], pts[j + 1]);
      } else {
        seg(a, b);
        seg(a, vadd(a, vscale(k.inward, tick)));
        seg(b, vadd(b, vscale(k.inward, tick)));
      }
    }
    // what it is, by its last bracket's lower outside end; its connectivity by the upper
    const last = brackets.reduce((p, q) => (q.c.x > p.c.x + 1e-9 ? q : p));
    const ends = [vsub(last.c, vscale(last.n, last.half)), vadd(last.c, vscale(last.n, last.half))].sort((p, q) => p.y - q.y);
    const out = vscale(last.inward, -font * 0.45);
    const text = bracketLabel(mark);
    if (text) note(vadd(ends[0], out), text);
    if (mark.connect === "HH" || mark.connect === "HT") note(vadd(ends[1], out), mark.connect.toLowerCase());
  }
  return { lines, texts };
}

export function layoutMolecule(
  drawn: Atom[],
  given: Bond[],
  opts: LayoutOptions,
  zoom: number
): Layout {
  const bonds = unspecifiedDoubles(drawn, given);
  const atoms = cumulatedShown(chargesAsDrawn(drawn, bonds), bonds);
  // (each label in its atom's colour, where it has one - a charge set
  // beside a bare vertex too)
  const labels = buildTextLabels(atoms, opts, bonds).map((t) => {
    const color = atoms[t.atom ?? t.markOf ?? -1]?.color;
    return color ? { ...t, color } : t;
  });
  const prim = buildAllPrimitives(atoms, bonds, opts, zoom, labels);
  // what is said about bonds, atoms and whole structures (IUPAC GR-11)
  const groups = centresLabelled(atoms, bonds);
  prim.lines.push(...centreStrokes(atoms, bonds, opts, zoom));
  const sgroups = sgroupDrawing(atoms, bonds, opts, zoom);
  prim.lines.push(...sgroups.lines);
  const texts = [
    ...sgroups.texts,
    ...labels,
    ...bondNotes(atoms, bonds, groups.bonds, opts, zoom),
    ...atomNotes(atoms, bonds, labels, groups.atoms, opts, zoom),
    ...structureNotes(atoms, groups.notes, opts, zoom),
  ];
  // the labels' marks - a charge's circle, a radical's dots - drawn as the
  // rest of the drawing is
  const units = opts.units ?? "px";
  const lwPx = Math.max(units === "world" ? opts.lineWidthPx * zoom : opts.lineWidthPx, Math.max(0.5, opts.minLinePx ?? 1));
  const marks = labelMarks(texts, toWorld(opts.fontPx, zoom, opts.units), labelSetOf(opts), pxToWorld(lwPx, zoom), lwPx);
  prim.lines.push(...marks.lines);
  prim.polys.push(...marks.polys);
  prim.fills.push(...marks.fills);
  // behind it all, the rings' fills and the parts' highlights
  const under = underOf(atoms, bonds, labels, opts, zoom);
  // A label hangs off its atom, so the drawing is wider than the atoms are:
  // leave it out and a label at the edge is cut off, on the canvas as in an
  // export.
  const bounds = expandBoundsForUnder(
    expandBoundsForBonds(
      expandBoundsForLabels(
        computeBounds(atoms),
        texts,
        toWorld(opts.fontPx, zoom, opts.units),
        labelSetOf(opts),
      ),
      prim,
      zoom,
    ),
    under,
  );
  return {
    ...(under.length ? { under } : {}),
    lines: prim.lines,
    polys: prim.polys,
    texts,
    circles: prim.circles,
    fills: prim.fills,
    bounds,
    zoom,
    reach: prim.reach,
  };
}

/** How far a part's highlight reaches either side of its bonds and round its atoms, in ems of the labels. */
const HIGHLIGHT_REACH = 0.4;

/** A ring's atoms by index, in order round it, from its key (`LayoutOptions.ringFills`); null where they are not one ring of bonds. */
export function ringOfKey(atoms: readonly Atom[], bonds: readonly Bond[], key: string): number[] | null {
  const ids = key.split("-").map(Number);
  const index = new Map(atoms.map((a, i) => [a.id, i]));
  const ring = ids.map((id) => index.get(id));
  if (ring.length < 3 || ring.some((i) => i == null)) return null;
  const inRing = new Set(ring as number[]);
  const next = new Map<number, number[]>();
  for (const b of bonds) {
    if (b.endpoints?.length || !inRing.has(b.a1) || !inRing.has(b.a2) || b.a1 === b.a2) continue;
    next.set(b.a1, [...(next.get(b.a1) ?? []), b.a2]);
    next.set(b.a2, [...(next.get(b.a2) ?? []), b.a1]);
  }
  if ([...inRing].some((i) => new Set(next.get(i) ?? []).size !== 2)) return null;
  const order = [ring[0] as number];
  for (let prev = -1; order.length < inRing.size; ) {
    const here = order[order.length - 1];
    const on = next.get(here)!.find((j) => j !== prev && !order.includes(j));
    if (on == null) return null;
    prev = here;
    order.push(on);
  }
  return next.get(order[order.length - 1])!.includes(order[0]) ? order : null;
}

/** Points round `c` at radius `r`. */
function roundOf(c: Vec2, r: number, n = 32): Vec2[] {
  return Array.from({ length: n }, (_, k) => ({ x: c.x + r * Math.cos((2 * Math.PI * k) / n), y: c.y + r * Math.sin((2 * Math.PI * k) / n) }));
}

/** A band from `p` to `q`, `h` either side of its line, its ends round. */
function bandOf(p: Vec2, q: Vec2, h: number, n = 12): Vec2[] {
  const a = Math.atan2(q.y - p.y, q.x - p.x);
  const out: Vec2[] = [];
  for (let k = 0; k <= n; k++) {
    const t = a - Math.PI / 2 - (Math.PI * k) / n;
    out.push({ x: p.x + h * Math.cos(t), y: p.y + h * Math.sin(t) });
  }
  for (let k = 0; k <= n; k++) {
    const t = a + Math.PI / 2 - (Math.PI * k) / n;
    out.push({ x: q.x + h * Math.cos(t), y: q.y + h * Math.sin(t) });
  }
  return out;
}

/** A box `left` to `right`, `bottom` to `top`, its corners rounded by `r`. */
function roundedBox(left: number, bottom: number, right: number, top: number, r: number, n = 6): Vec2[] {
  const rr = Math.max(0, Math.min(r, (right - left) / 2, (top - bottom) / 2));
  const corners: [number, number, number][] = [
    [right - rr, top - rr, 0],
    [left + rr, top - rr, Math.PI / 2],
    [left + rr, bottom + rr, Math.PI],
    [right - rr, bottom + rr, (3 * Math.PI) / 2],
  ];
  return corners.flatMap(([cx, cy, from]) =>
    Array.from({ length: n + 1 }, (_, k) => ({ x: cx + rr * Math.cos(from + (Math.PI / 2) * (k / n)), y: cy + rr * Math.sin(from + (Math.PI / 2) * (k / n)) })),
  );
}

/**
 * What is drawn behind the drawing: each ring filled (`LayoutOptions.ringFills`),
 * then each part highlighted - a band along each bond, round each atom, or
 * round its label where it has one - flat in its colour exactly (a pale one
 * from the palette reads the drawing over), so that one colour's pieces run
 * together into one shape with a sharp edge.
 */
function underOf(atoms: Atom[], bonds: Bond[], labels: readonly TextItem[], opts: LayoutOptions, zoom: number): Under[] {
  const out: Under[] = [];
  for (const [key, color] of Object.entries(opts.ringFills ?? {})) {
    const ring = ringOfKey(atoms, bonds, key);
    // (in the colour given, exactly - the maintainer, 2026-10-11)
    if (ring) out.push({ points: ring.map((i) => ({ x: atoms[i].x, y: atoms[i].y })), color });
  }
  if (!atoms.some((a) => a.highlight) && !bonds.some((b) => b.highlight)) return out;
  const font = toWorld(opts.fontPx, zoom, opts.units);
  const h = HIGHLIGHT_REACH * font;
  const set = labelSetOf(opts);
  for (const b of bonds) {
    if (!b.highlight || b.endpoints?.length || b.a1 === b.a2) continue;
    out.push({ points: bandOf(atoms[b.a1], atoms[b.a2], h), color: b.highlight });
  }
  const labelOf = new Map(labels.filter((t) => t.atom != null).map((t) => [t.atom!, t]));
  atoms.forEach((a, i) => {
    if (!a.highlight) return;
    const t = labelOf.get(i);
    const color = a.highlight;
    if (!t) {
      out.push({ points: roundOf(a, h), color });
      return;
    }
    // (round its label, as far past its ink as a band reaches past a bond's line, but no smaller than round a bare atom)
    const box = labelBox(t, font, set);
    const pad = 0.2 * font;
    out.push({
      points: roundedBox(a.x - Math.max(box.left + pad, h), a.y - Math.max(box.bottom + pad, h), a.x + Math.max(box.right + pad, h), a.y + Math.max(box.top + pad, h), h),
      color,
    });
  });
  return out;
}

/** `bounds` taking in what is drawn behind the drawing. */
function expandBoundsForUnder(bounds: { min: Vec2; max: Vec2 }, under: readonly Under[]): { min: Vec2; max: Vec2 } {
  if (!under.length) return bounds;
  const min = { ...bounds.min };
  const max = { ...bounds.max };
  for (const u of under)
    for (const p of u.points) {
      min.x = Math.min(min.x, p.x);
      min.y = Math.min(min.y, p.y);
      max.x = Math.max(max.x, p.x);
      max.y = Math.max(max.y, p.y);
    }
  return { min, max };
}

function toSvgPath(poly: Poly): string {
  if (!poly.points.length) return "";
  const p0 = poly.points[0];
  const segs = [`M ${p0.x} ${-p0.y}`];
  for (let i = 1; i < poly.points.length; i++) {
    const p = poly.points[i];
    segs.push(`L ${p.x} ${-p.y}`);
  }
  segs.push("Z");
  return segs.join(" ");
}

function expandBounds(
  bounds: { min: Vec2; max: Vec2 },
  pad: number
): { min: Vec2; max: Vec2 } {
  return {
    min: { x: bounds.min.x - pad, y: bounds.min.y - pad },
    max: { x: bounds.max.x + pad, y: bounds.max.y + pad },
  };
}

function escapeXml(text: string): string {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * The CSS font stack for a typeface: itself, its nearest stand-in, then
 * IBM Plex Sans JP for what it lacks - as the canvas draws it.
 */
export function fontStack(family: string): string {
  const quote = (name: string) => (/[^A-Za-z0-9-]/.test(name) ? `'${name}'` : name);
  const standIn =
    family === "Arial" ? ["Helvetica"] : family === "Helvetica" ? ["Arial"] : [];
  return [family, ...standIn, "IBM Plex Sans JP", "sans-serif"]
    .map((name, i, all) => (i === all.length - 1 ? name : quote(name)))
    .join(", ");
}

/** A label as the canvas draws it: set by `placeLabel`, run by run. */
function svgLabel(
  t: TextItem,
  fontSize: number,
  set: LabelSet,
  fill: string,
): string {
  const fontFamily = fontStack(set.fontFamily ?? "Arial");
  let out = "";
  for (const run of placeLabel(t, fontSize, set)) {
    // (a mark is drawn with the lines and shapes)
    if (run.mark) continue;
    out +=
      `<text x="${run.x}" y="${-run.y}" font-family="${fontFamily}"` +
      ` font-size="${run.size}"${run.italic ? ' font-style="italic"' : ""}${run.bold ? ' font-weight="bold"' : ""} fill="${svgColor(run.color, fill)}" stroke="none"` +
      ` text-anchor="start">${escapeXml(run.text)}</text>`;
  }
  return out;
}

/**
 * The same drawing as the canvas, as SVG. Everything is written in the
 * coordinates the layout is in: a line's width and a label's font size are
 * converted out of pixels with the zoom the layout was built for, so the
 * drawing keeps its proportions at any size it is shown at. The px size the
 * layout was built for is kept as the SVG's own width and height.
 */
export function createSVG(layout: Layout, opts: LayoutOptions): string {
  const zoom = layout.zoom > 0 ? layout.zoom : 1;
  const toCoord = (px: number) => px / zoom;
  const b = expandBounds(layout.bounds, toCoord(opts.paddingPx));
  const width = b.max.x - b.min.x;
  const height = b.max.y - b.min.y;
  const vb = `${b.min.x} ${-b.max.y} ${width} ${height}`;
  const stroke = opts.bondColor ?? "black";
  const fill = opts.labelColor ?? "black";
  const set = labelSetOf(opts);
  const strokeWidth = toWorld(opts.lineWidthPx, zoom, opts.units);
  const fontSize = toWorld(opts.fontPx, zoom, opts.units);
  let s = "";
  s += `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}"` +
    ` width="${width * zoom}" height="${height * zoom}" fill="none">`;
  // under it all: the shapes on the page, each filled, its line over its fill, an arrow's heads over its line
  for (const m of layout.shapes ?? []) {
    if (m.fill) s += `<path d="${toSvgPath(m.fill)}" fill="${svgColor(m.fill.color)}" stroke="none" />`;
    for (const l of m.lines) {
      const d = l.points.map((p, i) => `${i ? "L" : "M"} ${p.x} ${-p.y}`).join(" ") + (l.closed ? " Z" : "");
      s += `<path d="${d}" fill="none" stroke="${svgColor(l.color)}" stroke-width="${l.width}" stroke-linecap="butt" stroke-linejoin="miter" stroke-miterlimit="3" />`;
    }
    for (const h of m.heads) s += `<path d="${toSvgPath(h)}" fill="${svgColor(h.color)}" stroke="none" />`;
  }
  // behind the drawing: the rings' fills and the parts' highlights
  for (const u of layout.under ?? []) {
    s += `<path d="${toSvgPath(u)}" fill="${svgColor(u.color)}" stroke="none" />`;
  }
  // filled join caps
  for (const c of layout.fills || []) {
    s += `<circle cx="${c.c.x}" cy="${-c.c
      .y}" r="${c.r}" fill="${svgColor(c.color, stroke)}" stroke="none" />`;
  }
  for (const p of layout.polys) {
    s += `<path d="${toSvgPath(p)}" fill="${svgColor(p.color, stroke)}" stroke="none" />`;
  }
  for (const c of layout.curves ?? []) {
    if (c.points.length < 4) continue;
    let d = `M${c.points[0].x} ${-c.points[0].y}`;
    for (let i = 1; i + 2 < c.points.length; i += 3) {
      const [p, q, r] = [c.points[i], c.points[i + 1], c.points[i + 2]];
      d += `C${p.x} ${-p.y} ${q.x} ${-q.y} ${r.x} ${-r.y}`;
    }
    s += `<path d="${d}" fill="none" stroke="${svgColor(c.color, stroke)}" stroke-width="${c.width}"` +
      ` stroke-linecap="${c.round ? "round" : "butt"}" stroke-linejoin="round" />`;
  }
  for (const c of layout.circles || []) {
    s +=
      c.squash != null && c.squash < 1
        ? `<ellipse cx="${c.c.x}" cy="${-c.c.y}" rx="${c.r}" ry="${c.r * c.squash}"` +
          ` transform="rotate(${(-(c.angle ?? 0) * 180) / Math.PI} ${c.c.x} ${-c.c.y})"` +
          ` fill="none" stroke="${svgColor(c.color, stroke)}" stroke-width="${strokeWidth}" />`
        : `<circle cx="${c.c.x}" cy="${-c.c.y}" r="${c.r}" fill="none" stroke="${svgColor(c.color, stroke)}" stroke-width="${strokeWidth}" />`;
  }
  for (const l of layout.lines) {
    const w = toCoord(l.widthPx > 0 ? l.widthPx : 1);
    s += `<line x1="${l.x1}" y1="${-l.y1}" x2="${l.x2}" y2="${-l.y2}"` +
      ` stroke="${svgColor(l.color, stroke)}" stroke-width="${w}" stroke-linecap="butt"` +
      ` stroke-linejoin="miter" stroke-miterlimit="2" />`;
  }
  for (const t of layout.texts) {
    s += svgLabel(t, t.ownSize ? toWorld(t.fontPx, zoom, opts.units) : fontSize, set, svgColor(t.color, fill));
  }
  const img = layout.solidsImage;
  s += img
    ? `<image href="${img.href}" x="${img.bounds.min.x}" y="${-img.bounds.max.y}"` +
      ` width="${img.bounds.max.x - img.bounds.min.x}" height="${img.bounds.max.y - img.bounds.min.y}" preserveAspectRatio="none" />`
    : svgSolids(layout.solids ?? []);
  // (with the molecules an image, their measurements' lines and fans are in
  // it, in depth among the atoms: only the values are written over it)
  for (const m of layout.measures ?? []) s += svgMeasure(m, set.fontFamily, !img);
  s += `</svg>`;
  return s;
}

/** A part's colour as an SVG attribute takes it: a #rrggbb colour as it is, anything else as `otherwise`. */
function svgColor(css: string | undefined, otherwise = "black"): string {
  return css && /^#[0-9a-f]{6}$/i.test(css) ? css : otherwise;
}

/** A measurement as an SVG draws it: its fan, its lines, and its value on its white ground. */
function svgMeasure(m: MeasureMark, family: string | undefined, lines = true): string {
  let s = "";
  for (const [a, b, c] of lines ? m.fan : []) {
    s += `<path d="M${a.x} ${-a.y}L${b.x} ${-b.y}L${c.x} ${-c.y}Z" fill="${m.color}" fill-opacity="${m.fanOpacity}" stroke="none" />`;
  }
  for (const [a, b] of lines ? m.lines : []) {
    s += `<line x1="${a.x}" y1="${-a.y}" x2="${b.x}" y2="${-b.y}" stroke="${m.color}" stroke-width="${m.width}" stroke-linecap="butt" />`;
  }
  const box = measureLabelBox(m, family);
  s +=
    `<rect x="${box.min.x}" y="${-box.max.y}" width="${box.max.x - box.min.x}" height="${box.max.y - box.min.y}"` +
    ` rx="${(box.max.y - box.min.y) / 2}" fill="white" fill-opacity="0.9" stroke="none" />` +
    `<text x="${box.baseline.x}" y="${-box.baseline.y}" font-family="${fontStack(family ?? "Arial")}"` +
    ` font-size="${m.size}" fill="${m.color}" stroke="none" text-anchor="start">${escapeXml(m.text)}</text>`;
  return s;
}

/**
 * Molecules in 3D as an SVG draws them: each ball filled with a radial
 * gradient of its colour, light where the light falls, each stick a line.
 */
/** How far molecules in 3D reach on the page, drawn as their marks are; null with none. */
export function solidsBounds(marks: readonly SolidMark[]): { min: Vec2; max: Vec2 } | null {
  if (!marks.length) return null;
  const min = { x: Infinity, y: Infinity };
  const max = { x: -Infinity, y: -Infinity };
  const take = (x: number, y: number, r: number) => {
    min.x = Math.min(min.x, x - r);
    min.y = Math.min(min.y, y - r);
    max.x = Math.max(max.x, x + r);
    max.y = Math.max(max.y, y + r);
  };
  for (const m of marks) {
    if (m.kind === "ball") take(m.c.x, m.c.y, m.r);
    else {
      take(m.a.x, m.a.y, m.width / 2);
      take(m.b.x, m.b.y, m.width / 2);
    }
  }
  return { min, max };
}

function svgSolids(marks: SolidMark[]): string {
  if (!marks.length) return "";
  const ids = new Map<string, string>();
  let defs = "";
  for (const m of marks) {
    if (m.kind !== "ball" || ids.has(m.color)) continue;
    const id = `ball${ids.size}`;
    ids.set(m.color, id);
    const fx = 0.5 + BALL_SHADE.focus.x;
    const fy = 0.5 - BALL_SHADE.focus.y;
    defs +=
      `<radialGradient id="${id}" cx="0.5" cy="0.5" r="0.5" fx="${fx}" fy="${fy}">` +
      `<stop offset="0" stop-color="${shadeOf(m.color, BALL_SHADE.light)}"/>` +
      `<stop offset="0.6" stop-color="${m.color}"/>` +
      `<stop offset="1" stop-color="${shadeOf(m.color, -BALL_SHADE.dark)}"/>` +
      `</radialGradient>`;
  }
  let s = defs ? `<defs>${defs}</defs>` : "";
  for (const m of marks) {
    s +=
      m.kind === "ball"
        ? `<circle cx="${m.c.x}" cy="${-m.c.y}" r="${m.r}" fill="url(#${ids.get(m.color)})" stroke="none" />`
        : `<line x1="${m.a.x}" y1="${-m.a.y}" x2="${m.b.x}" y2="${-m.b.y}" stroke="${m.color}" stroke-width="${m.width}" stroke-linecap="butt" />`;
  }
  return s;
}
