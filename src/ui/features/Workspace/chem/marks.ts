/**
 * What the plugin that does the checks says about a structure, as marks on
 * it: atoms with more bonds than they can have, R and S at stereocentres, E
 * and Z at double bonds, Ra and Sa at axes of chirality (BINAP's).
 * A ring round an atom with too many bonds is the editor's, never in a
 * picture of the drawing. R, S, E and Z are shown in pictures as the canvas
 * shows them - copied, saved and exported (`stereoPictureItems`): the
 * maintainer's ruling of 2026-10-21, reversing that of 2026-10-10, which
 * kept them out of every picture.
 */
import { switchedAt } from "../utils/zoomSwitch";
import type { Analysis } from "../../../../lib/roles/client";
import { molIndex } from "../../../../lib/roles/molblock";
import { ELEMENTS } from "../../../../lib/chem/elements";
import { isMetal } from "../../../../lib/layout/perceive";
import type { Model } from "../store/types";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { labelBox, labelSetOf, runsWidth, type LayoutOptions, type TextItem, type TextRun } from "../../../../lib/chem/layout2d";

/** A stereodescriptor's letters, against the labels': on the drawing and on a molecule in 3D alike. */
export const MARK_SCALE = 0.6;
/** The smallest a mark's letters get, however far out the view is: on both alike. */
export const MARK_MIN_PX = 9;

/** Half a capital letter's height, as a share of the labels' size: how far R or S stands off its atom where the style does not say. */
export const STEREO_GAP = 0.35;

/** Half the height of a mark's letters, in ems of their size: a capital's, and a little round it. */
export const MARK_HALF_HEIGHT = 0.42;

/** How far apart two of R, S, E and Z keep at the least, in ems of their size. */
export const MARKS_APART = 0.6;

/**
 * The size R, S, E and Z go at, in pixels their letters would have at a
 * zoom (`naturalPx`, the labels' size times `MARK_SCALE`, before
 * `MARK_MIN_PX`): held at that least size as the view goes further out, they
 * go once they would be three quarters of it (the maintainer, 2026-10-21:
 * at a far zoom they stayed as large and floated round a structure a few
 * pixels across).
 */
export const MARKS_LEAST_PX = 0.75 * MARK_MIN_PX;

/**
 * Whether R, S, E and Z are in view at a zoom, they having been (`was`) or
 * not: switched past `MARKS_LEAST_PX`, a little either way, and faded over a
 * short time - never faded with the zoom, which left them half there at a
 * zoom (the maintainer, 2026-10-28; utils/zoomSwitch). Atom numbers on a
 * molecule in 3D go below their own least size (utils/atomNumbers
 * `NUMBER_LEAST_PX`).
 */
export const marksReadAt = (was: boolean, naturalPx: number): boolean => switchedAt(was, naturalPx, MARKS_LEAST_PX);

export type ValenceProblem = { valence: number; most?: number };

export type ChemMarks = {
  /** Atoms with more bonds than they can have, by id. */
  valence: Map<number, ValenceProblem>;
  /** Stereocentres, by atom id: R or S (r or s when pseudo-asymmetric). */
  centres: Map<number, "R" | "S" | "r" | "s">;
  /** Stereogenic double bonds, and axes of chirality, by bond id. */
  doubleBonds: Map<number, "E" | "Z" | "Ra" | "Sa">;
};

export const NO_MARKS: ChemMarks = {
  valence: new Map(),
  centres: new Map(),
  doubleBonds: new Map(),
};

