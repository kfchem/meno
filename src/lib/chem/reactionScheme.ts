import { arrowMeasures, arrowPath, arrowPieces, type ArrowForm, type ArrowLook } from "./reactionArrow";
import { bondFraction, resolveStyle, type DrawingStyle } from "./style";
import { greatest, least } from "./lists";

/**
 * A reaction as it is drawn: its structures, its arrow, and the "+" signs
 * between the structures on either side of it - how a "+" is drawn, and
 * which structure a drawing makes a reactant, a product or a reagent.
 */

type P = { x: number; y: number };

/** A reaction arrow as the editor holds one: its middle, which way it points, and how long it is. */
export type SchemeArrow = { x: number; y: number; angle: number; length: number };

/** A "+": where its middle is. */
export type SchemePlus = { x: number; y: number };

/** A "+"'s measures, in the drawing's units: across it, and its bars' thickness. */
export type PlusMeasures = { size: number; thickness: number };

/**
 * How wide a "+" is, as a fraction of the labels' font size: about the
 * width of the sign set in a label's typeface.
 */
const PLUS_SIZE = 0.6;

/**
 * The measures `style` gives a "+", with a bond `bondLength` long in the
 * drawing's units: about as wide as the sign set in its labels' typeface,
 * its bars as thick as a bond's line.
 */
export function plusMeasures(style: DrawingStyle, bondLength: number): PlusMeasures {
  return {
    size: PLUS_SIZE * bondFraction(style.fontSize, style) * bondLength,
    thickness: bondFraction(style.lineThickness, style) * bondLength,
  };
}

/** The outline of a "+" centred `at`, anticlockwise from the lower right of its right arm. */
export function plusOutline(at: P, m: PlusMeasures): P[] {
  const h = Math.max(0, m.size / 2);
  const t = Math.min(Math.max(0, m.thickness / 2), h);
  if (!(h > 0)) return [];
  const corners: [number, number][] = [
    [h, -t], [h, t], [t, t], [t, h], [-t, h], [-t, t],
    [-h, t], [-h, -t], [-t, -t], [-t, -h], [t, -h], [t, -t],
  ];
  return corners.map(([x, y]) => ({ x: at.x + x, y: at.y + y }));
}

/** An arrow's tail and point. */
export function arrowEnds(a: SchemeArrow): { from: P; to: P } {
  const dx = (Math.cos(a.angle) * a.length) / 2;
  const dy = (Math.sin(a.angle) * a.length) / 2;
  return { from: { x: a.x - dx, y: a.y - dy }, to: { x: a.x + dx, y: a.y + dy } };
}

/** The points an arrow's line runs through: its tail, the corners it turns at, its point. */
export function arrowPoints(a: SchemeArrow & Pick<ArrowForm, "corners">): P[] {
  const { from, to } = arrowEnds(a);
  return arrowPath(from, to, a.corners);
}

/**
 * The straight line an arrow's words are over and under: the arrow itself,
 * where it runs straight; where it turns, the longest stretch of it - its
 * middle, which way it runs, how long it is.
 */
export function wordsLine<A extends SchemeArrow & Pick<ArrowForm, "corners">>(a: A): A {
  if (!a.corners?.length) return a;
  const pts = arrowPoints(a);
  let best = 0;
  let longest = -1;
  for (let i = 1; i < pts.length; i++) {
    const l = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (l > longest) [best, longest] = [i, l];
  }
  const p = pts[best - 1];
  const q = pts[best];
  return { ...a, x: (p.x + q.x) / 2, y: (p.y + q.y) / 2, angle: Math.atan2(q.y - p.y, q.x - p.x), length: longest };
}

type RoleAtom = { id: number; x: number; y: number; sgroups?: readonly { id: number }[] };
type RoleBond = { a: number; b: number; endpoints?: readonly number[] };

/** A drawn reaction's molecules by role, each the ids of its atoms. */
export type ReactionRoles = { reactants: number[][]; products: number[][]; reagents: number[][] };

