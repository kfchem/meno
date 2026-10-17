/**
 * How good a 2D layout of a molecule is, in numbers: what a chemist sees at
 * a glance as untidy, measured so that one layout can be compared with
 * another, and a change to the layout engine with the last.
 *
 * All lengths are taken against the layout's own typical bond (the median),
 * so the scale it was drawn at does not matter.
 */
import { drawnVolume, insidePolygon } from "./geometry";
import { atomDepth, boxesDepth, hydrogenSpot, isName, namesLaid, segmentMeetsBox } from "./names";

// (where a label's H goes is the names' business too: there for all that ask here)
export { hydrogenSpot } from "./names";
import { isMetal, METAL_BOND } from "./perceive";
import { ringsAlike, smallestRings, type Edge } from "./rings";

export type Geometry = {
  x: readonly number[];
  y: readonly number[];
  edges: readonly Edge[];
  /** Bond orders, where known: a triple bond, or two double bonds, sit in a line. */
  orders?: readonly number[];
  /** Which bonds carry a wedge or hashes, by index. */
  wedged?: readonly number[];
  /** Which atoms are drawn with a label (O, N, a charged C...): labels need room. */
  labelled?: readonly boolean[];
  /** Element symbols and hydrogen counts, where known: an acid is told by them. */
  elements?: readonly string[];
  hydrogens?: readonly number[];
  /** The rings, where the caller has them already (they depend only on the bonds). */
  rings?: readonly (readonly number[])[];
  /**
   * Double bonds whose configuration is known, by bond index: an atom on
   * each end and whether they are cis.
   */
  cisTrans?: readonly { bond: number; refs: readonly [number, number]; cis: boolean }[];
  /**
   * The atoms of a cage drawn in perspective, where known. Among themselves
   * they are measured as the drawing of a solid, not of a flat structure:
   * rings foreshortened, bonds of a bridge longer, and a bond behind
   * another crossing it (drawn broken there) are how a solid looks.
   */
  perspective?: readonly boolean[];
  /**
   * How near each atom is to the viewer, where the drawing says (a cage, or
   * a bridge drawn across a ring): a bond passing in front of another is
   * drawn with the one behind broken, and their crossing is no fault.
   */
  depth?: readonly (number | null)[];
  /**
   * Each stereocentre's configuration, where known, by atom: its neighbours
   * in order (-1 for an implicit H) and the sign of the volume the first
   * three span, seen from the centre - the face the drawing shows is told
   * by it.
   */
  tetra?: readonly ({ neighbours: readonly number[]; volume: number } | null | undefined)[];
  /**
   * What a label's H running into something counts for, in crowdings: a
   * quarter unless given. A layout sets its parts first, not counting it,
   * and makes room for its H's last, by moving bonds a little, counting it
   * as much as labels on each other.
   */
  hydrogenRoom?: number;
  /**
   * Whether a bond is kept clear of a label's H by the H's ink - 0.46 of a
   * bond across, half a bond high, with a little paper round it - rather
   * than by its middle: a bond 0.4 off its middle, at a slant, can touch a
   * corner of it (a tert-butyl's methyl under an OH).
   */
  hydrogenInk?: boolean;
  /**
   * What a name's letters running into something count for (OTBS over an
   * atom), in crowdings: one unless given. A layout sets its parts first,
   * counting them lightly, and makes room for them last, with its H's.
   */
  nameRoom?: number;
  /**
   * Whether a sugar hung on a macrolide counts as seen from the wrong face
   * (it does unless this is false): a layout sets the aglycone first, not
   * counting it, and turns each sugar over last where it must.
   */
  sugarFaces?: boolean;
};

export type LayoutMetrics = {
  /** How much bond lengths vary: their standard deviation over their mean. */
  bondSpread: number;
  /** How far, on average, the angles between bonds are from ideal, in degrees. */
  angleError: number;
  /** How far, on average, rings of up to eight are from regular polygons, in bond lengths. */
  ringError: number;
  /** Atoms not bonded to each other but closer than half a bond. */
  overlaps: number;
  /** Bonds crossing bonds they do not share an atom with. */
  crossings: number;
  /** Double bonds drawn cis that are trans, or the other way: not this molecule at all. */
  wrongDoubles: number;
  /** Atoms lying on a bond they are not part of (within 0.3 of a bond). */
  clashes: number;
  /**
   * How far, on average, the angles round a large ring (nine or more) are
   * from a zigzag's 120 degrees, either way - a macrocycle drawn as a round
   * polygon is far off - in degrees. Not a ring that runs mostly through
   * other rings (a porphyrin's, a cyclodextrin's): that is a ring of rings.
   */
  macroAngleError: number;
  /** Wedges and hashes on ring bonds, where they are hard to read. */
  ringWedges: number;
  /**
   * Labelled atoms, not bonded, so close their labels crowd (under 0.8 of a
   * bond); a quarter for a label's H - beside its symbol, or under or over
   * it between bonds on both sides, as the drawing sets it - that runs into
   * another label, an atom or a bond; and a bond between two labels that
   * their letters all but cover.
   */
  crowdedLabels: number;
  /**
   * How far the drawing is turned off the 30-degree lattice, in degrees (0
   * to 15): the turn that brings the bonds that can lie on it - those of
   * four- and six-membered rings, and those in no ring - nearest to it.
   */
  tilt: number;
  /**
   * How far, on average, those bonds are still off the lattice once the
   * drawing is turned onto it: parts drawn askew to the rest, in degrees.
   */
  gridError: number;
  /**
   * How far, on average, a ring atom's other bonds are from where they go:
   * one straight out, two 60 degrees apart about straight out (a
   * gem-dimethyl), more splitting the room outside the ring evenly; an H at
   * a ring fusion upright. In degrees.
   */
  substituentError: number;
  /**
   * How far long chains are folded rather than drawn out straight, 0 to 1 -
   * and half as much again for each place a chain turns back on itself at
   * a cis double bond.
   */
  chainFold: number;
  /** How far long chains are from running parallel, as lipids' do, in degrees. */
  chainSplay: number;
  /**
   * How far, on average, the open parts of a structure run from level, in
   * degrees: each strand of atoms in no ring - ring to ring, ring to end,
   * branch to branch - along the axis of its zigzag, weighed by its length.
   */
  chainTilt: number;
  /**
   * How far the drawing's long axis is from level, in degrees, scaled by
   * how much longer than broad it is: a round drawing has no axis to tilt.
   */
  axisTilt: number;
  /** Height over width: a drawing reads best wider than it is tall. */
  aspect: number;
  /** Height over width of the tallest ring of sixteen or more: a macrocycle lies wide. */
  macroAspect: number;
  /**
   * Breaches of the order a drawing is read in, left to right and top to
   * bottom: an acid at the end of a chain on the right, an amino acid's
   * NH2 below its alpha carbon (half a breach), a ring system to the left
   * of the chains out of it, the rings hung on a macrocycle to its right
   * and below it (half a breach each way it is not).
   */
  readingOrder: number;
  /**
   * How far the largest fused ring system is from the way IUPAC orients a
   * fused system for numbering: as many rings as can be in a horizontal row,
   * then as many of the rest as can be above and to the right of it, and as
   * few below and to the left. Rings short of each, counted; a ring
   * system with its benzene rings to the right of its other rings, two;
   * and one and a half for each heteroatom of a ring fused to the benzene
   * ring that is above the middle of the two - which way up it is
   * outweighs how the rest of its rings lie.
   */
  ringOrder: number;
  /**
   * Which face of a ring system the drawing shows: its angular groups - the
   * one bond out of the rings at an atom with three ring bonds, a steroid's
   * methyls, taxol's - in front of the page, on wedges, as a steroid's
   * beta face is. How many more are behind it than in front.
   */
  face: number;
  /** All of it in one number, lower better, for putting layouts in order. */
  score: number;
};

/**
 * What each measure costs in the score, per unit. A fault a chemist cannot
 * miss (atoms on top of each other, bonds crossing) outweighs any amount of
 * untidiness; a turned drawing costs more than parts askew within it, which
 * some skeletons cannot avoid.
 */
export const SCORE_WEIGHTS = {
  overlaps: 10,
  crossings: 5,
  wrongDoubles: 50,
  clashes: 3,
  crowdedLabels: 5,
  ringWedges: 2,
  bondSpread: 50,
  angleError: 0.3,
  macroAngleError: 0.5,
  ringError: 30,
  tilt: 0.4,
  gridError: 0.1,
  substituentError: 0.2,
  chainFold: 10,
  chainSplay: 0.05,
  chainTilt: 0.08,
  axisTilt: 0.1,
  aspect: 5,
  macroAspect: 5,
  readingOrder: 3,
  ringOrder: 2,
  face: 3,
} as const;

/**
 * The score, measure by measure: what each adds. Aspect ratios cost only
 * past square.
 */
export function scoreParts(m: Omit<LayoutMetrics, "score">): Record<keyof typeof SCORE_WEIGHTS, number> {
  const w = SCORE_WEIGHTS;
  const parts = {} as Record<keyof typeof SCORE_WEIGHTS, number>;
  for (const k of Object.keys(w) as (keyof typeof SCORE_WEIGHTS)[]) parts[k] = w[k] * m[k];
  parts.aspect = w.aspect * Math.max(0, m.aspect - 1);
  parts.macroAspect = w.macroAspect * Math.max(0, m.macroAspect - 1);
  return parts;
}

const TAU = Math.PI * 2;
const deg = (r: number) => (r * 180) / Math.PI;