/** The plugin's answer about `model`, by the ids of its atoms and bonds. */
export function marksOf(model: Model, analysis: Analysis): ChemMarks {
  const { atoms, bonds } = molIndex(model);
  const marks: ChemMarks = {
    valence: new Map(),
    centres: new Map(),
    doubleBonds: new Map(),
  };
  for (const a of analysis.atoms) {
    const atom = atoms[a.index];
    if (!atom) continue;
    if (a.valenceError && !bridgesMetals(model, atom, a.valenceError) && !takesArrows(model, atom, a.valenceError))
      marks.valence.set(atom.id, a.valenceError);
    if (a.cip) marks.centres.set(atom.id, a.cip);
  }
  for (const b of analysis.bonds) {
    const bond = bonds[b.index];
    // (an axis's helicity said as the descriptor its labels have, (R)-BINAP:
    // M is Ra and P is Sa, both read from the groups CIP ranks first)
    if (bond && b.cip) marks.doubleBonds.set(bond.id, b.cip === "M" ? "Ra" : b.cip === "P" ? "Sa" : b.cip);
  }
  return marks;
}

/** The atoms and bonds whose R or S, E or Z was asked for, by id. */
export type StereoAsked = { atoms: ReadonlySet<number>; bonds: ReadonlySet<number> };

/** The atoms and bonds whose R or S, E or Z is asked for on the drawing. */
export function stereoAskedOf(model: Model): StereoAsked {
  return {
    atoms: new Set(model.atoms.filter((a) => a.stereoShown).map((a) => a.id)),
    bonds: new Set(model.bonds.filter((b) => b.stereoShown).map((b) => b.id)),
  };
}

/**
 * The R and S, E and Z of `marks` shown on `model`: each whose atom or bond
 * asks for it now, and asked for it when the marks were worked out
 * (`askedThen`) - or has been asked for since, and the marks were worked out
 * for the structure as it is (`forThisStructure`, asked only then). Asked
 * for since a change to the structure, it waits for marks worked out after,
 * so that what is shown together comes together: never a few at once from
 * marks made before and the rest a moment later. One no longer asked for
 * goes at once.
 */
export function shownMarks(
  marks: ChemMarks,
  model: Model,
  askedThen: StereoAsked,
  forThisStructure: () => boolean,
): Pick<ChemMarks, "centres" | "doubleBonds"> {
  const now = stereoAskedOf(model);
  const since = [...now.atoms].some((id) => !askedThen.atoms.has(id)) || [...now.bonds].some((id) => !askedThen.bonds.has(id));
  const fresh = since && forThisStructure();
  const only = <T>(of: Map<number, T>, asked: ReadonlySet<number>, then: ReadonlySet<number>) =>
    new Map([...of].filter(([id]) => asked.has(id) && (fresh || then.has(id))));
  return { centres: only(marks.centres, now.atoms, askedThen.atoms), doubleBonds: only(marks.doubleBonds, now.bonds, askedThen.bonds) };
}

/** The halogens: group 17, by atomic number. */
const HALOGEN = new Set(ELEMENTS.filter((e) => [9, 17, 35, 53, 85, 117].includes(e.number)).map((e) => e.symbol));

/**
 * A halogen bridging metals - μ-Cl in [Pd(allyl)Cl]2, drawn with a plain
 * bond to each Pd - has no more bonds than it can have (the maintainer,
 * 2026-10-18): its bonds to metals count as the dative bonds they are, so
 * that what it is checked by is its bonds to the rest - none, or the one it
 * has as usual. A halogen bonded past that to non-metals (two carbons) is
 * marked still.
 */
function bridgesMetals(model: Model, atom: Model["atoms"][number], p: ValenceProblem): boolean {
  if (!HALOGEN.has(atom.el)) return false;
  const byId = new Map(model.atoms.map((a) => [a.id, a]));
  let toMetals = 0;
  for (const b of model.bonds) {
    const other = b.a === atom.id ? b.b : b.b === atom.id ? b.a : null;
    if (other == null) continue;
    const o = byId.get(other);
    if (o && isMetal(o.el)) toMetals += b.order;
  }
  return toMetals > 0 && p.valence - toMetals <= (p.most ?? 1);
}

/**
 * An atom a dative bond is drawn into - BH3 in H3N→BH3, AlCl3 taking an
 * ether's O - has no more bonds than it can have for that: the pair is the
 * donor's, so the bond takes none of its valence (`valenceOrder`), as it
 * takes none of the donor's. The checks plugin counts a dative bond on the
 * atom it points to, and so is checked here by its bonds to the rest; a
 * coordination bond drawn as a plain line is written as one from `a` to
 * `b`, and counted alike. An atom with too many bonds besides is marked
 * still.
 */
