/**
 * Which bond is in front where two bonds of a drawing cross, said by the chemist (docs/EDITOR-2D.md, *A bond in front of another*): a look, as a
 * bond's wedge or colour is. The bond said to be behind keeps the ids of the bonds it passes behind (`Bond.behind`) and is drawn with a gap there
 * (lib/chem/layout2d `brokenBehind`; Brecher 2006, ST-3.1: "the front-to-back ordering of crossing bonds must be indicated ... with a small
 * discontinuity in the backmost bond"). Where all four atoms of the two bonds carry a depth, the depth says it and nothing is asked: a cage as
 * Clean-up draws it, a tool's projection.
 *
 * Kept by bond id, so it holds while the atoms move. Nothing silent ever says it again where nobody said it: a move that ENDS with the two no
 * longer crossing takes it away, in the move's own step (`crossingsApart`; while the move goes on it is kept and draws nothing), and so does an
 * edit that gives all four atoms a depth (`crossingsHeld`: the depth says it from then on, and the mark does not come back if the depth goes).
 * Where only some of the four carry a depth, the mark says it. It never runs both ways, and it names no bond that is gone.
 */
import type { Atom, Bond, Model } from "../store/types";

type Pt = { x: number; y: number };

/** The order said between two bonds: "behind" where the first passes behind the second, "front" where in front of it, none where nothing is said. */
export function orderBetween(model: Model, bondId: number, otherId: number): "front" | "behind" | null {
  const bond = model.bonds.find((b) => b.id === bondId);
  const other = model.bonds.find((b) => b.id === otherId);
  if (bond?.behind?.includes(otherId)) return "behind";
  if (other?.behind?.includes(bondId)) return "front";
  return null;
}

/** A bond's `behind` with `drop` taken out and `add` put in, or the field gone where nothing is left. */
function withBehind(b: Bond, drop: number | null, add: number | null): Bond {
  const now = (b.behind ?? []).filter((id) => id !== drop && id !== add);
  const next = add != null ? [...now, add] : now;
  const { behind: _was, ...rest } = b;
  return next.length ? { ...rest, behind: next } : rest;
}

/**
 * The model with bond `bondId` said to be in front of, or behind, bond `otherId` where they cross - the one way only, the other taken away; said
 * again where it holds already, it is taken away: nothing is said of the two then.
 */
export function orderedCrossing(model: Model, bondId: number, otherId: number, how: "front" | "behind"): Model {
  if (bondId === otherId || !model.bonds.some((b) => b.id === bondId) || !model.bonds.some((b) => b.id === otherId)) return model;
  const holds = orderBetween(model, bondId, otherId) === how;
  const [back, front] = how === "behind" ? [bondId, otherId] : [otherId, bondId];
  const bonds = model.bonds.map((b) => {
    if (b.id === back) return withBehind(b, front, holds ? null : front);
    if (b.id === front) return withBehind(b, back, null);
    return b;
  });
  return { ...model, bonds };
}

/**
 * The model's marks kept whole after an edit: an id of a bond that is gone, of the bond itself or given twice taken away; one between two bonds
 * whose four atoms all carry a depth now taken away (the depth says it); and where two bonds each say they are behind the other, the one said by
 * this edit kept (`before`, the bonds by id, says which is new), else the one on the bond with the smaller id.
 */
export function crossingsHeld(model: Model, before?: Model): Model {
  if ((model.bonds === before?.bonds && model.atoms === before?.atoms) || !model.bonds.some((b) => b.behind)) return model;
  const ids = new Set(model.bonds.map((b) => b.id));
  const atom = new Map(model.atoms.map((a) => [a.id, a]));
  const bondOf = new Map(model.bonds.map((b) => [b.id, b]));
  const deep = (b: Bond, o: Bond) => [b.a, b.b, o.a, o.b].every((id) => atom.get(id)?.z != null);
  const was = new Map((before?.bonds ?? []).map((b) => [b.id, b]));
  const said = new Map<number, number[]>();
  for (const b of model.bonds) {
    if (!b.behind) continue;
    const kept = [...new Set(b.behind)].filter((id) => Number.isInteger(id) && id !== b.id && ids.has(id) && !deep(b, bondOf.get(id)!));
    said.set(b.id, kept);
  }
  // (both ways: the newer kept)
  for (const [a, list] of said) {
    for (const o of [...list]) {
      const back = said.get(o);
      if (!back?.includes(a)) continue;
      const aNew = !was.get(a)?.behind?.includes(o);
      const oNew = !was.get(o)?.behind?.includes(a);
      const keepA = aNew === oNew ? a < o : aNew;
      if (keepA) said.set(o, back.filter((x) => x !== a));
      else said.set(a, (said.get(a) ?? []).filter((x) => x !== o));
    }
  }
  let changed = false;
  const bonds = model.bonds.map((b) => {
    if (!b.behind) return b;
    const kept = said.get(b.id) ?? [];
    if (kept.length === b.behind.length && kept.every((id, i) => id === b.behind![i])) return b;
    changed = true;
    const { behind: _was, ...rest } = b;
    return kept.length ? { ...rest, behind: kept } : rest;
  });
  return changed ? { ...model, bonds } : model;
}

