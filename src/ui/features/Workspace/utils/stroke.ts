/**
 * A stroke: bonds drawn in one gesture.
 *
 * - A **bond** stroke - a double-click on an atom, then a drag - draws one
 *   bond, which points where the pointer leads it (see `snapBond`) and,
 *   after a pause, goes exactly where the pointer is. It ends on an atom
 *   already there when it comes within reach of one - it closes a ring -
 *   and on the atom the pointer is on, however far away.
 * - A **chain** stroke - from an atom's menu or Quick Add (no click count starts one) -
 *   runs on a honeycomb laid out from where it starts (./chain): led along
 *   it, it lays a bond down a step at a time; led back, it takes them back;
 *   led round in a loop, it draws a ring as large as the loop.
 *
 * Nothing is added to the document until the stroke ends: it is one undo
 * step.
 */
import { snapBond, type Pt } from "./extendSnap";
import { followChain, startChain, type Chain } from "./chain";
import { cellOf, nearestCell, neighboursOf } from "./honeycomb";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { etaBondAt, etaRingAt } from "../chem/eta";
import { ATOM_PICK_RADIUS_RATIO } from "../constants";

/**
 * An atom a stroke has reached: a new one where it goes, an atom already
 * there (`atomId`), or one this stroke laid down before (`pathIndex`; -1 is
 * the atom the stroke started at). Its bond comes from the node before it,
 * or from `from` (a path index likewise) - where a ring a chain draws goes
 * off from the chain.
 */
export type StrokeNode = Pt & {
  atomId?: number;
  pathIndex?: number;
  from?: number;
  /** A bond from a metal ending inside a ring, on no atom: the ring it binds through all its atoms (chem/eta). */
  ring?: number[];
};

/** The stroke's own start, as a path index. */
export const BASE = -1;
/** A stroke's base where it starts on empty space: a new atom, at `start`. */
export const NEW_ATOM = -1;

export type Stroke = {
  kind: "bond" | "chain";
  /** The atom it starts at; NEW_ATOM where it starts on empty space. */
  baseId: number;
  /** Where it starts, when that is empty space. */
  start?: Pt;
  nodes: StrokeNode[];
  /** Which way the chain turned last: +1 left, -1 right, 0 not yet. */
  lastTurn: number;
  /** A bond stroke after a pause: it goes where the pointer is, unsnapped. */
  free: boolean;
  /** A chain's walk on its honeycomb, and the rings drawn on the way. */
  chain?: Chain;
};

type StrokeModel = {
  atoms: readonly { id: number; x: number; y: number }[];
  bonds: readonly { a: number; b: number }[];
};

type StrokeAtom = StrokeModel["atoms"][number];

/**
 * A drawing as a stroke asks of it, made once as it changes, not at every
 * step of a stroke - over a drawing of 28 000 atoms that took 36 to 112 ms
 * a step (a hot-path audit): each atom by its id, with
 * its place in the drawing; what each is bonded to; and the atoms by
 * square, `GRID` a side, to find one near a point.
 */
type StrokeIndex = {
  byId: Map<number, { atom: StrokeAtom; order: number }>;
  bonded: Map<number, number[]>;
  squares: Map<string, number[]>;
};
const GRID = 0.5 * NOMINAL_BOND_LENGTH;
const indexes = new WeakMap<object, { bonds: object; index: StrokeIndex }>();
const squareOf = (x: number, y: number) => `${Math.floor(x / GRID)} ${Math.floor(y / GRID)}`;