function takesArrows(model: Model, atom: Model["atoms"][number], p: ValenceProblem): boolean {
  if (p.most == null) return false;
  const into = model.bonds.filter((b) => b.b === atom.id && b.a !== atom.id && (b.dative || b.coordination) && b.order === 1).length;
  return into > 0 && p.valence - into <= p.most;
}

const NAMES = new Map(ELEMENTS.map((e) => [e.symbol, e.name]));

/** What is wrong with an atom's valence, in words. */
export function valenceMessage(el: string, p: ValenceProblem): string {
  const name = NAMES.get(el) ?? el;
  return p.most != null
    ? `Too many bonds: a valence of ${p.valence}, where ${name} takes at most ${p.most}.`
    : `Too many bonds: a valence of ${p.valence} is more than ${name} takes.`;
}

type Vec = { x: number; y: number };

/**
 * A structure looked up the way placing its marks needs: its atoms by id,
 * each atom's bonds in their order, and its bonds by id. Made once for all
 * the marks on it - a mark at each of a thousand stereocentres does not
 * each go through every atom and bond.
 */
export type MarkIndex = {
  at: Map<number, Model["atoms"][number]>;
  bondsAt: Map<number, Model["bonds"]>;
  bondById: Map<number, Model["bonds"][number]>;
};

export function markIndex(model: Model): MarkIndex {
  const at = new Map(model.atoms.map((a) => [a.id, a]));
  const bondsAt = new Map<number, Model["bonds"]>();
  const bondById = new Map<number, Model["bonds"][number]>();
  for (const b of model.bonds) {
    if (!bondById.has(b.id)) bondById.set(b.id, b);
    for (const e of b.a === b.b ? [b.a] : [b.a, b.b]) {
      const here = bondsAt.get(e);
      if (here) here.push(b);
      else bondsAt.set(e, [b]);
    }
  }
  return { at, bondsAt, bondById };
}

/**
 * The ways out from an atom, best first: halfway across each gap between
 * its bonds, the widest first, then round the compass. Straight down, first,
 * from an atom with no bonds.
 */
export function waysOut(model: Model, atomId: number, index: MarkIndex = markIndex(model)): Vec[] {
  const { at } = index;
  const atom = at.get(atomId);
  const compass = Array.from({ length: 12 }, (_, i) => {
    const t = -Math.PI / 2 + (i * Math.PI) / 6;
    return { x: Math.cos(t), y: Math.sin(t) };
  });
  if (!atom) return compass;
  const angles: number[] = [];
  for (const b of index.bondsAt.get(atomId) ?? []) {
    const other = b.a === atomId ? b.b : b.b === atomId ? b.a : null;
    const o = other != null ? at.get(other) : undefined;
    if (!o || (o.x === atom.x && o.y === atom.y)) continue;
    angles.push(Math.atan2(o.y - atom.y, o.x - atom.x));
  }
  angles.sort((p, q) => p - q);
  const gaps = angles.map((from, i) => {
    const to = i + 1 < angles.length ? angles[i + 1] : angles[0] + 2 * Math.PI;
    return { size: to - from, mid: (from + to) / 2 };
  });
  gaps.sort((p, q) => q.size - p.size);
  return [
    ...gaps.map((g) => ({ x: Math.cos(g.mid), y: Math.sin(g.mid) })),
    ...compass,
  ];
}

/**
 * The ways out from a stereocentre for its R or S, best first: opposite
 * each of its wedged and hashed bonds, as IUPAC's recommendations for
 * structure diagrams put it (GR-11.1), then its ways out (waysOut).
 */
