/**
 * What a selection takes in, and what is done to it - pure, over the
 * editor's model:
 *
 * - the atoms a box or a lasso holds, and the bonds between them;
 * - the atoms and bonds along the bonds from one atom to another (a
 *   Shift+click's);
 * - where the selected atoms go when the selection is turned about its
 *   middle, or turned over.
 */
import type { Bond, MarkAt, Model, Sel } from "../store/types";
import type { MarksAt } from "../document";
import { arrowPoints } from "../../../../lib/chem/reactionScheme";
import { middleOfPoints } from "../../../../lib/chem/lists";

type Pt = { x: number; y: number };

/** The bonds whose two atoms are both among `atoms`. */
export function bondsAmong(model: Pick<Model, "bonds">, atoms: ReadonlySet<number>): Set<number> {
  return new Set(model.bonds.filter((b) => atoms.has(b.a) && atoms.has(b.b)).map((b) => b.id));
}

/** The atoms inside the box with corners `p` and `q`, and the bonds among them. */
export function inBox(model: Model, p: Pt, q: Pt): Sel {
  const [x0, x1] = [Math.min(p.x, q.x), Math.max(p.x, q.x)];
  const [y0, y1] = [Math.min(p.y, q.y), Math.max(p.y, q.y)];
  const atoms = new Set(model.atoms.filter((a) => a.x >= x0 && a.x <= x1 && a.y >= y0 && a.y <= y1).map((a) => a.id));
  return { atoms, bonds: bondsAmong(model, atoms) };
}

/** Whether `p` is inside the polygon `ring` (by the even-odd rule). */
export function insidePolygon(p: Pt, ring: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** The atoms inside a lasso - the path the pointer drew, closed - and the bonds among them. */
export function inLasso(model: Model, path: readonly Pt[]): Sel {
  if (path.length < 3) return { atoms: new Set(), bonds: new Set() };
  const atoms = new Set(model.atoms.filter((a) => insidePolygon(a, path)).map((a) => a.id));
  return { atoms, bonds: bondsAmong(model, atoms) };
}

/**
 * The molecules in 3D a box (two corners) or a lasso (three points or more)
 * takes: those whose centre stands inside it.
 */
export function molecules3dIn(molecules: readonly { id: number; at: Pt }[], kind: "box" | "lasso", points: readonly Pt[]): number[] {
  if (kind === "box") {
    if (points.length < 2) return [];
    const [p, q] = points;
    const [x0, x1] = [Math.min(p.x, q.x), Math.max(p.x, q.x)];
    const [y0, y1] = [Math.min(p.y, q.y), Math.max(p.y, q.y)];
    return molecules.filter((m) => m.at.x >= x0 && m.at.x <= x1 && m.at.y >= y0 && m.at.y <= y1).map((m) => m.id);
  }
  if (points.length < 3) return [];
  return molecules.filter((m) => insidePolygon(m.at, points)).map((m) => m.id);
}

/** Whether `q` lies in a box (its two corners) or within a lasso, as `molecules3dIn` takes a middle. */
export function inPlace(q: Pt, kind: "box" | "lasso", points: readonly Pt[]): boolean {
  return molecules3dIn([{ id: 0, at: q }], kind, points).length > 0;
}

/** The arrows standing wholly in a box or a lasso - each end and each corner its line turns at - by id. */
export function arrowsIn(arrows: readonly (Parameters<typeof arrowPoints>[0] & { id: number })[], kind: "box" | "lasso", points: readonly Pt[]): number[] {
  return arrows.filter((a) => arrowPoints(a).every((q) => inPlace(q, kind, points))).map((a) => a.id);
}

/** A picture's corners on the page, as it is turned: lower left, lower right, upper right, upper left, before it is. */
export function cornersOf(p: { x: number; y: number; w: number; h: number; turn?: number }): Pt[] {
  const c = Math.cos(p.turn ?? 0);
  const s = Math.sin(p.turn ?? 0);
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([i, j]) => {
    const dx = (i * p.w) / 2;
    const dy = (j * p.h) / 2;
    return { x: p.x + dx * c - dy * s, y: p.y + dx * s + dy * c };
  });
}

/**
 * The atoms and bonds along the bonds from `from` to `to`, the shortest way
 * (the fewest bonds), both ends included; null where no bonds join them.
 */
export function pathBetween(model: Model, from: number, to: number): Sel | null {
  const next = new Map<number, { atom: number; bond: number }[]>();
  for (const b of model.bonds) {
    next.set(b.a, [...(next.get(b.a) ?? []), { atom: b.b, bond: b.id }]);
    next.set(b.b, [...(next.get(b.b) ?? []), { atom: b.a, bond: b.id }]);
  }
  const back = new Map<number, { atom: number; bond: number } | null>([[from, null]]);
  const queue = [from];
  while (queue.length && !back.has(to)) {
    const at = queue.shift()!;
    for (const step of next.get(at) ?? []) {
      if (back.has(step.atom)) continue;
      back.set(step.atom, { atom: at, bond: step.bond });
      queue.push(step.atom);
    }
  }
  if (!back.has(to)) return null;
  const atoms = new Set<number>([to]);
  const bonds = new Set<number>();
  for (let at = to, step = back.get(to); step; at = step.atom, step = back.get(at)) {
    atoms.add(step.atom);
    bonds.add(step.bond);
  }
  return { atoms, bonds };
}

