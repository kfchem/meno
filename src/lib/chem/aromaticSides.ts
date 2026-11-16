/**
 * Which ring the second line of a ring's double bond goes into: inside a
 * ring always, and so that aromatic rings show as aromatic: a ring shows as one when every double
 * bond in it has its second line inside it, which a double bond shared by
 * two fused rings can do for only one of them.
 *
 * A ring counts as aromatic, as drawn, when its double bonds alternate all
 * the way round - a six-membered ring with three - or when a five-membered
 * ring has two and the atom left over is an N, O, S, Se or P (a pyrrole, a
 * furan, a thiophene). Among the ways the shared double bonds can go, the
 * one that shows the most aromatic rings wins; between those showing as
 * many, the one whose rings are larger - indole shows its benzene ring.
 *
 * It depends only on which atoms are bonded, and how, so it is worked out
 * once for a structure and kept: drawing it again as atoms move costs
 * nothing.
 */
import { smallestRings } from "../layout/rings";

type RingBond = { a1: number; a2: number; order: number };

const LONE_PAIR = new Set(["N", "O", "S", "Se", "P"]);

/** More shared bonds than this and the choice is made one bond at a time. */
const EXHAUSTIVE = 14;

const key = (a: number, b: number) => (a < b ? `${a},${b}` : `${b},${a}`);

/** The double bonds of a ring, as indices into `bonds`, if it is aromatic as drawn. */
function aromaticRing(
  ring: number[],
  bondAt: Map<string, number>,
  bonds: readonly RingBond[],
  elements: readonly string[],
): number[] | null {
  const doubles: number[] = [];
  const inDouble = new Set<number>();
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const e = bondAt.get(key(a, b));
    if (e == null) return null;
    if (bonds[e].order === 3) return null;
    if (bonds[e].order === 2) {
      if (inDouble.has(a) || inDouble.has(b)) return null; // not alternating
      doubles.push(e);
      inDouble.add(a);
      inDouble.add(b);
    }
  }
  if (ring.length === 6 && doubles.length === 3) return doubles;
  if (ring.length === 5 && doubles.length === 2) {
    const left = ring.find((a) => !inDouble.has(a));
    return left != null && LONE_PAIR.has(elements[left]) ? doubles : null;
  }
  return null;
}

/**
 * For each double bond in an aromatic ring (by index into `bonds`), the ring
 * - its atoms, in order round it - its second line goes into.
 */
export function aromaticRingSides(
  atomCount: number,
  bonds: readonly RingBond[],
  elements: readonly string[],
  // (the bonds' smallest rings, where the caller has them already)
  rings: number[][] = smallestRings(
    atomCount,
    bonds.map((b) => [b.a1, b.a2] as const),
  ),
): Map<number, number[]> {
  const bondAt = new Map<string, number>();
  bonds.forEach((b, i) => bondAt.set(key(b.a1, b.a2), i));
  const aromatic = rings
    .map((ring) => ({ ring, doubles: aromaticRing(ring, bondAt, bonds, elements) }))
    .filter((r): r is { ring: number[]; doubles: number[] } => r.doubles != null);
  const out = new Map<number, number[]>();
  if (!aromatic.length) return out;

  // the aromatic rings each double bond is in
  const ringsOf = new Map<number, number[]>();
  aromatic.forEach((r, i) => {
    for (const e of r.doubles) {
      const here = ringsOf.get(e);
      if (here) here.push(i);
      else ringsOf.set(e, [i]);
    }
  });
  const shared = [...ringsOf].filter(([, rs]) => rs.length > 1).map(([e]) => e);
  for (const [e, rs] of ringsOf) if (rs.length === 1) out.set(e, aromatic[rs[0]].ring);

  // how an assignment of the shared bonds shows: rings shown, and their size
  const judge = (into: Map<number, number>) => {
    let shown = 0;
    let size = 0;
    aromatic.forEach((r, i) => {
      if (r.doubles.every((e) => (ringsOf.get(e)!.length === 1 ? true : into.get(e) === i))) {
        shown++;
        size += r.ring.length;
      }
    });
    return { shown, size };
  };
  const better = (a: { shown: number; size: number }, b: { shown: number; size: number }) =>
    a.shown > b.shown || (a.shown === b.shown && a.size > b.size);

  let best = new Map<number, number>(shared.map((e) => [e, ringsOf.get(e)![0]]));
  if (shared.length <= EXHAUSTIVE) {
    let bestScore = judge(best);
    const choice = new Map<number, number>();
    const walk = (k: number) => {
      if (k === shared.length) {
        const score = judge(choice);
        if (better(score, bestScore)) {
          bestScore = score;
          best = new Map(choice);
        }
        return;
      }
      for (const r of ringsOf.get(shared[k])!) {
        choice.set(shared[k], r);
        walk(k + 1);
      }
    };
    walk(0);
  } else {
    // one bond at a time, each to whichever ring shows best as things stand
    for (const e of shared) {
      let pick = best.get(e)!;
      let pickScore = judge(best);
      for (const r of ringsOf.get(e)!) {
        const trial = new Map(best).set(e, r);
        const score = judge(trial);
        if (better(score, pickScore)) {
          pick = r;
          pickScore = score;
        }
      }
      best.set(e, pick);
    }
  }
  for (const [e, r] of best) out.set(e, aromatic[r].ring);
  return out;
}