export function stereoWaysOut(model: Model, atomId: number, index: MarkIndex = markIndex(model)): Vec[] {
  const { at } = index;
  const atom = at.get(atomId);
  if (!atom) return waysOut(model, atomId, index);
  const opposite: Vec[] = [];
  for (const b of index.bondsAt.get(atomId) ?? []) {
    if (b.order !== 1 || (b.stereo !== "up" && b.stereo !== "down")) continue;
    const other = b.a === atomId ? b.b : b.b === atomId ? b.a : null;
    const o = other != null ? at.get(other) : undefined;
    const len = o ? Math.hypot(o.x - atom.x, o.y - atom.y) : 0;
    if (!o || len < 1e-9) continue;
    opposite.push({ x: -(o.x - atom.x) / len, y: -(o.y - atom.y) / len });
  }
  return [...opposite, ...waysOut(model, atomId, index)];
}

export type Rect = { minX: number; minY: number; maxX: number; maxY: number };
type Segment = [Vec, Vec];

function inside(p: Vec, r: Rect): boolean {
  return p.x >= r.minX && p.x <= r.maxX && p.y >= r.minY && p.y <= r.maxY;
}

function crosses(p: Vec, q: Vec, a: Vec, b: Vec): boolean {
  const side = (u: Vec, v: Vec, w: Vec) =>
    Math.sign((v.x - u.x) * (w.y - u.y) - (v.y - u.y) * (w.x - u.x));
  return side(p, q, a) * side(p, q, b) < 0 && side(a, b, p) * side(a, b, q) < 0;
}

/** Whether a line segment passes through a box. */
export function segmentHitsRect([p, q]: Segment, r: Rect): boolean {
  if (inside(p, r) || inside(q, r)) return true;
  const c = [
    { x: r.minX, y: r.minY },
    { x: r.maxX, y: r.minY },
    { x: r.maxX, y: r.maxY },
    { x: r.minX, y: r.maxY },
  ];
  return c.some((a, i) => crosses(p, q, a, c[(i + 1) % 4]));
}

function overlaps(r: Rect, o: Rect): boolean {
  return r.minX < o.maxX && o.minX < r.maxX && r.minY < o.maxY && o.minY < r.maxY;
}

/** More cells than this and a thing is checked against every box instead. */
const MOST_CELLS = 256;

/**
 * What a mark must keep off - the bonds as segments, the labels and the
 * marks already placed as boxes - kept in a grid of square cells `cell`
 * across, so that a box is checked against the things near it rather than
 * against everything on the page; and the same segment or box twice over -
 * records drawn on top of one another, and the marks they push to the same
 * places - kept once, with how many times it is there. It counts exactly
 * what checking every one would: a thing is only left out where its bounds
 * and the box's do not meet, and nothing that misses those can touch the
 * box.
 */
export class MarkObstacles {
  private readonly segments: Segment[] = [];
  private readonly rects: Rect[] = [];
  // (how many times each is there, and where each is kept, by where it is)
  private readonly segmentTimes: number[] = [];
  private readonly rectTimes: number[] = [];
  private readonly segmentAt = new Map<string, number>();
  private readonly rectAt = new Map<string, number>();
  private readonly segmentCells = new Map<string, number[]>();
  private readonly rectCells = new Map<string, number[]>();
  // (those too big, or too far out, for the grid: checked every time)
  private readonly segmentsEverywhere: number[] = [];
  private readonly rectsEverywhere: number[] = [];
  private segmentSeen: Int32Array = new Int32Array(0);
  private rectSeen: Int32Array = new Int32Array(0);
  private asked = 0;

  constructor(
    segments: Segment[],
    rects: Rect[],
    private readonly cell = 1,
  ) {
    for (const s of segments) this.addSegment(s);
    for (const r of rects) this.add(r);
  }

