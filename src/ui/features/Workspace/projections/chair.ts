/**
 * The chair tool's drawing (docs/EDITOR-2D.md, *Projections*; foundation part 10): a chair of F9's solids (lib/chem/perception/projection) seen its
 * standard way, as ordinary atoms and bonds that carry their depth (`z`, nearer larger), the flag that their configuration is the drawing's
 * (`stereoCentre`), R and S shown where a group makes a centre (`stereoShown`) and the near edge bold. Pure: nothing here knows a page or a store; the tool puts what it makes where the pointer was.
 * After it is made it is a drawing like any other: nothing remembers that a tool made it.
 */
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { chair, flipped, type FreePosition, type Solid } from "../../../../lib/chem/perception/projection/solids";
import { project, standardView, type View } from "../../../../lib/chem/perception/projection/views";
import type { Atom, Bond } from "../store/types";

/** The drawing a tool makes: its atoms and bonds, and the ring atoms' ids in the solid's order (atom 0 first). */
export type ChairDrawing = { atoms: Atom[]; bonds: Bond[]; ring: number[]; solid: Solid; view: View; scale: number };

/**
 * How a chair is scaled: the longest of its ring bonds as drawn is the style's bond length (`NOMINAL_BOND_LENGTH`), one constant: the look
 * owner may set another rule. By convention, no basis claimed.
 */
export function chairScale(solid: Solid, view: View, length = NOMINAL_BOND_LENGTH): number {
  const seen = solid.atoms.map((p) => project(view, p));
  const longest = Math.max(...solid.bonds.map(([a, b]) => Math.hypot(seen[a].x - seen[b].x, seen[a].y - seen[b].y)));
  return length / longest;
}

/**
 * A chair in one of its two standard views (`form` 0 or 1, F9 `standardView`), or its ring flip (`flip`), its middle at `at`: atom k of the solid is
 * `firstId + k`, its bond k `firstBondId + k`. The near edge - the two atoms nearest the viewer - is bold.
 */
export function chairDrawing(opts: { at: { x: number; y: number }; form?: 0 | 1; flip?: boolean; firstId: number; firstBondId: number; length?: number }): ChairDrawing {
  const base = chair();
  const solid = opts.flip ? flipped(base) : base;
  const view = standardView(base, opts.form ?? 0);
  const scale = chairScale(base, view, opts.length);
  const seen = solid.atoms.map((p) => project(view, p));
  const middle = { x: seen.reduce((s, p) => s + p.x, 0) / 6, y: seen.reduce((s, p) => s + p.y, 0) / 6 };
  const atoms: Atom[] = seen.map((p, k) => ({
    id: opts.firstId + k,
    el: "C",
    r: 0.9,
    x: opts.at.x + (p.x - middle.x) * scale,
    y: opts.at.y + (p.y - middle.y) * scale,
    z: p.z * scale,
    stereoCentre: true,
    // (R and S shown at once on a centre a group makes: the chemist's check that the drawing says what is meant; none where there is none)
    stereoShown: true,
  }));
  const near = [...seen.keys()].sort((a, b) => seen[b].z - seen[a].z).slice(0, 2);
  const bonds: Bond[] = solid.bonds.map(([a, b], k) => ({
    id: opts.firstBondId + k,
    a: opts.firstId + a,
    b: opts.firstId + b,
    order: 1,
    ...(near.includes(a) && near.includes(b) ? { display: "bold" as const } : {}),
  }));
  return { atoms, bonds, ring: atoms.map((a) => a.id), solid, view, scale };
}

/** A free position as the page sees it from atom `k` of a drawing: where a group's atom goes (page units), and what the position is. */
export type SeenPlace = { place: { x: number; y: number }; direction: { x: number; y: number; z: number }; free: FreePosition };

/** The free positions of atom `k` of a chair drawing, each as the page has it: the group's atom at the bond's seen vector, scaled as the ring is. */
export function seenPlaces(d: ChairDrawing, k: number): SeenPlace[] {
  const atom = d.atoms[k];
  return d.solid.free
    .filter((f) => f.at === k)
    .map((free) => {
      const v = project(d.view, free.direction);
      return { place: { x: atom.x + v.x * d.scale, y: atom.y + v.y * d.scale }, direction: v, free };
    });
}