/** The middle of the selected atoms: of the box round them. */
export function middleOf(model: Model, atoms: ReadonlySet<number>): Pt | null {
  return middleOfPoints(model.atoms.filter((a) => atoms.has(a.id)));
}

/**
 * The marks put by hand on the atoms `atoms` holds - their charges and R
 * and S - and on the bonds among them - their E and Z - each where `f`
 * takes it from what it is of: turned with them, or turned over. None,
 * where none was put by hand.
 */
export function marksAtOf(model: Model, atoms: ReadonlySet<number>, f: (p: MarkAt) => MarkAt): MarksAt | undefined {
  const out: MarksAt = { atoms: [], bonds: [] };
  for (const a of model.atoms) {
    if (!atoms.has(a.id) || (!a.chargeAt && !a.stereoAt)) continue;
    out.atoms.push({ id: a.id, ...(a.chargeAt ? { chargeAt: f(a.chargeAt) } : {}), ...(a.stereoAt ? { stereoAt: f(a.stereoAt) } : {}) });
  }
  for (const b of model.bonds) {
    if (b.stereoAt && atoms.has(b.a) && atoms.has(b.b)) out.bonds.push({ id: b.id, stereoAt: f(b.stereoAt) });
  }
  return out.atoms.length || out.bonds.length ? out : undefined;
}

/** A mark's place from what it is of, turned by `angle` (radians, anticlockwise). */
export const turnedBy = (angle: number) => (p: MarkAt): MarkAt => ({
  x: p.x * Math.cos(angle) - p.y * Math.sin(angle),
  y: p.x * Math.sin(angle) + p.y * Math.cos(angle),
});

/** Where the selected atoms go, the selection turned by `angle` (radians, anticlockwise) about `about`. */
export function turned(
  atoms: readonly { id: number; x: number; y: number }[],
  about: Pt,
  angle: number,
): { id: number; x: number; y: number }[] {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return atoms.map((a) => {
    const dx = a.x - about.x;
    const dy = a.y - about.y;
    return { id: a.id, x: about.x + dx * c - dy * s, y: about.y + dx * s + dy * c };
  });
}

/** Arrows carried round `about` by `angle` with what they are among: each one's middle turned, and each pointing as far round - its corners, kept along it, going with it. */
export function turnedArrows(
  arrows: readonly { id: number; x: number; y: number; angle: number }[],
  about: Pt,
  angle: number,
): { id: number; x: number; y: number; angle: number }[] {
  return turned(arrows, about, angle).map((q, i) => ({ ...q, angle: arrows[i].angle + angle }));
}

/**
 * Arrows turned over with what they are among, about the line through
 * `mid` - upright (`vertical`: left for right) or level (`horizontal`: up
 * for down): each one's middle mirrored, pointing the mirrored way, and its
 * corners on its other side.
 */
export function turnedOverArrows(
  arrows: readonly { id: number; x: number; y: number; angle: number; corners?: readonly { along: number; across: number }[] }[],
  mid: Pt,
  axis: "vertical" | "horizontal",
): { id: number; x: number; y: number; angle: number; corners?: { along: number; across: number }[] }[] {
  return arrows.map((a) => ({
    id: a.id,
    x: axis === "vertical" ? 2 * mid.x - a.x : a.x,
    y: axis === "horizontal" ? 2 * mid.y - a.y : a.y,
    angle: axis === "vertical" ? Math.PI - a.angle : -a.angle,
    ...(a.corners ? { corners: a.corners.map((c) => ({ along: c.along, across: -c.across })) } : {}),
  }));
}

/**
 * The selection turned over, left to right (about the upright line through
 * its middle) or top to bottom: what was in front of the page is now
 * behind it, so each wedge on it becomes hashes and each hashes a wedge, and
 * a depth changes sign - the same molecule, seen from its other side, not
 * its mirror image. About `about`, where given: the middle of all that is
 * turned over with it.
 */
export function turnedOver(
  model: Model,
  atoms: ReadonlySet<number>,
  axis: "vertical" | "horizontal",
  about?: Pt,
): { atoms: { id: number; x: number; y: number; z?: number }[]; bonds: Pick<Bond, "id" | "stereo">[] } {
  const mid = about ?? middleOf(model, atoms);
  if (!mid) return { atoms: [], bonds: [] };
  const moved = model.atoms
    .filter((a) => atoms.has(a.id))
    .map((a) => ({
      id: a.id,
      x: axis === "vertical" ? 2 * mid.x - a.x : a.x,
      y: axis === "horizontal" ? 2 * mid.y - a.y : a.y,
      ...(a.z != null ? { z: -a.z } : {}),
    }));
  const bonds = model.bonds
    .filter((b) => atoms.has(b.a) && atoms.has(b.b) && (b.stereo === "up" || b.stereo === "down"))
    .map((b) => ({ id: b.id, stereo: b.stereo === "up" ? ("down" as const) : ("up" as const) }));
  return { atoms: moved, bonds };
}