  /** The cells a box's bounds cover, or null where they are too many to list. */
  private cellsOf(minX: number, minY: number, maxX: number, maxY: number): string[] | null {
    const x0 = Math.floor(minX / this.cell);
    const x1 = Math.floor(maxX / this.cell);
    const y0 = Math.floor(minY / this.cell);
    const y1 = Math.floor(maxY / this.cell);
    if (![x0, x1, y0, y1].every(Number.isFinite)) return null;
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > MOST_CELLS) return null;
    const out: string[] = [];
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push(`${x},${y}`);
    return out;
  }

  private file(cells: Map<string, number[]>, everywhere: number[], k: number, keys: string[] | null) {
    if (!keys) {
      everywhere.push(k);
      return;
    }
    for (const key of keys) {
      const here = cells.get(key);
      if (here) here.push(k);
      else cells.set(key, [k]);
    }
  }

  private addSegment(s: Segment) {
    const [p, q] = s;
    const where = `${p.x},${p.y},${q.x},${q.y}`;
    const was = this.segmentAt.get(where);
    if (was != null) {
      this.segmentTimes[was]++;
      return;
    }
    const k = this.segments.push(s) - 1;
    this.segmentTimes.push(1);
    this.segmentAt.set(where, k);
    this.file(this.segmentCells, this.segmentsEverywhere, k, this.cellsOf(Math.min(p.x, q.x), Math.min(p.y, q.y), Math.max(p.x, q.x), Math.max(p.y, q.y)));
  }

  /** A box to keep off from now on: a mark just placed. */
  add(r: Rect) {
    const where = `${r.minX},${r.minY},${r.maxX},${r.maxY}`;
    const was = this.rectAt.get(where);
    if (was != null) {
      this.rectTimes[was]++;
      return;
    }
    const k = this.rects.push(r) - 1;
    this.rectTimes.push(1);
    this.rectAt.set(where, k);
    this.file(this.rectCells, this.rectsEverywhere, k, this.cellsOf(r.minX, r.minY, r.maxX, r.maxY));
  }

  /** How many of the segments pass through a box, and how many of the boxes overlap it. */
  count(rect: Rect): number {
    this.asked++;
    if (this.segmentSeen.length < this.segments.length) this.segmentSeen = grown(this.segmentSeen, this.segments.length);
    if (this.rectSeen.length < this.rects.length) this.rectSeen = grown(this.rectSeen, this.rects.length);
    const keys = this.cellsOf(rect.minX, rect.minY, rect.maxX, rect.maxY);
    let hits = 0;
    const segment = (k: number) => {
      if (this.segmentSeen[k] === this.asked) return;
      this.segmentSeen[k] = this.asked;
      if (segmentHitsRect(this.segments[k], rect)) hits += this.segmentTimes[k];
    };
    const box = (k: number) => {
      if (this.rectSeen[k] === this.asked) return;
      this.rectSeen[k] = this.asked;
      if (overlaps(rect, this.rects[k])) hits += this.rectTimes[k];
    };
    if (!keys) {
      this.segments.forEach((_, k) => segment(k));
      this.rects.forEach((_, k) => box(k));
      return hits;
    }
    for (const key of keys) {
      for (const k of this.segmentCells.get(key) ?? []) segment(k);
      for (const k of this.rectCells.get(key) ?? []) box(k);
    }
    for (const k of this.segmentsEverywhere) segment(k);
    for (const k of this.rectsEverywhere) box(k);
    return hits;
  }
}

function grown(a: Int32Array, n: number): Int32Array {
  const out = new Int32Array(Math.max(n, a.length * 2, 64));
  out.set(a);
  return out;
}

/**
 * Where a mark half `half` wide and high goes: out from `from` along the
 * first of `dirs` - past `start(dir)`, and a little further if it must -
 * that keeps it off the bonds, the labels and the marks already placed;
 * failing that, where it covers least.
 */
export function placeMark(opts: {
  from: Vec;
  dirs: Vec[];
  start: (dir: Vec) => number;
  half: Vec;
  step: number;
  obstacles: MarkObstacles;
}): Rect {
  const { from, dirs, start, half, step, obstacles } = opts;
  let best: { score: number; rect: Rect } | null = null;
  dirs.forEach((dir, rank) => {
    const reach = Math.abs(dir.x) * half.x + Math.abs(dir.y) * half.y;
    for (let k = 0; k < 3; k++) {
      const d = start(dir) + reach + k * step;
      const c = { x: from.x + dir.x * d, y: from.y + dir.y * d };
      const rect = {
        minX: c.x - half.x,
        maxX: c.x + half.x,
        minY: c.y - half.y,
        maxY: c.y + half.y,
      };
      const hits = obstacles.count(rect);
      const score = hits * 100 + k * 3 + rank;
      if (!best || score < best.score) best = { score, rect };
    }
  });
  return best!.rect;
}