/**
 * The free position of atom `k` a bond dragged to `pointer` (page units) is taken to: the one whose seen direction is nearest the pointer's, by
 * angle; one already holding a group (`taken`: the free positions of that atom's, by kind) is not offered. None where both are taken.
 */
export function snapTo(d: ChairDrawing, k: number, pointer: { x: number; y: number }, taken: readonly FreePosition["kind"][] = []): SeenPlace | null {
  const atom = d.atoms[k];
  const want = Math.atan2(pointer.y - atom.y, pointer.x - atom.x);
  let best: { place: SeenPlace; off: number } | null = null;
  for (const place of seenPlaces(d, k)) {
    if (taken.includes(place.free.kind)) continue;
    let off = Math.abs(Math.atan2(place.place.y - atom.y, place.place.x - atom.x) - want);
    if (off > Math.PI) off = 2 * Math.PI - off;
    if (!best || off < best.off) best = { place, off };
  }
  return best?.place ?? null;
}

/** A chair found on a page: which of its two standard views and whether flipped, how it is scaled and where its middle is, and each ring atom's place in the solid. */
export type FoundChair = { form: 0 | 1; flip: boolean; scale: number; at: { x: number; y: number }; index: Map<number, number> };

/** The six-rings of a drawing whose atoms all carry a depth, each as atom ids in order round it. */
export function depthRings(model: Pick<{ atoms: Atom[]; bonds: Bond[] }, "atoms" | "bonds">): number[][] {
  const deep = new Set(model.atoms.filter((a) => a.z != null).map((a) => a.id));
  const near = new Map<number, number[]>();
  for (const b of model.bonds) {
    if (!deep.has(b.a) || !deep.has(b.b)) continue;
    near.set(b.a, [...(near.get(b.a) ?? []), b.b]);
    near.set(b.b, [...(near.get(b.b) ?? []), b.a]);
  }
  const found = new Map<string, number[]>();
  const walk = (path: number[]) => {
    const last = path[path.length - 1];
    for (const n of near.get(last) ?? []) {
      if (path.length === 6 && n === path[0]) found.set([...path].sort((p, q) => p - q).join(","), [...path]);
      else if (path.length < 6 && n > path[0] && !path.includes(n)) walk([...path, n]);
    }
  };
  for (const id of near.keys()) walk([id]);
  return [...found.values()];
}

/**
 * The chair a ring is, where its atoms' places and depths are those of one of the solid's four pictures - either standard view, either flip - to
 * within a part in a million of a bond: none where they are not (a ring drawn by hand, in another view, or a boat).
 */
export function chairOf(model: { atoms: Atom[] }, ring: readonly number[]): FoundChair | null {
  const at = new Map(model.atoms.map((a) => [a.id, a]));
  const atoms = ring.map((id) => at.get(id));
  if (atoms.length !== 6 || atoms.some((a) => !a || a.z == null)) return null;
  const places = atoms as Atom[];
  const middle = { x: places.reduce((s, a) => s + a.x, 0) / 6, y: places.reduce((s, a) => s + a.y, 0) / 6 };
  for (const form of [0, 1] as const) {
    for (const flip of [false, true]) {
      const d = chairDrawing({ at: middle, form, flip, firstId: 1, firstBondId: 1 });
      for (let turn = 0; turn < 6; turn++) {
        for (const way of [1, -1]) {
          const mine = places.map((_, i) => d.atoms[(turn + way * i + 6) % 6]);
          const ok = places.every((a, i) => Math.hypot(a.x - mine[i].x, a.y - mine[i].y, (a.z ?? 0) - (mine[i].z ?? 0)) < 1e-6 * NOMINAL_BOND_LENGTH * 100);
          if (ok) return { form, flip, scale: d.scale, at: middle, index: new Map(ring.map((id, i) => [id, (turn + way * i + 6) % 6])) };
        }
      }
    }
  }
  return null;
}

