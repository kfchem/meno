/**
 * The one comparison of two drawings' configurations (foundation part 14 C):
 * what a drawing says of each stereocentre, double bond (and odd run of
 * cumulated double bonds) and axis, by atom id (`saidOf`, as the reader
 * reads it: `readStereo`), and how a second drawing's differs, unit by unit
 * (`compared`): a configuration turned (`inverted`), lost (`opened`),
 * stated where none was (`closed`), or no longer a unit because two of its
 * groups are now alike (`alike`).
 *
 * Two readings of one centre are matched atom by atom, by id, with two
 * exceptions: a plain H drawn as an atom in one drawing and carried in the
 * other is the same neighbour (an H with a mass number, a charge or a map
 * number is a group of its own: the caller says which H are plain); and a
 * carried H a group took (a substituent put in its place) is that group.
 * An id in both drawings is the same neighbour whatever it now is - an H
 * replaced in place by a group keeps its configuration.
 *
 * It compares what the reader reads, not two identities: no canonical
 * order, nothing of the structure's symmetry but what the caller passes as
 * `alike`.
 */
import { parity } from "./geometry";
import type { DrawnAtom, DrawnBond, DrawnStereo } from "./from2d";
import { ofTheStructure } from "../graph";

/** A centre as a drawing says it: its neighbours by atom id (-1 its carried H), and the sign of the volume the first three span. */
export type SaidCentre = { neighbours: readonly number[]; volume: 1 | -1 };

/**
 * What a drawing says of configuration, by atom id: each centre; each
 * double bond's (and odd cumulene run's) two refs, the lower-id end's
 * first, and whether they are on one side, keyed "lower,higher" by its
 * ends; each axis's sense against the lowest-id other neighbour at each
 * end. With each atom's hydrogens (carried and drawn plain) and which
 * drawn atoms are plain H.
 */
export type Said = {
  centres: Map<number, SaidCentre>;
  doubles: Map<string, { refs: readonly [number, number]; cis: boolean }>;
  axes: Map<string, 1 | -1>;
  hydrogens: Map<number, number>;
  plain: ReadonlySet<number>;
};

/** Whether two of the groups of the atom `at` are alike, `besides` (its partner across a double bond or an axis) left out. */
export type Alike = (at: number, besides?: number) => boolean;

/** A unit of configuration, by atom id: a centre, a double bond's (or an odd cumulene run's) two ends, an axis's two ends. */
export type ConfigurationUnit = { kind: "centre"; at: number } | { kind: "double" | "axis"; at: readonly [number, number] };

/** How a unit differs: `inverted`, `opened` (stated before, not now), `closed` (stated now, not before), `alike` (no unit now: two of its groups alike). */
export type Difference = ConfigurationUnit & { how: "inverted" | "opened" | "closed" | "alike" };

/** The parity of the permutation taking `from` to `to` (the same items): +1 even, -1 odd; 0 where they are not the same items. */
function parityBetween<T>(from: readonly T[], to: readonly T[]): 1 | -1 | 0 {
  if (from.length !== to.length || from.some((x) => !to.includes(x)) || new Set(from).size !== from.length) return 0;
  // (the sign of the permutation of places taking one to the other: the one parity, geometry's - the 0 above is this comparison's own)
  return parity(from.map((x) => to.indexOf(x)));
}

const keyOf = (p: number, q: number) => (p < q ? `${p},${q}` : `${q},${p}`);
const endsOf = (key: string) => key.split(",").map(Number) as [number, number];

/**
 * What the drawing of `atoms` and `bonds` says, as `stereo` reads it (the
 * reader's `readStereo`, with the caller's cage fitter: lib/layout/drawn's),
 * its atoms' ids `ids`, by place; `plain` says which atoms are plain H (no
 * mass number, charge or map number). A hydrogen bond is no bond of the
 * structure (perception/graph `ofTheStructure`): an H drawn with one is
 * still its centre's own H.
 */
export function saidOf(atoms: readonly DrawnAtom[], bonds: readonly DrawnBond[], ids: readonly number[], plain: (i: number) => boolean, stereo: DrawnStereo): Said {
  const degree = atoms.map(() => 0);
  for (const b of bonds) {
    if (b.a === b.b || !ofTheStructure(b)) continue;
    degree[b.a]++;
    degree[b.b]++;
  }
  const plainAt = new Set(atoms.flatMap((_, i) => (plain(i) && degree[i] === 1 ? [ids[i]] : [])));
  const hydrogens = new Map(atoms.map((a, i) => [ids[i], a.hs]));
  for (const b of bonds) {
    if (b.a === b.b || !ofTheStructure(b)) continue;
    if (plainAt.has(ids[b.b])) hydrogens.set(ids[b.a], hydrogens.get(ids[b.a])! + 1);
    if (plainAt.has(ids[b.a])) hydrogens.set(ids[b.b], hydrogens.get(ids[b.b])! + 1);
  }
  const id = (n: number) => (n === -1 ? -1 : ids[n]);
  const centres = new Map<number, SaidCentre>([...stereo.tetra].map(([c, t]) => [ids[c], { neighbours: t.neighbours.map(id), volume: t.volume }]));
  const doubles = new Map<string, { refs: readonly [number, number]; cis: boolean }>();
  const sides = (i: number, j: number, refs: readonly [number, number], cis: boolean) => {
    const [p, q] = [ids[i], ids[j]];
    doubles.set(keyOf(p, q), { refs: p < q ? [ids[refs[0]], ids[refs[1]]] : [ids[refs[1]], ids[refs[0]]], cis });
  };
  for (const [k, ct] of stereo.cisTrans) sides(bonds[k].a, bonds[k].b, ct.refs, ct.cis);
  for (const x of stereo.cumulated) sides(x.atoms[0], x.atoms[1], x.refs, x.cis);
  const axes = new Map<string, 1 | -1>();
  for (const ax of stereo.axes) axes.set(keyOf(ids[ax.atoms[0]], ids[ax.atoms[1]]), againstLowest(bonds, ids, ax));
  return { centres, doubles, axes, hydrogens, plain: plainAt };
}