/**
 * Where a double bond's E or Z goes: its middle, and the way out from it -
 * across the bond, to the side with fewer of its neighbours on (above, when
 * the two sides have as many) - and the other way, should that be clearer.
 */
export function bondSide(
  model: Model,
  bondId: number,
  index: MarkIndex = markIndex(model),
): { at: Vec; out: Vec; back: Vec } | null {
  const { at } = index;
  const bond = index.bondById.get(bondId);
  const p = bond && at.get(bond.a);
  const q = bond && at.get(bond.b);
  if (!bond || !p || !q) return null;
  const len = Math.hypot(q.x - p.x, q.y - p.y);
  if (len < 1e-9) return null;
  const mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
  let n = { x: -(q.y - p.y) / len, y: (q.x - p.x) / len };
  if (n.y < 0 || (n.y === 0 && n.x < 0)) n = { x: -n.x, y: -n.y };
  let side = 0;
  // (the bonds at either end, each once)
  const near = new Set([...(index.bondsAt.get(bond.a) ?? []), ...(index.bondsAt.get(bond.b) ?? [])]);
  for (const b of near) {
    if (b.id === bondId) continue;
    const ends = [b.a, b.b];
    if (!ends.includes(bond.a) && !ends.includes(bond.b)) continue;
    const other = at.get(ends.find((e) => e !== bond.a && e !== bond.b) ?? -1);
    if (!other) continue;
    side += Math.sign((other.x - mid.x) * n.x + (other.y - mid.y) * n.y);
  }
  const out = side > 0 ? { x: -n.x, y: -n.y } : n;
  return { at: mid, out, back: { x: -out.x, y: -out.y } };
}

/** An R, S, E or Z placed: what it says, and where its middle is. */
export type StereoPlace = { key: string; x: number; y: number; text: string };

/**
 * Where each R, S, E and Z on a structure goes, each placed clear of the
 * bonds, the labels and the marks placed before it: a stereocentre's
 * opposite a wedge where it has one, as IUPAC's recommendations for
 * structure diagrams place it (GR-11.1), `off` from its atom or as far
 * beyond its label; a double bond's to the side of it with fewer of its
 * neighbours on. `half` is how far a mark reaches across and up from its
 * middle; a mark placed keeps the next `apart` off; `bond` is a bond's
 * length. Those `fixed` - put by hand, by their key - go where they were
 * put, first, and the rest keep clear of them.
 */