function indexOf(model: StrokeModel): StrokeIndex {
  const known = indexes.get(model.atoms);
  if (known && known.bonds === model.bonds) return known.index;
  const byId = new Map<number, { atom: StrokeAtom; order: number }>();
  const squares = new Map<string, number[]>();
  model.atoms.forEach((atom, order) => {
    byId.set(atom.id, { atom, order });
    const key = squareOf(atom.x, atom.y);
    const square = squares.get(key);
    if (square) square.push(order);
    else squares.set(key, [order]);
  });
  const bonded = new Map<number, number[]>();
  for (const b of model.bonds) {
    (bonded.get(b.a) ?? bonded.set(b.a, []).get(b.a)!).push(b.b);
    (bonded.get(b.b) ?? bonded.set(b.b, []).get(b.b)!).push(b.a);
  }
  const index = { byId, bonded, squares };
  indexes.set(model.atoms, { bonds: model.bonds, index });
  return index;
}

/** The first atom of the drawing, in its order, within `reach` of `p` and not `but`: as model.atoms.find would find it. */
function atomNear(model: StrokeModel, index: StrokeIndex, p: Pt, reach: number, but: number): number | undefined {
  const [i, j] = [Math.floor(p.x / GRID), Math.floor(p.y / GRID)];
  const span = Math.ceil(reach / GRID);
  let first: number | undefined;
  for (let di = -span; di <= span; di++)
    for (let dj = -span; dj <= span; dj++)
      for (const order of index.squares.get(`${i + di} ${j + dj}`) ?? []) {
        const a = model.atoms[order];
        if (a.id !== but && Math.hypot(a.x - p.x, a.y - p.y) < reach && (first === undefined || order < first)) first = order;
      }
  return first === undefined ? undefined : model.atoms[first].id;
}

/** How near an atom the end of a bond has to come to close onto it. */
export const JOIN_REACH = 0.4;
/** How far off a double bond's line, against a bond's length, a bond from a metal ending on its middle binds it (eta2). */
export const ETA2_ACROSS = 0.2;

/**
 * A stroke from the atom `baseId`, or - a chain - from `start` on empty
 * space (baseId NEW_ATOM). A chain's honeycomb is turned so that a bond its
 * atom already has is one of the honeycomb's.
 */
export function startStroke(
  kind: Stroke["kind"],
  baseId: number,
  model?: StrokeModel,
  start?: Pt,
  length = 1,
): Stroke {
  const s: Stroke = { kind, baseId, nodes: [], lastTurn: 0, free: false, ...(start ? { start } : {}) };
  if (kind !== "chain" || !model) return s;
  const base = baseId === NEW_ATOM ? start : model.atoms.find((a) => a.id === baseId);
  if (!base) return s;
  const bonded = model.bonds
    .flatMap((b) => (b.a === baseId ? [b.b] : b.b === baseId ? [b.a] : []))
    .map((id) => model.atoms.find((a) => a.id === id))
    .filter((a): a is { id: number; x: number; y: number } => !!a);
  return { ...s, chain: startChain({ x: base.x, y: base.y }, bonded, length) };
}

/**
 * A chain's walk as the nodes it adds: each point of the walk an atom - one
 * already there where the honeycomb's point falls on it - and a point it
 * comes round to again the same atom. A point is taken as an atom already
 * there, or one of the chain's own, only where the ring that closes lies
 * along the honeycomb - its atoms on its points, its bonds its bonds - or
 * where it closes none: a chain draws the honeycomb's rings and no other
 * (the maintainer, 2026-10-07 and 2026-10-08); elsewhere, it is an atom of
 * its own.
 */