/** Where each atom goes: its new x, y and, a ring atom, its new depth. */
export type Moves = Map<number, { x: number; y: number; z?: number }>;

/**
 * The ring flip of a chair on a page (F9 `flipped`): every ring atom takes the other picture's place and depth, and each group moves from
 * axial to equatorial or back **on the same face** - a group and everything beyond it carried by the same step. None where the ring is no chair
 * of the tool's, or where a group of it stands at neither of its atom's free positions (drawn by hand: nothing is guessed).
 */
export function flipChairMoves(model: { atoms: Atom[]; bonds: Bond[] }, ring: readonly number[]): Moves | null {
  const found = chairOf(model, ring);
  if (!found) return null;
  const was = chairDrawing({ at: found.at, form: found.form, flip: found.flip, firstId: 1, firstBondId: 1 });
  const now = chairDrawing({ at: found.at, form: found.form, flip: !found.flip, firstId: 1, firstBondId: 1 });
  const byId = new Map(model.atoms.map((a) => [a.id, a]));
  const moves: Moves = new Map();
  for (const id of ring) {
    const k = found.index.get(id)!;
    moves.set(id, { x: now.atoms[k].x, y: now.atoms[k].y, z: now.atoms[k].z });
  }
  const inRing = new Set(ring);
  const beyond = (from: number, through: number): number[] => {
    // (the atoms reached from a group's atom without passing the ring)
    const out = [through];
    const seen = new Set([from, through]);
    for (let h = 0; h < out.length; h++) {
      for (const b of model.bonds) {
        const other = b.a === out[h] ? b.b : b.b === out[h] ? b.a : null;
        if (other == null || seen.has(other) || inRing.has(other)) continue;
        seen.add(other);
        out.push(other);
      }
    }
    return out;
  };
  for (const id of ring) {
    const k = found.index.get(id)!;
    const here = byId.get(id)!;
    for (const b of model.bonds) {
      const g = b.a === id ? b.b : b.b === id ? b.a : null;
      if (g == null || inRing.has(g)) continue;
      const atom = byId.get(g)!;
      // (which of its free positions the group stands at, by where it is drawn: the group's bond as the page has it)
      const place = seenPlaces(was, k).find((p) => Math.hypot(atom.x - here.x - (p.place.x - was.atoms[k].x), atom.y - here.y - (p.place.y - was.atoms[k].y)) < 1e-6 * NOMINAL_BOND_LENGTH * 100);
      if (!place) return null;
      const target = seenPlaces(now, k).find((p) => p.free.face === place.free.face && p.free.kind !== place.free.kind)!;
      const to = { x: target.place.x - now.atoms[k].x + moves.get(id)!.x, y: target.place.y - now.atoms[k].y + moves.get(id)!.y };
      // (the group's own atom to where it goes, relative to its ring atom, the rest of it by the same step)
      const dx = to.x - atom.x;
      const dy = to.y - atom.y;
      for (const m of beyond(id, g)) {
        const a = byId.get(m)!;
        moves.set(m, { x: a.x + dx, y: a.y + dy });
      }
    }
  }
  return moves;
}

/** The chairs among the atoms `ids` (a structure's) of a drawing: the rings of it that are the tool's chair, each as atom ids in order round it. */
export function chairsIn(model: { atoms: Atom[]; bonds: Bond[] }, ids: ReadonlySet<number>): number[][] {
  const part = { atoms: model.atoms.filter((a) => ids.has(a.id)), bonds: model.bonds.filter((b) => ids.has(b.a) && ids.has(b.b)) };
  return depthRings(part).filter((ring) => chairOf(part, ring) != null);
}

/** Whether a structure holds a projection - for now, a chair of the tool's: Clean-up leaves it as drawn, and *Draw flat* lays it out flat (docs/EDITOR-2D.md, *Projections*). */
export const isProjection = (model: { atoms: Atom[]; bonds: Bond[] }, ids: ReadonlySet<number>): boolean => chairsIn(model, ids).length > 0;