function median(v: number[]): number {
  if (!v.length) return 1;
  // (numbers sorted as numbers: the same order, without a call for each comparison)
  const s = v.every(Number.isFinite) ? Float64Array.from(v).sort() : [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Of a bridged system's cycles as small as its smallest set's rings, a
 * smallest set: as many as its rings, shortest first, then the nearest
 * regular, each kept where no sum of those kept gives it.
 */
function bestFitting(t: { own: readonly number[][]; alike: readonly number[][] }, x: readonly number[], y: readonly number[], bond: number): number[][] {
  const bondOf = new Map<number, number>();
  const n = x.length;
  const vectorOf = (r: readonly number[]) => {
    let v = 0n;
    r.forEach((a, k) => {
      const b = r[(k + 1) % r.length];
      const key = a < b ? a * n + b : b * n + a;
      if (!bondOf.has(key)) bondOf.set(key, bondOf.size);
      v ^= 1n << BigInt(bondOf.get(key)!);
    });
    return v;
  };
  const ranked = t.alike.map((r) => ({ r, off: ringIrregularity(x, y, r, bond) })).sort((p, q) => p.r.length - q.r.length || p.off - q.off);
  const basis: bigint[] = [];
  const kept: number[][] = [];
  for (const { r } of ranked) {
    let v = vectorOf(r);
    for (const b of basis) if ((v ^ b) < v) v ^= b;
    if (!v) continue;
    basis.push(v);
    basis.sort((p, q) => (p > q ? -1 : p < q ? 1 : 0));
    kept.push(r);
    if (kept.length === t.own.length) break;
  }
  return kept;
}

/** How far a ring is from a regular polygon of its size, in bond lengths. */
export function ringIrregularity(
  xs: readonly number[],
  ys: readonly number[],
  ring: readonly number[],
  bond: number,
): number {
  const k = ring.length;
  const cx = ring.reduce((s, i) => s + xs[i], 0) / k;
  const cy = ring.reduce((s, i) => s + ys[i], 0) / k;
  const ideal = bond / (2 * Math.sin(Math.PI / k)); // circumradius
  let best = Infinity;
  for (const dir of [1, -1]) {
    // the regular polygon's turn that best fits these vertices
    let sx = 0;
    let sy = 0;
    ring.forEach((a, i) => {
      const t = Math.atan2(ys[a] - cy, xs[a] - cx) - (dir * i * TAU) / k;
      sx += Math.cos(t);
      sy += Math.sin(t);
    });
    const t0 = Math.atan2(sy, sx);
    let sum = 0;
    ring.forEach((a, i) => {
      const t = t0 + (dir * i * TAU) / k;
      const dx = xs[a] - (cx + ideal * Math.cos(t));
      const dy = ys[a] - (cy + ideal * Math.sin(t));
      sum += dx * dx + dy * dy;
    });
    best = Math.min(best, Math.sqrt(sum / k) / bond);
  }
  return best;
}


/**
 * How far a label's ink reaches along `d` from its atom, in bond lengths, of
 * what lies in the path of a bond leaving that way: its symbol's first letter
 * centred on the atom, half a bond high, the rest after it, and its H where
 * the drawing sets it (hydrogenSpot), as inkReach reckons them. A charged
 * carbon, a bare vertex, reaches nowhere.
 */
function labelInk(el: string, hs: number, ways: readonly { x: number; y: number }[], d: { x: number; y: number }): number {
  const symbol = el === "C" ? 0 : el.length;
  if (!symbol) return 0;
  const boxes = [{ x0: -0.25, x1: 0.25 + 0.4 * (symbol - 1), y0: -0.25, y1: 0.25 }];
  if (hs > 0) {
    const h = ways.length ? hydrogenSpot(ways) : { x: 0.5, y: 0 };
    const count = hs > 1 ? 0.3 : 0;
    boxes.push(
      h.x < 0
        ? { x0: h.x - 0.2 - count, x1: h.x + 0.2, y0: -0.25, y1: 0.25 }
        : { x0: h.x - 0.2, x1: h.x + 0.2 + count, y0: h.y - 0.25, y1: h.y + 0.25 },
    );
  }
  // (the band a line and a little paper either side of it take)
  const band = 0.1;
  const n = { x: -d.y, y: d.x };
  let reach = 0;
  for (const b of boxes) {
    const corners = [
      { x: b.x0, y: b.y0 },
      { x: b.x1, y: b.y0 },
      { x: b.x1, y: b.y1 },
      { x: b.x0, y: b.y1 },
    ];
    corners.forEach((c, i) => {
      const e = corners[(i + 1) % 4];
      const sc = c.x * n.x + c.y * n.y;
      const se = e.x * n.x + e.y * n.y;
      const along = (t: number) => (c.x + t * (e.x - c.x)) * d.x + (c.y + t * (e.y - c.y)) * d.y;
      if (Math.abs(sc) <= band) reach = Math.max(reach, along(0));
      for (const edge of [-band, band]) {
        if ((sc - edge) * (se - edge) < 0) reach = Math.max(reach, along((edge - sc) / (se - sc)));
      }
    });
  }
  return reach;
}

/**
 * Whether an atom `d` off a label's H (in bond lengths, y up) is where the
 * H's ink runs into it - its own ink, a label's (`labelled`) or a bare
 * vertex's: an H's ink is 0.4 of a bond across and half a bond high, an O's
 * a little more; side by side they want a space between them, or OH O reads
 * as one word, one over the other a sliver of paper. Its count (`count`),
 * written after it and set lower, reaches as far again to the right and a
 * little further down (NH2's 2 above an O under it).
 */
export function hydrogenRunsInto(d: { x: number; y: number }, labelled: boolean, count: boolean): boolean {
  const [w, t] = labelled ? [0.65, 0.58] : [0.33, 0.33];
  const right = count ? w + 0.3 : w;
  const down = count ? t + 0.1 : t;
  return d.x > -w && d.x < right && d.y > -down && d.y < t;
}

function segmentsCross(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, dx: number, dy: number,
): boolean {
  const o = (px: number, py: number, qx: number, qy: number, rx: number, ry: number) =>
    Math.sign((qx - px) * (ry - py) - (qy - py) * (rx - px));
  return (
    o(ax, ay, bx, by, cx, cy) * o(ax, ay, bx, by, dx, dy) < 0 &&
    o(cx, cy, dx, dy, ax, ay) * o(cx, cy, dx, dy, bx, by) < 0
  );
}

function pointToSegment(
  px: number, py: number, ax: number, ay: number, bx: number, by: number,
): number {
  const vx = bx - ax;
  const vy = by - ay;
  const len2 = vx * vx + vy * vy;
  const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / len2)) : 0;
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
}

/**
 * The rings alike in size to a bridged system's smallest set (`ringsAlike`),
 * by the bonds they were found among: the same molecule is measured over
 * and over while it is laid out.
 */
const alikeRings = new WeakMap<readonly Edge[], number[][]>();

/** What a measure reads of a drawing's structure alone, whatever its atoms' places (`structureOf`). */
type Structure = {
  rings: number[][];
  /** The bonds whose lengths are measured: their ends, and what the length is taken over (a metal's bond is drawn long). */
  measured: [number, number, number][];
  inRing: Set<number>;
  /** Each ring atom's ring system, by its place in `systems` as they were merged. */
  systemOf: Map<number, number>;
  /** The ring systems. */
  live: Set<number>[];
  bonded: Set<number>;
  neighbours: number[][];
  orderOf: Map<number, number>;
  /** The rings of eight or fewer drawn flat. */
  small: number[][];
  /**
   * Each bridged system drawn flat with more than one smallest set of
   * rings: its rings among `small`, and every cycle as small as one of
   * them (`ringsAlike`) - its shapes read from the set that fits best.
   */
  tiedSets: { own: number[][]; alike: number[][] }[];
  inSmall: Set<number>;
  /** The rings of nine or more not run mostly through other rings. */
  macrocycles: number[][];
  ringBonds: Set<number>;
  /** The bonds that can lie on the lattice, each in the frame or not, and the step of its lattice. */
  latticeBonds: { a: number; b: number; frame: boolean; step: number }[];
  frames: Set<number>[];
  inFrame: number[];
  ringNeighbours: number[][];
  /** Each atom's neighbours in none of its rings. */
  outsideOf: number[][];
  /** The rings through each atom. */
  ringsAt: number[][][];
  /** The rings through each atom whose middle a bond out of it is kept from. */
  centresAt: number[][][];
  /** Each stereocentre at a fusion of rings with its H not drawn yet. */
  hiddenAt: boolean[];
  /** In a complex, the rings of six or fewer drawn flat that an atom of something else may be hidden inside, each with its system. */
  insideRings: { ring: number[]; system: number | undefined }[];
  /** The atoms passed over there: an H, or one in perspective or bonded to one. */
  passedInside: boolean[];
  /** The largest system's rings of up to eight, fused and not bridged; none without a ring. */
  fusedMain: number[][];
  /** Each system's rings of up to eight, where it has two or more and no larger ring; else null. */
  ownOf: (number[][] | null)[];
  /**
   * The atoms from left to right and the bonds by their boxes' left sides,
   * as the last measure of the same structure had them: a layout measures
   * one piece placed a little otherwise each time, nearly in order already.
   */
  sorted: { atoms: Int32Array | null; bonds: Int32Array | null };
};

/**
 * Each drawing's structure, by its bonds, with the arrays it was read
 * from: a layout measures one piece over and over, placed otherwise each
 * time, with the same arrays (`scorer`).
 */
const structures = new WeakMap<readonly Edge[], { from: readonly unknown[]; structure: Structure }>();

/** What a measure reads of a drawing's structure alone, worked out once for the same arrays. */
function structureOf(g: Geometry): Structure {
  const from = [g.x.length, g.orders, g.wedged, g.labelled, g.elements, g.hydrogens, g.rings, g.cisTrans, g.perspective, g.depth, g.tetra];
  const known = structures.get(g.edges);
  if (known && known.from.every((v, i) => v === from[i])) return known.structure;
  const structure = readStructure(g);
  structures.set(g.edges, { from, structure });
  return structure;
}