/** An axis's sense taken against the lowest-id other neighbour at each end: against the other neighbour at an end, the sense turns. */
export function againstLowest(drawn: readonly DrawnBond[], ids: readonly number[], ax: { atoms: readonly [number, number]; refs: readonly [number, number]; sense: 1 | -1 }): 1 | -1 {
  // (the structure's bonds: a hydrogen bond is none)
  const bonds = drawn.filter(ofTheStructure);
  // (an end's other neighbours: but the other end, a biaryl's, or the cumulated double bond it runs on through, an allene's)
  const bonded = (x: number, y: number) => bonds.some((b) => (b.a === x && b.b === y) || (b.a === y && b.b === x));
  const through = (x: number, end: number) => {
    if (bonded(x, end)) return end;
    const run = bonds.find((b) => b.order >= 2 && (b.a === x || b.b === x));
    return run ? (run.a === x ? run.b : run.a) : end;
  };
  const others = (x: number, end: number) => {
    const skip = through(x, end);
    return bonds.flatMap((b) => (b.a === x && b.b !== skip ? [b.b] : b.b === x && b.a !== skip ? [b.a] : []));
  };
  const lowest = (x: number, not: number) => others(x, not).reduce((p, q) => (ids[p] < ids[q] ? p : q));
  const [i, j] = ax.atoms;
  return (ax.sense * (ax.refs[0] === lowest(i, j) ? 1 : -1) * (ax.refs[1] === lowest(j, i) ? 1 : -1)) as 1 | -1;
}

/**
 * How `now` differs from `was`, unit by unit (see the file's header):
 * each unit of `was` inverted, opened or no longer one, each of `now` not
 * in `was` closed - in that order, centres, then double bonds, then axes.
 * `took` maps a centre of `was` whose carried H a group took to that
 * group's atom. A unit is `alike` where two of an atom's groups are alike
 * in `now` and were not in `was` - two H, or as `alike` says for each
 * drawing (`besides`, the partner across a double bond or an axis, left
 * out): a ring's two branches alike in both (cis-1,4-dimethylcyclohexane's)
 * leave a unit as it was. Empty where both say the same.
 */
export function compared(was: Said, now: Said, took: ReadonlyMap<number, number> = new Map(), alike?: { was: Alike; now: Alike }): Difference[] {
  const out: Difference[] = [];
  const twoH = (s: Said, at: number) => (s.hydrogens.get(at) ?? 0) >= 2;
  const alikeIn = (s: Said, test: Alike | undefined, at: number, besides?: number) => twoH(s, at) || !!test?.(at, besides);
  // (no unit now: alike now - and, for a unit `was` had, not alike there)
  const noUnit = (at: number, besides?: number) => alikeIn(now, alike?.now, at, besides);
  const noLonger = (at: number, besides?: number) => noUnit(at, besides) && !alikeIn(was, alike?.was, at, besides);
  for (const [c, t] of was.centres) {
    const u = now.centres.get(c);
    if (noLonger(c)) {
      out.push({ kind: "centre", at: c, how: "alike" });
      continue;
    }
    if (!u) {
      out.push({ kind: "centre", at: c, how: "opened" });
      continue;
    }
    // (an id in both is that neighbour; a plain H drawn in one and carried in the other is the H; a carried H a group took is the group)
    const asWas = (n: number) => (n === -1 ? (took.get(c) ?? "H") : was.plain.has(n) && !u.neighbours.includes(n) ? "H" : n);
    const asNow = (n: number) => (n === -1 || (now.plain.has(n) && !t.neighbours.includes(n)) ? "H" : n);
    const sign = parityBetween(t.neighbours.map(asWas), u.neighbours.map(asNow));
    // (not the same neighbours: the configuration given is not there)
    if (sign === 0) out.push({ kind: "centre", at: c, how: "opened" });
    else if (t.volume * sign !== u.volume) out.push({ kind: "centre", at: c, how: "inverted" });
  }
  for (const [c] of now.centres) if (!was.centres.has(c) && !noUnit(c)) out.push({ kind: "centre", at: c, how: "closed" });
  const pairs = (kind: "double" | "axis", before: ReadonlyMap<string, unknown>, after: ReadonlyMap<string, unknown>, same: (key: string) => boolean) => {
    for (const key of before.keys()) {
      const at = endsOf(key);
      if (noLonger(at[0], at[1]) || noLonger(at[1], at[0])) out.push({ kind, at, how: "alike" });
      else if (!after.has(key)) out.push({ kind, at, how: "opened" });
      else if (!same(key)) out.push({ kind, at, how: "inverted" });
    }
    for (const key of after.keys()) {
      const at = endsOf(key);
      if (!before.has(key) && !noUnit(at[0], at[1]) && !noUnit(at[1], at[0])) out.push({ kind, at, how: "closed" });
    }
  };
  pairs("double", was.doubles, now.doubles, (key) => {
    const d = was.doubles.get(key)!;
    const e = now.doubles.get(key)!;
    // (read against the other group on an end, the reading turns)
    return (e.cis !== d.cis) === (e.refs[0] !== d.refs[0] !== (e.refs[1] !== d.refs[1]));
  });
  pairs("axis", was.axes, now.axes, (key) => was.axes.get(key) === now.axes.get(key));
  return out;
}