export function chainNodes(model: StrokeModel, s: Stroke): StrokeNode[] {
  const c = s.chain;
  if (!c) return s.nodes;
  const L = c.honeycomb.length;
  const nodes: StrokeNode[] = [];
  const index = indexOf(model);
  const base = s.baseId === NEW_ATOM ? s.start : index.byId.get(s.baseId)?.atom;
  // where each placed atom is, by its path index: the base, then the nodes
  const placed: { at: Pt; ref: number }[] = base ? [{ at: base, ref: BASE }] : [];
  const near = (p: Pt) => placed.find((q) => Math.hypot(q.at.x - p.x, q.at.y - p.y) < 0.3 * L)?.ref;
  const existing = (p: Pt) => atomNear(model, index, p, 0.35 * L, s.baseId);
  // the drawing as it stands with the chain so far, atom by atom: what
  // each is bonded to - an atom already there by "m<id>", the chain's own
  // by "n<ref>" - to tell what ring taking a point as an atom closes
  const vertexOf = (ref: number): string =>
    ref === BASE ? (s.baseId === NEW_ATOM ? "base" : `m${s.baseId}`) : nodes[ref].atomId != null ? `m${nodes[ref].atomId}` : `n${ref}`;
  // (the drawing's own bonds from its index; the chain's, as they are made)
  const added = new Map<string, Set<string>>();
  const join = (u: string, v: string) => {
    if (u === v) return;
    if (!added.has(u)) added.set(u, new Set());
    if (!added.has(v)) added.set(v, new Set());
    added.get(u)!.add(v);
    added.get(v)!.add(u);
  };
  const neighbours = (u: string): string[] => {
    const own = u.startsWith("m") ? (index.bonded.get(Number(u.slice(1))) ?? []).map((id) => `m${id}`) : [];
    const more = added.get(u);
    return more ? [...own, ...more] : own;
  };
  // (the ring a bond from `u` to `v` closes: the shortest way between
  // them, from `u` to `v`; none where there is no way, or where they are
  // bonded already - the bond is there)
  const closes = (u: string, v: string): string[] | null => {
    if (u === v || neighbours(u).includes(v)) return null;
    const came = new Map<string, string>([[u, u]]);
    let edge = [u];
    while (edge.length) {
      const next: string[] = [];
      for (const x of edge)
        for (const y of neighbours(x)) {
          if (came.has(y)) continue;
          came.set(y, x);
          if (y === v) {
            const way = [v];
            while (way[way.length - 1] !== u) way.push(came.get(way[way.length - 1])!);
            return way.reverse();
          }
          next.push(y);
        }
      edge = next;
    }
    return null;
  };
  const placeOf = (v: string): Pt | undefined =>
    v === "base" ? base : v.startsWith("m") ? index.byId.get(Number(v.slice(1)))?.atom : nodes[Number(v.slice(1))];
  // (a ring along the honeycomb: each of its atoms on a point of it, and
  // each of its bonds, the closing one too, between neighbours there)
  const alongHoneycomb = (ring: string[]) =>
    ring.every((v, i) => {
      const p = placeOf(v);
      const q = placeOf(ring[(i + 1) % ring.length]);
      if (!p || !q) return false;
      const a = nearestCell(c.honeycomb, p);
      const b = nearestCell(c.honeycomb, q);
      const on = (cell: Pt, at: Pt) => Math.hypot(cell.x - at.x, cell.y - at.y) < 0.35 * L;
      return on(a, p) && on(b, q) && neighboursOf(c.honeycomb, a).some((n) => n.key === b.key);
    });
  // (taking `to` for the point, bonded from `from`: a ring along the honeycomb, or none)
  const allowed = (from: string, to: string) => {
    const ring = closes(from, to);
    return ring == null || alongHoneycomb(ring);
  };
  let last = BASE;
  const place = (p: Pt, from?: number): number => {
    const u = vertexOf(from ?? last);
    const again = near(p);
    if (again != null && allowed(u, vertexOf(again))) {
      nodes.push({ x: p.x, y: p.y, pathIndex: again, ...(from != null ? { from } : {}) });
      join(u, vertexOf(again));
      last = again;
      return again;
    }
    const found = existing(p);
    const atomId = found != null && allowed(u, `m${found}`) ? found : undefined;
    nodes.push({ x: p.x, y: p.y, ...(atomId != null ? { atomId } : {}), ...(from != null ? { from } : {}) });
    placed.push({ at: p, ref: nodes.length - 1 });
    join(u, vertexOf(nodes.length - 1));
    last = nodes.length - 1;
    return nodes.length - 1;
  };
  // the walk: one bond a step
  const refs: number[] = [BASE];
  for (let i = 1; i < c.walk.length; i++) {
    const cell = cellOf(c.honeycomb, c.walk[i]);
    // (a step from somewhere other than the node before: after coming round
    // to a point it had been through, the walk goes on from there)
    const prev = refs[i - 1];
    const from = nodes.length && refOf(nodes, nodes.length - 1) !== prev ? prev : undefined;
    refs.push(place(cell, from));
  }
  return nodes;
}

