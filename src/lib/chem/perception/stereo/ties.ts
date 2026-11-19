/**
 * The centres a ring system ties to each other (foundation part 13, 225): a cage's bridgeheads, which stand only out,out, and a small fused
 * bicycle's junctions, which join only cis - each pair's volumes about its three neighbours toward the other opposite (`Tie`). Counted by
 * the stereoisomers (lib/chem/isomers) and asked by the CIP, which says a pair drawn the impossible way round (lib/chem/cip).
 */
import { parity } from "./geometry";

/**
 * Two centres whose senses their ring system ties (`tiesOf`): `ta`, three of `a`'s neighbours toward `b` - along each of a cage's
 * three bridges, or a fused bicycle's `b` itself and each ring's next atom - and `tb`, `b`'s matching three. Their volumes about each,
 * the three in that order, are opposite: a cage's out,out form, a small fused bicycle's cis (MEASURED, 3D embeddings of norbornane,
 * camphor, bicyclo[2.2.2]octane, quinuclidine, bicyclo[3.1.0]hexane; the chemistry check's ruling). The other way is the in,out form,
 * or a trans fusion, which a bridge of three atoms or fewer, or rings of six atoms in all, cannot take.
 */
export type Tie = { a: number; b: number; ta: readonly number[]; tb: readonly number[] };

/** Every tie of `g` (`Tie`): a cage's bridgeheads, pair by pair, and a small fused bicycle's two junctions. */
export function tiesOf(g: { readonly atoms: readonly unknown[]; readonly bonds: readonly { readonly a: number; readonly b: number }[] }): Tie[] {
  const around: number[][] = g.atoms.map(() => []);
  for (const b of g.bonds) {
    around[b.a].push(b.b);
    around[b.b].push(b.a);
  }
  const apart = (p: readonly number[], q: readonly number[]) => !p.some((x) => q.includes(x));
  const out: Tie[] = [];
  for (let a = 0; a < g.atoms.length; a++) {
    if (around[a].length < 3) continue;
    // (every path out of `a` of up to TIE_BRIDGE_MOST + 1 bonds, by the atom it ends at: its atoms between)
    const paths = new Map<number, number[][]>();
    const walk = (at: number, between: number[]) => {
      for (const n of around[at]) {
        if (n === a || between.includes(n)) continue;
        if (between.length) paths.set(n, [...(paths.get(n) ?? []), between]);
        if (between.length < TIE_BRIDGE_MOST) walk(n, [...between, n]);
      }
    };
    walk(a, []);
    for (const [b, ps] of paths) {
      if (b < a) continue;
      // (a cage: three bridges sharing no atom)
      let three: number[][] | null = null;
      for (let i = 0; i < ps.length && !three; i++)
        for (let j = i + 1; j < ps.length && !three; j++)
          for (let k = j + 1; k < ps.length && !three; k++) if (apart(ps[i], ps[j]) && apart(ps[i], ps[k]) && apart(ps[j], ps[k])) three = [ps[i], ps[j], ps[k]];
      if (three) {
        out.push({ a, b, ta: three.map((p) => p[0]), tb: three.map((p) => p[p.length - 1]) });
        continue;
      }
      // (a small fused bicycle: a and b bonded, two rings through their bond of TIE_FUSED_MOST atoms between, or fewer, in all)
      if (!around[a].includes(b)) continue;
      const two = ps.flatMap((p, i) => ps.slice(i + 1).flatMap((q) => (apart(p, q) && p.length + q.length <= TIE_FUSED_MOST ? [[p, q]] : [])))[0];
      if (two) out.push({ a, b, ta: [b, two[0][0], two[1][0]], tb: [a, two[0][two[0].length - 1], two[1][two[1].length - 1]] });
    }
  }
  return out;
}

/** A centre's lone pair, as a fourth place among its neighbours (a three-bond centre's: quinuclidine's N). */
export const LONE_PAIR = -2;

/** The sign of the volume `three` of a centre's neighbours span about it, from its configuration (`neighbours`, `volume`): Meno's one convention. */
export function volumeOfThree(neighbours: readonly number[], volume: 1 | -1, three: readonly number[]): 1 | -1 {
  const four = neighbours.length === 3 ? [...neighbours, LONE_PAIR] : [...neighbours];
  const order = [...three, four.find((n) => !three.includes(n))!].map((n) => four.indexOf(n));
  return (volume * parity(order)) as 1 | -1;
}


/** The most atoms a cage's bridge has between its bridgeheads for their senses to be tied: with four, in,out isomers begin. */
const TIE_BRIDGE_MOST = 3;

/** The most atoms a small fused bicycle's two rings have between its junctions: six atoms in all, with the junctions - joined only cis. */
const TIE_FUSED_MOST = 4;