function readStructure(g: Geometry): Structure {
  const { edges } = g;
  const n = g.x.length;
  const pair = (p: number, q: number) => (p < q ? p * n + q : q * n + p);
  const persp = g.perspective;
  const solid = (...atoms: number[]) => !!persp && atoms.every((a) => persp[a]);
  // (a bond to a drawn H is drawn short, by choice: it is left out; a
  // metal's to a ligand is drawn long, and measured against that - but in a
  // chelate's ring, which is drawn regular; not in a ring through two
  // metals, their bridges', drawn with a metal's bonds - section 7)
  const isH = (a: number) => g.elements?.[a] === "H";
  const rings = (g.rings as number[][] | undefined) ?? smallestRings(n, edges);
  const metalsIn = (r: readonly number[]) => r.filter((a) => isMetal(g.elements?.[a] ?? "")).length;
  const ringBond = new Set(rings.filter((r) => metalsIn(r) < 2).flatMap((r) => r.map((a, i) => pair(a, r[(i + 1) % r.length]))));
  // (nor a metal's bond to a pi system's star, which is the ring's own distance)
  const toMetal = (a: number, b: number) =>
    isMetal(g.elements?.[a] ?? "") !== isMetal(g.elements?.[b] ?? "") &&
    g.elements?.[a] !== "*" &&
    g.elements?.[b] !== "*" &&
    !ringBond.has(pair(a, b));
  const measured = edges
    .filter(([a, b]) => !isH(a) && !isH(b) && !solid(a, b))
    .map(([a, b]): [number, number, number] => [a, b, toMetal(a, b) ? METAL_BOND : 1]);

  const inRing = new Set(rings.flat());
  // ring systems: rings sharing atoms
  const systemOf = new Map<number, number>();
  const systems: Set<number>[] = [];
  for (const r of rings) {
    const touching = [...new Set(r.map((a) => systemOf.get(a)).filter((s): s is number => s != null))];
    const merged = new Set<number>(r);
    for (const t of touching) for (const a of systems[t]) merged.add(a);
    const id = systems.length;
    systems.push(merged);
    for (const a of merged) systemOf.set(a, id);
    for (const t of touching) systems[t] = new Set();
  }
  const live = systems.filter((s) => s.size > 0);
  const bonded = new Set(edges.map(([a, b]) => pair(a, b)));
  const neighbours: number[][] = Array.from({ length: n }, () => []);
  const orderOf = new Map<number, number>();
  edges.forEach(([a, b], e) => {
    neighbours[a].push(b);
    neighbours[b].push(a);
    orderOf.set(pair(a, b), g.orders?.[e] ?? 1);
  });
  const cross = (a: number) =>
    (g.elements?.[a] === "P" || g.elements?.[a] === "S") && neighbours[a].length === 4 && !inRing.has(a);

  // (a ring drawn in depth - a cage's, or one a bridge makes across a ring
  // - is seen in perspective, not as a polygon)
  const inDepth = (r: readonly number[]) => solid(...r) || r.some((a) => (g.depth?.[a] ?? 0) !== 0);
  const small = rings.filter((r) => r.length <= 8 && !inDepth(r));
  const inSmall = new Set(rings.filter((r) => r.length <= 8).flat());
  // (not one that runs through other rings - a porphyrin's, a
  // cyclodextrin's: that is a ring of rings, set round a circle)
  const threaded = (r: number[]) =>
    new Set(
      rings
        .filter((q) => q.length < r.length && q.filter((a) => r.includes(a)).length >= 3)
        .flatMap((q) => q.filter((a) => r.includes(a))),
    ).size >=
    0.4 * r.length;
  const macrocycles = rings.filter((r) => r.length >= 9 && !threaded(r));

  const ringBonds = new Set<number>();
  for (const r of rings) {
    r.forEach((a, i) => {
      const b = r[(i + 1) % r.length];
      ringBonds.add(pair(a, b));
    });
  }

  // the 30-degree lattice (layoutMetrics' tilt): the bonds that can lie on it
  const fitsLattice = new Set<number>();
  const offLattice = new Set<number>();
  // (each ring's once: a ring of rings has many)
  const squareRing = new Map(
    rings.map((r) => [r, (r.length === 4 || r.length === 6) && rings.every((q) => q === r || q.filter((a) => r.includes(a)).length <= 2)]),
  );
  const square = (r: readonly number[]) => squareRing.get(r as number[])!;
  for (const r of rings) {
    const fits = square(r);
    r.forEach((a, i) => {
      const b = r[(i + 1) % r.length];
      (fits ? fitsLattice : offLattice).add(pair(a, b));
    });
  }
  // The eye takes the largest ring system as the frame the drawing is
  // square to - of those with rings that can lie on the lattice, and all of
  // the largest where several are as large. A ring hung off it askew is then
  // askew, rather than the frame tilted. Without a ring, every bond counts.
  const latticeBonds: { a: number; b: number; frame: boolean; step: number }[] = [];
  // (a four-membered ring is a square with its sides level and upright - a
  // beta-lactam's, an oxetane's - not merely on the lattice)
  // (and so is a cross)
  const squareBonds = new Set(
    [
      ...rings
        .filter((r) => r.length === 4)
        .flatMap((r) => edges.filter(([a, b]) => r.includes(a) && r.includes(b))),
      ...edges.filter(([a, b]) => cross(a) || cross(b)),
    ].map(([a, b]) => pair(a, b)),
  );
  const fitting = live.filter((sys) => rings.some((r) => square(r) && r.every((a) => sys.has(a))));
  const frameSize = Math.max(0, ...fitting.map((sys) => sys.size));
  const frames = fitting.filter((sys) => sys.size === frameSize);
  for (const [a, b] of edges) {
    const k = pair(a, b);
    if (offLattice.has(k) && !fitsLattice.has(k)) continue;
    // a solid's bonds, and those out of it, lie as it is seen
    if (g.perspective?.[a] || g.perspective?.[b]) continue;
    const frame = frames.length
      ? fitsLattice.has(k) && frames.some((sys) => sys.has(a) && sys.has(b))
      : true;
    latticeBonds.push({ a, b, frame, step: squareBonds.has(k) ? 90 : 30 });
  }
  const inFrame = [...new Set(frames.flatMap((sys) => [...sys]))];

  // a ring atom's other bonds, against splitting the widest room between
  // its ring bonds evenly
  const ringNeighbours: number[][] = Array.from({ length: n }, () => []);
  for (const r of rings) {
    r.forEach((a, i) => {
      for (const b of [r[(i + 1) % r.length], r[(i + r.length - 1) % r.length]]) {
        if (!ringNeighbours[a].includes(b)) ringNeighbours[a].push(b);
      }
    });
  }
  // (the ring systems with a bridge in them: two rings sharing three atoms
  // or more anywhere among rings fused to each other)
  const bridgedAt = new Set<number>();
  let alike: number[][] = [];
  const tiedSets: Structure["tiedSets"] = [];
  {
    const system = rings.map((_, i) => i);
    const root = (i: number): number => (system[i] === i ? i : (system[i] = root(system[i])));
    const bridged = new Set<number>();
    rings.forEach((r, i) =>
      rings.forEach((q, j) => {
        if (j <= i) return;
        const shared = q.filter((v) => r.includes(v)).length;
        if (shared >= 2) system[root(j)] = root(i);
        if (shared >= 3) bridged.add(i);
      }),
    );
    const bridgedSystems = new Set([...bridged].map(root));
    rings.forEach((r, i) => {
      if (bridgedSystems.has(root(i))) r.forEach((v) => bridgedAt.add(v));
    });
    // (and in such a system every ring as small as one of its smallest set,
    // where the room left for a bond out is read: which of quinuclidine's
    // three six-membered cycles the smallest set holds goes by the order its
    // atoms come in, and quinine's vinyl, read against the one ring through
    // its atom, counted 225 degrees off one way and 88 the other)
    if (bridgedSystems.size) {
      const known = alikeRings.get(edges);
      alike = known ?? [...bridgedSystems].flatMap((s) => ringsAlike(rings.filter((r, i) => root(i) === s && r.length < 9), neighbours));
      if (!known) alikeRings.set(edges, alike);
      for (const sys of bridgedSystems) {
        const own = rings.filter((r, i) => root(i) === sys && r.length < 9);
        const atoms = new Set(own.flat());
        const cycles = alike.filter((c) => atoms.has(c[0]));
        if (cycles.length > own.length && !cycles.some(inDepth)) tiedSets.push({ own, alike: cycles });
      }
    }
  }
  const outsideOf = ringNeighbours.map((inside, a) => neighbours[a].filter((b) => !inside.includes(b)));
  const ringsAt = Array.from({ length: n }, (_, a) => rings.filter((r) => r.includes(a)));
  const centresAt = Array.from({ length: n }, (_, a) => (bridgedAt.has(a) ? alike : rings).filter((r) => r.includes(a) && r.length < 9));
  // (a stereocentre at a fusion of rings, its H not drawn yet - while the
  // engine sets the parts - is measured by where placeStereo will put
  // that H: a frame that leaves it no room upright is the worse for it,
  // lovastatin's turned with its rings aslant. Only where rings of five
  // to eight are fused, as a steroid's are - not bridged, not on a
  // macrocycle, an epoxide or a beta-lactam - and not in a solid, whose
  // drawing shows its configuration without one)
  const hiddenAt = Array.from(
    { length: n },
    (_, a) =>
      outsideOf[a].length === 0 &&
      ringNeighbours[a].length >= 3 &&
      !persp?.[a] &&
      !!g.tetra?.[a]?.neighbours.includes(-1) &&
      !bridgedAt.has(a) &&
      ringsAt[a].every((r) => r.length >= 5 && r.length <= 8),
  );
  const complex = (g.elements ?? []).some((e) => isMetal(e));
  const insideRings = complex ? small.filter((q) => q.length <= 6).map((ring) => ({ ring, system: systemOf.get(ring[0]) })) : [];
  const passedInside = Array.from({ length: n }, (_, p) => isH(p) || (!!persp && (!!persp[p] || neighbours[p].some((q) => persp[q]))));
  const main = live.length ? live.reduce((b, s) => (s.size > b.size ? s : b)) : null;
  const fusedMain = main
    ? rings.filter(
        (r) =>
          r.length <= 8 &&
          r.every((a) => main.has(a)) &&
          rings.every((q) => q === r || q.filter((a) => r.includes(a)).length <= 2),
      )
    : [];
  const ownOf = live.map((sys) => {
    const own = rings.filter((r) => r.length <= 8 && r.every((a) => sys.has(a)));
    return own.length < 2 || rings.some((r) => r.length > 8 && r.every((a) => sys.has(a))) ? null : own;
  });
  return {
    rings,
    measured,
    inRing,
    systemOf,
    live,
    bonded,
    neighbours,
    orderOf,
    small,
    tiedSets,
    inSmall,
    macrocycles,
    ringBonds,
    latticeBonds,
    frames,
    inFrame,
    ringNeighbours,
    outsideOf,
    ringsAt,
    centresAt,
    hiddenAt,
    insideRings,
    passedInside,
    fusedMain,
    ownOf,
    sorted: { atoms: null, bonds: null },
  };
}

/**
 * The indices 0 to count - 1 by `key`, least first: sorted again from
 * `from`, the order the last measure left them in - a drawing placed a
 * little otherwise is nearly in order already - or, where that is far from
 * the order now, afresh. (Between keys alike the order may differ from a
 * sort afresh: the sweeps that use it take every pair within reach either
 * way.)
 */
function sortedBy(from: Int32Array | null, count: number, key: ArrayLike<number>): Int32Array {
  const out = from && from.length === count ? from : Int32Array.from({ length: count }, (_, i) => i);
  let shifts = 0;
  for (let i = 1; i < count; i++) {
    const v = out[i];
    const kv = key[v];
    let j = i - 1;
    while (j >= 0 && key[out[j]] > kv) {
      out[j + 1] = out[j];
      j--;
      shifts++;
    }
    out[j + 1] = v;
    if (shifts > 8 * count) return out.sort((p, q) => key[p] - key[q]);
  }
  return out;
}