/** What a node stands for, as a path index: itself, or the atom it closes onto among the stroke's. */
function refOf(nodes: StrokeNode[], i: number): number {
  const n = nodes[i];
  return n.pathIndex != null ? n.pathIndex : i;
}

/** The atom a stroke is at: where it is, the one before it, and what it is bonded to. */
function tipOf(model: StrokeModel, s: Stroke) {
  // (from the drawing's index, made as it changes: not a map of every atom at every frame)
  const index = indexOf(model);
  const at = { get: (id: number) => index.byId.get(id)?.atom };
  const bondedTo = (id: number) => index.bonded.get(id) ?? [];
  const base = s.baseId === NEW_ATOM ? s.start : at.get(s.baseId);
  if (!base) return null;
  const n = s.nodes.length;
  const tip: Pt = n ? s.nodes[n - 1] : base;
  const previous: Pt | null = n > 1 ? s.nodes[n - 2] : n === 1 ? base : null;
  const tipAtom = n ? s.nodes[n - 1].atomId : s.baseId;
  // the atoms the tip is bonded to, in the model and in the stroke
  const neighbours: Pt[] = [];
  const bonded = new Set<number>();
  if (tipAtom != null) {
    for (const id of bondedTo(tipAtom)) {
      const a = at.get(id);
      if (a) neighbours.push(a);
      bonded.add(id);
    }
  }
  if (previous) neighbours.push(previous);
  return { tip, previous, tipAtom, neighbours, bonded, at };
}

export type StrokeTarget = {
  /** The atom the bond starts at, and where it ends. */
  tip: Pt;
  end: Pt;
  /** Set when it ends on an atom already there, or one of this stroke's. */
  atomId?: number;
  pathIndex?: number;
  /** The bond it makes 120 degrees with, when it snapped to that. */
  trigonalTo?: number;
  turn?: 1 | -1;
  /** Set when a bond from a metal ends inside a ring, on no atom: the ring it binds, `end` its centre (chem/eta). */
  ring?: number[];
};

/** The angle each stroke's bond was last held at (`snapBond`), for as long as the stroke is the same. */
const lastSnap = new WeakMap<Stroke, number>();