/**
 * For every double bond in a ring, the ring its second line goes into: an
 * aromatic ring's as `aromaticRingSides` has it, and any other inside the
 * smallest ring it is in - between two as small, the one with more double
 * bonds of its own. A ring's double bond is drawn inside the ring, however
 * the atoms round it happen to lie: a bridged system's bond, taxol's, is
 * not left outside it by the bonds of the bridge.
 */
export function ringSides(
  atomCount: number,
  bonds: readonly RingBond[],
  elements: readonly string[],
): Map<number, number[]> {
  const rings = smallestRings(
    atomCount,
    bonds.map((b) => [b.a1, b.a2] as const),
  );
  const out = aromaticRingSides(atomCount, bonds, elements, rings);
  const bondAt = new Map<string, number>();
  bonds.forEach((b, i) => bondAt.set(key(b.a1, b.a2), i));
  const ringBonds = rings.map((ring) =>
    ring.map((a, i) => bondAt.get(key(a, ring[(i + 1) % ring.length]))!),
  );
  const doublesIn = ringBonds.map((es) => es.filter((e) => bonds[e]?.order === 2).length);
  // the rings each bond is in, in their order
  const ringsOf = new Map<number, number[]>();
  ringBonds.forEach((es, r) => {
    for (const e of new Set(es)) {
      const here = ringsOf.get(e);
      if (here) here.push(r);
      else ringsOf.set(e, [r]);
    }
  });
  bonds.forEach((b, e) => {
    if (b.order !== 2 || out.has(e)) return;
    let best = -1;
    (ringsOf.get(e) ?? []).forEach((r) => {
      if (
        best < 0 ||
        rings[r].length < rings[best].length ||
        (rings[r].length === rings[best].length && doublesIn[r] > doublesIn[best])
      ) {
        best = r;
      }
    });
    if (best >= 0) out.set(e, rings[best]);
  });
  return out;
}

const remembered = new Map<string, Map<number, number[]>>();

/**
 * `ringSides`, remembered for the structure: a structure being drawn is
 * laid out again at every move, and its rings do not change.
 */
export function ringSidesOf(
  atomCount: number,
  bonds: readonly RingBond[],
  elements: readonly string[],
): Map<number, number[]> {
  const k =
    elements.join(" ") + "|" + bonds.map((b) => `${b.a1}-${b.a2}:${b.order}`).join(" ");
  let found = remembered.get(k);
  if (!found) {
    found = ringSides(atomCount, bonds, elements);
    if (remembered.size > 32) remembered.delete(remembered.keys().next().value!);
    remembered.set(k, found);
  }
  return found;
}