/**
 * The molecules a drawing of one reaction holds, by role:
 *
 * - a structure is what is joined by its bonds - a haptic bond's to the
 *   atoms it reaches, an Sgroup's atoms to one another;
 * - what lies before the arrow's tail, along the arrow, is a reactant;
 *   past its point, a product; alongside it - above or below - a reagent;
 * - two structures in one role are one molecule, a salt drawn as its ions,
 *   where they lie less than a bond (`bondLength`) apart and no "+" stands
 *   between them; otherwise they are two.
 *
 * Each in the order they are drawn along the arrow, a reagent to its left
 * (above, for an arrow pointing right) before one to its right.
 */
export function reactionRoles(
  model: { atoms: readonly RoleAtom[]; bonds: readonly RoleBond[] },
  arrow: SchemeArrow,
  pluses: readonly SchemePlus[],
  bondLength: number,
): ReactionRoles {
  const parent = new Map<number, number>(model.atoms.map((a) => [a.id, a.id]));
  const find = (id: number): number => {
    let r = id;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(id, r);
    return r;
  };
  const join = (a: number, b: number) => {
    if (!parent.has(a) || !parent.has(b)) return;
    parent.set(find(a), find(b));
  };
  for (const b of model.bonds) {
    join(b.a, b.b);
    for (const e of b.endpoints ?? []) join(b.a, e);
  }
  const inGroup = new Map<number, number>();
  for (const a of model.atoms) {
    for (const g of a.sgroups ?? []) {
      const first = inGroup.get(g.id);
      if (first == null) inGroup.set(g.id, a.id);
      else join(first, a.id);
    }
  }
  const atomsOf = new Map<number, RoleAtom[]>();
  for (const a of model.atoms) {
    const r = find(a.id);
    atomsOf.set(r, [...(atomsOf.get(r) ?? []), a]);
  }

  const { from } = arrowEnds(arrow);
  const u = { x: Math.cos(arrow.angle), y: Math.sin(arrow.angle) };
  type Piece = { ids: number[]; min: P; max: P; c: P; along: number; across: number; role: keyof ReactionRoles };
  const pieces: Piece[] = [...atomsOf.values()].map((atoms) => {
    const xs = atoms.map((a) => a.x);
    const ys = atoms.map((a) => a.y);
    const min = { x: least(xs), y: least(ys) };
    const max = { x: greatest(xs), y: greatest(ys) };
    const c = { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2 };
    const along = (c.x - from.x) * u.x + (c.y - from.y) * u.y;
    // (to the arrow's left is positive)
    const across = (c.y - from.y) * u.x - (c.x - from.x) * u.y;
    const role = along < 0 ? "reactants" : along > arrow.length ? "products" : "reagents";
    return { ids: atoms.map((a) => a.id), min, max, c, along, across, role };
  });

  // a "+" between two pieces: along the line from the one's middle to the
  // other's, and within a bond of it
  const plusBetween = (p: Piece, q: Piece) => {
    const d = { x: q.c.x - p.c.x, y: q.c.y - p.c.y };
    const len2 = d.x * d.x + d.y * d.y;
    if (!(len2 > 0)) return false;
    return pluses.some((s) => {
      const t = ((s.x - p.c.x) * d.x + (s.y - p.c.y) * d.y) / len2;
      const off = Math.abs((s.x - p.c.x) * d.y - (s.y - p.c.y) * d.x) / Math.sqrt(len2);
      return t > 0 && t < 1 && off < bondLength;
    });
  };
  const gap = (p: Piece, q: Piece) =>
    Math.hypot(
      Math.max(0, p.min.x - q.max.x, q.min.x - p.max.x),
      Math.max(0, p.min.y - q.max.y, q.min.y - p.max.y),
    );
  const molecule = pieces.map((_, i) => i);
  const top = (i: number): number => (molecule[i] === i ? i : (molecule[i] = top(molecule[i])));
  for (let i = 0; i < pieces.length; i++) {
    for (let j = i + 1; j < pieces.length; j++) {
      const p = pieces[i];
      const q = pieces[j];
      if (p.role === q.role && gap(p, q) < bondLength && !plusBetween(p, q)) molecule[top(i)] = top(j);
    }
  }
  const molecules = new Map<number, Piece[]>();
  pieces.forEach((p, i) => molecules.set(top(i), [...(molecules.get(top(i)) ?? []), p]));

  type Placed = { ids: number[]; along: number; across: number };
  const byRole: Record<keyof ReactionRoles, Placed[]> = { reactants: [], products: [], reagents: [] };
  for (const ps of molecules.values()) {
    const mean = (f: (p: Piece) => number) => ps.reduce((s, p) => s + f(p), 0) / ps.length;
    byRole[ps[0].role].push({ ids: ps.flatMap((p) => p.ids), along: mean((p) => p.along), across: mean((p) => p.across) });
  }
  const alongIt = (a: Placed, b: Placed) => a.along - b.along;
  // (to the arrow's left first: above one pointing right)
  const side = (m: Placed) => (m.across >= 0 ? 0 : 1);
  return {
    reactants: byRole.reactants.sort(alongIt).map((m) => m.ids),
    products: byRole.products.sort(alongIt).map((m) => m.ids),
    reagents: byRole.reagents.sort((a, b) => side(a) - side(b) || alongIt(a, b)).map((m) => m.ids),
  };
}