export function stereoPlaces(o: {
  model: Model;
  centres: ReadonlyMap<number, string>;
  doubleBonds: ReadonlyMap<number, string>;
  boxes: ReadonlyMap<number, { left: number; right: number; top: number; bottom: number }>;
  half: (cip: string) => Vec;
  apart: number;
  off: number;
  bond: number;
  fixed?: ReadonlyMap<string, Vec>;
}): StereoPlace[] {
  const { model, boxes, half, apart, off, bond: L } = o;
  const index = markIndex(model);
  const { at } = index;
  const segments: Segment[] = [];
  for (const b of model.bonds) {
    const p = at.get(b.a);
    const q = at.get(b.b);
    if (p && q) segments.push([p, q]);
  }
  const rects: Rect[] = [];
  for (const [id, box] of boxes) {
    const a = at.get(id);
    if (!a) continue;
    rects.push({
      minX: a.x - box.left,
      maxX: a.x + box.right,
      minY: a.y - box.bottom,
      maxY: a.y + box.top,
    });
  }
  const out: StereoPlace[] = [];
  // (what each is kept off, looked for near it, not all over the page)
  const obstacles = new MarkObstacles(segments, rects, L);
  const put = (key: string, text: string, r: Rect) => {
    obstacles.add({ minX: r.minX - apart, maxX: r.maxX + apart, minY: r.minY - apart, maxY: r.maxY + apart });
    out.push({ key, text, x: (r.minX + r.maxX) / 2, y: (r.minY + r.maxY) / 2 });
  };
  const fixed = o.fixed ?? new Map<string, Vec>();
  const put0 = (key: string, cip: string) => {
    const p = fixed.get(key);
    if (!p) return false;
    const h = half(cip);
    put(key, cip, { minX: p.x - h.x, maxX: p.x + h.x, minY: p.y - h.y, maxY: p.y + h.y });
    return true;
  };
  const centres = [...o.centres].filter(([id, cip]) => !put0(`centre-${id}`, cip));
  const doubleBonds = [...o.doubleBonds].filter(([id, cip]) => !put0(`bond-${id}`, cip));
  for (const [id, cip] of centres) {
    const a = at.get(id);
    if (!a) continue;
    const box = boxes.get(id);
    const r = placeMark({
      from: a,
      dirs: stereoWaysOut(model, id, index),
      start: (dir) => (box ? exitDistance(box, dir) : 0) + off,
      half: half(cip),
      step: 0.15 * L,
      obstacles,
    });
    put(`centre-${id}`, cip, r);
  }
  for (const [id, cip] of doubleBonds) {
    const side = bondSide(model, id, index);
    if (!side) continue;
    const r = placeMark({
      from: side.at,
      dirs: [side.out, side.back],
      // clear of the second line, which is not among the segments
      start: () => 0.3 * L,
      half: half(cip),
      step: 0.15 * L,
      obstacles,
    });
    put(`bond-${id}`, cip, r);
  }
  return out;
}

/**
 * How far along `dir` a point leaves a box around the origin that reaches
 * `left`, `right`, `top` and `bottom` from it.
 */
export function exitDistance(
  box: { left: number; right: number; top: number; bottom: number },
  dir: Vec,
): number {
  const tx =
    dir.x > 1e-9 ? box.right / dir.x : dir.x < -1e-9 ? box.left / -dir.x : Infinity;
  const ty =
    dir.y > 1e-9 ? box.top / dir.y : dir.y < -1e-9 ? box.bottom / -dir.y : Infinity;
  const t = Math.min(tx, ty);
  return Number.isFinite(t) ? t : 0;
}

/** A descriptor's letter, and an axis's a after it (or nothing). */
export function stereoParts(cip: string): [string, string] {
  return [cip.slice(0, 1), cip.slice(1)];
}

/**
 * How wide a descriptor is as written, in ems of its size - near enough to
 * place it by: a capital or a lower-case letter, an axis's smaller a, and
 * the parentheses about it.
 */
export function stereoTextEms(cip: string, parentheses: boolean): number {
  const [letter, axis] = stereoParts(cip);
  const letterEms = letter === letter.toLowerCase() ? 0.5 : 0.68;
  return letterEms + (axis ? 0.38 : 0) + (parentheses ? 0.66 : 0);
}

/**
 * R, S, E and Z as a picture of the drawing shows them (2026-10-21): where
 * the canvas puts them - `stereoPlaces`, kept off the same bonds and labels,
 * those put by hand where they were put - at the size the canvas draws them
 * at, the labels' size times `MARK_SCALE`, but without `MARK_MIN_PX`, which
 * keeps them readable on a screen zoomed out and has no meaning at a
 * picture's size in print. Written as the canvas writes them: the letter in
 * italics, an axis's a smaller and lower, in parentheses where the style says
 * so, in the labels' colour. `atoms` as the layout laid them, in its order
 * (`texts[].atom` indexes them); `model` the drawing they are of; `marks`
 * those it shows, by id - any not in it left out.
 */