/**
 * The model's marks with those whose two bonds no longer cross on the page taken away: what a move does as it ENDS (never while it goes on), so
 * that a gap coming back where the bonds are dragged across again later says nothing nobody said again. The same model where none is.
 */
export function crossingsApart(model: Model): Model {
  if (!model.bonds.some((b) => b.behind?.length)) return model;
  const atom = new Map(model.atoms.map((a) => [a.id, a]));
  const bondOf = new Map(model.bonds.map((b) => [b.id, b]));
  const cross = (b: Bond, o: Bond) => {
    const [p, q, r, s] = [atom.get(b.a), atom.get(b.b), atom.get(o.a), atom.get(o.b)];
    return !!p && !!q && !!r && !!s && crossingPoint(p, q, r, s) != null;
  };
  let changed = false;
  const bonds = model.bonds.map((b) => {
    if (!b.behind?.length) return b;
    const kept = b.behind.filter((id) => {
      const o = bondOf.get(id);
      return !!o && cross(b, o);
    });
    if (kept.length === b.behind.length) return b;
    changed = true;
    const { behind: _was, ...rest } = b;
    return kept.length ? { ...rest, behind: kept } : rest;
  });
  return changed ? { ...model, bonds } : model;
}

/** A bond's marks on new ids (`to`: old bond id to new), those whose bond did not come with it dropped. */
export function behindRemapped(behind: readonly number[] | undefined, to: (id: number) => number | undefined): { behind?: number[] } {
  if (!behind?.length) return {};
  const out = behind.map(to).filter((id): id is number => id != null);
  return out.length ? { behind: out } : {};
}

/**
 * The marks of the bonds turned over with `atoms` exchanged: what was in front of the page is behind it now, so a bond said to be behind
 * another is in front of it - as a depth changes sign. Only between two bonds both turned; each bond whose field changes, with its new field.
 */
export function turnedOverCrossings(model: Model, atoms: ReadonlySet<number>): { id: number; behind: number[] }[] {
  const turned = new Set(model.bonds.filter((b) => atoms.has(b.a) && atoms.has(b.b)).map((b) => b.id));
  const next = new Map<number, number[]>();
  const of = (id: number) => next.get(id) ?? [...(model.bonds.find((b) => b.id === id)?.behind ?? [])];
  for (const b of model.bonds) {
    if (!turned.has(b.id) || !b.behind) continue;
    for (const o of b.behind) {
      if (!turned.has(o)) continue;
      next.set(b.id, of(b.id).filter((x) => x !== o));
      next.set(o, [...of(o).filter((x) => x !== b.id), b.id]);
    }
  }
  return [...next].map(([id, behind]) => ({ id, behind }));
}

/** Where two segments cross, away from their ends: the point, or none. */
function crossingPoint(p: Pt, q: Pt, r: Pt, s: Pt): Pt | null {
  const d = { x: q.x - p.x, y: q.y - p.y };
  const e = { x: s.x - r.x, y: s.y - r.y };
  const den = d.x * e.y - d.y * e.x;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((r.x - p.x) * e.y - (r.y - p.y) * e.x) / den;
  const u = ((r.x - p.x) * d.y - (r.y - p.y) * d.x) / den;
  if (t <= 1e-9 || t >= 1 - 1e-9 || u <= 1e-9 || u >= 1 - 1e-9) return null;
  return { x: p.x + d.x * t, y: p.y + d.y * t };
}

/** The atoms bonded together with `id`, by the bonds: its structure. */
function structureOf(model: Model, id: number): Set<number> {
  const seen = new Set([id]);
  const todo = [id];
  while (todo.length) {
    const at = todo.pop()!;
    for (const b of model.bonds) {
      const o = b.a === at ? b.b : b.b === at ? b.a : null;
      if (o != null && !seen.has(o)) {
        seen.add(o);
        todo.push(o);
      }
    }
  }
  return seen;
}

/**
 * The bonds of its own structure that bond `bondId` crosses on the page where it can be said which is in front - not where all four atoms of the
 * two carry a depth (the depth says it) - nearest first to `at` (the pointer), each with where they cross. Two structures lying over each other
 * are not one drawing: none of the other's.
 */
export function crossingsOf(model: Model, bondId: number, at?: Pt): { other: number; at: Pt }[] {
  const bond = model.bonds.find((b) => b.id === bondId);
  if (!bond) return [];
  const atom = new Map<number, Atom>(model.atoms.map((a) => [a.id, a]));
  const [p, q] = [atom.get(bond.a), atom.get(bond.b)];
  if (!p || !q) return [];
  const mine = structureOf(model, bond.a);
  const out: { other: number; at: Pt }[] = [];
  for (const o of model.bonds) {
    if (o.id === bond.id || !mine.has(o.a) || o.a === bond.a || o.a === bond.b || o.b === bond.a || o.b === bond.b) continue;
    const [r, s] = [atom.get(o.a), atom.get(o.b)];
    if (!r || !s) continue;
    if ([p, q, r, s].every((x) => x.z != null)) continue;
    const c = crossingPoint(p, q, r, s);
    if (c) out.push({ other: o.id, at: c });
  }
  if (at) out.sort((m, n) => Math.hypot(m.at.x - at.x, m.at.y - at.y) - Math.hypot(n.at.x - at.x, n.at.y - at.y));
  return out;
}