export function layoutMetrics(g: Geometry): LayoutMetrics {
  const { x, y, edges } = g;
  const n = x.length;
  // (a bond, or any pair of atoms, by a number: a string would be built
  // for every pair every time the drawing is measured)
  const pair = (p: number, q: number) => (p < q ? p * n + q : q * n + p);
  const persp = g.perspective;
  const solid = (...atoms: number[]) => !!persp && atoms.every((a) => persp[a]);
  // one bond in front of the other, where the drawing gives depth
  const z = g.depth;
  const passes = (a: number, b: number, c: number, d: number) => {
    if (!z) return false;
    const za = z[a];
    const zb = z[b];
    const zc = z[c];
    const zd = z[d];
    if (za == null || zb == null || zc == null || zd == null) return false;
    return Math.abs((za + zb) / 2 - (zc + zd) / 2) > 0.25;
  };
  // (a bond to a drawn H is drawn short, by choice: it is left out; a
  // metal's to a ligand is drawn long, and measured against that - but in a
  // chelate's ring, which is drawn regular; not in a ring through two
  // metals, their bridges', drawn with a metal's bonds - section 7)
  const isH = (a: number) => g.elements?.[a] === "H";
  const {
    rings,
    measured,
    inRing,
    systemOf,
    live,
    bonded,
    neighbours,
    orderOf,
    small,
    tiedSets,
    inSmall,
    macrocycles,
    ringBonds,
    latticeBonds,
    frames,
    inFrame,
    ringNeighbours,
    outsideOf,
    ringsAt,
    centresAt,
    hiddenAt,
    insideRings,
    passedInside,
    fusedMain,
    ownOf,
    sorted,
  } = structureOf(g);
  const lengths = measured.map(([a, b, per]) => Math.hypot(x[a] - x[b], y[a] - y[b]) / per);
  const L = median(lengths);
  const mean = lengths.reduce((s, v) => s + v, 0) / Math.max(lengths.length, 1);
  const bondSpread = lengths.length
    ? Math.sqrt(lengths.reduce((s, v) => s + (v - mean) ** 2, 0) / lengths.length) / mean
    : 0;


  // A phosphorus or sulfur with four bonds - a phosphate, a sulfonyl - is
  // drawn as a cross, square to the page, the chain straight through it
  const cross = (a: number) =>
    (g.elements?.[a] === "P" || g.elements?.[a] === "S") && neighbours[a].length === 4 && !inRing.has(a);

  // A trident's middle atom - a tert-butyl's, a trimethylsilyl's, a
  // trimethylammonium's, a CF3's or a CCl3's (assemble.ts `tridentEnds`):
  // three of its four bonds to like ends, drawn fanned 60° apart about the
  // line of the fourth - the bond into it 120° from the outer two
  const endKind = (b: number) => {
    const el = g.elements?.[b];
    return el != null && neighbours[b].length === 1 && ["C", "F", "Cl", "Br", "I"].includes(el) ? el : null;
  };
  const tridentEnds = (a: number): number[] | null => {
    const el = g.elements?.[a];
    if ((el !== "C" && el !== "Si" && el !== "N") || neighbours[a].length !== 4 || inRing.has(a)) return null;
    for (const k of ["C", "F", "Cl", "Br", "I"]) {
      const ends = neighbours[a].filter((b) => endKind(b) === k);
      if (ends.length === 3) return ends;
    }
    return null;
  };

  // angles: at an atom in no ring, its bonds evenly spread (a pair at 120°,
  // or 180° across a triple bond or between two double bonds, or between
  // two crosses - the O of a P-O-P - so that a run of them is one line; the
  // bond joining a cross to a zigzag gives way, to 150°); a trident's fanned
  let angleSum = 0;
  let angleCount = 0;
  for (let a = 0; a < n; a++) {
    const nb = neighbours[a];
    if (nb.length < 2 || inRing.has(a)) continue;
    const dirs = nb
      .map((b) => Math.atan2(y[b] - y[a], x[b] - x[a]))
      .sort((p, q) => p - q);
    const gaps = dirs.map((d, i) =>
      i + 1 < dirs.length ? dirs[i + 1] - d : dirs[0] + TAU - d,
    );
    let ideal = TAU / nb.length;
    if (nb.length === 2) {
      const o = nb.map((b) => orderOf.get(pair(a, b)) ?? 1);
      const linear = o.includes(3) || (o[0] === 2 && o[1] === 2) || nb.every(cross);
      ideal = linear ? Math.PI : (2 * Math.PI) / 3;
      // either way round: the smaller gap against the ideal
      const off = Math.abs(deg(Math.min(...gaps) - (linear ? Math.PI : ideal)));
      angleSum += nb.some(cross) && !linear ? Math.min(off, Math.abs(deg(Math.min(...gaps)) - 150)) : off;
    } else if (tridentEnds(a)) {
      const ends = tridentEnds(a)!;
      const end = nb.find((b) => !ends.includes(b))!;
      const e = dirs.indexOf(Math.atan2(y[end] - y[a], x[end] - x[a]));
      gaps.forEach((gap, i) => {
        const beside = i === e || (i + 1) % gaps.length === e;
        angleSum += Math.abs(deg(gap - (beside ? (2 * Math.PI) / 3 : Math.PI / 3))) / gaps.length;
      });
    } else {
      for (const gap of gaps) angleSum += Math.abs(deg(gap - ideal)) / gaps.length;
    }
    angleCount++;
  }
  const angleError = angleCount ? angleSum / angleCount : 0;

  // (a bridged system's rings as the smallest set that fits the drawing
  // best, where it has more than one - which of them the rings were
  // found as goes by the order of the atoms, and the same drawing reads
  // the same either way: shortest first, then the most regular, each kept
  // where it is no sum of those kept - quinuclidine drawn flat, its two
  // regular hexagons, not the arc round its bridge)
  const shaped = tiedSets.length ? [...small.filter((r) => !tiedSets.some((t) => t.own.includes(r))), ...tiedSets.flatMap((t) => bestFitting(t, x, y, L))] : small;
  const ringError = shaped.length
    ? shaped.reduce((s, r) => s + ringIrregularity(x, y, r, L), 0) / shaped.length
    : 0;

  // round a macrocycle: each atom that is in no smaller ring, its angle
  // inside the ring against 120° or 240°, whichever is nearer
  let macroSum = 0;
  let macroCount = 0;
  for (const r of macrocycles) {
    r.forEach((a, i) => {
      if (inSmall.has(a)) return;
      const p = r[(i + r.length - 1) % r.length];
      const q = r[(i + 1) % r.length];
      const t =
        Math.atan2(y[p] - y[a], x[p] - x[a]) - Math.atan2(y[q] - y[a], x[q] - x[a]);
      const inner = deg(Math.abs(Math.atan2(Math.sin(t), Math.cos(t)))); // 0..180
      macroSum += Math.abs(inner - 120);
      macroCount++;
    });
  }
  const macroAngleError = macroCount ? macroSum / macroCount : 0;

  // (a centre's wedge: an axis of chirality's - BINAP's, on a ring bond as
  // it must be, neither end with four groups - is not counted)
  const groupsAt = (a: number) => neighbours[a].length + (g.hydrogens?.[a] ?? 0);
  const ringWedges = (g.wedged ?? []).filter((e) => {
    const [a, b] = edges[e] ?? [];
    return a != null && ringBonds.has(pair(a, b)) && (groupsAt(a) >= 4 || groupsAt(b) >= 4);
  }).length;

  let crowdedLabels = 0;
  if (g.labelled) {
    for (let a = 0; a < n; a++) {
      if (!g.labelled[a]) continue;
      for (let b = a + 1; b < n; b++) {
        if (!g.labelled[b] || bonded.has(pair(a, b))) continue;
        if (Math.hypot(x[a] - x[b], y[a] - y[b]) < 0.8 * L) crowdedLabels++;
      }
    }
  }
  // and a label's H, where the drawing sets it, clear of every other
  // label, atom and bond: an OH's H is ink as much as its O. A quarter of
  // a crowding each - the layout moves a bond to clear it where it can
  // (untangle), but never buys that with a bond crossing another.
  const hydrogenRoom = g.hydrogenRoom ?? 0.25;
  if (g.labelled && g.hydrogens && hydrogenRoom > 0) {
    // (its count after it where it follows its symbol, or is under or over it)
    const spots: { a: number; x: number; y: number; count: boolean }[] = [];
    for (let a = 0; a < n; a++) {
      if (!g.labelled[a] || !(g.hydrogens[a] > 0) || g.elements?.[a] === "C" || !neighbours[a].length) continue;
      const h = hydrogenSpot(
        neighbours[a].map((b) => {
          const d = Math.hypot(x[b] - x[a], y[b] - y[a]) || 1;
          return { x: (x[b] - x[a]) / d, y: (y[b] - y[a]) / d };
        }),
      );
      spots.push({ a, x: x[a] + h.x * L, y: y[a] + h.y * L, count: g.hydrogens[a] > 1 && h.x >= 0 });
    }
    for (const [i, h] of spots.entries()) {
      let crowded = false;
      for (let b = 0; b < n && !crowded; b++) {
        if (b === h.a) continue;
        if (hydrogenRunsInto({ x: (x[b] - h.x) / L, y: (y[b] - h.y) / L }, g.labelled[b], h.count)) crowded = true;
      }
      for (const o of spots.slice(i + 1)) {
        if (Math.abs(h.x - o.x) < 0.6 * L && Math.abs(h.y - o.y) < 0.55 * L) crowded = true;
      }
      for (const [p, q] of edges) {
        if (crowded) break;
        if (p === h.a || q === h.a) continue;
        const near = g.hydrogenInk
          ? segmentMeetsBox({ x: x[p], y: y[p] }, { x: x[q], y: y[q] }, { x0: h.x - 0.35 * L, x1: h.x + 0.35 * L, y0: h.y - 0.35 * L, y1: h.y + 0.35 * L })
          : pointToSegment(h.x, h.y, x[p], y[p], x[q], y[q]) < 0.3 * L;
        if (near) crowded = true;
      }
      if (crowded) crowdedLabels += hydrogenRoom;
    }
  }
  // and a bond between two labels that their letters all but cover - Pd and
  // NH2 a bond apart at a slant, the d reaching along it to the N: each
  // label's ink as the engine reckons it (inkReach), what of it lies in the
  // bond's path; one crowding where under a twentieth of the bond shows
  if (g.labelled && g.elements) {
    const ways = (a: number) =>
      neighbours[a].map((b) => {
        const d = Math.hypot(x[b] - x[a], y[b] - y[a]) || 1;
        return { x: (x[b] - x[a]) / d, y: (y[b] - y[a]) / d };
      });
    for (const [p, q] of edges) {
      if (!g.labelled[p] || !g.labelled[q]) continue;
      const len = Math.hypot(x[q] - x[p], y[q] - y[p]);
      if (len < 1e-9) continue;
      const d = { x: (x[q] - x[p]) / len, y: (y[q] - y[p]) / len };
      const covered =
        labelInk(g.elements[p], g.hydrogens?.[p] ?? 0, ways(p), d) +
        labelInk(g.elements[q], g.hydrogens?.[q] ?? 0, ways(q), { x: -d.x, y: -d.y });
      if (len - covered * L < 0.05 * L) crowdedLabels++;
    }
  }
  // and a label that is a name (OTBS, NHBz, PPh3), its letters clear of
  // every other atom, bond and name, with a space's paper beside another
  // label (NHBz O reads as one word): for each it runs into, one crowding
  // - for an atom or a name, as much of one as it is in, up to a third of
  // a bond deep, so that a little clear of it is a little better
  const nameRoom = g.nameRoom ?? 1;
  if (g.labelled && g.elements && nameRoom > 0) {
    const named = [...namesLaid({ x, y, edges, elements: g.elements, hydrogens: g.hydrogens }, L)];
    // (and a label's H, where the drawing sets it: OH's H in BzO's way as much as its O)
    const spots: { a: number; x: number; y: number }[] = [];
    for (let a = 0; a < n; a++) {
      if (!g.labelled[a] || g.elements[a] === "C" || isName(g.elements[a]) || !((g.hydrogens?.[a] ?? 0) > 0) || !neighbours[a].length) continue;
      const h = hydrogenSpot(
        neighbours[a].map((b) => {
          const d = Math.hypot(x[b] - x[a], y[b] - y[a]) || 1;
          return { x: (x[b] - x[a]) / d, y: (y[b] - y[a]) / d };
        }),
      );
      spots.push({ a, x: x[a] + h.x * L, y: y[a] + h.y * L });
    }
    for (const [i, [a, { box }]] of named.entries()) {
      for (let b = 0; b < n; b++) {
        if (b === a || bonded.has(pair(a, b)) || named.some(([o]) => o === b)) continue;
        const deep = atomDepth(box, { x: x[b], y: y[b] }, g.labelled[b] && g.elements[b] !== "*", L);
        if (deep > 0) crowdedLabels += nameRoom * Math.min(1, deep / (0.3 * L));
      }
      for (const h of spots) {
        if (bonded.has(pair(a, h.a))) continue;
        const deep = atomDepth(box, h, true, L);
        if (deep > 0) crowdedLabels += nameRoom * Math.min(1, deep / (0.3 * L));
      }
      for (const [p, q] of edges) {
        if (p === a || q === a) continue;
        if (segmentMeetsBox({ x: x[p], y: y[p] }, { x: x[q], y: y[q] }, box)) crowdedLabels += nameRoom;
      }
      for (const [, o] of named.slice(i + 1)) {
        const deep = boxesDepth(box, o.box, L);
        if (deep > 0) crowdedLabels += nameRoom * Math.min(1, deep / (0.3 * L));
      }
    }
  }

  // the 30° lattice: the bonds of four- and six-membered rings and those in
  // no ring can all lie on it; five-membered rings and macrocycles cannot,
  // nor a ring bridged across another (sharing three atoms or more with
  // it), which is drawn in perspective. The turn that brings those bonds
  // nearest to it is how far the drawing is tilted, and what is left after
  // that turn how far its parts are askew.
  const latticeDirs = latticeBonds.map(({ a, b, frame, step }) => ({ t: deg(Math.atan2(y[b] - y[a], x[b] - x[a])), frame, step }));
  // (the frame's own bonds picked out once: the tilt is sought among 300 turns)
  const frameDirs = latticeDirs.filter((d) => d.frame);
  const offBy = (turn: number, frameOnly: boolean) => {
    const dirs = frameOnly ? frameDirs : latticeDirs;
    let sum = 0;
    for (const { t, step } of dirs) {
      const u = t - turn;
      sum += Math.abs(u - step * Math.round(u / step));
    }
    return dirs.length ? sum / dirs.length : 0;
  };
  let turn = 0;
  let best = offBy(0, true);
  // (a bond is off the lattice by at most a degree more for a degree's
  // turn, and so is the mean: the turns within what one is off by of the
  // best so far, past it, are no better, and are passed over)
  for (let i = -150, next = -150; i < 150; i++) {
    if (i < next) continue;
    const e = offBy(i / 10, true);
    if (e < best - 1e-9) {
      best = e;
      turn = i / 10;
    }
    next = i + 1 + Math.max(0, Math.floor((e - best) * 10 - 1e-6));
  }
  let tilt = Math.abs(turn);
  // A frame whose rings cannot all lie on the lattice together - two
  // benzene rings either side of a five-membered one, as in fluorene - is
  // square when it is set straight by its own shape: its long axis level
  // or upright.
  if (frames.length && best > 2) {
    const fx = inFrame.reduce((sum, a) => sum + x[a], 0) / inFrame.length;
    const fy = inFrame.reduce((sum, a) => sum + y[a], 0) / inFrame.length;
    let fxx = 0;
    let fyy = 0;
    let fxy = 0;
    for (const a of inFrame) {
      fxx += (x[a] - fx) ** 2;
      fyy += (y[a] - fy) ** 2;
      fxy += (x[a] - fx) * (y[a] - fy);
    }
    const along = Math.abs(deg(0.5 * Math.atan2(2 * fxy, fxx - fyy))); // 0..90
    tilt = Math.min(tilt, along, 90 - along);
  }
  const gridError = offBy(turn, false);

  let subSum = 0;
  let subCount = 0;
  for (let a = 0; a < n; a++) {
    const inside = ringNeighbours[a];
    const outside = outsideOf[a];
    const atRings = ringsAt[a];
    const hidden = hiddenAt[a];
    if (inside.length < 2 || (outside.length === 0 && !hidden)) continue;
    const dir = (b: number) => Math.atan2(y[b] - y[a], x[b] - x[a]);
    const ringDirs = inside.map(dir).sort((p, q) => p - q);
    // the widest gap no ring lies in: at a fusion of three rings every gap
    // is 120 degrees, and only one is outside
    const centres = centresAt[a].map((r) => {
      const rx = r.reduce((sum, v) => sum + x[v], 0) / r.length;
      const ry = r.reduce((sum, v) => sum + y[v], 0) / r.length;
      return Math.atan2(ry - y[a], rx - x[a]);
    });
    let start = 0;
    let gap = -1;
    ringDirs.forEach((d, i) => {
      const next = i + 1 < ringDirs.length ? ringDirs[i + 1] : ringDirs[0] + TAU;
      const holdsRing = centres.some((c) => {
        const u = (((c - d) % TAU) + TAU) % TAU;
        return u > 1e-6 && u < next - d - 1e-6;
      });
      if (!holdsRing && next - d > gap) {
        gap = next - d;
        start = d;
      }
    });
    if (gap < 0) continue;
    // an H drawn at a fusion of rings stands straight up or down, as a
    // steroid's do: measured against upright
    if (hidden || (inside.length >= 3 && outside.length === 1 && isH(outside[0]))) {
      let along = hidden ? start + gap / 2 : dir(outside[0]);
      if (hidden) {
        // (where placeStereo will put it, by its measure of room: clear of
        // atoms and bonds, 35 degrees from its own, into one of its rings
        // only as a steroid's goes, upright first among equals)
        const own = atRings.map((r) => ({
          polygon: r.map((v) => ({ x: x[v], y: y[v] })),
          unsaturated: r.some((v, k) => {
            const w = r[(k + 1) % r.length];
            return (orderOf.get(pair(v, w)) ?? 1) >= 2 && !rings.some((q) => q !== r && q.includes(v) && q.includes(w));
          }),
        }));
        // (what is near enough to matter: room is counted only up to 0.85)
        const near = new Uint8Array(n);
        const atoms: number[] = [];
        for (let b = 0; b < n; b++) {
          const dx = x[b] - x[a];
          const dy = y[b] - y[a];
          if (b !== a && !isH(b) && dx * dx + dy * dy < 9 * L * L) {
            near[b] = 1;
            atoms.push(b);
          }
        }
        const bonds = edges.filter(([u, v]) => u !== a && v !== a && (near[u] || near[v]) && !isH(u) && !isH(v));
        // (upright, or somewhere outside its rings: aslant into one of them
        // it goes only where nothing else will do)
        const ways = [Math.PI / 2, (3 * Math.PI) / 2];
        for (let k = 0; k < 24; k++) {
          const t = (k * Math.PI) / 12;
          const u = (((t - start) % TAU) + TAU) % TAU;
          if (u > 0 && u < gap && !ways.includes(t)) ways.push(t);
        }
        let best = -Infinity;
        for (const t of ways) {
          const p = { x: x[a] + L * Math.cos(t), y: y[a] + L * Math.sin(t) };
          let r = Infinity;
          for (const b of atoms) r = Math.min(r, (Math.hypot(x[b] - p.x, y[b] - p.y) - (g.labelled?.[b] ? 0.2 * L : 0)) / L);
          for (const [u, v] of bonds) {
            r = Math.min(r, pointToSegment(p.x, p.y, x[u], y[u], x[v], y[v]) / L + 0.15);
            if (segmentsCross(x[a], y[a], p.x, p.y, x[u], y[u], x[v], y[v])) r = Math.min(r, 0);
          }
          for (const b of neighbours[a]) {
            const d = Math.abs(Math.atan2(Math.sin(dir(b) - t), Math.cos(dir(b) - t)));
            if (d < (35 * Math.PI) / 180) r = Math.min(r, d);
          }
          const upright = Math.abs(Math.sin(t)) > 0.97;
          const into = own.length <= 2 && own.some((q) => (q.unsaturated || !upright) && insidePolygon(p, q.polygon));
          const lean = Math.min(Math.abs(t - Math.PI / 2), Math.abs(t - (3 * Math.PI) / 2));
          const score = Math.min(r, 0.85) - (into ? 0.3 : 0) - 0.02 * lean;
          if (score > best + 1e-9) {
            best = score;
            along = t;
          }
        }
      }
      const t = deg(Math.atan2(Math.sin(along), Math.cos(along)));
      subSum += Math.min(Math.abs(t - 90), Math.abs(t + 90));
      subCount++;
      continue;
    }
    const m = outside.length;
    const rel = outside
      .map((b) => (((dir(b) - start) % TAU) + TAU) % TAU)
      .sort((p, q) => p - q);
    // two on one ring atom close together, 60 degrees apart about straight
    // out; otherwise splitting the room evenly
    const ideal = (k: number) =>
      m === 2 && gap > Math.PI / 2
        ? gap / 2 + (k === 0 ? -1 : 1) * Math.min(Math.PI / 6, gap / 4)
        : (gap * (k + 1)) / (m + 1);
    rel.forEach((r, k) => {
      subSum += Math.abs(deg(r - ideal(k)));
      subCount++;
    });
  }
  const substituentError = subCount ? subSum / subCount : 0;

  // chains: runs of atoms in no ring, each with two bonds
  const chainAtom = (a: number) => !inRing.has(a) && neighbours[a].length === 2;
  const orderAt = (a: number, b: number) =>
    orderOf.get(pair(a, b)) ?? 1;
  const runs: number[][] = [];
  const done = new Set<number>();
  for (let a = 0; a < n; a++) {
    if (!chainAtom(a) || done.has(a)) continue;
    // walk to one end, then collect to the other
    let prev = -1;
    let cur = a;
    for (;;) {
      const next = neighbours[cur].find((b) => b !== prev && chainAtom(b) && b !== a);
      if (next == null || next === a) break;
      prev = cur;
      cur = next;
      if (cur === a) break;
    }
    const run: number[] = [];
    const endOuter = neighbours[cur].find((b) => b !== prev && !chainAtom(b));
    if (endOuter != null) run.push(endOuter);
    prev = endOuter ?? -1;
    for (;;) {
      run.push(cur);
      done.add(cur);
      const next = neighbours[cur].find((b) => b !== prev);
      if (next == null) break;
      prev = cur;
      cur = next;
      if (!chainAtom(cur)) {
        run.push(cur);
        break;
      }
      if (done.has(cur)) break;
    }
    if (run.length >= 5) runs.push(run);
  }
  const zig = Math.cos(Math.PI / 6);
  // folding, over stretches of single bonds (a cis double bond bends a
  // chain rightly)
  let foldSum = 0;
  let foldCount = 0;
  for (const run of runs) {
    let from = 0;
    for (let i = 1; i <= run.length; i++) {
      const brk = i === run.length || orderAt(run[i - 1], run[i]) !== 1;
      if (!brk) continue;
      const bonds = i - 1 - from;
      if (bonds >= 5) {
        const p = run[from];
        const q = run[i - 1];
        const reach = Math.hypot(x[q] - x[p], y[q] - y[p]) / (bonds * L * zig);
        foldSum += Math.max(0, 1 - reach);
        foldCount++;
      }
      from = i;
    }
  }
  let chainFold = foldCount ? foldSum / foldCount : 0;
  const cx = x.reduce((sum, v) => sum + v, 0) / Math.max(n, 1);
  const cy = y.reduce((sum, v) => sum + v, 0) / Math.max(n, 1);
  // long chains, pointed away from the middle, against running parallel
  const axes = runs
    .filter((r) => r.length >= 7)
    .map((r) => {
      const p = r[0];
      const q = r[r.length - 1];
      const flip = Math.hypot(x[p] - cx, y[p] - cy) > Math.hypot(x[q] - cx, y[q] - cy);
      return flip ? Math.atan2(y[p] - y[q], x[p] - x[q]) : Math.atan2(y[q] - y[p], x[q] - x[p]);
    });
  let splaySum = 0;
  let splayCount = 0;
  for (let i = 0; i < axes.length; i++) {
    for (let j = i + 1; j < axes.length; j++) {
      const t = axes[i] - axes[j];
      splaySum += deg(Math.abs(Math.atan2(Math.sin(t), Math.cos(t))));
      splayCount++;
    }
  }
  const chainSplay = splayCount ? splaySum / splayCount : 0;

  // strands: the open parts of the structure, split where they branch and
  // where they meet a ring, and carried on at a free end into the atom that
  // continues them there - an OH rather than an =O, a carbon first
  const leaf = (a: number) => !inRing.has(a) && neighbours[a].length === 1;
  const spineDegree = (a: number) => neighbours[a].filter((b) => !leaf(b)).length;
  const through = (a: number) => !inRing.has(a) && !leaf(a) && spineDegree(a) === 2;
  const bendAt = (p: number, t: number, c: number) => {
    const u = Math.atan2(y[p] - y[t], x[p] - x[t]) - Math.atan2(y[c] - y[t], x[c] - x[t]);
    return Math.abs(deg(Math.abs(Math.atan2(Math.sin(u), Math.cos(u)))) - 120);
  };
  const carryOn = (t: number, p: number): number | null => {
    if (inRing.has(t) || spineDegree(t) > 1) return null;
    const rank = (c: number) =>
      (orderAt(t, c) === 1 ? 0 : 2) + (g.elements && g.elements[c] !== "C" ? 1 : 0);
    const free = neighbours[t]
      .filter(leaf)
      .sort((a, b) => rank(a) - rank(b) || bendAt(p, t, a) - bendAt(p, t, b) || a - b);
    return free[0] ?? null;
  };
  const walked = new Set<number>();
  const strands: number[][] = [];
  let reversals = 0;
  for (let e = 0; e < n; e++) {
    if (leaf(e) || through(e)) continue;
    for (const first of neighbours[e]) {
      if (leaf(first)) continue;
      const key = pair(e, first);
      if (walked.has(key) || ringBonds.has(key)) continue;
      const path = [e, first];
      walked.add(key);
      while (through(path[path.length - 1])) {
        const cur = path[path.length - 1];
        const next = neighbours[cur].find((b) => b !== path[path.length - 2] && !leaf(b));
        if (next == null || path.includes(next)) break;
        walked.add(pair(cur, next));
        path.push(next);
      }
      const head = carryOn(path[0], path[1]);
      if (head != null) path.unshift(head);
      const tail = carryOn(path[path.length - 1], path[path.length - 2]);
      if (tail != null) path.push(tail);
      // A cis double bond turns a chain rightly: measure either side of it.
      // But a chain is read as the straight chain it would be without it -
      // a fatty acid's cis bond is a step in a straight chain - so the part
      // after it carries on the way the part before it went, never back.
      let from = 0;
      const pieces: number[][] = [];
      for (let i = 1; i + 2 < path.length; i++) {
        const [p, a, b, q] = [path[i - 1], path[i], path[i + 1], path[i + 2]];
        if (orderAt(a, b) !== 2) continue;
        const side = (r: number) =>
          Math.sign((x[b] - x[a]) * (y[r] - y[a]) - (y[b] - y[a]) * (x[r] - x[a]));
        if (side(p) * side(q) > 0) {
          pieces.push(path.slice(from, i + 1));
          from = i + 1;
        }
      }
      pieces.push(path.slice(from));
      strands.push(...pieces);
      const heading = (s: number[]) => ({ x: x[s[s.length - 1]] - x[s[0]], y: y[s[s.length - 1]] - y[s[0]] });
      for (let k = 1; k < pieces.length; k++) {
        const u = heading(pieces[k - 1]);
        const v = heading(pieces[k]);
        if (pieces[k - 1].length >= 3 && pieces[k].length >= 3 && u.x * v.x + u.y * v.y < 0) {
          reversals++;
        }
      }
    }
  }
  // A zigzag's axis runs through the midpoints of its bonds, and it should
  // run level - except a short chain hung on a ring, which may as well run
  // straight out from the ring: its axis within 30 degrees of the way out,
  // as a zigzag's is of its first bond.
  const outward = (r: number): number | null => {
    const ring = rings.filter((q) => q.includes(r)).sort((p, q) => p.length - q.length)[0];
    if (!ring) return null;
    const rx = ring.reduce((sum, a) => sum + x[a], 0) / ring.length;
    const ry = ring.reduce((sum, a) => sum + y[a], 0) / ring.length;
    return Math.atan2(y[r] - ry, x[r] - rx);
  };
  let tiltSum = 0;
  let tiltBonds = 0;
  for (const s of strands) {
    const k = s.length - 1;
    if (k < 3) continue;
    const dx = (x[s[k - 1]] + x[s[k]] - x[s[0]] - x[s[1]]) / 2;
    const dy = (y[s[k - 1]] + y[s[k]] - y[s[0]] - y[s[1]]) / 2;
    const t = Math.abs(deg(Math.atan2(dy, dx)));
    let off = t > 90 ? 180 - t : t;
    const [head, tail] = [s[0], s[k]];
    const hungFrom = inRing.has(head) && leaf(tail) ? head : inRing.has(tail) && leaf(head) ? tail : null;
    const out = k <= 4 && hungFrom != null ? outward(hungFrom) : null;
    if (out != null) {
      const along = hungFrom === head ? Math.atan2(dy, dx) : Math.atan2(-dy, -dx);
      const u = along - out;
      off = Math.min(off, Math.max(0, deg(Math.abs(Math.atan2(Math.sin(u), Math.cos(u)))) - 30));
    }
    tiltSum += k * off;
    tiltBonds += k;
  }
  const chainTilt = tiltBonds ? tiltSum / tiltBonds : 0;
  chainFold += 0.5 * reversals;

  const width = Math.max(...x) - Math.min(...x);
  const height = Math.max(...y) - Math.min(...y);
  const aspect = n > 2 ? height / Math.max(width, L) : 0;
  // the long axis: the way the atoms spread furthest
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (let a = 0; a < n; a++) {
    sxx += (x[a] - cx) ** 2;
    syy += (y[a] - cy) ** 2;
    sxy += (x[a] - cx) * (y[a] - cy);
  }
  const half = (sxx + syy) / 2;
  const spread = Math.sqrt(Math.max(0, half * half - (sxx * syy - sxy * sxy)));
  const long = half + spread;
  const broad = Math.max(0, half - spread);
  const axisTilt =
    long > 0 ? Math.abs(deg(0.5 * Math.atan2(2 * sxy, sxx - syy))) * (1 - Math.sqrt(broad / long)) : 0;
  // (a ring of up to fifteen, seven bonds a side at most, is as tall as it
  // is wide whatever its shape, and lies as its conventions put it: a
  // macrolide's lactone at its lower left)
  let macroAspect = 0;
  for (const r of rings) {
    if (r.length < 16) continue;
    const rx = r.map((a) => x[a]);
    const ry = r.map((a) => y[a]);
    const w = Math.max(...rx) - Math.min(...rx);
    const h = Math.max(...ry) - Math.min(...ry);
    macroAspect = Math.max(macroAspect, h / Math.max(w, L));
  }

  // reading order
  let readingOrder = 0;
  const el = g.elements;
  if (el) {
    // The first carbon of a chain on the right: a carboxyl - an acid's or
    // an ester's - with the chain it heads running off to its left, as far
    // as that runs unbranched. One on a ring goes wherever the ring puts it;
    // an acetyl heads no chain. Where chains are headed both ways (the two
    // acids of glutathione), one has to run the other way, and only the
    // excess counts.
    let rightWay = 0;
    let wrongWay = 0;
    for (let a = 0; a < n; a++) {
      if (el[a] !== "C" || inRing.has(a)) continue;
      const oxo = neighbours[a].filter((b) => el[b] === "O" && orderAt(a, b) === 2);
      const oxy = neighbours[a].filter((b) => el[b] === "O" && orderAt(a, b) === 1);
      const onto = neighbours[a].filter((b) => el[b] !== "O");
      if (oxo.length !== 1 || oxy.length !== 1 || onto.length !== 1) continue;
      if (leaf(onto[0])) continue;
      // an acid on a ring: to the right of the middle, but lightly - a
      // ring's substituents go where the ring puts them
      if (inRing.has(onto[0])) {
        const isAcid = oxy.some((o) => (g.hydrogens?.[o] ?? 0) > 0 || neighbours[o].length === 1);
        if (isAcid && x[a] < cx - 0.25 * L) readingOrder += 0.5;
        continue;
      }
      let prev = a;
      let cur = onto[0];
      for (let i = 0; i < n && through(cur); i++) {
        const next = neighbours[cur].find((v) => v !== prev && !leaf(v));
        if (next == null || inRing.has(next)) break;
        prev = cur;
        cur = next;
      }
      if (x[cur] < x[a] - 0.25 * L) rightWay++;
      else if (x[cur] > x[a] + 0.25 * L) wrongWay++;
    }
    readingOrder += Math.max(0, wrongWay - rightWay);
    // the backbone of an amino acid or a peptide from N to C, left to
    // right, as sequences are written: at each carbon bearing an N and a
    // carbonyl carbon, the N to the left of it. Round a cyclic peptide half
    // must run back, so again only the excess counts.
    let forward = 0;
    let backward = 0;
    for (let a = 0; a < n; a++) {
      if (el[a] !== "C") continue;
      const nitrogen = neighbours[a].find((b) => el[b] === "N");
      const carbonyl = neighbours[a].find(
        (b) =>
          el[b] === "C" &&
          neighbours[b].some((c) => el[c] === "O" && orderAt(b, c) === 2) &&
          neighbours[b].some((c) => (el[c] === "O" || el[c] === "N") && orderAt(b, c) === 1),
      );
      if (nitrogen == null || carbonyl == null) continue;
      if (x[nitrogen] < x[carbonyl] - 0.25 * L) forward++;
      else if (x[nitrogen] > x[carbonyl] + 0.25 * L) backward++;
    }
    readingOrder += Math.max(0, backward - forward);
    // and an amino acid's NH2, at the start of its backbone, below the
    // alpha carbon: the backbone comes up from it to the carboxyl, the side
    // chain branching off to the left
    for (let a = 0; a < n; a++) {
      if (el[a] !== "N" || inRing.has(a) || neighbours[a].length !== 1) continue;
      if ((g.hydrogens?.[a] ?? 0) === 0) continue;
      const alpha = neighbours[a][0];
      if (el[alpha] !== "C" || inRing.has(alpha)) continue;
      const acid = neighbours[alpha].some(
        (b) =>
          el[b] === "C" &&
          neighbours[b].some((c) => el[c] === "O" && orderAt(b, c) === 2) &&
          neighbours[b].some((c) => (el[c] === "O" || el[c] === "N") && orderAt(b, c) === 1),
      );
      if (acid && y[a] > y[alpha] - 0.25 * L) readingOrder += 0.5;
    }
    // a sugar - a ring of five or six with one oxygen in it, and oxygens on
    // its carbons - drawn as its Haworth projection seen from above: the
    // ring oxygen at the back, which is the top
    for (const r of rings) {
      if (r.length !== 5 && r.length !== 6) continue;
      const ox = r.filter((a) => el[a] === "O");
      if (ox.length !== 1 || r.some((a) => el[a] !== "C" && el[a] !== "O")) continue;
      // (saturated, as a sugar's ring is: not a lactone, as artemisinin's is)
      if (r.some((a) => neighbours[a].some((b) => orderAt(a, b) !== 1))) continue;
      const hydroxylated = r.filter(
        (a) => el[a] === "C" && neighbours[a].some((b) => !r.includes(b) && el[b] === "O"),
      ).length;
      if (hydroxylated < 2) continue;
      // A sugar hung on a macrolide's ring faces it, whichever side that is:
      // its anomeric carbon toward the aglycone, as erythromycin's are, and
      // so its ring oxygen wherever that then falls - but it is still seen
      // from the face its carbons number clockwise from.
      const onMacrocycle = neighbours[ox[0]].some(
        (c) =>
          r.includes(c) &&
          neighbours[c].some(
            (b) =>
              !r.includes(b) &&
              el[b] === "O" &&
              neighbours[b].some((d) => d !== c && rings.some((q) => q.length >= 12 && q.includes(d))),
          ),
      );
      // (one hung from the macrocycle by an O of its own is turned over to
      // its face last, where the drawing is set without it; one the ring
      // runs through, a cyclodextrin's, is set with it)
      const hung = neighbours[ox[0]].some(
        (c) =>
          r.includes(c) &&
          neighbours[c].some(
            (b) =>
              !r.includes(b) &&
              el[b] === "O" &&
              !rings.some((q) => q.length >= 12 && q.includes(b)) &&
              neighbours[b].some((d) => d !== c && rings.some((q) => q.length >= 12 && q.includes(d))),
          ),
      );
      if (hung && g.sugarFaces === false) continue;
      const ry = r.reduce((sum, a) => sum + y[a], 0) / r.length;
      if (!onMacrocycle && y[ox[0]] < ry + 0.25 * L) readingOrder++;
      // and its anomeric carbon - on the ring oxygen, with an oxygen or a
      // nitrogen of its own: a glycoside's link, a nucleoside's base - on
      // the right-hand side of the ring. Where two sugars are linked by
      // their anomeric carbons (sucrose) one of them cannot be; an aldose's
      // (the anomeric carbon on one carbon) keeps its place first.
      const rx = r.reduce((sum, a) => sum + x[a], 0) / r.length;
      for (const c of neighbours[ox[0]]) {
        if (!r.includes(c)) continue;
        const own = neighbours[c].some((b) => !r.includes(b) && (el[b] === "O" || el[b] === "N"));
        if (!own) continue;
        const carbons = neighbours[c].filter((b) => el[b] === "C").length;
        if (!onMacrocycle && x[c] < rx + 0.25 * L) readingOrder += carbons <= 1 ? 1 : 0.5;
        // and the carbons numbered on from it clockwise round the ring, as
        // the Haworth projection has them: the face it is seen from
        const next = neighbours[c].find((b) => r.includes(b) && b !== ox[0]);
        if (next != null) {
          const turn = (x[c] - rx) * (y[next] - ry) - (y[c] - ry) * (x[next] - rx);
          if (turn > 0) readingOrder += carbons <= 1 ? 1 : 0.5;
        }
      }
    }
    // an acid's C=O up: the way it is always drawn - at the end of a chain,
    // or on an aromatic ring, in its plane (one on a saturated ring's
    // stereocentre goes where its stereo bond puts it: penicillin's down)
    for (let a = 0; a < n; a++) {
      if (el[a] !== "C") continue;
      const saturated = (b: number) => inRing.has(b) && neighbours[b].every((c) => orderAt(b, c) === 1);
      if (neighbours[a].some((b) => el[b] !== "O" && saturated(b))) continue;
      const oxo = neighbours[a].filter((b) => el[b] === "O" && orderAt(a, b) === 2);
      const hydroxy = neighbours[a].filter(
        (b) =>
          el[b] === "O" &&
          orderAt(a, b) === 1 &&
          ((g.hydrogens?.[b] ?? 0) > 0 || neighbours[b].length === 1),
      );
      if (oxo.length !== 1 || hydroxy.length !== 1) continue;
      if (y[oxo[0]] < y[a] - 0.2 * L) readingOrder++;
      else if (y[oxo[0]] < y[a] + 0.2 * L) readingOrder += 0.5;
    }
    // and a double-bonded O on a cross above the chain through it, as
    // IUPAC puts double-bonded substituents on a chain (P-3.2.2): never
    // below it
    for (let a = 0; a < n; a++) {
      if (!cross(a)) continue;
      const oxo = neighbours[a].filter((b) => el[b] === "O" && orderAt(a, b) === 2);
      if (oxo.length === 1 && y[oxo[0]] < y[a] - 0.2 * L) readingOrder += 0.5;
    }
    // A chain folded back on itself - a fatty acid drawn as a hairpin, a
    // prostaglandin's two chains from its ring, both running off to the
    // right - has its carboxyl end above its tail: read from the carboxyl,
    // as arachidonic acid is drawn, and as IUPAC sets prostane.
    for (let a = 0; a < n; a++) {
      if (el[a] !== "C" || inRing.has(a)) continue;
      const oxo = neighbours[a].filter((b) => el[b] === "O" && orderAt(a, b) === 2);
      const hydroxy = neighbours[a].filter(
        (b) => el[b] === "O" && orderAt(a, b) === 1 && ((g.hydrogens?.[b] ?? 0) > 0 || neighbours[b].length === 1),
      );
      const on = neighbours[a].filter((b) => el[b] === "C");
      if (oxo.length !== 1 || hydroxy.length !== 1 || on.length !== 1) continue;
      // its tail: the methyl farthest from it along the bonds
      const far = new Array<number>(n).fill(-1);
      far[a] = 0;
      const todo = [a];
      let tail = -1;
      for (let h = 0; h < todo.length; h++) {
        const u = todo[h];
        for (const v of neighbours[u]) {
          if (far[v] >= 0) continue;
          far[v] = far[u] + 1;
          todo.push(v);
          if (el[v] === "C" && neighbours[v].length === 1 && (tail < 0 || far[v] > far[tail])) tail = v;
        }
      }
      if (tail < 0 || far[tail] < 8) continue;
      // (the end of a chain of four or more, not a methyl on a ring)
      let run = 0;
      for (let u = tail, prev = -1; !inRing.has(u) && neighbours[u].length <= 2 && run < 4; run++) {
        const next = neighbours[u].find((v) => v !== prev);
        if (next == null) break;
        prev = u;
        u = next;
      }
      if (run < 4) continue;
      if (x[a] > cx + 0.5 * L && x[tail] > cx + 0.5 * L && y[a] < y[tail] + 0.5 * L) readingOrder++;
    }
    // A macrolide's lactone at the lower left of its ring, the ring
    // numbered from the carbonyl carbon counterclockwise - C2 to its right
    // along the bottom, the ring O last, above it - as erythromycin and
    // epothilone are drawn.
    for (const r of rings) {
      if (r.length < 12) continue;
      const lactones = r.filter(
        (c, i) =>
          el[c] === "C" &&
          neighbours[c].some((o) => !r.includes(o) && el[o] === "O" && orderAt(c, o) === 2) &&
          [r[(i + 1) % r.length], r[(i + r.length - 1) % r.length]].some((o) => el[o] === "O"),
      );
      if (lactones.length !== 1) continue;
      const c1 = lactones[0];
      const i = r.indexOf(c1);
      const [before, after] = [r[(i + r.length - 1) % r.length], r[(i + 1) % r.length]];
      const c2 = el[after] === "O" ? before : after;
      // (a plain lactone: not one on a ring's carbon, as sirolimus's is)
      if (rings.some((q) => q !== r && (q.includes(c1) || q.includes(c2)))) continue;
      const rx = r.reduce((sum, v) => sum + x[v], 0) / r.length;
      const ry = r.reduce((sum, v) => sum + y[v], 0) / r.length;
      if (x[c1] > rx - 0.5 * L) readingOrder += 0.5;
      if (y[c1] > ry - 0.5 * L) readingOrder += 0.5;
      if ((x[c1] - rx) * (y[c2] - ry) - (y[c1] - ry) * (x[c2] - rx) < 0) readingOrder++;
    }
  }
  const centre = (s: Set<number>) => {
    let sx = 0;
    let sy = 0;
    for (const a of s) {
      sx += x[a];
      sy += y[a];
    }
    return { x: sx / s.size, y: sy / s.size };
  };
  if (live.length) {
    const main = live.reduce((b, s) => (s.size > b.size ? s : b));
    const mc = centre(main);
    // a ring system with a chain out of it: the rings to the left, the
    // chain read after them
    for (const s of strands) {
      if (s.length - 1 < 4) continue;
      const [head, tail] = [s[0], s[s.length - 1]];
      const free = main.has(head) && leaf(tail) ? tail : main.has(tail) && leaf(head) ? head : null;
      if (free != null && x[free] < mc.x - 0.5 * L) readingOrder++;
    }
    // rings hung on a macrocycle - on it, or one atom off it, as a sugar on
    // its oxygen: to its right, and below it - a glycoside's aglycone at the
    // upper left, its sugars after it, lower right
    const macro = rings.find((r) => r.length >= 12 && r.every((a) => main.has(a)));
    if (macro) {
      const hung = (s: Set<number>) =>
        macro.some((m) =>
          neighbours[m].some(
            (b) => s.has(b) || (!inRing.has(b) && neighbours[b].some((c) => s.has(c))),
          ),
        );
      for (const s of live) {
        if (s === main || !hung(s)) continue;
        const c = centre(s);
        if (c.x < mc.x + 0.5 * L) readingOrder += 0.5;
        if (c.y > mc.y - 0.5 * L) readingOrder += 0.5;
      }
    }
  }

  // fused rings as IUPAC orients them: the largest system's rings of up to
  // eight, fused and not bridged, by their centres
  let ringOrder = 0;
  if (live.length) {
    const fused = fusedMain;
    if (fused.length >= 2) {
      const centres = fused.map((r) => ({
        x: r.reduce((sum, a) => sum + x[a], 0) / r.length,
        y: r.reduce((sum, a) => sum + y[a], 0) / r.length,
      }));
      // rows of ring centres level with each other, turned `t`: the longest
      const rowsIn = (t: number) => {
        const c = Math.cos(t);
        const sn = Math.sin(t);
        const ys = centres.map((p) => p.x * sn + p.y * c);
        const rows: number[][] = [];
        ys.forEach((y0) => {
          const row = ys.map((v, i) => (Math.abs(v - y0) < 0.15 * L ? i : -1)).filter((i) => i >= 0);
          if (!rows.some((r) => r.length === row.length && r.every((v, k) => v === row[k]))) rows.push(row);
        });
        const longest = Math.max(...rows.map((r) => r.length));
        return rows.filter((r) => r.length === longest);
      };
      const rows = rowsIn(0);
      const most = Math.max(
        rows[0].length,
        rowsIn(Math.PI / 3)[0].length,
        rowsIn((2 * Math.PI) / 3)[0].length,
      );
      // of the longest rows here, the one the rest sit best against: above
      // and to the right of it, none below and to the left - and a row of
      // six-membered rings, which lie square, before one with others in it
      let best = Infinity;
      for (const row of rows) {
        let breach = most - row.length;
        const rx = row.reduce((sum, i) => sum + centres[i].x, 0) / row.length;
        const ry = row.reduce((sum, i) => sum + centres[i].y, 0) / row.length;
        centres.forEach((p, i) => {
          if (row.includes(i)) {
            if (fused[i].length !== 6) breach += 0.25;
            return;
          }
          const right = p.x > rx + 0.1 * L;
          const up = p.y > ry + 0.1 * L;
          const left = p.x < rx - 0.1 * L;
          const down = p.y < ry - 0.1 * L;
          if (!(right && up)) breach += 0.5;
          if (left && down) breach += 0.5;
          else if (left) breach += 0.25;
        });
        best = Math.min(best, breach);
      }
      ringOrder += best;
    }
  }
  // and within a ring system, a benzene ring at the left, where reading
  // begins: indole's, quinoline's and coumarin's benzene rings, estradiol's
  // aromatic A ring, griseofulvin's and reserpine's
  for (const own of ownOf) {
    if (!own) continue;
    // (six carbons each with a double bond in the rings - to its own ring
    // or a fused one, whichever way the Kekule structure was written:
    // berberine's A ring as PubChem writes it has two of its own)
    const benzene = (r: readonly number[]) =>
      r.length === 6 &&
      r.every((a) => (g.elements?.[a] ?? "C") === "C") &&
      r.every((a) => neighbours[a].some((b) => (orderOf.get(pair(a, b)) ?? 1) >= 2 && ringBonds.has(pair(a, b))));
    const midX = (list: readonly (readonly number[])[]) =>
      list.reduce((sum, r) => sum + r.reduce((t, a) => t + x[a], 0) / r.length, 0) / list.length;
    const aromatic = own.filter(benzene);
    const rest = own.filter((r) => !benzene(r));
    if (aromatic.length && rest.length && midX(aromatic) > midX(rest) + 0.25 * L) ringOrder += 2;
    // the heteroatoms of a ring fused to the benzene ring below the middle
    // of the two: quinoline's N, indole's NH, coumarin's O at the bottom,
    // morphine's ether O and strychnine's indoline N - which way up comes
    // before how the rest of its rings lie
    // - but a flavonoid's: the ring O of a chromane or chromene carrying an
    // aryl ring on the atom next to it or the one after (flavones,
    // flavanones, catechins, isoflavones) stands at the top, as every
    // drawing of one has it (the maintainer, 2026-10-11)
    // (counted by the ring, not by its atoms: a methylenedioxy's two O are
    // one ring the wrong way up, as berberine's ring N is - and the
    // maintainer has berberine's N at the bottom, 2026-10-11)
    const hetero: { atoms: number[]; cy: number }[] = [];
    const above = new Map<number, number>();
    const elOf = (a: number) => g.elements?.[a] ?? "C";
    for (const r of rest) {
      const b = aromatic.find((q) => q.filter((a) => r.includes(a)).length === 2);
      if (!b) continue;
      const both = [...new Set([...r, ...b])];
      const cy = both.reduce((sum, a) => sum + y[a], 0) / both.length;
      const ringO = r.filter((a) => elOf(a) !== "C");
      const o = ringO.length === 1 && elOf(ringO[0]) === "O" && r.length === 6 ? ringO[0] : -1;
      const k = r.indexOf(o);
      const fusedAtO = o >= 0 && [r[(k + 1) % 6], r[(k + 5) % 6]].some((a) => b.includes(a));
      // (the atoms next to the O but one away from the benzene ring, and the one after: C2, C3)
      const c2 = o >= 0 ? [r[(k + 1) % 6], r[(k + 5) % 6]].find((a) => !b.includes(a)) : undefined;
      const c3 = c2 != null ? r[(r.indexOf(c2) + (r[(r.indexOf(c2) + 1) % 6] === o ? 5 : 1)) % 6] : undefined;
      const aryl = (a: number | undefined) =>
        a != null && neighbours[a].some((nb) => !r.includes(nb) && rings.some((q) => q.includes(nb) && !q.includes(a) && benzene(q)));
      if (fusedAtO && (aryl(c2) || aryl(c3))) {
        above.set(o, Math.min(above.get(o) ?? Infinity, cy));
        continue;
      }
      // (a metal in a metallacycle is not one of them)
      const atoms = r.filter((a) => elOf(a) !== "C" && !isMetal(elOf(a)));
      if (atoms.length) hetero.push({ atoms, cy });
    }
    for (const { atoms, cy } of hetero) if (atoms.reduce((sum, a) => sum + y[a], 0) / atoms.length > cy + 0.1 * L) ringOrder += 1.5;
    for (const [a, cy] of above) if (y[a] < cy - 0.1 * L) ringOrder += 1.5;
  }

  // the face: an angular group - the one bond out of the rings at an atom
  // with three ring bonds - in front of the page where it can be, as a
  // steroid's methyls are (its beta face). Seen from the other face, the
  // same skeleton is its mirror image on the page, every wedge hashes.
  // (A cage drawn in perspective shows its own face, and a macrocycle
  // lies as its own conventions have it; a bond is in front of the page as
  // a wedge draws it, ring bonds lying in it.)
  const inMacrocycle = new Set(rings.filter((r) => r.length > 8).flat());
  let toward = 0;
  let away = 0;
  for (let c = 0; c < n && g.tetra; c++) {
    const t = g.tetra[c];
    if (!t || solid(c) || inMacrocycle.has(c) || neighbours[c].length !== 4) continue;
    const out = neighbours[c].filter((b) => !ringBonds.has(pair(c, b)));
    if (out.length !== 1 || g.elements?.[out[0]] === "H" || t.neighbours.includes(-1)) continue;
    // (read as a wedge on it would be: see drawnVolume)
    const d = drawnVolume(
      { x: x[c], y: y[c] },
      t.neighbours.map((b) => ({ x: x[b], y: y[b] })),
      t.neighbours.map((b) => (b === out[0] ? 1 : 0)),
    );
    if (!d) continue;
    if (d === Math.sign(t.volume)) toward++;
    else away++;
  }
  const face = Math.max(0, away - toward);

  let wrongDoubles = 0;
  for (const { bond, refs, cis } of g.cisTrans ?? []) {
    const [a, b] = edges[bond];
    const onA = neighbours[a].includes(refs[0]) && refs[0] !== b ? refs[0] : refs[1];
    const onB = onA === refs[0] ? refs[1] : refs[0];
    const side = (r: number) =>
      Math.sign((x[b] - x[a]) * (y[r] - y[a]) - (y[b] - y[a]) * (x[r] - x[a]));
    if ((side(onA) === side(onB)) !== cis) wrongDoubles++;
  }

  // (atoms of one solid drawn in perspective - a cage, a ring turned on
  // its bond - may lie over each other's ink as the solid is seen; atoms
  // of two such, two phenyls of PPh3 turned as a propeller's blades, are
  // two things drawn one on the other, as anywhere else)
  const oneSolid = (...atoms: number[]) => solid(...atoms) && atoms.every((a) => systemOf.get(a) === systemOf.get(atoms[0]));
  // (the atoms from left to right, to pass over pairs far apart across -
  // every pair, where a place is not a number)
  const sweep = L > 0 && x.every(Number.isFinite) && y.every(Number.isFinite);
  const byX = (sorted.atoms = sortedBy(sorted.atoms, n, x));
  let overlaps = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n && !(sweep && x[byX[j]] - x[byX[i]] >= L); j++) {
      const a = Math.min(byX[i], byX[j]);
      const b = Math.max(byX[i], byX[j]);
      const dx = x[a] - x[b];
      const dy = y[a] - y[b];
      if (dx * dx + dy * dy >= 0.25 * L * L) continue;
      if (bonded.has(pair(a, b)) || oneSolid(a, b)) continue;
      overlaps++;
    }
  }
  // and in a complex, where crowded ligands meet round their metal, an atom
  // of something else inside a ring of six or fewer drawn flat: hidden in it
  // as much as on an atom (a Cl inside a cyclohexyl). (Not inside a larger
  // ring, where a substituent may be drawn - taxol's
  // eight-membered one; nor a bridge of the ring's own system, which may
  // run across it - artemisinin's; nor what hangs from a ring in
  // perspective, set by it - Cp*'s methyls; nor a stereocentre's drawn H,
  // set by its own rule.)
  for (const { ring: r, system: own } of insideRings) {
    const xs = r.map((a) => x[a]);
    const ys = r.map((a) => y[a]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    // (only the atoms between the ring's left and right, from left to right, where every place is a number)
    let first = 0;
    for (let hi = sweep ? n : 0; first < hi; ) {
      const mid = (first + hi) >> 1;
      if (x[byX[mid]] <= minX) first = mid + 1;
      else hi = mid;
    }
    for (let k = first; k < n; k++) {
      const p = sweep ? byX[k] : k;
      if (sweep && x[p] >= maxX) break;
      if (x[p] <= minX || x[p] >= maxX || y[p] <= minY || y[p] >= maxY || passedInside[p] || systemOf.get(p) === own) continue;
      let inside = false;
      for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        const [xi, yi, xj, yj] = [x[r[i]], y[r[i]], x[r[j]], y[r[j]]];
        if (yi > y[p] !== yj > y[p] && x[p] < ((xj - xi) * (y[p] - yi)) / (yj - yi) + xi) inside = !inside;
      }
      if (inside) overlaps++;
    }
  }

  // (each bond's box, to pass over pairs far apart without more ado)
  const E = edges.length;
  const lox = new Float64Array(E);
  const hix = new Float64Array(E);
  const loy = new Float64Array(E);
  const hiy = new Float64Array(E);
  edges.forEach(([a, b], e) => {
    lox[e] = Math.min(x[a], x[b]);
    hix[e] = Math.max(x[a], x[b]);
    loy[e] = Math.min(y[a], y[b]);
    hiy[e] = Math.max(y[a], y[b]);
  });
  // (and the bonds by their boxes' left sides: a bond's box reaches no
  // further right than the widest box from its left side)
  const bondsByX = (sorted.bonds = sortedBy(sorted.bonds, E, lox));
  let widest = 0;
  for (let e = 0; e < E; e++) widest = Math.max(widest, hix[e] - lox[e]);
  let crossings = 0;
  for (let s = 0; s < E; s++) {
    for (let t = s + 1; t < E && !(sweep && lox[bondsByX[t]] > hix[bondsByX[s]]); t++) {
      const i = Math.min(bondsByX[s], bondsByX[t]);
      const j = Math.max(bondsByX[s], bondsByX[t]);
      const [a, b] = edges[i];
      if (lox[j] > hix[i] || hix[j] < lox[i] || loy[j] > hiy[i] || hiy[j] < loy[i]) continue;
      const [c, d] = edges[j];
      if (a === c || a === d || b === c || b === d) continue;
      if (!segmentsCross(x[a], y[a], x[b], y[b], x[c], y[c], x[d], y[d])) continue;
      if (oneSolid(a, b, c, d) || passes(a, b, c, d)) continue;
      crossings++;
    }
  }

  let clashes = 0;
  const near = 0.3 * L;
  for (let p = 0; p < n; p++) {
    const px = x[p];
    const py = y[p];
    // (the first bond whose box can reach the atom, with a bond's length to spare)
    let lo = 0;
    for (let hi = sweep ? E : 0; lo < hi; ) {
      const mid = (lo + hi) >> 1;
      if (lox[bondsByX[mid]] < px - near - widest - L) lo = mid + 1;
      else hi = mid;
    }
    for (let s = lo; s < E; s++) {
      const e = bondsByX[s];
      if (sweep && px < lox[e] - near) break;
      if (px > hix[e] + near || py < loy[e] - near || py > hiy[e] + near) continue;
      const [a, b] = edges[e];
      if (p === a || p === b) continue;
      if (pointToSegment(px, py, x[a], y[a], x[b], y[b]) >= near) continue;
      if (oneSolid(p, a, b)) continue;
      clashes++;
    }
  }

  const measures = {
    bondSpread,
    angleError,
    ringError,
    overlaps,
    crossings,
    wrongDoubles,
    clashes,
    macroAngleError,
    ringWedges,
    crowdedLabels,
    tilt,
    gridError,
    substituentError,
    chainFold,
    chainSplay,
    chainTilt,
    axisTilt,
    aspect,
    macroAspect,
    readingOrder,
    ringOrder,
    face,
  };
  const score = Object.values(scoreParts(measures)).reduce((sum, v) => sum + v, 0);
  return { ...measures, score };
}