export function stereoPictureItems(o: {
  atoms: readonly { id: number; x: number; y: number }[];
  model: Model;
  marks: Pick<ChemMarks, "centres" | "doubleBonds">;
  texts: readonly TextItem[];
  opts: LayoutOptions;
}): TextItem[] {
  const { atoms, model, opts } = o;
  const ids = new Set(model.atoms.map((a) => a.id));
  const bondIds = new Set(model.bonds.map((b) => b.id));
  const centres = new Map([...o.marks.centres].filter(([id]) => ids.has(id)));
  const doubleBonds = new Map([...o.marks.doubleBonds].filter(([id]) => bondIds.has(id)));
  if (!centres.size && !doubleBonds.size) return [];
  const set = labelSetOf(opts);
  const labelFont = opts.fontPx;
  const size = labelFont * MARK_SCALE;
  const parentheses = !!opts.stereoParentheses;
  const gap = opts.stereoGap ?? STEREO_GAP;
  const laid = new Map(atoms.map((a) => [a.id, a]));
  const drawn: Model = {
    atoms: model.atoms.map((a) => {
      const p = laid.get(a.id);
      return p ? { ...a, x: p.x, y: p.y } : a;
    }),
    bonds: model.bonds,
  };
  const boxes = new Map<number, ReturnType<typeof labelBox>>();
  for (const t of o.texts) {
    const id = t.atom != null ? atoms[t.atom]?.id : undefined;
    if (id != null) boxes.set(id, labelBox(t, t.fontPx, set));
  }
  // (those put by hand: where they were put, in ems of the labels from their atom or their bond's middle)
  const fixed = new Map<string, { x: number; y: number }>();
  const at = (id: number) => laid.get(id) ?? model.atoms.find((a) => a.id === id);
  for (const a of model.atoms) {
    const p = at(a.id);
    if (a.stereoAt && centres.has(a.id) && p) fixed.set(`centre-${a.id}`, { x: p.x + a.stereoAt.x * labelFont, y: p.y + a.stereoAt.y * labelFont });
  }
  for (const b of model.bonds) {
    const p = at(b.a);
    const q = at(b.b);
    if (b.stereoAt && doubleBonds.has(b.id) && p && q) fixed.set(`bond-${b.id}`, { x: (p.x + q.x) / 2 + b.stereoAt.x * labelFont, y: (p.y + q.y) / 2 + b.stereoAt.y * labelFont });
  }
  const places = stereoPlaces({
    model: drawn,
    centres,
    doubleBonds,
    boxes,
    half: (cip) => ({ x: (size * stereoTextEms(cip, parentheses)) / 2, y: size * MARK_HALF_HEIGHT }),
    apart: MARKS_APART * size,
    off: gap * labelFont,
    bond: NOMINAL_BOND_LENGTH,
    fixed,
  });
  return places.map((p) => stereoTextItem(p, size, opts));
}

/**
 * One of R, S, E and Z as a text, its middle at `p`, `size` large: the letter
 * in italics, an axis's a smaller and lower, in parentheses where the style
 * says so, in the labels' colour. What the canvas draws (ChemMarks2D) and a
 * picture of the drawing (`stereoPictureItems`) both: the same ink. `width`
 * measures it at `size`; the canvas gives the size the drawing's labels are
 * set at and measured in, where that is not the page's (`fontPx`).
 */
export function stereoTextItem(p: { x: number; y: number; text: string }, size: number, opts: LayoutOptions, fontPx = size): TextItem {
  const set = labelSetOf(opts);
  const parentheses = !!opts.stereoParentheses;
  const [letter, axis] = stereoParts(p.text);
  const runs: TextRun[] = [...(parentheses ? [{ text: "(" }] : []), { text: letter, italic: true }, ...(axis ? [{ text: axis, sub: true }] : []), ...(parentheses ? [{ text: ")" }] : [])];
  // (its middle where the canvas puts it: a text is placed by its first letter's middle)
  const w = runsWidth(runs, size, set);
  const first = runsWidth([runs[0]], size, set);
  return { x: p.x - w / 2 + first / 2, y: p.y, text: runs.map((r) => r.text).join(""), fontPx, runs, anchorRun: 0, ownSize: true, ...(opts.labelColor ? { color: opts.labelColor } : {}) };
}