/** The bond the pointer is leading, not yet laid down. */
export function strokeTarget(
  model: StrokeModel,
  s: Stroke,
  pointer: Pt,
  length: number,
): StrokeTarget | null {
  // (a chain leads no bond of its own: its walk is what it lays down)
  if (s.kind === "chain") return null;
  const t = tipOf(model, s);
  if (!t) return null;
  let end: Pt;
  let trigonalTo: number | undefined;
  let turn: 1 | -1 | undefined;
  if (s.free) {
    end = pointer;
  } else {
    const b = snapBond(t.tip, t.neighbours, pointer, length, lastSnap.get(s));
    lastSnap.set(s, b.angle);
    end = b.end;
    trigonalTo = b.trigonalTo;
  }
  // closing onto an atom within reach: one already there...
  // from a metal, on the middle of a double or triple bond, on no atom:
  // that bond, bound through both its atoms by one bond to its middle
  // (eta2, chem/eta)
  if (s.kind === "bond" && t.tipAtom != null && s.nodes.length === 0) {
    const eta2 = etaBondAt(model as unknown as Parameters<typeof etaBondAt>[0], t.tipAtom, pointer, ETA2_ACROSS * length, ATOM_PICK_RADIUS_RATIO * length);
    if (eta2) return { tip: t.tip, end: eta2.centre, ring: eta2.ring };
  }
  const reach = JOIN_REACH * length;
  let bestFar = reach;
  let join: { atomId?: number; pathIndex?: number; at: Pt } | null = null;
  // (a bond goes to the atom the pointer is on, however far that is: a
  // ring is closed with a long bond as well as a short one)
  if (s.kind === "bond") {
    for (const a of model.atoms) {
      if (a.id === t.tipAtom || t.bonded.has(a.id)) continue;
      const far = Math.hypot(a.x - pointer.x, a.y - pointer.y);
      if (far < bestFar) {
        bestFar = far;
        join = { atomId: a.id, at: a };
      }
    }
    if (join) bestFar = 0;
    // ...or, from a metal, inside a ring on no atom: the ring, bound
    // through all its atoms by one bond to its centre (chem/eta)
    if (!join && t.tipAtom != null && s.nodes.length === 0) {
      const eta = etaRingAt(model as unknown as Parameters<typeof etaRingAt>[0], t.tipAtom, pointer);
      if (eta) return { tip: t.tip, end: eta.centre, ring: eta.ring };
    }
  }
  for (const a of model.atoms) {
    if (a.id === t.tipAtom || t.bonded.has(a.id)) continue;
    const far = Math.hypot(a.x - end.x, a.y - end.y);
    if (far < bestFar) {
      bestFar = far;
      join = { atomId: a.id, at: a };
    }
  }
  // ...or one this stroke laid down, short of the last two
  s.nodes.forEach((node, i) => {
    if (i >= s.nodes.length - 2 || node.atomId != null || node.pathIndex != null)
      return;
    const far = Math.hypot(node.x - end.x, node.y - end.y);
    if (far < bestFar) {
      bestFar = far;
      join = { pathIndex: i, at: node };
    }
  });
  if (join) {
    const j = join as { atomId?: number; pathIndex?: number; at: Pt };
    return {
      tip: t.tip,
      end: { x: j.at.x, y: j.at.y },
      atomId: j.atomId,
      pathIndex: j.pathIndex,
      turn,
    };
  }
  return { tip: t.tip, end, trigonalTo, turn };
}

function lay(s: Stroke, target: StrokeTarget): Stroke {
  const node: StrokeNode = { x: target.end.x, y: target.end.y };
  if (target.atomId != null) node.atomId = target.atomId;
  if (target.pathIndex != null) node.pathIndex = target.pathIndex;
  if (target.ring) node.ring = target.ring;
  return {
    ...s,
    nodes: [...s.nodes, node],
    lastTurn: target.turn ?? s.lastTurn,
  };
}

/**
 * The stroke after the pointer has moved: a chain goes on along its
 * honeycomb, or back, and draws its rings (./chain).
 */
export function advanceStroke(
  model: StrokeModel,
  s: Stroke,
  pointer: Pt,
  _length: number,
): Stroke {
  if (s.kind !== "chain" || !s.chain) return s;
  const chain = followChain(s.chain, pointer);
  if (chain === s.chain) return s;
  const next = { ...s, chain };
  return { ...next, nodes: chainNodes(model, next) };
}

/** A pause in the stroke: a bond lets go of the grid and follows the pointer exactly; a chain goes on as it was. */
export function holdStroke(
  _model: StrokeModel,
  s: Stroke,
  _pointer: Pt,
  _length: number,
): Stroke {
  if (s.kind === "bond") return s.free ? s : { ...s, free: true };
  return s;
}

/**
 * Everything the stroke adds when it ends: a bond stroke's atom and the
 * bond it is on; a chain's walk, and its rings - the one the latest step
 * back drew among them.
 */
export function finishStroke(
  model: StrokeModel,
  s: Stroke,
  pointer: Pt,
  length: number,
): StrokeNode[] {
  if (s.kind === "chain") {
    if (!s.chain) return s.nodes;
    return chainNodes(model, s);
  }
  const target = strokeTarget(model, s, pointer, length);
  if (!target) return s.nodes;
  return lay(s, target).nodes;
}