/** A scheme's arrow as a picture is given it: where it lies, its form, what it sets for itself, its colour. */
type DrawnArrow = SchemeArrow & ArrowForm & { look?: ArrowLook; color?: string };

/**
 * What a picture of a scheme fills - each arrow's pieces as `style` and its
 * form draw them, over what it sets for itself, in its colour where it has
 * one; each "+" - with a bond `bondLength` long.
 */
export function schemePieces(
  scheme: { arrows?: readonly DrawnArrow[]; pluses?: readonly SchemePlus[] },
  style: DrawingStyle,
  bondLength: number,
): { points: P[]; color?: string }[] {
  const plus = plusMeasures(style, bondLength);
  return [
    ...(scheme.arrows ?? []).flatMap((a) => {
      const { from, to } = arrowEnds(a);
      return arrowPieces(from, to, a, arrowMeasures(resolveStyle(style, a.look), bondLength)).map((points) => ({ points, ...(a.color ? { color: a.color } : {}) }));
    }),
    ...(scheme.pluses ?? []).map((p) => ({ points: plusOutline(p, plus) })),
  ].filter((o) => o.points.length > 2);
}

/** The outlines of a scheme's arrows and pluses (`schemePieces`), their colours aside. */
export function schemeOutlines(scheme: { arrows?: readonly DrawnArrow[]; pluses?: readonly SchemePlus[] }, style: DrawingStyle, bondLength: number): P[][] {
  return schemePieces(scheme, style, bondLength).map((o) => o.points);
}

/** A new reaction arrow's length, in bonds: what a file's arrow is given too. */
export const ARROW_LENGTH_BONDS = 8 / 3;

/**
 * The arrow with one end - its point (`head`) or its tail - taken to
 * `pointer`, the other end staying at `fixed`: its direction a multiple of
 * `step` radians where one is given, its length no less than `minLength`.
 */
export function reshapedArrow(
  end: "head" | "tail",
  fixed: P,
  pointer: P,
  { step, minLength }: { step?: number; minLength: number },
): SchemeArrow {
  let angle = Math.atan2(pointer.y - fixed.y, pointer.x - fixed.x);
  if (step) angle = Math.round(angle / step) * step;
  const length = Math.max(minLength, Math.hypot(pointer.x - fixed.x, pointer.y - fixed.y));
  const moving = { x: fixed.x + Math.cos(angle) * length, y: fixed.y + Math.sin(angle) * length };
  const [from, to] = end === "head" ? [fixed, moving] : [moving, fixed];
  return {
    x: (from.x + to.x) / 2,
    y: (from.y + to.y) / 2,
    angle: Math.atan2(to.y - from.y, to.x - from.x),
    length,
  };
}
